using System.Security.Claims;
using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Authorize]
public class PropertyRefundsController : ControllerBase
{
    private static readonly HashSet<string> TerminalStatuses = ["SUCCEEDED", "FAILED", "CANCELLED"];
    private readonly IApplicationDbContext _context;

    public PropertyRefundsController(IApplicationDbContext context) => _context = context;

    [HttpPost("api/property-payments/{paymentPublicId}/refunds")]
    public async Task<ActionResult<PropertyRefundDto>> RequestRefund(
        string paymentPublicId,
        [FromBody] PropertyRefundRequest request,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey)
    {
        if (!Guid.TryParse(paymentPublicId, out var paymentId)) return NotFound(new { message = "Không tìm thấy giao dịch thanh toán." });
        var key = idempotencyKey?.Trim();
        if (key is not { Length: >= 8 and <= 200 }) return BadRequest(new { message = "Idempotency-Key phải có từ 8 đến 200 ký tự." });
        if (request.Amount <= 0 || request.Amount != decimal.Truncate(request.Amount)) return BadRequest(new { message = "Số tiền hoàn phải là số nguyên VND lớn hơn 0." });
        var reason = request.Reason?.Trim();
        if (reason is not { Length: >= 3 and <= 1000 }) return BadRequest(new { message = "Lý do hoàn tiền phải có từ 3 đến 1000 ký tự." });

        var payment = await _context.Payments.IgnoreQueryFilters()
            .Include(item => item.Reservation)
            .Include(item => item.Refunds)
            .FirstOrDefaultAsync(item => item.Id == paymentId &&
                (item.Status == PaymentStatus.Completed || item.Status == PaymentStatus.Refunded));
        if (payment?.Reservation == null || !CanAccess(payment, 2)) return NotFound(new { message = "Không tìm thấy giao dịch thanh toán." });

        var replay = payment.Refunds.FirstOrDefault(item => item.IdempotencyKey == key);
        if (replay != null)
        {
            if (replay.RequestedAmount != request.Amount || !string.Equals(replay.Reason, reason, StringComparison.Ordinal))
                return Conflict(new { code = "IDEMPOTENCY_KEY_REUSED", message = "Idempotency-Key đã được dùng cho yêu cầu khác." });
            return Ok(ToDto(replay, payment, true));
        }

        var reservedAmount = payment.Refunds.Where(item => item.Status is not "FAILED" and not "CANCELLED").Sum(item => item.RequestedAmount);
        var remaining = payment.Amount - reservedAmount;
        if (request.Amount > remaining) return Conflict(new { code = "REFUND_AMOUNT_EXCEEDED", message = "Số tiền hoàn vượt quá số dư có thể hoàn.", remainingRefundableAmount = remaining });

        var refund = new PropertyRefund
        {
            TenantId = payment.TenantId,
            PaymentId = payment.Id,
            Payment = payment,
            PublicId = $"RF-{Guid.NewGuid():N}".ToUpperInvariant(),
            IdempotencyKey = key,
            RequestedByUserId = UserId(),
            RequestedAmount = request.Amount,
            Reason = reason,
            Status = IsCustomer() ? "PENDING_APPROVAL" : "REQUESTED"
        };
        _context.PropertyRefunds.Add(refund);
        await _context.SaveChangesAsync();
        return Ok(ToDto(refund, payment, false));
    }

    [HttpGet("api/property-refunds/{refundPublicId}")]
    public async Task<ActionResult<PropertyRefundDto>> Get(string refundPublicId)
    {
        var refund = await RefundQuery().FirstOrDefaultAsync(item => item.PublicId == refundPublicId);
        if (refund?.Payment == null || !CanAccess(refund.Payment)) return NotFound(new { message = "Không tìm thấy yêu cầu hoàn tiền." });
        return Ok(ToDto(refund, refund.Payment, false));
    }

