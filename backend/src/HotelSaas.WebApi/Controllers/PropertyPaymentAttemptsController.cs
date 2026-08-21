using System.Security.Claims;
using System.Security.Cryptography;
using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
public class PropertyPaymentAttemptsController : ControllerBase
{
    private static readonly HashSet<string> Methods = ["MANUAL_TRANSFER", "QR_TRANSFER", "MOMO", "ZALOPAY", "CASH", "CARD_TERMINAL", "OTHER"];
    private readonly IApplicationDbContext _context;

    public PropertyPaymentAttemptsController(IApplicationDbContext context) => _context = context;

    [HttpGet("api/reservations/{reservationId:guid}/financial-summary")]
    [Authorize]
    public async Task<ActionResult<BookingFinancialSummaryDto>> Summary(Guid reservationId)
    {
        var reservation = await ReservationQuery().FirstOrDefaultAsync(item => item.Id == reservationId);
        if (reservation == null || !CanAccess(reservation, null)) return NotFound(new { message = "Không tìm thấy booking." });
        return Ok(ToSummary(reservation));
    }

    [HttpPost("api/reservations/{reservationId:guid}/payment-attempts")]
    [AllowAnonymous]
    public async Task<ActionResult<PropertyPaymentAttemptDto>> Create(Guid reservationId,
        [FromBody] CreatePropertyPaymentAttemptRequest request,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
        [FromHeader(Name = "Booking-Access-Key")] string? bookingAccessKey = null)
    {
        var key = idempotencyKey?.Trim();
        if (key is not { Length: >= 8 and <= 200 }) return BadRequest(new { message = "Idempotency-Key phải có từ 8 đến 200 ký tự." });
        var method = request.Method?.Trim().ToUpperInvariant() ?? string.Empty;
        var purpose = request.Purpose?.Trim().ToUpperInvariant() ?? string.Empty;
        if (!Methods.Contains(method) || purpose is not ("DEPOSIT" or "BALANCE" or "SERVICE" or "SURCHARGE" or "OTHER"))
            return BadRequest(new { message = "Phương thức hoặc mục đích thanh toán không hợp lệ." });
        var reservation = await ReservationQuery().FirstOrDefaultAsync(item => item.Id == reservationId);
        if (reservation == null || !CanAccess(reservation, bookingAccessKey)) return NotFound(new { message = "Không tìm thấy booking." });
        if (reservation.Status is ReservationStatus.Cancelled or ReservationStatus.CheckedOut or ReservationStatus.NoShow)
            return Conflict(new { message = "Booking không còn nhận thanh toán." });

        var replay = await _context.PropertyPaymentAttempts.IgnoreQueryFilters()
            .FirstOrDefaultAsync(item => item.ReservationId == reservationId && item.IdempotencyKey == key);
        if (replay != null)
        {
            if (replay.Method != method || replay.Purpose != purpose)
                return Conflict(new { code = "IDEMPOTENCY_KEY_REUSED", message = "Idempotency-Key đã được dùng cho yêu cầu khác." });
            return Ok(ToAttempt(replay, true));
        }
        var summary = ToSummary(reservation);
        if (summary.RemainingBalance <= 0) return Conflict(new { message = "Booking không còn số dư cần thanh toán." });
        var configuration = await _context.PropertyPaymentConfigurations.IgnoreQueryFilters()
            .FirstOrDefaultAsync(item => item.TenantId == reservation.TenantId && item.Enabled && !item.IsDeleted);
        if (configuration == null) return Conflict(new { code = "PAYMENT_CONFIGURATION_REQUIRED", message = "Cơ sở chưa bật cấu hình thanh toán." });
        var configuredMethod = PropertyPaymentConfigurationsController.ReadMethods(configuration)
            .FirstOrDefault(item => item.Method == method && item.Enabled);
        if (configuredMethod == null) return Conflict(new { code = "PAYMENT_METHOD_DISABLED", message = "Phương thức thanh toán chưa được cơ sở kích hoạt." });
        if (!PropertyPaymentOptionPolicy.IsReady(configuration, configuredMethod))
            return Conflict(new { code = "PAYMENT_METHOD_NOT_READY", message = "Phương thức thanh toán chưa đủ cấu hình để sử dụng." });
        var amount = purpose == "DEPOSIT" ? DepositAmount(configuration, summary.RemainingBalance) : summary.RemainingBalance;
        if (amount <= 0) amount = summary.RemainingBalance;
        var attempt = new PropertyPaymentAttempt
        {
            TenantId = reservation.TenantId, ReservationId = reservation.Id, Reservation = reservation,
            PublicId = $"PA-{Convert.ToHexString(RandomNumberGenerator.GetBytes(16))}", IdempotencyKey = key,
            Purpose = purpose, Method = method, Provider = configuration.Environment == "SIMULATOR" ? "SIMULATOR" : configuredMethod.Provider ?? method,
            Environment = configuration.Environment,
            Status = method is "MANUAL_TRANSFER" or "QR_TRANSFER" ? "PENDING_VERIFICATION" : "PENDING",
            ExpectedAmount = Math.Min(amount, summary.RemainingBalance), ExpiresAtUtc = DateTime.UtcNow.AddMinutes(configuration.PaymentExpiryMinutes),
            UniqueTransferContent = configuration.TransferTemplate.Replace("{paymentCode}", reservation.BookingCode),
            BankName = configuration.BankName, BankCode = configuration.BankCode, AccountName = configuration.AccountName,
            AccountNumberMasked = Mask(configuration.AccountNumber), QrProvider = configuration.QrProvider,
            InstructionsVi = configuration.InstructionsVi, InstructionsEn = configuration.InstructionsEn
        };
        _context.PropertyPaymentAttempts.Add(attempt);
        await _context.SaveChangesAsync();
        return Ok(ToAttempt(attempt, false));
    }

