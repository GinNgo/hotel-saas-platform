using System.Security.Claims;
using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/chat")]
[Authorize]
public sealed class SupportChatController(IApplicationDbContext context, ICurrentTenantService tenantService) : ControllerBase
{
    [HttpGet("me/history")]
    [Authorize(Roles = "Customer")]
    public async Task<ActionResult<IReadOnlyList<SupportMessageDto>>> CustomerHistory()
    {
        var userId = CurrentUserId();
        if (!userId.HasValue) return Forbid();
        var conversationIds = await context.SupportConversations.AsNoTracking()
            .Where(item => item.CreatedByUserId == userId && item.Channel == "IN_APP" && !item.IsDeleted)
            .Select(item => item.Id).ToListAsync();
        var rows = await context.SupportMessages.AsNoTracking()
            .Where(item => conversationIds.Contains(item.ConversationId) && !item.IsDeleted)
            .OrderBy(item => item.CreatedAtUtc).ToListAsync();
        return Ok(rows.Select(ToDto).ToList());
    }

    [HttpPost("me/messages")]
    [Authorize(Roles = "Customer")]
    public async Task<ActionResult<SupportMessageDto>> SendCustomerMessage([FromBody] SendCustomerSupportMessageRequest request)
    {
        var userId = CurrentUserId();
        if (!userId.HasValue) return Forbid();
        var content = request.Content?.Trim();
        if (content?.Length is not (>= 1 and <= 2000)) return BadRequest(new { code = "SUPPORT_MESSAGE_INVALID", message = "Tin nhắn phải có từ 1 đến 2000 ký tự." });

        Guid? tenantId = request.PropertyId;
        Guid? reservationId = request.ReservationId;
        if (reservationId.HasValue)
        {
            var reservation = await context.Reservations.IgnoreQueryFilters().AsNoTracking()
                .FirstOrDefaultAsync(item => item.Id == reservationId && item.CustomerUserId == userId && !item.IsDeleted);
            if (reservation == null) return NotFound(new { code = "SUPPORT_RESERVATION_NOT_FOUND", message = "Không tìm thấy booking thuộc tài khoản." });
            tenantId = reservation.TenantId;
        }
        else if (tenantId.HasValue)
        {
            if (!await context.Tenants.IgnoreQueryFilters().AnyAsync(item => item.Id == tenantId && !item.IsDeleted))
                return NotFound(new { code = "SUPPORT_PROPERTY_NOT_FOUND", message = "Không tìm thấy cơ sở." });
        }
        else
        {
            var latestReservation = await context.Reservations.IgnoreQueryFilters().AsNoTracking()
                .Where(item => item.CustomerUserId == userId && !item.IsDeleted)
                .OrderByDescending(item => item.CreatedAtUtc)
                .Select(item => new { item.Id, item.TenantId }).FirstOrDefaultAsync();
            if (latestReservation != null)
            {
                reservationId = latestReservation.Id;
                tenantId = latestReservation.TenantId;
            }
        }

        var conversation = await context.SupportConversations
            .Where(item => item.CreatedByUserId == userId && item.Channel == "IN_APP" && item.Status != "CLOSED" &&
                item.TenantId == tenantId && item.ReservationId == reservationId)
            .OrderByDescending(item => item.LastMessageAtUtc).FirstOrDefaultAsync();
        if (conversation == null)
        {
            conversation = new SupportConversation
            {
                TenantId = tenantId, ReservationId = reservationId, CreatedByUserId = userId.Value,
                Channel = "IN_APP", Subject = reservationId.HasValue ? "Hỗ trợ booking" : "Hỗ trợ khách hàng"
            };
            context.SupportConversations.Add(conversation);
        }
        var message = new SupportMessage { TenantId = tenantId, Conversation = conversation, SenderUserId = userId.Value, Content = content };
        conversation.LastMessageAtUtc = message.CreatedAtUtc;
        context.SupportMessages.Add(message);
        await NotifyPlatformAdmins(message, "Yêu cầu hỗ trợ mới từ khách hàng");
        await context.SaveChangesAsync();
        return Ok(ToDto(message));
    }

