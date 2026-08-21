using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using HotelSaas.Infrastructure.Persistence;
using HotelSaas.Infrastructure.Services;
using HotelSaas.WebApi.Controllers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace HotelSaas.WebApi.Tests;

public class PublicPricingControllerTests
{
    [Fact]
    public async Task Quote_uses_server_price_and_best_active_promotion()
    {
        await using var db = CreateContext();
        var (tenant, type) = AddInventory(db, 2);
        db.Promotions.Add(new Promotion
        {
            TenantId = tenant.Id, Code = "SAVE10", Title = "Giảm 10%", DiscountPercent = 10,
            StartDateUtc = DateTime.UtcNow.AddDays(-1), EndDateUtc = DateTime.UtcNow.AddDays(1), IsActive = true
        });
        await db.SaveChangesAsync();
        var start = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(2));

        var result = await new PublicPricingController(db).Quote(new(
            tenant.Id, type.Id, start, start.AddDays(2), 1, 2, 0, null));

        var quote = Assert.IsType<PublicQuoteDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal(2_000_000, quote.BaseSubtotal);
        Assert.Equal(200_000, quote.TotalDiscount);
        Assert.Equal(1_800_000, quote.FinalTotal);
        Assert.Equal("SAVE10", Assert.Single(quote.AppliedPromotions).Code);
    }

    [Fact]
    public async Task Quote_rejects_unknown_coupon()
    {
        await using var db = CreateContext();
        var (tenant, type) = AddInventory(db, 1);
        await db.SaveChangesAsync();
        var start = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(2));

        var result = await new PublicPricingController(db).Quote(new(
            tenant.Id, type.Id, start, start.AddDays(1), 1, 1, 0, "MISSING"));

        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task Coupon_campaign_is_not_publicly_listed_or_auto_applied()
    {
        await using var db = CreateContext();
        var (tenant, type) = AddInventory(db, 1);
        db.Promotions.Add(new Promotion
        {
            TenantId = tenant.Id, Code = "PRIVATE10", Title = "Mã riêng", ApplicationType = "COUPON", DiscountPercent = 10,
            StartDateUtc = DateTime.UtcNow.AddDays(-1), EndDateUtc = DateTime.UtcNow.AddDays(1), IsActive = true
        });
        await db.SaveChangesAsync();
        var start = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(2));
        var catalog = await new PublicPricingController(db).Promotions();
        Assert.Empty(Assert.IsType<OkObjectResult>(catalog.Result).Value as IEnumerable<PublicPromotionDto> ?? []);
        var quote = await new PublicPricingController(db).Quote(new(tenant.Id, type.Id, start, start.AddDays(1), 1, 1, 0, null));
        Assert.Equal(1_000_000, Assert.IsType<PublicQuoteDto>(Assert.IsType<OkObjectResult>(quote.Result).Value).FinalTotal);
        var couponQuote = await new PublicPricingController(db).Quote(new(tenant.Id, type.Id, start, start.AddDays(1), 1, 1, 0, "PRIVATE10"));
        Assert.Equal(900_000, Assert.IsType<PublicQuoteDto>(Assert.IsType<OkObjectResult>(couponQuote.Result).Value).FinalTotal);
    }

    [Fact]
    public async Task Quote_calculates_property_tax_and_service_fee_after_discount()
    {
        await using var db = CreateContext();
        var (tenant, type) = AddInventory(db, 1);
        tenant.TaxRatePercent = 8;
        tenant.ServiceFeeRatePercent = 5;
        db.Promotions.Add(new Promotion
        {
            TenantId = tenant.Id, Code = "SAVE10", Title = "Giảm 10%", DiscountPercent = 10,
            StartDateUtc = DateTime.UtcNow.AddDays(-1), EndDateUtc = DateTime.UtcNow.AddDays(1), IsActive = true
        });
        await db.SaveChangesAsync();
        var start = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(2));

        var result = await new PublicPricingController(db).Quote(new(
            tenant.Id, type.Id, start, start.AddDays(2), 1, 2, 0, null));

        var quote = Assert.IsType<PublicQuoteDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal(144_000, quote.TaxAmount);
        Assert.Equal(90_000, quote.FeeAmount);
        Assert.Equal(234_000, quote.TaxesAndFees);
        Assert.Equal(2_034_000, quote.FinalTotal);
    }

    [Fact]
    public async Task Quote_rejects_capacity_above_selected_quantity()
    {
        await using var db = CreateContext();
        var (tenant, type) = AddInventory(db, 2);
        await db.SaveChangesAsync();
        var start = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(2));

        var result = await new PublicPricingController(db).Quote(new(
            tenant.Id, type.Id, start, start.AddDays(1), 1, 3, 0, null));

        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task Quote_rejects_sold_out_inventory()
    {
        await using var db = CreateContext();
        var (tenant, type) = AddInventory(db, 1);
        var start = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(2));
        db.BookingHolds.Add(new BookingHold
        {
            TenantId = tenant.Id, RoomTypeId = type.Id, Quantity = 1,
            CheckInDate = start.ToDateTime(TimeOnly.MinValue), CheckOutDate = start.AddDays(1).ToDateTime(TimeOnly.MinValue),
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(10)
        });
        await db.SaveChangesAsync();

        var result = await new PublicPricingController(db).Quote(new(
            tenant.Id, type.Id, start, start.AddDays(1), 1, 1, 0, null));

        Assert.IsType<ConflictObjectResult>(result.Result);
    }

    [Fact]
    public async Task Quote_applies_highest_priority_override_per_night_and_falls_back_to_base_price()
    {
        await using var db = CreateContext();
        var (tenant, type) = AddInventory(db, 1);
        var start = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(2));
        db.RoomRateOverrides.AddRange(
            new RoomRateOverride { TenantId = tenant.Id, RoomTypeId = type.Id, StartDate = start, EndDate = start, NightlyPrice = 1_200_000, Priority = 1 },
            new RoomRateOverride { TenantId = tenant.Id, RoomTypeId = type.Id, StartDate = start, EndDate = start, NightlyPrice = 1_350_000, Priority = 5 });
        await db.SaveChangesAsync();

        var result = await new PublicPricingController(db).Quote(new(
            tenant.Id, type.Id, start, start.AddDays(2), 1, 1, 0, null));

        var quote = Assert.IsType<PublicQuoteDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal(2_350_000, quote.BaseSubtotal);
        Assert.Equal(1_175_000, quote.NightlyPrice);
        Assert.Equal(2_350_000, quote.FinalTotal);
    }

    private static ApplicationDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        return new ApplicationDbContext(options, new CurrentTenantService());
    }

    private static (Tenant Tenant, RoomType Type) AddInventory(ApplicationDbContext db, int rooms)
    {
        var tenant = new Tenant
        {
            Name = "Pricing Hotel", Code = Guid.NewGuid().ToString("N"), Slug = Guid.NewGuid().ToString("N"),
            Address = "1 Quote Street", City = "Da Nang", Status = TenantStatus.Active
        };
        var type = new RoomType
        {
            TenantId = tenant.Id, Tenant = tenant, Name = "Deluxe", Code = "DLX", BasePricePerNight = 1_000_000,
            CapacityAdults = 2, CapacityChildren = 1, IsActive = true
        };
        for (var index = 0; index < rooms; index++)
            type.Rooms.Add(new Room { TenantId = tenant.Id, RoomTypeId = type.Id, RoomNumber = $"20{index}", IsActive = true, Status = RoomStatus.Clean });
        db.RoomTypes.Add(type);
        return (tenant, type);
    }
}