    [HttpGet("api/payment-attempts/{attemptId}")]
    [AllowAnonymous]
    public async Task<ActionResult<PropertyPaymentAttemptDto>> Get(string attemptId)
    {
        var attempt = await Find(attemptId);
        if (attempt == null) return NotFound(new { message = "Không tìm thấy yêu cầu thanh toán." });
        Expire(attempt);
        await _context.SaveChangesAsync();
        return Ok(ToAttempt(attempt, false));
    }

    [HttpPost("api/payment-attempts/{attemptId}/cancel")]
    [AllowAnonymous]
    public async Task<ActionResult<PropertyPaymentAttemptDto>> Cancel(string attemptId)
    {
        var attempt = await Find(attemptId);
        if (attempt == null) return NotFound(new { message = "Không tìm thấy yêu cầu thanh toán." });
        if (attempt.Status == "SUCCESS") return Conflict(new { message = "Giao dịch đã thành công nên không thể hủy." });
        if (attempt.Status != "CANCELLED") { attempt.Status = "CANCELLED"; await _context.SaveChangesAsync(); }
        return Ok(ToAttempt(attempt, false));
    }

    [HttpPost("api/management/payment-attempts/{attemptId}/confirm-manual")]
    [Authorize(Policy = "reservation_payment.execute")]
    public async Task<ActionResult<ManualPaymentConfirmationDto>> ConfirmManual(string attemptId,
        [FromBody] ManualPaymentConfirmationRequest request)
    {
        var attempt = await Find(attemptId);
        if (attempt?.Reservation == null || !TenantMatches(attempt.TenantId)) return NotFound(new { message = "Không tìm thấy yêu cầu thanh toán." });
        if (request.Reason?.Trim().Length is not (>= 5 and <= 500) || request.EvidenceReference?.Trim().Length is not (>= 3 and <= 200))
            return BadRequest(new { message = "Lý do và chứng từ xác nhận là bắt buộc." });
        Expire(attempt);
        if (attempt.Status == "EXPIRED") return Conflict(new { message = "Yêu cầu thanh toán đã hết hạn." });
        if (attempt.Status is not ("PENDING" or "PENDING_VERIFICATION"))
            return Conflict(new { message = "Yêu cầu thanh toán không còn ở trạng thái chờ xác nhận." });
        return Ok(await Complete(attempt, request.Reason.Trim(), request.EvidenceReference.Trim()));
    }

