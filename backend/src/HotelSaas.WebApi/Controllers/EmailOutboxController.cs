using System.Net;
using System.Security.Claims;
using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/admin/email-outbox")]
[Authorize]
public sealed class EmailOutboxController(IApplicationDbContext context, IEmailDeliveryService emailDelivery) : ControllerBase
{
    [HttpGet("failures")]
    [Authorize(Policy = "audit_log.read")]
    public async Task<ActionResult<EmailOutboxPageDto>> Failures([FromQuery] int page = 0, [FromQuery] int size = 25)
    {
        page = Math.Max(0, page);
        size = Math.Clamp(size, 1, 100);
        var tenantId = TenantScope();
        var query = context.Reservations.IgnoreQueryFilters().AsNoTracking()
            .Where(item => !item.IsDeleted && (tenantId == null || item.TenantId == tenantId) && (item.ConfirmationEmailStatus == "FAILED" || item.ConfirmationEmailStatus == "NOT_CONFIGURED"))
            .OrderByDescending(item => item.ConfirmationEmailLastAttemptUtc ?? item.CreatedAtUtc);
        var total = await query.CountAsync();
        var reservations = await query.Skip(page * size).Take(size).ToListAsync();
        var content = reservations.Select(ToFailure).ToList();
        return Ok(new EmailOutboxPageDto(content, total, total == 0 ? 0 : (int)Math.Ceiling(total / (double)size), page, size));
    }

    [HttpGet("{id:guid}/attempts")]
    [Authorize(Policy = "audit_log.read")]
    public async Task<ActionResult<IReadOnlyList<EmailDeliveryAttemptDto>>> Attempts(Guid id)
    {
        var reservation = await Find(id);
        if (reservation == null) return NotFound(new { message = "Không tìm thấy bản ghi email booking." });
        if (!reservation.ConfirmationEmailLastAttemptUtc.HasValue) return Ok(Array.Empty<EmailDeliveryAttemptDto>());
        return Ok(new[] { ToAttempt(reservation) });
    }

    [HttpPost("{id:guid}/retry")]
    [Authorize(Policy = "audit_log.execute")]
    public async Task<ActionResult<EmailOutboxFailureDto>> Retry(Guid id)
    {
        var tenantId = TenantScope();
        var reservation = await context.Reservations.IgnoreQueryFilters().Include(item => item.Tenant)
            .FirstOrDefaultAsync(item => item.Id == id && !item.IsDeleted && (tenantId == null || item.TenantId == tenantId));
        if (reservation == null) return NotFound(new { message = "Không tìm thấy bản ghi email booking." });
        if (reservation.ConfirmationEmailStatus == "SENT")
            return Conflict(new { code = "EMAIL_ALREADY_SENT", message = "Email xác nhận booking đã được gửi thành công." });
        if (reservation.ConfirmationEmailLastAttemptUtc > DateTime.UtcNow.AddSeconds(-30))
            return Conflict(new { code = "EMAIL_RETRY_COOLDOWN", message = "Vui lòng chờ 30 giây trước khi gửi lại email." });

        reservation.ConfirmationEmailLastAttemptUtc = DateTime.UtcNow;
        if (!emailDelivery.IsConfigured)
        {
            reservation.ConfirmationEmailStatus = "NOT_CONFIGURED";
            reservation.ConfirmationEmailFailureReason = "EMAIL_PROVIDER_NOT_CONFIGURED";
            await context.SaveChangesAsync();
            return Ok(ToFailure(reservation));
        }

        reservation.ConfirmationEmailStatus = "PENDING";
        reservation.ConfirmationEmailFailureReason = null;
        await context.SaveChangesAsync();
        var result = await emailDelivery.SendAsync(reservation.GuestEmail,
            $"Xác nhận booking {reservation.BookingCode}", ConfirmationBody(reservation));
        reservation.ConfirmationEmailStatus = result.Status;
        reservation.ConfirmationEmailSentAtUtc = result.Sent ? DateTime.UtcNow : null;
        reservation.ConfirmationEmailFailureReason = result.Error;
        await context.SaveChangesAsync();
        return Ok(ToFailure(reservation));
    }

    private Task<Reservation?> Find(Guid id)
    {
        var tenantId = TenantScope();
        return context.Reservations.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(item => item.Id == id && !item.IsDeleted && (tenantId == null || item.TenantId == tenantId));
    }

    private Guid? TenantScope() => User?.Identity?.IsAuthenticated != true || User.IsInRole("SuperAdmin") ? null :
        Guid.TryParse(User.FindFirstValue("tenant_id"), out var tenantId) ? tenantId : Guid.Empty;

    private static EmailOutboxFailureDto ToFailure(Reservation item) => new(
        item.Id, item.TenantId, $"BOOKING_CONFIRMATION:{item.Id:N}", "BOOKING_CONFIRMATION", "v1",
        MaskEmail(item.GuestEmail), $"Xác nhận booking {item.BookingCode}", item.ConfirmationEmailStatus,
        item.ConfirmationEmailLastAttemptUtc.HasValue ? 1 : 0, 1, 0,
        item.ConfirmationEmailFailureReason ?? (item.ConfirmationEmailStatus == "NOT_CONFIGURED" ? "EMAIL_PROVIDER_NOT_CONFIGURED" : null),
        item.ConfirmationEmailLastAttemptUtc, item.ConfirmationEmailLastAttemptUtc ?? item.CreatedAtUtc, item.CreatedAtUtc);

    private static EmailDeliveryAttemptDto ToAttempt(Reservation item) => new(
        item.Id, 1, item.ConfirmationEmailStatus, item.ConfirmationEmailFailureReason,
        item.ConfirmationEmailStatus == "SENT" ? item.BookingCode : null, 0,
        item.ConfirmationEmailLastAttemptUtc ?? item.CreatedAtUtc);

    private static string MaskEmail(string email)
    {
        var separator = email.IndexOf('@');
        if (separator <= 0) return "***";
        return $"{email[0]}***{email[separator..]}";
    }

    private static string ConfirmationBody(Reservation reservation)
    {
        var propertyName = reservation.Tenant?.Name ?? "LuxeStay";
        return $"<h1>Booking {WebUtility.HtmlEncode(reservation.BookingCode)}</h1>" +
               $"<p>Xin chào {WebUtility.HtmlEncode(reservation.GuestFullName)},</p>" +
               $"<p>Đơn đặt phòng tại <strong>{WebUtility.HtmlEncode(propertyName)}</strong> đã được ghi nhận.</p>" +
               $"<p>Nhận phòng: {reservation.CheckInDate:dd/MM/yyyy}<br>Trả phòng: {reservation.CheckOutDate:dd/MM/yyyy}<br>" +
               $"Tổng tiền: {reservation.TotalAmount:N0} VND</p>";
    }
}

public sealed record EmailOutboxPageDto(IReadOnlyList<EmailOutboxFailureDto> Content, int TotalElements, int TotalPages, int Number, int Size);
public sealed record EmailOutboxFailureDto(Guid Id, Guid HotelId, string IdempotencyKey, string TemplateKey, string TemplateVersion,
    string MaskedRecipient, string Subject, string Status, int AttemptCount, int MaxAttempts, int ManualRetryCount,
    string? LastErrorCode, DateTime? FailedAt, DateTime NextAttemptAt, DateTime CreatedAt);
public sealed record EmailDeliveryAttemptDto(Guid Id, int AttemptNumber, string Outcome, string? ErrorCode,
    string? ProviderMessageId, int DurationMs, DateTime AttemptedAt);
