using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Globalization;
using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Application.Common.Models;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PaymentsController : ControllerBase
{
    private static readonly TimeSpan SessionLifetime = TimeSpan.FromMinutes(15);
    private readonly IApplicationDbContext _context;
    private readonly IVnPayService _vnPayService;
    private readonly IConfiguration _configuration;

    public PaymentsController(IApplicationDbContext context, IVnPayService vnPayService, IConfiguration? configuration = null)
    {
        _context = context;
        _vnPayService = vnPayService;
        _configuration = configuration ?? new ConfigurationBuilder().Build();
    }

    [HttpPost("sessions")]
    [EnableRateLimiting("payment-session")]
    public async Task<ActionResult<PaymentSessionDto>> CreateSession(
        [FromBody] CreatePaymentSessionRequest request,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
        [FromHeader(Name = "Booking-Access-Key")] string? bookingAccessKey = null)
    {
        if (!string.Equals(request.Provider, "VNPAY", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { message = "Cổng thanh toán chưa được hỗ trợ." });
        var requestKey = idempotencyKey?.Trim();
        if (requestKey is not { Length: >= 8 and <= 200 })
            return BadRequest(new { message = "Idempotency-Key phải có từ 8 đến 200 ký tự." });

        var reservation = await _context.Reservations.IgnoreQueryFilters()
            .Include(r => r.Tenant)
            .Include(r => r.Payments)
            .FirstOrDefaultAsync(r => r.Id == request.ReservationId);
        if (reservation != null && !CanInitiatePayment(reservation, bookingAccessKey))
            return NotFound(new { message = "Không tìm thấy đơn đặt phòng." });
        if (reservation != null && ReservationPaymentLifecycle.ExpireIfOverdue(reservation, DateTime.UtcNow))
            await _context.SaveChangesAsync();
        var validationError = ValidatePayableReservation(reservation);
        if (validationError != null) return validationError;

        var replay = reservation!.Payments.FirstOrDefault(payment => payment.ClientRequestKey == requestKey);
        if (replay != null)
            return Ok(BuildSession(replay, reservation, CreatePaymentUrl(replay, reservation)));

        var paymentConfiguration = await _context.PropertyPaymentConfigurations.IgnoreQueryFilters()
            .FirstOrDefaultAsync(item => item.TenantId == reservation.TenantId && !item.IsDeleted);
        var vnPayAvailable = PropertyPaymentOptionPolicy.Available(paymentConfiguration)
            .Any(option => option.Code == "VNPAY");
        if (!vnPayAvailable)
            return Conflict(new
            {
                code = "PAYMENT_METHOD_UNAVAILABLE",
                message = "VNPAY đã bị tắt hoặc chưa sẵn sàng cho cơ sở này."
            });

        // A reservation can have only one active VNPay session, making retries idempotent.
        var payment = reservation.Payments
            .Where(p => p.Method == PaymentMethod.VNPay && p.Status == PaymentStatus.Pending)
            .OrderByDescending(p => p.CreatedAtUtc)
            .FirstOrDefault(p => p.CreatedAtUtc.Add(SessionLifetime) > DateTime.UtcNow);
        if (payment != null)
        {
            if (payment.ClientRequestKey != null)
                return Conflict(new
                {
                    code = "PAYMENT_SESSION_ACTIVE",
                    message = "Booking đang có một phiên VNPay còn hiệu lực.",
                    sessionId = payment.Id,
                    expiresAt = payment.CreatedAtUtc.Add(SessionLifetime)
                });
            payment.ClientRequestKey = requestKey;
            await _context.SaveChangesAsync();
        }
        else
        {
            payment = new Payment
            {
                TenantId = reservation.TenantId,
                ReservationId = reservation.Id,
                Amount = reservation.TotalAmount,
                Method = PaymentMethod.VNPay,
                Status = PaymentStatus.Pending,
                ClientRequestKey = requestKey
            };
            _context.Payments.Add(payment);
            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateException)
            {
                _context.Payments.Remove(payment);
                var concurrentReplay = await _context.Payments.IgnoreQueryFilters()
                    .FirstOrDefaultAsync(item => item.ReservationId == reservation.Id && item.ClientRequestKey == requestKey);
                if (concurrentReplay == null) throw;
                payment = concurrentReplay;
            }
        }

        return Ok(BuildSession(payment, reservation, CreatePaymentUrl(payment, reservation)));
    }

    [HttpGet("sessions/{sessionId:guid}")]
    public async Task<ActionResult<PaymentSessionStatusDto>> GetSession(Guid sessionId,
        [FromHeader(Name = "Booking-Access-Key")] string? bookingAccessKey = null)
    {
        var payment = await _context.Payments.IgnoreQueryFilters()
            .Include(p => p.Reservation)
            .FirstOrDefaultAsync(p => p.Id == sessionId && p.Method == PaymentMethod.VNPay);
        if (payment == null) return NotFound(new { message = "Không tìm thấy phiên thanh toán." });
        if (payment.Reservation == null || !CanInitiatePayment(payment.Reservation, bookingAccessKey))
            return NotFound(new { message = "Không tìm thấy phiên thanh toán." });

        if (ReservationPaymentLifecycle.ExpireIfOverdue(payment.Reservation, DateTime.UtcNow))
            await _context.SaveChangesAsync();
        var status = SessionStatus(payment);
        return Ok(new PaymentSessionStatusDto(
            payment.Id, payment.ReservationId, payment.Reservation.BookingCode, "VNPAY", payment.Amount, "VND", status,
            payment.CreatedAtUtc.Add(SessionLifetime), payment.PaidAtUtc,
            status == "SUCCEEDED" && payment.Reservation?.Status != ReservationStatus.Confirmed,
            status == "FAILED" ? "PAYMENT_FAILED" : null,
            payment.Reservation!.ConfirmationEmailStatus, payment.Reservation.GuestEmail,
            payment.Reservation.ConfirmationEmailStatus == "SENT"));
    }

    [HttpGet("reservations/{reservationId:guid}/active-session")]
    [EnableRateLimiting("payment-session")]
    public async Task<ActionResult<PaymentSessionDto>> GetActiveSession(Guid reservationId,
        [FromHeader(Name = "Booking-Access-Key")] string? bookingAccessKey = null)
    {
        var reservation = await _context.Reservations.IgnoreQueryFilters()
            .Include(item => item.Tenant).Include(item => item.Payments)
            .FirstOrDefaultAsync(item => item.Id == reservationId);
        if (reservation == null || !CanInitiatePayment(reservation, bookingAccessKey))
            return NotFound(new { message = "Không tìm thấy phiên thanh toán." });
        if (ReservationPaymentLifecycle.ExpireIfOverdue(reservation, DateTime.UtcNow))
            await _context.SaveChangesAsync();
        var payment = reservation.Payments.Where(item => item.Method == PaymentMethod.VNPay &&
                item.Status == PaymentStatus.Pending && item.CreatedAtUtc.Add(SessionLifetime) > DateTime.UtcNow)
            .OrderByDescending(item => item.CreatedAtUtc).FirstOrDefault();
        if (payment == null) return NotFound(new { message = "Không có phiên thanh toán còn hiệu lực." });
        return Ok(BuildSession(payment, reservation, CreatePaymentUrl(payment, reservation)));
    }

    [HttpPost("vnpay-url/{reservationId:guid}")]
    public async Task<ActionResult<Result<string>>> CreateVnPayUrl(Guid reservationId)
    {
        var result = await CreateSession(new CreatePaymentSessionRequest(reservationId, "VNPAY"),
            Request.Headers["Idempotency-Key"], Request.Headers["Booking-Access-Key"]);
        if (result.Result is OkObjectResult { Value: PaymentSessionDto session })
            return Ok(Result<string>.Success(session.Url));
        if (result.Result is ObjectResult error)
            return StatusCode(error.StatusCode ?? 400, Result<string>.Failure(ReadMessage(error.Value)));
        return BadRequest(Result<string>.Failure("Không thể tạo phiên thanh toán."));
    }

    [HttpGet("vnpay-callback")]
    public async Task<IActionResult> VnPayCallback()
    {
        var query = Request.Query.ToDictionary(q => q.Key, q => q.Value.ToString());
        var txnRef = query.GetValueOrDefault("vnp_TxnRef", string.Empty);
        if (!Guid.TryParse(txnRef, out var sessionId)) return RedirectToResult(null, "FAILED");

        var payment = await _context.Payments.IgnoreQueryFilters()
            .Include(p => p.Reservation!).ThenInclude(r => r!.Tenant)
            .Include(p => p.Reservation!).ThenInclude(r => r!.Folio)
            .FirstOrDefaultAsync(p => p.Id == sessionId && p.Method == PaymentMethod.VNPay);
        if (payment?.Reservation == null) return RedirectToResult(sessionId, "FAILED");

        var (isValidSignature, isSuccess, txnNo, responseCode) = _vnPayService.ProcessIpn(
            query, payment.Reservation.Tenant?.CustomVnPayHashSecret);
        if (!isValidSignature) return RedirectToResult(sessionId, "FAILED");

        var amountMatches = TryReadVnPayAmount(query, out var callbackAmount) && callbackAmount == payment.Amount;
        var merchantMatches = string.IsNullOrWhiteSpace(payment.Reservation.Tenant?.CustomVnPayTmnCode) ||
            string.Equals(query.GetValueOrDefault("vnp_TmnCode"), payment.Reservation.Tenant.CustomVnPayTmnCode,
                StringComparison.Ordinal);
        var transactionBelongsToAnotherPayment = !string.IsNullOrWhiteSpace(txnNo) &&
            await _context.PaymentTransactions.IgnoreQueryFilters().AnyAsync(transaction =>
                transaction.PaymentId != payment.Id && transaction.Provider == "VNPay" &&
                transaction.TransactionNo == txnNo && transaction.IsSuccess);
        var callbackAccepted = isSuccess && amountMatches && merchantMatches &&
            !string.IsNullOrWhiteSpace(txnNo) && !transactionBelongsToAnotherPayment;
        var storedResponseCode = !amountMatches ? "AMOUNT_MISMATCH" :
            !merchantMatches ? "MERCHANT_MISMATCH" :
            transactionBelongsToAnotherPayment ? "TRANSACTION_REUSED" : responseCode;
        var duplicate = await _context.PaymentTransactions.IgnoreQueryFilters()
            .AnyAsync(t => t.PaymentId == payment.Id && t.TransactionNo == txnNo && t.ResponseCode == storedResponseCode);

        if (!duplicate)
        {
            _context.PaymentTransactions.Add(new PaymentTransaction
            {
                TenantId = payment.TenantId,
                PaymentId = payment.Id,
                Provider = "VNPay",
                TransactionNo = txnNo,
                BankCode = query.GetValueOrDefault("vnp_BankCode"),
                ResponseCode = storedResponseCode,
                RawPayload = JsonSerializer.Serialize(query),
                IsSuccess = callbackAccepted
            });
        }

        if (callbackAccepted && payment.Status is PaymentStatus.Pending or PaymentStatus.Expired)
        {
            payment.Status = PaymentStatus.Completed;
            payment.TransactionReference = txnNo;
            payment.PaidAtUtc = DateTime.UtcNow;
            if (payment.Reservation.Status == ReservationStatus.PendingPayment &&
                payment.CreatedAtUtc.Add(SessionLifetime) > DateTime.UtcNow)
            {
                payment.Reservation.Status = ReservationStatus.Confirmed;
                payment.Reservation.DepositAmount = payment.Amount;
                if (payment.Reservation.Folio != null) payment.Reservation.Folio.TotalCredits += payment.Amount;
            }
        }
        else if (!callbackAccepted && payment.Status == PaymentStatus.Pending)
        {
            payment.Status = PaymentStatus.Failed;
        }

        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateException) when (callbackAccepted)
        {
            // The filtered unique index is the final guard when callbacks race with one provider transaction.
            return RedirectToResult(sessionId, "FAILED");
        }
        return RedirectToResult(sessionId, callbackAccepted ? "SUCCEEDED" : "FAILED");
    }

    private ObjectResult? ValidatePayableReservation(Reservation? reservation)
    {
        if (reservation == null) return NotFound(new { message = "Không tìm thấy đơn đặt phòng." });
        if (reservation.Tenant?.Status != TenantStatus.Active)
            return StatusCode(StatusCodes.Status409Conflict, new { message = "Cơ sở lưu trú hiện không thể nhận thanh toán." });
        if (reservation.Status != ReservationStatus.PendingPayment)
            return Conflict(new { message = "Đơn đặt phòng không ở trạng thái chờ thanh toán." });
        if (reservation.TotalAmount <= 0)
            return BadRequest(new { message = "Số tiền thanh toán phải lớn hơn 0." });
        return null;
    }

    private bool CanInitiatePayment(Reservation reservation, string? bookingAccessKey)
    {
        if (User.IsInRole("SuperAdmin")) return true;
        if (Guid.TryParse(User.FindFirstValue("tenant_id"), out var tenantId) && tenantId == reservation.TenantId)
            return true;
        if (reservation.CustomerUserId.HasValue &&
            Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var customerId))
            return customerId == reservation.CustomerUserId;
        return !reservation.CustomerUserId.HasValue &&
            (FixedTimeEquals(reservation.GuestAccessKey, bookingAccessKey) ||
             string.IsNullOrWhiteSpace(reservation.GuestAccessKey) && FixedTimeEquals(reservation.ClientRequestKey, bookingAccessKey));
    }

    private static bool FixedTimeEquals(string? expected, string? actual)
    {
        if (string.IsNullOrWhiteSpace(expected) || string.IsNullOrWhiteSpace(actual)) return false;
        var expectedHash = SHA256.HashData(Encoding.UTF8.GetBytes(expected));
        var actualHash = SHA256.HashData(Encoding.UTF8.GetBytes(actual.Trim()));
        return CryptographicOperations.FixedTimeEquals(expectedHash, actualHash);
    }

    private static bool TryReadVnPayAmount(IReadOnlyDictionary<string, string> query, out decimal amount)
    {
        amount = 0;
        if (!long.TryParse(query.GetValueOrDefault("vnp_Amount"), NumberStyles.None,
                CultureInfo.InvariantCulture, out var minorUnits) || minorUnits < 0)
            return false;
        amount = minorUnits / 100m;
        return true;
    }

    private string CreatePaymentUrl(Payment payment, Reservation reservation)
    {
        var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "127.0.0.1";
        return _vnPayService.CreatePaymentUrl(
            reservation.Id, reservation.BookingCode, payment.Amount,
            $"Thanh toan {reservation.BookingCode}", ip,
            reservation.Tenant?.CustomVnPayTmnCode,
            reservation.Tenant?.CustomVnPayHashSecret,
            payment.Id.ToString("N"));
    }

    private static PaymentSessionDto BuildSession(Payment payment, Reservation reservation, string url) =>
        new(payment.Id, reservation.Id, reservation.BookingCode, "VNPAY", "VNPAY", payment.Amount, "VND", SessionStatus(payment),
            "SANDBOX", payment.CreatedAtUtc.Add(SessionLifetime), url, false,
            reservation.ConfirmationEmailStatus, reservation.GuestEmail,
            reservation.ConfirmationEmailStatus == "SENT");

    private static string SessionStatus(Payment payment) => payment.Status switch
    {
        PaymentStatus.Completed => "SUCCEEDED",
        PaymentStatus.Failed => "FAILED",
        PaymentStatus.Expired => "EXPIRED",
        _ when payment.CreatedAtUtc.Add(SessionLifetime) <= DateTime.UtcNow => "EXPIRED",
        _ => "PENDING"
    };

    private IActionResult RedirectToResult(Guid? sessionId, string status)
    {
        var frontendUrl = _configuration["Frontend:BaseUrl"]?.TrimEnd('/') ?? "http://localhost:4200";
        return Redirect($"{frontendUrl}/payment-result?session={Uri.EscapeDataString(sessionId?.ToString() ?? string.Empty)}&provider=VNPAY&status={status}");
    }

    private static string ReadMessage(object? value) =>
        value?.GetType().GetProperty("message")?.GetValue(value)?.ToString() ?? "Không thể tạo phiên thanh toán.";
}

public record CreatePaymentSessionRequest(Guid ReservationId, string Provider);
public record PaymentSessionDto(Guid SessionId, Guid ReservationId, string BookingCode, string Provider, string Method, decimal Amount,
    string Currency, string Status, string Mode, DateTime ExpiresAt, string Url, bool ReconciliationRequired,
    string ConfirmationEmailStatus = "NOT_CONFIGURED", string? ConfirmationEmailRecipient = null, bool ConfirmationEmailSent = false);
public record PaymentSessionStatusDto(Guid SessionId, Guid ReservationId, string BookingCode, string Provider, decimal Amount,
    string Currency, string Status, DateTime ExpiresAt, DateTime? CompletedAt, bool ReconciliationRequired, string? FailureCode,
    string ConfirmationEmailStatus = "NOT_CONFIGURED", string? ConfirmationEmailRecipient = null, bool ConfirmationEmailSent = false);
