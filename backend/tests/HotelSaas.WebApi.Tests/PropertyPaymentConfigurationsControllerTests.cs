using HotelSaas.Infrastructure.Persistence;
using HotelSaas.Infrastructure.Services;
using HotelSaas.WebApi.Controllers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Xunit;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;

namespace HotelSaas.WebApi.Tests;

public class PropertyPaymentConfigurationsControllerTests
{
    [Fact]
    public async Task Configuration_round_trips_masked_secrets_and_preserves_them_on_blank_update()
    {
        var tenantId = Guid.NewGuid();
        var tenant = new CurrentTenantService();
        tenant.SetTenant(tenantId, HotelSaas.Domain.Enums.SubscriptionTier.Pro);
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using var db = new ApplicationDbContext(options, tenant);
        var controller = new PropertyPaymentConfigurationsController(db, tenant);
        var request = Request("123456789", "merchant-secret");

        var saved = await controller.Update(tenantId, request);
        var first = Assert.IsType<PropertyPaymentConfigurationDto>(Assert.IsType<OkObjectResult>(saved.Result).Value);
        var updated = await controller.Update(tenantId, Request(null, first.Methods.Single().MerchantReferenceMasked));
        var second = Assert.IsType<PropertyPaymentConfigurationDto>(Assert.IsType<OkObjectResult>(updated.Result).Value);

        Assert.Equal("****6789", first.AccountNumberMasked);
        Assert.Equal("****cret", first.Methods.Single().MerchantReferenceMasked);
        Assert.Equal("****6789", second.AccountNumberMasked);
        Assert.Equal("****cret", second.Methods.Single().MerchantReferenceMasked);
        Assert.Equal(2, second.Version);
    }

    [Fact]
    public async Task Production_validation_reports_approval_and_missing_merchant_blockers()
    {
        var tenantId = Guid.NewGuid();
        var tenant = new CurrentTenantService();
        tenant.SetTenant(tenantId, HotelSaas.Domain.Enums.SubscriptionTier.Pro);
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using var db = new ApplicationDbContext(options, tenant);
        var controller = new PropertyPaymentConfigurationsController(db, tenant);
        var request = Request("123456789", null) with
        {
            Environment = "PRODUCTION",
            Methods = [new PropertyPaymentMethodRequest("MOMO", true, "MOMO", null)]
        };

        var response = await controller.ValidateRequest(tenantId, request);

        var readiness = Assert.IsType<PropertyPaymentReadinessDto>(Assert.IsType<OkObjectResult>(response.Result).Value);
        Assert.False(readiness.Ready);
        Assert.Contains(readiness.Blockers, item => item.Contains("merchant_reference_required"));
        Assert.Contains(readiness.Blockers, item => item.Contains("production_not_approved"));
    }

    [Fact]
    public async Task Public_options_expose_only_ready_methods_and_keep_legacy_pay_at_hotel()
    {
        var tenantId = Guid.NewGuid();
        var tenantService = new CurrentTenantService();
        tenantService.SetTenant(tenantId, SubscriptionTier.Pro);
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using var db = new ApplicationDbContext(options, tenantService);
        db.Tenants.Add(new Tenant { Id = tenantId, Name = "Payment Hotel", Code = "PAY", Slug = "pay", Address = "1 Pay", City = "Hue", Status = TenantStatus.Active });
        await db.SaveChangesAsync();
        var publicController = new PublicPaymentOptionsController(db);

        var legacy = Assert.IsType<List<PublicPaymentOptionDto>>(Assert.IsType<OkObjectResult>((await publicController.Get(tenantId)).Result).Value);
        Assert.Equal("PAY_AT_HOTEL", Assert.Single(legacy).Code);

        var management = new PropertyPaymentConfigurationsController(db, tenantService);
        await management.Update(tenantId, Request("123456789", "merchant-secret") with
        {
            Methods = [
                new PropertyPaymentMethodRequest("MANUAL_TRANSFER", true, "BANK", null),
                new PropertyPaymentMethodRequest("VNPAY", true, "VNPAY", null),
                new PropertyPaymentMethodRequest("CASH", false, "CASH", null)
            ]
        });
        var configured = Assert.IsType<List<PublicPaymentOptionDto>>(Assert.IsType<OkObjectResult>((await publicController.Get(tenantId)).Result).Value);
        Assert.Contains(configured, item => item.Code == "MANUAL_TRANSFER");
        Assert.Contains(configured, item => item.Code == "VNPAY");
        Assert.DoesNotContain(configured, item => item.Code == "PAY_AT_HOTEL");
    }

    private static PropertyPaymentConfigurationRequest Request(string? account, string? merchant) => new(
        true, "SIMULATOR", [new PropertyPaymentMethodRequest("MANUAL_TRANSFER", true, "BANK", merchant)],
        "Luxe Bank", "LUXE", "Luxe Hotel", account, "PERCENTAGE", 30, 30,
        "BOOKING {paymentCode}", "VIETQR", "Chuyển khoản đúng nội dung.", "Transfer with the exact content.");
}