    [HttpGet("api/property-refunds")]
    [Authorize(Policy = "property_refund.read")]
    public async Task<ActionResult<List<PropertyRefundDto>>> List([FromQuery] Guid propertyId, [FromQuery] string? status = null, [FromQuery] string? provider = null, [FromQuery] DateTime? from = null, [FromQuery] DateTime? to = null, [FromQuery] decimal? minAmount = null, [FromQuery] decimal? maxAmount = null, [FromQuery] string sortDirection = "DESC")
    {
        if (!CanAccessTenant(propertyId)) return NotFound(new { message = "Không tìm thấy cơ sở." });
        var query = RefundQuery().Where(item => item.TenantId == propertyId);
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(item => item.Status == status.Trim().ToUpperInvariant());
        if (!string.IsNullOrWhiteSpace(provider)) query = query.Where(item => item.Provider == provider.Trim().ToUpperInvariant());
        if (from.HasValue) query = query.Where(item => item.CreatedAtUtc >= from.Value);
        if (to.HasValue) query = query.Where(item => item.CreatedAtUtc <= to.Value);
        if (minAmount.HasValue) query = query.Where(item => item.RequestedAmount >= minAmount.Value);
        if (maxAmount.HasValue) query = query.Where(item => item.RequestedAmount <= maxAmount.Value);
        var refunds = await (sortDirection.Equals("ASC", StringComparison.OrdinalIgnoreCase) ? query.OrderBy(item => item.CreatedAtUtc) : query.OrderByDescending(item => item.CreatedAtUtc)).ToListAsync();
        return Ok(refunds.Select(item => ToDto(item, item.Payment!, false)).ToList());
    }

    [HttpPost("api/property-refunds/{refundPublicId}/approve")]
    [Authorize(Policy = "property_refund.approve")]
    public async Task<ActionResult<PropertyRefundDto>> Approve(string refundPublicId)
    {
        var refund = await RefundQuery().FirstOrDefaultAsync(item => item.PublicId == refundPublicId);
        if (refund?.Payment == null || !CanAccessTenant(refund.TenantId)) return NotFound(new { message = "Không tìm thấy yêu cầu hoàn tiền." });
        if (refund.Status == "PENDING_PROVIDER" || refund.Status == "SUCCEEDED") return Ok(ToDto(refund, refund.Payment, false));
        if (TerminalStatuses.Contains(refund.Status)) return Conflict(new { message = "Yêu cầu hoàn tiền đã kết thúc." });
        refund.Status = "PENDING_PROVIDER";
        refund.ApprovedAtUtc = DateTime.UtcNow;
        refund.ApprovedByUserId = UserId();
        await _context.SaveChangesAsync();
        return Ok(ToDto(refund, refund.Payment, false));
    }

    [HttpPost("api/property-refunds/{refundPublicId}/attempts")]
    [Authorize(Policy = "property_refund.execute")]
    public async Task<ActionResult<PropertyRefundAttemptDto>> CreateAttempt(string refundPublicId, [FromBody] PropertyRefundAttemptRequest request)
    {
        var refund = await RefundQuery().FirstOrDefaultAsync(item => item.PublicId == refundPublicId);
        if (refund == null || !CanAccessTenant(refund.TenantId)) return NotFound(new { message = "Không tìm thấy yêu cầu hoàn tiền." });
        if (refund.Status != "PENDING_PROVIDER") return Conflict(new { message = "Yêu cầu chưa sẵn sàng gửi sang cổng hoàn tiền." });
        var provider = request.Provider?.Trim().ToUpperInvariant();
        var environment = request.Environment?.Trim().ToUpperInvariant();
        if (provider is not { Length: >= 2 and <= 40 } || environment is not ("SIMULATOR" or "SANDBOX" or "PRODUCTION"))
            return BadRequest(new { message = "Provider hoặc môi trường hoàn tiền không hợp lệ." });
        refund.Provider = provider;
        refund.Environment = environment;
        refund.AttemptNumber++;
        refund.ProviderReference = $"{provider}-RF-{Guid.NewGuid():N}".ToUpperInvariant();
        await _context.SaveChangesAsync();
        return Ok(new PropertyRefundAttemptDto(refund.PublicId, refund.AttemptNumber, provider, environment, refund.ProviderReference, refund.Status, false));
    }

    [HttpPost("api/property-refunds/{refundPublicId}/retry")]
    [Authorize(Policy = "property_refund.execute")]
    public async Task<ActionResult<PropertyRefundDto>> Retry(string refundPublicId)
    {
        var refund = await RefundQuery().FirstOrDefaultAsync(item => item.PublicId == refundPublicId);
        if (refund?.Payment == null || !CanAccessTenant(refund.TenantId)) return NotFound(new { message = "Không tìm thấy yêu cầu hoàn tiền." });
        if (refund.Status != "FAILED") return Conflict(new { message = "Chỉ yêu cầu hoàn tiền thất bại mới được thử lại." });
        refund.Status = "PENDING_PROVIDER";
        refund.FailureCode = null;
        refund.CompletedAtUtc = null;
        await _context.SaveChangesAsync();
        return Ok(ToDto(refund, refund.Payment, false));
    }

