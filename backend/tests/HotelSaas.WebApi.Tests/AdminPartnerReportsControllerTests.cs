using System.Text.Json;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using HotelSaas.Infrastructure.Persistence;
using HotelSaas.Infrastructure.Services;
using HotelSaas.WebApi.Controllers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace HotelSaas.WebApi.Tests;

public class AdminPartnerReportsControllerTests
{
    [Fact]
    public async Task Property_reports_return_authoritative_owner_staff_and_inventory_data()
    {
        var tenantService = new CurrentTenantService();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using var db = new ApplicationDbContext(options, tenantService);
        var tenant = new Tenant
        {
            Name = "Luxe Partner Hotel", Code = "LPH", Slug = "luxe-partner-hotel", Address = "1 Bach Dang",
            City = "Da Nang", Status = TenantStatus.Active
        };
        var owner = new User
        {
            Username = "partner-owner", Email = "owner@example.com", FullName = "Partner Owner",
            PasswordHash = "test", GlobalRole = GlobalUserRole.TenantStaff, IsActive = true
        };
        var roomType = new RoomType
        {
            TenantId = tenant.Id, Tenant = tenant, Name = "Deluxe", Code = "DLX", BasePricePerNight = 1_250_000,
            CapacityAdults = 2, CapacityChildren = 1, IsActive = true
        };
        var room = new Room
        {
            TenantId = tenant.Id, Tenant = tenant, RoomType = roomType, RoomTypeId = roomType.Id,
            RoomNumber = "701", Floor = 7, Status = RoomStatus.Dirty, IsActive = true
        };
        db.AddRange(tenant, owner, new TenantStaff
        {
            TenantId = tenant.Id, Tenant = tenant, UserId = owner.Id, User = owner, Role = StaffRole.Owner, IsActive = true
        }, roomType, room);
        await db.SaveChangesAsync();
        var controller = new AdminPartnerReportsController(db);

        var owners = Json(await controller.PropertyOwners());
        var registrations = Json(await controller.PropertyRegistrations());
        var staff = Json(await controller.PropertyStaff());
        var roomTypes = Json(await controller.PropertyRoomTypes());
        var rooms = Json(await controller.PropertyRooms());

        Assert.Contains("Partner Owner", owners);
        Assert.Contains("\"roomCount\":1", owners);
        Assert.Contains("Luxe Partner Hotel", registrations);
        Assert.Contains("OWNER", staff);
        Assert.Contains("\"maxGuests\":3", roomTypes);
        Assert.Contains("\"housekeepingStatus\":\"DIRTY\"", rooms);
    }

    [Fact]
    public async Task Unsubscribed_report_excludes_an_owner_with_an_active_plan()
    {
        var tenantService = new CurrentTenantService();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using var db = new ApplicationDbContext(options, tenantService);
        var plan = new SubscriptionPlan { Code = "PRO", NameVi = "Pro", NameEn = "Pro", Price = 500_000, IsActive = true };
        var tenant = new Tenant
        {
            Name = "Subscribed Hotel", Code = "SUB", Slug = "subscribed-hotel", Address = "1 Tran Phu", City = "Hue",
            ActiveSubscriptionPlan = plan, ActiveSubscriptionPlanId = plan.Id,
            SubscriptionEffectiveUntilUtc = DateTime.UtcNow.AddMonths(1)
        };
        var owner = new User
        {
            Username = "subscribed-owner", Email = "subscribed@example.com", FullName = "Subscribed Owner",
            PasswordHash = "test", GlobalRole = GlobalUserRole.TenantStaff, IsActive = true
        };
        var order = new PlatformSubscriptionOrder
        {
            PublicId = "ORDER-PUBLIC-1", OrderCode = "SUB-2026-001", OwnerUserId = owner.Id, TenantId = tenant.Id,
            SubscriptionPlan = plan, SubscriptionPlanId = plan.Id, PlanCode = plan.Code, PlanName = plan.NameVi,
            PlanVersion = "2026-08", Price = 500_000, BillingPeriod = "MONTHLY", Status = "APPLIED",
            AppliedAtUtc = DateTime.UtcNow.AddDays(-2), ExpiresAtUtc = DateTime.UtcNow.AddDays(1), IdempotencyKey = "subscription-order-key"
        };
        var payment = new PlatformPaymentAttempt
        {
            PlatformSubscriptionOrder = order, PlatformSubscriptionOrderId = order.Id, PublicId = "PAY-PUBLIC-1",
            Status = "COMPLETED", Method = "BANK_TRANSFER", ExpectedAmount = 500_000,
            ProviderOrderReference = "BANK-REF-001", CompletedAtUtc = DateTime.UtcNow.AddDays(-2),
            ExpiresAtUtc = DateTime.UtcNow.AddDays(1), IdempotencyKey = "subscription-payment-key"
        };
        db.AddRange(plan, tenant, owner, new TenantStaff
        {
            TenantId = tenant.Id, Tenant = tenant, UserId = owner.Id, User = owner, Role = StaffRole.Owner, IsActive = true
        }, order, payment);
        await db.SaveChangesAsync();

        var controller = new AdminPartnerReportsController(db);
        var json = Json(await controller.UnsubscribedOwners());
        var orders = Json(await controller.SubscriptionOrders());
        var payments = Json(await controller.SubscriptionPayments());
        var contracts = Json(await controller.SoftwareContracts());

        Assert.Equal("[]", json);
        Assert.Contains("SUB-2026-001", orders);
        Assert.Contains("subscribed@example.com", orders);
        Assert.Contains("BANK-REF-001", payments);
        Assert.Contains("\"paymentStatus\":\"COMPLETED\"", payments);
        Assert.Contains("Subscribed Hotel", contracts);
        Assert.Contains("\"status\":\"ACTIVE\"", contracts);
    }

    private static string Json(ActionResult<IReadOnlyList<object>> response)
    {
        var ok = Assert.IsType<OkObjectResult>(response.Result);
        return JsonSerializer.Serialize(ok.Value, new JsonSerializerOptions(JsonSerializerDefaults.Web));
    }
}
