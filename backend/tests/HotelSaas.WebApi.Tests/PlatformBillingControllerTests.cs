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

public class PlatformBillingControllerTests
{
    [Fact]
    public async Task Purchase_order_is_server_priced_and_idempotent()
    {
        var tenant = Hotel(); var owner = Guid.NewGuid(); var plan = Plan("PRO", 990000);
        await using var db = CreateContext(tenant, plan);
        var controller = WithTenant(new PlatformBillingController(db), tenant.Id, owner, "purchase-key");

        var first = await controller.Purchase(new(tenant.Id, plan.Id));
        var replay = await controller.Purchase(new(tenant.Id, plan.Id));

        var firstJson = JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(first.Result).Value);
        var replayJson = JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(replay.Result).Value);
        Assert.Equal(990000, firstJson.GetProperty("Price").GetDecimal());
        Assert.False(firstJson.GetProperty("Replayed").GetBoolean());
        Assert.True(replayJson.GetProperty("Replayed").GetBoolean());
        Assert.Single(db.PlatformSubscriptionOrders);
    }

    [Fact]
    public async Task Idempotency_key_cannot_be_reused_for_a_different_plan()
    {
        var tenant = Hotel(); var firstPlan = Plan("BASIC", 100); var secondPlan = Plan("PRO", 200);
        await using var db = CreateContext(tenant, firstPlan, secondPlan);
        var controller = WithTenant(new PlatformBillingController(db), tenant.Id, Guid.NewGuid(), "same-key");

        await controller.Purchase(new(tenant.Id, firstPlan.Id));
        var conflict = await controller.Purchase(new(tenant.Id, secondPlan.Id));

        Assert.IsType<ConflictObjectResult>(conflict.Result);
        Assert.Single(db.PlatformSubscriptionOrders);
    }

    [Fact]
    public async Task Simulator_payment_applies_subscription_once_and_writes_history()
    {
        var tenant = Hotel(); var owner = Guid.NewGuid(); var plan = Plan("PRO", 990000);
        await using var db = CreateContext(tenant, plan);
        var billing = WithTenant(new PlatformBillingController(db), tenant.Id, owner, "order-key");
        var orderResult = await billing.Purchase(new(tenant.Id, plan.Id));
        var orderPublicId = JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(orderResult.Result).Value).GetProperty("PublicId").GetString()!;
        billing.Request.Headers["Idempotency-Key"] = "attempt-key";
        var attemptResult = await billing.CreateAttempt(orderPublicId, new("SIMULATOR", "SIMULATOR"));
        var attemptPublicId = JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(attemptResult.Result).Value).GetProperty("PublicId").GetString()!;
        var simulator = WithTenant(new PlatformFinancialSimulatorController(db), tenant.Id, owner);

        Assert.IsType<OkObjectResult>(await simulator.Confirm(orderPublicId, attemptPublicId));
        Assert.IsType<OkObjectResult>(await simulator.Confirm(orderPublicId, attemptPublicId));

        Assert.Equal(plan.Id, tenant.ActiveSubscriptionPlanId);
        Assert.Equal(SubscriptionTier.Pro, tenant.SubscriptionTier);
        Assert.Single(db.PlatformSubscriptionHistories);
        Assert.Equal("APPLIED", db.PlatformSubscriptionOrders.Single().Status);
        Assert.Equal("SUCCESS", db.PlatformPaymentAttempts.Single().Status);
    }

    [Fact]
    public async Task Configured_sandbox_provider_can_create_payment_attempt()
    {
        var tenant = Hotel(); var owner = Guid.NewGuid(); var plan = Plan("PRO", 990000);
        await using var db = CreateContext(tenant, plan);
        db.PlatformPaymentConfigurations.Add(new PlatformPaymentConfiguration
        {
            Provider = "VNPAY", Environment = "SANDBOX", Enabled = true, SecretReference = "vault/vnpay/merchant"
        });
        await db.SaveChangesAsync();
        var billing = WithTenant(new PlatformBillingController(db), tenant.Id, owner, "order-key");
        var order = await billing.Purchase(new(tenant.Id, plan.Id));
        var publicId = JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(order.Result).Value).GetProperty("PublicId").GetString()!;
        billing.Request.Headers["Idempotency-Key"] = "attempt-key";

        var result = await billing.CreateAttempt(publicId, new("VNPAY", "VNPAY"));

        var payload = JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal("VNPAY", payload.GetProperty("Provider").GetString());
        Assert.Equal("SANDBOX", payload.GetProperty("Environment").GetString());
    }

    [Fact]
    public async Task Disabled_provider_configuration_blocks_payment_attempt()
    {
        var tenant = Hotel(); var owner = Guid.NewGuid(); var plan = Plan("PRO", 990000);
        await using var db = CreateContext(tenant, plan);
        db.PlatformPaymentConfigurations.Add(new PlatformPaymentConfiguration
        {
            Provider = "MOMO", Environment = "SANDBOX", Enabled = false, SecretReference = "vault/momo/merchant"
        });
        await db.SaveChangesAsync();
        var billing = WithTenant(new PlatformBillingController(db), tenant.Id, owner, "order-key");
        var order = await billing.Purchase(new(tenant.Id, plan.Id));
        var publicId = JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(order.Result).Value).GetProperty("PublicId").GetString()!;
        billing.Request.Headers["Idempotency-Key"] = "attempt-key";

        var result = await billing.CreateAttempt(publicId, new("MOMO", "MOMO"));

        var conflict = Assert.IsType<ConflictObjectResult>(result.Result);
        Assert.Contains("PAYMENT_NOT_READY", JsonSerializer.Serialize(conflict.Value));
        Assert.Empty(db.PlatformPaymentAttempts);
    }

    private static T WithTenant<T>(T controller, Guid tenantId, Guid userId, string? key = null) where T : ControllerBase
    {
        var http = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity([
            new Claim(ClaimTypes.NameIdentifier, userId.ToString()), new Claim(ClaimTypes.Role, "TenantStaff"), new Claim("tenant_id", tenantId.ToString())
        ], "test")) };
        if (key is not null) http.Request.Headers["Idempotency-Key"] = key;
        controller.ControllerContext = new ControllerContext { HttpContext = http }; return controller;
    }
    private static Tenant Hotel() => new() { Name = "Billing Hotel", Code = $"H-{Guid.NewGuid():N}", Slug = $"h-{Guid.NewGuid():N}", Address = "1 Test", City = "Da Nang", Status = TenantStatus.Active };
    private static SubscriptionPlan Plan(string code, decimal price) => new() { Code = $"{code}-{Guid.NewGuid():N}", NameVi = code, NameEn = code, BillingType = "MONTHLY", Price = price, IsActive = true, Features = [new SubscriptionPlanFeature { Code = "MAX_ROOMS", Limit = 100 }] };
    private static ApplicationDbContext CreateContext(Tenant tenant, params SubscriptionPlan[] plans)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        var db = new ApplicationDbContext(options, new CurrentTenantService()); db.Tenants.Add(tenant); db.SubscriptionPlans.AddRange(plans); db.SaveChanges(); return db;
    }
}