    [HttpPost("api/financial-simulator/property-payment-attempts/{attemptId}/confirm")]
    [AllowAnonymous]
    public async Task<ActionResult<ManualPaymentConfirmationDto>> ConfirmSimulator(string attemptId)
    {
        var attempt = await Find(attemptId);
        if (attempt == null) return NotFound(new { message = "Không tìm thấy yêu cầu thanh toán." });
        if (attempt.Environment != "SIMULATOR") return Conflict(new { message = "Attempt không thuộc môi trường simulator." });
        Expire(attempt);
        if (attempt.Status == "EXPIRED") return Conflict(new { message = "Yêu cầu thanh toán đã hết hạn." });
        if (attempt.Status is not ("PENDING" or "PENDING_VERIFICATION"))
            return Conflict(new { message = "Yêu cầu thanh toán không còn ở trạng thái chờ xác nhận." });
        return Ok(await Complete(attempt, "Simulator confirmation", "SIMULATOR"));
    }

    private async Task<ManualPaymentConfirmationDto> Complete(PropertyPaymentAttempt attempt, string reason, string evidence)
    {
        if (attempt.Status == "SUCCESS")
            return new(attempt.PublicId, attempt.ProviderReference!, "SUCCESS", attempt.ExpectedAmount, attempt.CompletedAtUtc!.Value, true);
        attempt.Status = "SUCCESS"; attempt.CompletedAtUtc = DateTime.UtcNow; attempt.ConfirmationReason = reason;
        attempt.EvidenceReference = evidence; attempt.ConfirmedByUserId = UserId();
        attempt.ProviderReference = $"TX-{Convert.ToHexString(RandomNumberGenerator.GetBytes(12))}";
        var method = ParseMethod(attempt.Method);
        var payment = new Payment
        {
            TenantId = attempt.TenantId, ReservationId = attempt.ReservationId, Reservation = attempt.Reservation,
            Amount = attempt.ExpectedAmount, Method = method, Status = PaymentStatus.Completed,
            TransactionReference = attempt.ProviderReference, PaidAtUtc = attempt.CompletedAtUtc
        };
        _context.Payments.Add(payment);
        if (attempt.Reservation?.Folio != null) attempt.Reservation.Folio.TotalCredits += payment.Amount;
        if (attempt.Reservation?.Status == ReservationStatus.PendingPayment && ToSummary(attempt.Reservation).RemainingBalance <= 0)
            attempt.Reservation.Status = ReservationStatus.Confirmed;
        await _context.SaveChangesAsync();
        return new(attempt.PublicId, payment.Id.ToString(), "SUCCESS", payment.Amount, attempt.CompletedAtUtc.Value, false);
    }