    [HttpGet("tenant/history")]
    [Authorize(Policy = "ai_chat.read")]
    public async Task<ActionResult<IReadOnlyList<SupportMessageDto>>> TenantHistory([FromQuery] Guid propertyId)
    {
        var userId = CurrentUserId();
        if (!userId.HasValue || tenantService.TenantId != propertyId) return NotFound(new { message = "Không tìm thấy cơ sở." });
        var conversation = await context.SupportConversations.AsNoTracking()
            .Where(item => item.TenantId == propertyId && item.CreatedByUserId == userId && item.Channel == "TENANT_ADMIN")
            .OrderByDescending(item => item.LastMessageAtUtc).FirstOrDefaultAsync();
        if (conversation == null) return Ok(Array.Empty<SupportMessageDto>());
        return Ok(await Messages(conversation.Id));
    }

    [HttpPost("tenant/messages")]
    [Authorize(Policy = "ai_chat.create")]
    public async Task<ActionResult<SupportMessageDto>> SendTenantMessage([FromBody] SendTenantSupportMessageRequest request)
    {
        var userId = CurrentUserId();
        if (!userId.HasValue) return Forbid();
        if (tenantService.TenantId != request.PropertyId) return NotFound(new { message = "Không tìm thấy cơ sở." });
        var content = request.Content?.Trim();
        if (content?.Length is not (>= 1 and <= 2000)) return BadRequest(new { code = "SUPPORT_MESSAGE_INVALID", message = "Tin nhắn phải có từ 1 đến 2000 ký tự." });

        var conversation = await context.SupportConversations
            .Where(item => item.TenantId == request.PropertyId && item.CreatedByUserId == userId && item.Channel == "TENANT_ADMIN" && item.Status != "CLOSED")
            .OrderByDescending(item => item.LastMessageAtUtc).FirstOrDefaultAsync();
        if (conversation == null)
        {
            conversation = new SupportConversation { TenantId = request.PropertyId, CreatedByUserId = userId.Value };
            context.SupportConversations.Add(conversation);
        }
        var message = new SupportMessage { TenantId = request.PropertyId, Conversation = conversation, SenderUserId = userId.Value, Content = content };
        conversation.LastMessageAtUtc = message.CreatedAtUtc;
        context.SupportMessages.Add(message);
        await NotifyPlatformAdmins(message, "Yêu cầu hỗ trợ mới từ đối tác");
        await context.SaveChangesAsync();
        return Ok(ToDto(message));
    }

    [HttpGet("support/conversations")]
    [Authorize(Policy = "ai_chat.read")]
    public async Task<ActionResult<IReadOnlyList<SupportConversationDto>>> Conversations()
    {
        if (tenantService.TenantId.HasValue) return Forbid();
        var rows = await context.SupportConversations.IgnoreQueryFilters().AsNoTracking()
            .Include(item => item.Tenant).Include(item => item.CreatedByUser).Include(item => item.Messages)
            .Where(item => !item.IsDeleted)
            .OrderBy(item => item.Status == "CLOSED").ThenByDescending(item => item.LastMessageAtUtc)
            .ToListAsync();
        return Ok(rows.Select(ToDto).ToList());
    }

    [HttpGet("support/conversations/{conversationId:guid}")]
    [Authorize(Policy = "ai_chat.read")]
    public async Task<ActionResult<IReadOnlyList<SupportMessageDto>>> ConversationHistory(Guid conversationId)
    {
        if (tenantService.TenantId.HasValue) return Forbid();
        var exists = await context.SupportConversations.IgnoreQueryFilters().AnyAsync(item => item.Id == conversationId && !item.IsDeleted);
        return exists ? Ok(await Messages(conversationId, true)) : NotFound(new { message = "Không tìm thấy hội thoại." });
    }

