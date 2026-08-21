using System.Security.Claims;
using HotelSaas.Application.Common.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/notifications")]
[Authorize]
public sealed class NotificationsController(IApplicationDbContext context, ICurrentTenantService tenantService) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "system.read")]
    public async Task<ActionResult<NotificationPageDto>> List([FromQuery] int page = 0, [FromQuery] int size = 20)
    {
        if (tenantService.TenantId.HasValue) return Forbid();
        var userId = CurrentUserId(); if (!userId.HasValue) return Forbid();
        page = Math.Max(0, page); size = Math.Clamp(size, 1, 100);
        var query = context.AppNotifications.AsNoTracking().Where(item => item.UserId == userId && !item.IsDeleted)
            .OrderByDescending(item => item.CreatedAtUtc);
        var total = await query.CountAsync();
        var unread = await context.AppNotifications.CountAsync(item => item.UserId == userId && !item.IsDeleted && !item.IsRead);
        var rows = await query.Skip(page * size).Take(size).Select(item => new NotificationDto(
            item.Id, item.UserId, item.Type, item.Title, item.Message, item.IsRead, item.CreatedAtUtc,
            item.ResourceType, item.ResourceId)).ToListAsync();
        var pages = total == 0 ? 0 : (int)Math.Ceiling(total / (double)size);
        return Ok(new NotificationPageDto(rows, total, pages, page, size, page == 0, page + 1 >= pages, unread, 90));
    }

    [HttpPost("{id:guid}/read")]
    [Authorize(Policy = "system.update")]
    public async Task<IActionResult> MarkRead(Guid id)
    {
        if (tenantService.TenantId.HasValue) return Forbid();
        var userId = CurrentUserId(); if (!userId.HasValue) return Forbid();
        var item = await context.AppNotifications.FirstOrDefaultAsync(row => row.Id == id && row.UserId == userId && !row.IsDeleted);
        if (item == null) return NotFound(new { code = "NOTIFICATION_NOT_FOUND", message = "Không tìm thấy thông báo." });
        if (!item.IsRead) { item.IsRead = true; item.ReadAtUtc = DateTime.UtcNow; await context.SaveChangesAsync(); }
        return NoContent();
    }

    [HttpPost("read-all")]
    [Authorize(Policy = "system.update")]
    public async Task<IActionResult> MarkAllRead()
    {
        if (tenantService.TenantId.HasValue) return Forbid();
        var userId = CurrentUserId(); if (!userId.HasValue) return Forbid();
        var rows = await context.AppNotifications.Where(item => item.UserId == userId && !item.IsDeleted && !item.IsRead).ToListAsync();
        var now = DateTime.UtcNow;
        foreach (var item in rows) { item.IsRead = true; item.ReadAtUtc = now; }
        if (rows.Count > 0) await context.SaveChangesAsync();
        return NoContent();
    }

    private Guid? CurrentUserId() => Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;
}

public sealed record NotificationDto(Guid Id, Guid UserId, string Type, string Title, string Message, bool IsRead,
    DateTime CreatedAt, string? ResourceType, Guid? ResourceId);
public sealed record NotificationPageDto(IReadOnlyList<NotificationDto> Content, int TotalElements, int TotalPages,
    int Number, int Size, bool First, bool Last, int UnreadCount, int RetentionDays);
