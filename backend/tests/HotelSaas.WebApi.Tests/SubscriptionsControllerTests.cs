using System.Security.Claims;
using System.Text.Json;
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

public class SubscriptionsControllerTests
{
    [Fact]
    public async Task Admin_plan_lifecycle_persists_normalized_features_and_status()
    {
        await using var db = CreateContext();
        var controller = new AdminSubscriptionPlansController(db);
        var request = new SaveSubscriptionPlanRequest(" pro_plus ", "Pro Plus", "Pro Plus", "YEARLY", 1200000, false,
            [new SaveSubscriptionFeatureRequest("max_rooms", 250), new SaveSubscriptionFeatureRequest("MAX_STAFF", 50)]);

        var created = await controller.Create(request);
        var payload = JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(created.Result).Value);
        var id = payload.GetProperty("Id").GetGuid();
        var disabled = await controller.Status(id, "INACTIVE");

        Assert.Equal("PRO_PLUS", payload.GetProperty("Code").GetString());
        Assert.Equal(2, await db.SubscriptionPlanFeatures.CountAsync());
        Assert.Equal("INACTIVE", JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(disabled.Result).Value).GetProperty("Status").GetString());
    }

    [Fact]
    public async Task Admin_plan_rejects_duplicate_features_and_negative_price()
    {
        await using var db = CreateContext();
        var controller = new AdminSubscriptionPlansController(db);
        var duplicate = new SaveSubscriptionPlanRequest("BAD", "Bad", null, "MONTHLY", -1, false,
            [new SaveSubscriptionFeatureRequest("MAX_ROOMS", 1), new SaveSubscriptionFeatureRequest("max_rooms", 2)]);

        Assert.IsType<BadRequestObjectResult>((await controller.Create(duplicate)).Result);
        Assert.Empty(db.SubscriptionPlans);
    }

    [Fact]
    public async Task Tenant_usage_is_scoped_and_derived_from_live_inventory()
    {
        var tenant = Hotel(SubscriptionTier.Basic);
        var other = Hotel(SubscriptionTier.Enterprise);
        await using var db = CreateContext(tenant, other);
        db.RoomTypes.Add(new RoomType { TenantId = tenant.Id, Name = "Deluxe", Code = "DLX", BasePricePerNight = 1 });
        db.Rooms.Add(new Room { TenantId = tenant.Id, RoomTypeId = Guid.NewGuid(), RoomNumber = "101" });
        db.Rooms.Add(new Room { TenantId = other.Id, RoomTypeId = Guid.NewGuid(), RoomNumber = "999" });
        await db.SaveChangesAsync();
        var controller = WithTenant(new SubscriptionsController(db), tenant.Id);

        var result = await controller.Usage();
        var json = JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(result.Result).Value);

        Assert.Equal(1, json.GetProperty("Usage").GetProperty("MAX_ROOMS").GetInt32());
        Assert.Equal(30, json.GetProperty("Limits").GetProperty("MAX_ROOMS").GetInt32());
    }

    private static T WithTenant<T>(T controller, Guid tenantId) where T : ControllerBase
    {
        controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity([
            new Claim(ClaimTypes.NameIdentifier, Guid.NewGuid().ToString()), new Claim(ClaimTypes.Role, "TenantStaff"), new Claim("tenant_id", tenantId.ToString())
        ], "test")) } };
        return controller;
    }
    private static Tenant Hotel(SubscriptionTier tier) => new() { Name = $"{tier} Hotel", Code = $"{tier}-HOTEL", Slug = $"{tier}-hotel", Address = "1 Test", City = "Da Nang", Status = TenantStatus.Active, SubscriptionTier = tier };
    private static ApplicationDbContext CreateContext(params Tenant[] tenants)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        var db = new ApplicationDbContext(options, new CurrentTenantService());
        db.Tenants.AddRange(tenants); db.SaveChanges(); return db;
    }
}