    [HttpPost("support/conversations/{conversationId:guid}/messages")]
    [Authorize(Policy = "ai_chat.update")]
    public async Task<ActionResult<SupportMessageDto>> Reply(Guid conversationId, [FromBody] SendSupportReplyRequest request)
    {
        if (tenantService.TenantId.HasValue) return Forbid();
        var userId = CurrentUserId();
        if (!userId.HasValue) return Forbid();
        var content = request.Content?.Trim();
        if (content?.Length is not (>= 1 and <= 2000)) return BadRequest(new { code = "SUPPORT_MESSAGE_INVALID", message = "Tin nhắn phải có từ 1 đến 2000 ký tự." });
        var conversation = await context.SupportConversations.IgnoreQueryFilters().FirstOrDefaultAsync(item => item.Id == conversationId && !item.IsDeleted);
        if (conversation == null) return NotFound(new { message = "Không tìm thấy hội thoại." });
        if (conversation.Status == "CLOSED") return Conflict(new { code = "SUPPORT_CONVERSATION_CLOSED", message = "Hội thoại đã đóng." });
        var message = new SupportMessage { TenantId = conversation.TenantId, ConversationId = conversation.Id, SenderUserId = userId.Value, Content = content };
        conversation.AssignedAgentUserId ??= userId;
        conversation.AssignedAtUtc ??= DateTime.UtcNow;
        conversation.Status = "ASSIGNED";
        conversation.LastMessageAtUtc = message.CreatedAtUtc;
        conversation.Version++;
        context.SupportMessages.Add(message);
        await context.SaveChangesAsync();
        return Ok(ToDto(message));
    }

    [HttpPost("support/conversations/{conversationId:guid}/assign")]
    [Authorize(Policy = "ai_chat.update")]
    public async Task<ActionResult<SupportConversationDto>> Assign(Guid conversationId, [FromBody] SupportConversationVersionRequest request)
    {
        var conversation = await PlatformConversation(conversationId);
        if (conversation.Result != null) return conversation.Result;
        var item = conversation.Value!;
        var conflict = VersionConflict(item, request.ExpectedVersion); if (conflict != null) return conflict;
        var userId = CurrentUserId(); if (!userId.HasValue) return Forbid();
        if (item.Status == "CLOSED") return Conflict(new { code = "SUPPORT_CONVERSATION_CLOSED", message = "Hội thoại đã đóng." });
        item.AssignedAgentUserId = userId;
        item.AssignedAtUtc = DateTime.UtcNow;
        item.Status = "ASSIGNED";
        item.Version++;
        await context.SaveChangesAsync();
        return Ok(ToDto(item));
    }

    [HttpPost("support/conversations/{conversationId:guid}/close")]
    [Authorize(Policy = "ai_chat.update")]
    public async Task<ActionResult<SupportConversationDto>> Close(Guid conversationId, [FromBody] SupportConversationVersionRequest request)
    {
        var conversation = await PlatformConversation(conversationId);
        if (conversation.Result != null) return conversation.Result;
        var item = conversation.Value!;
        var conflict = VersionConflict(item, request.ExpectedVersion); if (conflict != null) return conflict;
        var userId = CurrentUserId(); if (!userId.HasValue) return Forbid();
        if (item.Status == "CLOSED") return Ok(ToDto(item));
        item.Status = "CLOSED";
        item.ClosedByUserId = userId;
        item.ClosedAtUtc = DateTime.UtcNow;
        item.Version++;
        await context.SaveChangesAsync();
        return Ok(ToDto(item));
    }

    [HttpPost("support/conversations/{conversationId:guid}/reopen")]
    [Authorize(Policy = "ai_chat.update")]
    public async Task<ActionResult<SupportConversationDto>> Reopen(Guid conversationId, [FromBody] SupportConversationVersionRequest request)
    {
        var conversation = await PlatformConversation(conversationId);
        if (conversation.Result != null) return conversation.Result;
        var item = conversation.Value!;
        var conflict = VersionConflict(item, request.ExpectedVersion); if (conflict != null) return conflict;
        var userId = CurrentUserId(); if (!userId.HasValue) return Forbid();
        if (item.Status != "CLOSED") return Conflict(new { code = "SUPPORT_CONVERSATION_NOT_CLOSED", message = "Chỉ hội thoại đã đóng mới có thể mở lại." });
        item.Status = item.AssignedAgentUserId.HasValue ? "ASSIGNED" : "OPEN";
        item.ReopenedByUserId = userId;
        item.ReopenedAtUtc = DateTime.UtcNow;
        item.Version++;
        await context.SaveChangesAsync();
        return Ok(ToDto(item));
    }

