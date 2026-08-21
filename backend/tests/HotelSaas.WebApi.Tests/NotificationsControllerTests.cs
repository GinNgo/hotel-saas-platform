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

public sealed class NotificationsControllerTests
{
    [Fact]
    public async Task List_returns_only_the_current_platform_users_notifications()
    {
        var tenant = new CurrentTenantService();
        await using var db = Context(tenant);
        var userId = Guid.NewGuid();
        db.AppNotifications.AddRange(
            new AppNotification { UserId = userId, Type = "SUPPORT_MESSAGE", Title = "Mine", Message = "A" },
            new AppNotification { UserId = Guid.NewGuid(), Type = "SUPPORT_MESSAGE", Title = "Other", Message = "B" });
        await db.SaveChangesAsync();

        var result = await Controller(db, tenant, userId).List();

        var page = Assert.IsType<NotificationPageDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Single(page.Content);
        Assert.Equal("Mine", page.Content[0].Title);
        Assert.Equal(1, page.UnreadCount);
    }

    [Fact]
    public async Task Mark_read_is_idempotent_and_cannot_mutate_another_users_notification()
    {
        var tenant = new CurrentTenantService();
        await using var db = Context(tenant);
        var userId = Guid.NewGuid();
        var mine = new AppNotification { UserId = userId, Type = "TEST", Title = "Mine", Message = "A" };
        var other = new AppNotification { UserId = Guid.NewGuid(), Type = "TEST", Title = "Other", Message = "B" };
        db.AppNotifications.AddRange(mine, other);
        await db.SaveChangesAsync();
        var controller = Controller(db, tenant, userId);

        Assert.IsType<NoContentResult>(await controller.MarkRead(mine.Id));
        Assert.IsType<NoContentResult>(await controller.MarkRead(mine.Id));
        Assert.IsType<NotFoundObjectResult>(await controller.MarkRead(other.Id));
        Assert.True(mine.IsRead);
        Assert.NotNull(mine.ReadAtUtc);
        Assert.False(other.IsRead);
    }

    [Fact]
    public async Task Tenant_context_cannot_open_platform_notifications()
    {
        var tenant = new CurrentTenantService();
        tenant.SetTenant(Guid.NewGuid(), SubscriptionTier.Basic);
        await using var db = Context(tenant);

        var result = await Controller(db, tenant, Guid.NewGuid()).List();

        Assert.IsType<ForbidResult>(result.Result);
    }

    [Fact]
    public async Task Mark_all_read_updates_only_the_current_users_unread_rows()
    {
        var tenant = new CurrentTenantService();
        await using var db = Context(tenant);
        var userId = Guid.NewGuid();
        var mine = new AppNotification { UserId = userId, Type = "TEST", Title = "Mine", Message = "A" };
        var other = new AppNotification { UserId = Guid.NewGuid(), Type = "TEST", Title = "Other", Message = "B" };
        db.AppNotifications.AddRange(mine, other);
        await db.SaveChangesAsync();

        var result = await Controller(db, tenant, userId).MarkAllRead();

        Assert.IsType<NoContentResult>(result);
        Assert.True(mine.IsRead);
        Assert.NotNull(mine.ReadAtUtc);
        Assert.False(other.IsRead);
    }

    [Fact]
    public async Task Incoming_support_message_creates_a_notification_for_each_active_superadmin()
    {
        var tenant = new CurrentTenantService();
        await using var db = Context(tenant);
        var customerId = Guid.NewGuid();
        var admin = new User { Username = "superadmin", Email = "admin@example.test", FullName = "Admin", GlobalRole = GlobalUserRole.SuperAdmin, IsActive = true };
        db.Users.Add(admin);
        await db.SaveChangesAsync();
        var support = new SupportChatController(db, tenant)
        {
            ControllerContext = Principal(customerId)
        };

        await support.SendCustomerMessage(new("Tôi cần hỗ trợ"));

        var notification = Assert.Single(db.AppNotifications);
        Assert.Equal(admin.Id, notification.UserId);
        Assert.Equal("SUPPORT_MESSAGE", notification.Type);
        Assert.NotNull(notification.ResourceId);
    }

    private static ApplicationDbContext Context(CurrentTenantService tenant) => new(
        new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options, tenant);

    private static NotificationsController Controller(ApplicationDbContext db, CurrentTenantService tenant, Guid userId) => new(db, tenant)
    {
        ControllerContext = Principal(userId)
    };

    private static ControllerContext Principal(Guid userId) => new()
    {
        HttpContext = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, userId.ToString())], "test"))
        }
    };
}
