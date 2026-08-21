using System.Security.Claims;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using HotelSaas.Infrastructure.Persistence;
using HotelSaas.Infrastructure.Services;
using HotelSaas.WebApi.Controllers;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace HotelSaas.WebApi.Tests;

public sealed class SupportChatControllerTests
{
    [Fact]
    public async Task Customer_message_uses_the_latest_owned_booking_context()
    {
        var tenant = new CurrentTenantService();
        await using var db = Context(tenant);
        var userId = Guid.NewGuid();
        var tenantId = Guid.NewGuid();
        var reservation = new Reservation
        {
            TenantId = tenantId, CustomerUserId = userId, BookingCode = "LXS-CUSTOMER-CHAT",
            GuestFullName = "Khách hàng", GuestEmail = "guest@example.test"
        };
        db.Reservations.Add(reservation);
        await db.SaveChangesAsync();

        var result = await Controller(db, tenant, userId).SendCustomerMessage(new("Tôi cần hỗ trợ booking"));

        Assert.IsType<OkObjectResult>(result.Result);
        var conversation = Assert.Single(db.SupportConversations);
        Assert.Equal(tenantId, conversation.TenantId);
        Assert.Equal(reservation.Id, conversation.ReservationId);
        Assert.Equal("IN_APP", conversation.Channel);
    }

    [Fact]
    public async Task Customer_cannot_attach_another_users_booking()
    {
        var tenant = new CurrentTenantService();
        await using var db = Context(tenant);
        var reservation = new Reservation
        {
            TenantId = Guid.NewGuid(), CustomerUserId = Guid.NewGuid(), BookingCode = "LXS-OTHER",
            GuestFullName = "Khách khác", GuestEmail = "other@example.test"
        };
        db.Reservations.Add(reservation);
        await db.SaveChangesAsync();

        var result = await Controller(db, tenant, Guid.NewGuid()).SendCustomerMessage(new("Không được phép", ReservationId: reservation.Id));

        Assert.IsType<NotFoundObjectResult>(result.Result);
        Assert.Empty(db.SupportConversations);
    }

    [Fact]
    public async Task Customer_history_excludes_other_principals_messages()
    {
        var tenant = new CurrentTenantService();
        await using var db = Context(tenant);
        var userId = Guid.NewGuid();
        var own = new SupportConversation { CreatedByUserId = userId, Channel = "IN_APP" };
        var other = new SupportConversation { CreatedByUserId = Guid.NewGuid(), Channel = "IN_APP" };
        db.SupportMessages.AddRange(
            new SupportMessage { Conversation = own, SenderUserId = userId, Content = "Của tôi" },
            new SupportMessage { Conversation = other, SenderUserId = other.CreatedByUserId, Content = "Không phải của tôi" });
        await db.SaveChangesAsync();

        var result = await Controller(db, tenant, userId).CustomerHistory();

        var rows = Assert.IsAssignableFrom<IReadOnlyList<SupportMessageDto>>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Single(rows);
        Assert.Equal("Của tôi", rows[0].Content);
    }

    [Fact]
    public async Task Tenant_message_is_persisted_with_guid_scope_and_returned_in_history()
    {
        var tenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var tenant = new CurrentTenantService();
        tenant.SetTenant(tenantId, SubscriptionTier.Basic);
        await using var db = Context(tenant);
        var controller = Controller(db, tenant, userId);

        var sent = await controller.SendTenantMessage(new(tenantId, "  Cần hỗ trợ cấu hình  "));
        var history = await controller.TenantHistory(tenantId);

        Assert.IsType<OkObjectResult>(sent.Result);
        var rows = Assert.IsAssignableFrom<IReadOnlyList<SupportMessageDto>>(Assert.IsType<OkObjectResult>(history.Result).Value);
        Assert.Single(rows);
        Assert.Equal("Cần hỗ trợ cấu hình", rows[0].Content);
        Assert.Equal(tenantId, rows[0].PropertyId);
    }