    [HttpPost("api/financial-simulator/property-refunds/{refundPublicId}/confirm")]
    [Authorize(Policy = "property_refund.execute")]
    public async Task<ActionResult<PropertyRefundDto>> ConfirmSimulator(string refundPublicId)
    {
        var refund = await RefundQuery().FirstOrDefaultAsync(item => item.PublicId == refundPublicId);
        if (refund?.Payment == null || !CanAccessTenant(refund.TenantId)) return NotFound(new { message = "Không tìm thấy yêu cầu hoàn tiền." });
        if (refund.Status == "SUCCEEDED") return Ok(ToDto(refund, refund.Payment, false));
        if (refund.Status != "PENDING_PROVIDER" || refund.Environment != "SIMULATOR" || refund.AttemptNumber < 1)
            return Conflict(new { message = "Chưa có simulator attempt hợp lệ." });
        refund.Status = "SUCCEEDED";
        refund.CompletedAtUtc = DateTime.UtcNow;
        var succeeded = await _context.PropertyRefunds.IgnoreQueryFilters()
            .Where(item => item.PaymentId == refund.PaymentId && (item.Status == "SUCCEEDED" || item.Id == refund.Id))
            .SumAsync(item => item.RequestedAmount);
        if (succeeded >= refund.Payment.Amount) refund.Payment.Status = PaymentStatus.Refunded;
        await _context.SaveChangesAsync();
        return Ok(ToDto(refund, refund.Payment, false));
    }

    private IQueryable<PropertyRefund> RefundQuery() => _context.PropertyRefunds.IgnoreQueryFilters()
        .Include(item => item.Payment!).ThenInclude(item => item.Reservation)
        .Include(item => item.Payment!).ThenInclude(payment => payment.Refunds);
    private Guid? UserId() => Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;
    private bool IsCustomer() => User.IsInRole("Customer");
    private bool CanAccess(Payment payment, int staffAction = 1) => User.IsInRole("SuperAdmin") ||
        (IsCustomer() && payment.Reservation?.CustomerUserId == UserId()) ||
        HasPermission("PROPERTY_REFUND", staffAction) && CanAccessTenant(payment.TenantId);
    private bool CanAccessTenant(Guid tenantId) => User.IsInRole("SuperAdmin") ||
        Guid.TryParse(User.FindFirstValue("tenant_id"), out var claimTenantId) && claimTenantId == tenantId;
    private bool HasPermission(string function, int action) => User.FindAll("permission").Any(claim =>
    {
        var parts = claim.Value.Split(':', 2, StringSplitOptions.TrimEntries);
        return parts.Length == 2 && parts[0].Equals(function, StringComparison.OrdinalIgnoreCase) &&
            int.TryParse(parts[1], out var mask) && (mask & action) == action;
    });
    private static PropertyRefundDto ToDto(PropertyRefund refund, Payment payment, bool replayed)
    {
        var reserved = payment.Refunds.Where(item => item.Status is not "FAILED" and not "CANCELLED").Sum(item => item.RequestedAmount);
        return new(refund.PublicId, payment.Id.ToString(), refund.RequestedAmount, "VND", refund.Status,
            Math.Max(0, payment.Amount - reserved), refund.CreatedAtUtc, refund.CompletedAtUtc, replayed,
            refund.Provider, refund.Environment, refund.Reason, refund.FailureCode, refund.AttemptNumber);
    }
}

public record PropertyRefundRequest(decimal Amount, string? Reason);
public record PropertyRefundAttemptRequest(string? Provider, string? Environment);
public record PropertyRefundDto(string PublicId, string OriginalTransactionPublicId, decimal RequestedAmount,
    string Currency, string Status, decimal RemainingRefundableAmount, DateTime RequestedAt,
    DateTime? CompletedAt, bool Replayed, string? Provider, string? Environment,
    string? Reason = null, string? FailureCode = null, int AttemptNumber = 0);
public record PropertyRefundAttemptDto(string RefundPublicId, int AttemptNumber, string Provider,
    string Environment, string ProviderReference, string Status, bool Replayed);