    private async Task<List<SupportMessageDto>> Messages(Guid conversationId, bool ignoreFilters = false)
    {
        var query = ignoreFilters ? context.SupportMessages.IgnoreQueryFilters() : context.SupportMessages;
        var rows = await query.AsNoTracking().Where(item => item.ConversationId == conversationId && !item.IsDeleted)
            .OrderBy(item => item.CreatedAtUtc).ToListAsync();
        return rows.Select(item => new SupportMessageDto(item.Id, item.ConversationId, item.TenantId, item.SenderUserId, item.Content, item.CreatedAtUtc, item.IsRead)).ToList();
    }

    private Guid? CurrentUserId() => Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;
    private async Task NotifyPlatformAdmins(SupportMessage message, string title)
    {
        var adminIds = await context.Users.IgnoreQueryFilters().AsNoTracking()
            .Where(item => item.GlobalRole == GlobalUserRole.SuperAdmin && item.IsActive && !item.IsDeleted)
            .Select(item => item.Id).ToListAsync();
        foreach (var adminId in adminIds)
            context.AppNotifications.Add(new AppNotification
            {
                UserId = adminId,
                Type = "SUPPORT_MESSAGE",
                Title = title,
                Message = message.Content.Length <= 160 ? message.Content : message.Content[..160] + "…",
                ResourceType = "SUPPORT_CONVERSATION",
                ResourceId = message.Conversation?.Id ?? message.ConversationId
            });
    }
    private async Task<ActionResult<SupportConversation>> PlatformConversation(Guid id)
    {
        if (tenantService.TenantId.HasValue) return Forbid();
        var item = await context.SupportConversations.IgnoreQueryFilters()
            .FirstOrDefaultAsync(row => row.Id == id && !row.IsDeleted);
        return item == null ? NotFound(new { message = "Không tìm thấy hội thoại." }) : item;
    }

    private ActionResult? VersionConflict(SupportConversation item, int expectedVersion) => item.Version == expectedVersion ? null :
        Conflict(new { code = "SUPPORT_CONVERSATION_VERSION_CONFLICT", message = "Hội thoại đã được cập nhật bởi người khác.", currentVersion = item.Version });

    private static SupportMessageDto ToDto(SupportMessage item) =>
        new(item.Id, item.ConversationId, item.TenantId, item.SenderUserId, item.Content, item.CreatedAtUtc, item.IsRead);
    private static SupportConversationDto ToDto(SupportConversation item)
    {
        var last = item.Messages.OrderByDescending(message => message.CreatedAtUtc).FirstOrDefault();
        return new(item.Id, item.CreatedByUserId, item.CreatedByUser?.FullName ?? item.CreatedByUser?.Username ?? "Đối tác",
            item.TenantId, item.Tenant?.Name ?? "Cơ sở", item.AssignedAgentUserId, item.Channel, item.Subject, item.Status,
            last?.Content ?? string.Empty, item.LastMessageAtUtc, item.Version, item.AssignedAtUtc,
            item.ClosedByUserId, item.ClosedAtUtc, item.ReopenedByUserId, item.ReopenedAtUtc);
    }
}

public sealed record SendCustomerSupportMessageRequest(string Content, Guid? PropertyId = null, Guid? ReservationId = null);
public sealed record SendTenantSupportMessageRequest(Guid PropertyId, string Content);
public sealed record SendSupportReplyRequest(string Content);
public sealed record SupportConversationVersionRequest(int ExpectedVersion);
public sealed record SupportMessageDto(Guid Id, Guid ConversationId, Guid? PropertyId, Guid SenderId, string Content, DateTime Timestamp, bool IsRead);
public sealed record SupportConversationDto(Guid ConversationId, Guid CustomerId, string CustomerName, Guid? PropertyId, string PropertyName,
    Guid? AssignedAgentId, string Channel, string Subject, string Status, string LastMessage, DateTime? LastMessageAt, int Version,
    DateTime? AssignedAt, Guid? ClosedByUserId, DateTime? ClosedAt, Guid? ReopenedByUserId, DateTime? ReopenedAt);