    [Fact]
    public async Task Tenant_cannot_send_or_read_another_property_support_thread()
    {
        var tenant = new CurrentTenantService();
        tenant.SetTenant(Guid.NewGuid(), SubscriptionTier.Basic);
        await using var db = Context(tenant);
        var controller = Controller(db, tenant, Guid.NewGuid());

        var send = await controller.SendTenantMessage(new(Guid.NewGuid(), "Không hợp lệ"));
        var history = await controller.TenantHistory(Guid.NewGuid());

        Assert.IsType<NotFoundObjectResult>(send.Result);
        Assert.IsType<NotFoundObjectResult>(history.Result);
        Assert.Empty(db.SupportMessages);
    }

    [Fact]
    public async Task Tenant_context_cannot_open_the_platform_support_queue()
    {
        var tenant = new CurrentTenantService();
        tenant.SetTenant(Guid.NewGuid(), SubscriptionTier.Basic);
        await using var db = Context(tenant);

        var result = await Controller(db, tenant, Guid.NewGuid()).Conversations();

        Assert.IsType<ForbidResult>(result.Result);
    }

    [Fact]
    public async Task Platform_agent_reply_assigns_the_conversation_and_keeps_tenant_scope()
    {
        var tenant = new CurrentTenantService();
        await using var db = Context(tenant);
        var tenantId = Guid.NewGuid();
        var conversation = new SupportConversation { TenantId = tenantId, CreatedByUserId = Guid.NewGuid() };
        db.SupportConversations.Add(conversation);
        await db.SaveChangesAsync();
        var agentId = Guid.NewGuid();

        var result = await Controller(db, tenant, agentId).Reply(conversation.Id, new("Đã tiếp nhận yêu cầu"));

        Assert.IsType<OkObjectResult>(result.Result);
        Assert.Equal(agentId, conversation.AssignedAgentUserId);
        Assert.Equal("ASSIGNED", conversation.Status);
        Assert.Equal(tenantId, Assert.Single(db.SupportMessages.IgnoreQueryFilters()).TenantId);
    }

    [Fact]
    public async Task Platform_agent_can_assign_close_and_reopen_with_audit_metadata()
    {
        var tenant = new CurrentTenantService();
        await using var db = Context(tenant);
        var conversation = new SupportConversation { CreatedByUserId = Guid.NewGuid(), Channel = "IN_APP" };
        db.SupportConversations.Add(conversation);
        await db.SaveChangesAsync();
        var agentId = Guid.NewGuid();
        var controller = Controller(db, tenant, agentId);

        var assigned = await controller.Assign(conversation.Id, new(1));
        var closed = await controller.Close(conversation.Id, new(2));
        var reopened = await controller.Reopen(conversation.Id, new(3));

        Assert.IsType<OkObjectResult>(assigned.Result);
        Assert.IsType<OkObjectResult>(closed.Result);
        Assert.IsType<OkObjectResult>(reopened.Result);
        Assert.Equal(agentId, conversation.AssignedAgentUserId);
        Assert.NotNull(conversation.AssignedAtUtc);
        Assert.Equal(agentId, conversation.ClosedByUserId);
        Assert.NotNull(conversation.ClosedAtUtc);
        Assert.Equal(agentId, conversation.ReopenedByUserId);
        Assert.NotNull(conversation.ReopenedAtUtc);
        Assert.Equal("ASSIGNED", conversation.Status);
        Assert.Equal(4, conversation.Version);
    }

    [Fact]
    public async Task Lifecycle_rejects_a_stale_conversation_version()
    {
        var tenant = new CurrentTenantService();
        await using var db = Context(tenant);
        var conversation = new SupportConversation { CreatedByUserId = Guid.NewGuid(), Version = 4 };
        db.SupportConversations.Add(conversation);
        await db.SaveChangesAsync();

        var result = await Controller(db, tenant, Guid.NewGuid()).Close(conversation.Id, new(3));

        var conflict = Assert.IsType<ConflictObjectResult>(result.Result);
        Assert.Contains("SUPPORT_CONVERSATION_VERSION_CONFLICT", System.Text.Json.JsonSerializer.Serialize(conflict.Value));
        Assert.Equal("OPEN", conversation.Status);
    }

    private static ApplicationDbContext Context(CurrentTenantService tenant)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        return new ApplicationDbContext(options, tenant);
    }

    private static SupportChatController Controller(ApplicationDbContext db, CurrentTenantService tenant, Guid userId)
    {
        return new SupportChatController(db, tenant)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, userId.ToString())], "test"))
                }
            }
        };
    }
}
