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

public class HomeRecommendationsControllerTests
{
    [Fact]
    public async Task Recommendations_use_real_inventory_capacity_and_promotional_price()
    {
        await using var db = CreateContext();
        var (tenant, type) = AddInventory(db, "Family Stay", "Đà Nẵng", 2);
        db.Promotions.Add(new Promotion
        {
            TenantId = tenant.Id, Code = "HOME10", Title = "Home deal", DiscountPercent = 10,
            StartDateUtc = DateTime.UtcNow.AddDays(-1), EndDateUtc = DateTime.UtcNow.AddDays(1), IsActive = true
        });
        await db.SaveChangesAsync();
        var start = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(2));

        var result = await new HomeRecommendationsController(db).Recommendations(new(
            "city:da-nang", start, start.AddDays(2), AdultCount: 4, RoomCount: 2));

        var response = Assert.IsType<HomeRecommendationResponseDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        var item = Assert.Single(response.Items);
        Assert.Equal(type.BasePricePerNight, item.Pricing!.NightlyPrice);
        Assert.Equal(900_000, item.Pricing.FinalNightlyPrice);
        Assert.Equal(400_000, item.Quote!.TotalDiscount);
        Assert.Equal(2, item.Quote.RoomQuantity);
    }

    [Fact]
    public async Task Recommendations_omit_property_when_requested_inventory_is_sold_out()
    {
        await using var db = CreateContext();
        var (tenant, type) = AddInventory(db, "Sold Out", "Đà Nẵng", 1);
        var start = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(2));
        db.BookingHolds.Add(new BookingHold
        {
            TenantId = tenant.Id, RoomTypeId = type.Id, Quantity = 1,
            CheckInDate = start.ToDateTime(TimeOnly.MinValue), CheckOutDate = start.AddDays(1).ToDateTime(TimeOnly.MinValue),
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(10)
        });
        await db.SaveChangesAsync();

        var result = await new HomeRecommendationsController(db).Recommendations(new(
            "city:da-nang", start, start.AddDays(1)));

        var response = Assert.IsType<HomeRecommendationResponseDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Empty(response.Items);
        Assert.Equal(0, response.TotalAvailable);
    }

    [Fact]
    public async Task Accessible_properties_are_limited_to_staff_tenant()
    {
        await using var db = CreateContext();
        var (mine, _) = AddInventory(db, "Mine", "Đà Nẵng", 1);
        AddInventory(db, "Other", "Hà Nội", 1);
        await db.SaveChangesAsync();
        var controller = new PublicPropertiesController(db)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
        controller.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity([
            new Claim(ClaimTypes.Role, StaffRole.Manager.ToString()), new Claim("tenant_id", mine.Id.ToString())
        ], "test"));

        var result = await controller.Accessible();

        var properties = Assert.IsType<List<PublicPropertyDto>>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal("Mine", Assert.Single(properties).Name);
    }

    private static ApplicationDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        return new ApplicationDbContext(options, new CurrentTenantService());
    }

    private static (Tenant Tenant, RoomType Type) AddInventory(ApplicationDbContext db, string name, string city, int rooms)
    {
        var tenant = new Tenant
        {
            Name = name, Code = Guid.NewGuid().ToString("N"), Slug = Guid.NewGuid().ToString("N"),
            Address = "1 Home Street", City = city, Status = TenantStatus.Active
        };
        var type = new RoomType
        {
            TenantId = tenant.Id, Tenant = tenant, Name = "Deluxe", Code = "DLX", BasePricePerNight = 1_000_000,
            CapacityAdults = 2, CapacityChildren = 1, IsActive = true
        };
        for (var index = 0; index < rooms; index++) type.Rooms.Add(new Room
        {
            TenantId = tenant.Id, RoomTypeId = type.Id, RoomNumber = $"30{index}", IsActive = true, Status = RoomStatus.Clean
        });
        db.RoomTypes.Add(type);
        return (tenant, type);
    }
}
