using System.Text.Json;
using HotelSaas.Infrastructure.Persistence;
using HotelSaas.Infrastructure.Services;
using HotelSaas.WebApi.Controllers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Http;
using System.Security.Claims;
using Xunit;

namespace HotelSaas.WebApi.Tests;

public sealed class PlatformPaymentConfigurationControllerTests
{
    [Fact]
    public async Task Save_masks_secret_and_never_returns_raw_reference()
    {
        await using var db = Context();
        var controller = Controller(db);

        var result = await controller.ConfigurePayment(new("VNPAY", "SANDBOX", true,
            "vault/platform/vnpay-secret-7890", "Vietcombank", "****1234", "https://api.example.test/callback"));

        var payload = Assert.IsType<OkObjectResult>(result.Result).Value;
        var json = JsonSerializer.Serialize(payload);
        Assert.Contains("****7890", json);
        Assert.DoesNotContain("vault/platform/vnpay-secret-7890", json);
        Assert.Equal("vault/platform/vnpay-secret-7890", db.PlatformPaymentConfigurations.Single().SecretReference);
    }

    [Fact]
    public async Task Validation_reports_disabled_and_missing_secret_blockers()
    {
        await using var db = Context();
        db.PlatformPaymentConfigurations.Add(new()
        {
            Provider = "MOMO", Environment = "SANDBOX", Enabled = false
        });
        await db.SaveChangesAsync();

        var result = await Controller(db).ValidatePaymentConfiguration("MOMO");

        var json = JsonSerializer.Serialize(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Contains("CONFIGURATION_DISABLED", json);
        Assert.Contains("SECRET_REFERENCE_MISSING", json);
        Assert.Contains("\"Ready\":false", json);
    }

    [Fact]
    public async Task Production_becomes_ready_only_after_explicit_approval()
    {
        await using var db = Context();
        var configuration = new HotelSaas.Domain.Entities.PlatformPaymentConfiguration
        {
            Provider = "VNPAY", Environment = "PRODUCTION", Enabled = true,
            SecretReference = "vault/vnpay/production", CallbackUrl = "https://api.example.test/vnpay/callback"
        };
        db.PlatformPaymentConfigurations.Add(configuration);
        await db.SaveChangesAsync();
        var approverId = Guid.NewGuid();
        var controller = Controller(db, approverId);

        var before = await controller.ValidatePaymentConfiguration("VNPAY");
        var approved = await controller.ApprovePaymentConfiguration("VNPAY", "PRODUCTION");
        var after = await controller.ValidatePaymentConfiguration("VNPAY");

        Assert.Contains("PRODUCTION_NOT_APPROVED", JsonSerializer.Serialize(Assert.IsType<OkObjectResult>(before.Result).Value));
        Assert.IsType<OkObjectResult>(approved.Result);
        Assert.Contains("\"Ready\":true", JsonSerializer.Serialize(Assert.IsType<OkObjectResult>(after.Result).Value));
        Assert.True(configuration.ProductionApproved);
        Assert.Equal(approverId, configuration.ProductionApprovedByUserId);
        Assert.NotNull(configuration.ProductionApprovedAtUtc);

        await controller.ConfigurePayment(new("VNPAY", "PRODUCTION", true, null, null, null, "https://api.example.test/vnpay/callback-v2"));

        Assert.False(configuration.ProductionApproved);
        Assert.Null(configuration.ProductionApprovedByUserId);
        Assert.Null(configuration.ProductionApprovedAtUtc);
    }

    private static ApplicationDbContext Context()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        return new ApplicationDbContext(options, new CurrentTenantService());
    }

    private static PlatformBillingController Controller(ApplicationDbContext db, Guid? userId = null)
    {
        var controller = new PlatformBillingController(db);
        if (userId.HasValue)
            controller.ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, userId.Value.ToString())], "test"))
                }
            };
        return controller;
    }
}