    private IQueryable<Reservation> ReservationQuery() => _context.Reservations.IgnoreQueryFilters()
        .Include(item => item.Folio).Include(item => item.Payments).ThenInclude(payment => payment.Refunds);
    private async Task<PropertyPaymentAttempt?> Find(string id) => await _context.PropertyPaymentAttempts.IgnoreQueryFilters()
        .Include(item => item.Reservation!).ThenInclude(reservation => reservation!.Folio)
        .Include(item => item.Reservation!).ThenInclude(reservation => reservation!.Payments).ThenInclude(payment => payment.Refunds)
        .FirstOrDefaultAsync(item => item.PublicId == id);
    private static void Expire(PropertyPaymentAttempt attempt) { if (attempt.Status is "PENDING" or "PENDING_VERIFICATION" && attempt.ExpiresAtUtc <= DateTime.UtcNow) attempt.Status = "EXPIRED"; }
    private bool CanAccess(Reservation reservation, string? key) => User?.Identity?.IsAuthenticated == true
        ? User.IsInRole("SuperAdmin") || reservation.CustomerUserId == UserId() || TenantMatches(reservation.TenantId)
        : FixedEquals(reservation.GuestAccessKey, key);
    private bool TenantMatches(Guid tenantId) => Guid.TryParse(User?.FindFirstValue("tenant_id"), out var claim) && claim == tenantId;
    private Guid? UserId() => Guid.TryParse(User?.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;
    private static bool FixedEquals(string? expected, string? actual)
    {
        if (string.IsNullOrWhiteSpace(expected) || string.IsNullOrWhiteSpace(actual)) return false;
        var left = System.Text.Encoding.UTF8.GetBytes(expected);
        var right = System.Text.Encoding.UTF8.GetBytes(actual);
        return left.Length == right.Length && CryptographicOperations.FixedTimeEquals(left, right);
    }
    private static BookingFinancialSummaryDto ToSummary(Reservation reservation)
    {
        var payments = reservation.Payments.Where(item => item.Status is PaymentStatus.Completed or PaymentStatus.Refunded).Sum(item => item.Amount);
        var refunds = reservation.Payments.SelectMany(item => item.Refunds).Where(item => item.Status == "SUCCEEDED").Sum(item => item.RequestedAmount);
        var gross = reservation.Folio?.TotalCharges ?? reservation.TotalAmount;
        var balance = gross - payments + refunds;
        var state = refunds >= payments && payments > 0 ? "REFUNDED" : refunds > 0 ? "PARTIALLY_REFUNDED" :
            balance < 0 ? "OVERPAID" : balance == 0 ? "PAID" : payments > 0 ? "PARTIALLY_PAID" : "UNPAID";
        return new(reservation.Id, gross, reservation.DepositAmount, payments, refunds, balance, "VND", state,
            (reservation.UpdatedAtUtc ?? reservation.CreatedAtUtc).Ticks, DateTime.UtcNow);
    }
    private static PropertyPaymentAttemptDto ToAttempt(PropertyPaymentAttempt attempt, bool replayed) => new(
        attempt.PublicId, attempt.ReservationId, attempt.Purpose, attempt.Status, attempt.Environment, attempt.ExpectedAmount,
        "VND", attempt.ExpiresAtUtc, attempt.Method, attempt.Provider,
        new(attempt.BankName, attempt.BankCode, attempt.AccountName, attempt.AccountNumberMasked, attempt.QrProvider,
            null, attempt.InstructionsVi, attempt.InstructionsEn),
        attempt.UniqueTransferContent, null, null, replayed);
    private static PaymentMethod ParseMethod(string method) => method switch { "CASH" => PaymentMethod.Cash, "CARD_TERMINAL" => PaymentMethod.CreditCard, _ => PaymentMethod.BankTransfer };
    private static decimal DepositAmount(PropertyPaymentConfiguration configuration, decimal balance) => configuration.DepositPolicyType switch
    {
        "FIXED" => configuration.DepositValue ?? balance,
        "PERCENTAGE" => decimal.Round(balance * (configuration.DepositValue ?? 100) / 100m, 0, MidpointRounding.AwayFromZero),
        _ => balance
    };
    private static string? Mask(string? value) => string.IsNullOrWhiteSpace(value) ? null : $"****{value[^Math.Min(4, value.Length)..]}";
}

public record CreatePropertyPaymentAttemptRequest(string? Purpose, string? Method);
public record BookingFinancialSummaryDto(Guid ReservationId, decimal GrossCharges, decimal DepositRequired,
    decimal SuccessfulPayments, decimal SuccessfulRefunds, decimal RemainingBalance, string Currency,
    string FinancialState, long SourceVersion, DateTime CalculatedAt);
public record PropertyPaymentReceiverDto(string? BankName, string? BankCode, string? AccountName,
    string? AccountNumberMasked, string? QrProvider, string? MerchantReferenceMasked, string? InstructionsVi, string? InstructionsEn);
public record PropertyPaymentAttemptDto(string AttemptId, Guid ReservationId, string Purpose, string Status,
    string Environment, decimal ExpectedAmount, string Currency, DateTime ExpiresAt, string Method, string Provider,
    PropertyPaymentReceiverDto Receiver, string? UniqueTransferContent, string? QrData, string? RedirectUrl, bool Replayed);
public record ManualPaymentConfirmationRequest(string? Reason, string? EvidenceReference);
public record ManualPaymentConfirmationDto(string AttemptId, string TransactionId, string Status,
    decimal Amount, DateTime ConfirmedAt, bool Replayed);
