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

public class RoomTypesControllerTests
{
    [Fact]
    public async Task Admin_crud_round_trips_multilingual_content_images_and_booking_benefits()
    {
        var tenant = Hotel("Admin Hotel");
        await using var db = CreateContext(tenant);
        var controller = WithUser(new RoomTypesController(db), "SuperAdmin");
        var request = new SaveAdminRoomTypeRequest(tenant.Id, "dlx", "Phòng Deluxe", "Deluxe Room", "Mô tả", "Description",
            "KING", 1, 32, 2, 1, 3, 1_500_000, "ACTIVE", ["/rooms/1.webp", "/rooms/2.webp"],
            IncludesBreakfast: true, IsRefundable: true, FreeCancellationHours: 48, AmenityCodes: ["SEA_VIEW", "BALCONY"]);

        var createdResult = await controller.Create(request);
        var created = Assert.IsType<AdminRoomTypeDto>(Assert.IsType<CreatedAtActionResult>(createdResult.Result).Value);
        db.ChangeTracker.Clear();
        Assert.Equal(2, await db.RoomImages.IgnoreQueryFilters().CountAsync());
        Assert.Equal(2, await db.RoomTypeAmenities.IgnoreQueryFilters().CountAsync());
        db.ChangeTracker.Clear();
        var updatedResult = await controller.Update(created.Id, request with
        {
            NameVi = "Deluxe hướng biển", ImageUrls = ["/rooms/new.webp"], AmenityCodes = ["SEA_VIEW"]
        });
        var updated = Assert.IsType<AdminRoomTypeDto>(Assert.IsType<OkObjectResult>(updatedResult.Result).Value);

        Assert.Equal("Deluxe Room", updated.NameEn);
        Assert.Equal("Description", updated.DescriptionEn);
        Assert.Equal(32, updated.Area);
        Assert.True(updated.IncludesBreakfast);
        Assert.Equal(48, updated.FreeCancellationHours);
        Assert.Equal(["/rooms/new.webp"], updated.ImageUrls);
        Assert.Equal(["SEA_VIEW"], updated.AmenityCodes);
    }

    [Fact]
    public async Task Tenant_staff_cannot_create_room_type_for_another_property()
    {
        var mine = Hotel("Mine");
        var other = Hotel("Other");
        await using var db = CreateContext(mine, other);
        var controller = WithUser(new RoomTypesController(db), "Manager", mine.Id);
        var request = new SaveAdminRoomTypeRequest(other.Id, "STD", "Standard", null, null, null,
            "DOUBLE", 1, 20, 2, 0, 2, 800_000, "ACTIVE");

        var result = await controller.Create(request);

        Assert.IsType<ForbidResult>(result.Result);
        Assert.Empty(db.RoomTypes.IgnoreQueryFilters());
    }

    private static T WithUser<T>(T controller, string role, Guid? tenantId = null) where T : ControllerBase
    {
        var claims = new List<Claim> { new(ClaimTypes.Role, role), new(ClaimTypes.NameIdentifier, Guid.NewGuid().ToString()) };
        if (tenantId.HasValue) claims.Add(new Claim("tenant_id", tenantId.Value.ToString()));
        controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(claims, "test")) } };
        return controller;
    }

    private static ApplicationDbContext CreateContext(params Tenant[] tenants)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        var db = new ApplicationDbContext(options, new CurrentTenantService());
        db.Tenants.AddRange(tenants);
        db.SaveChanges();
        return db;
    }
    private static Tenant Hotel(string name) => new()
    {
        Name = name, Code = Guid.NewGuid().ToString("N"), Slug = Guid.NewGuid().ToString("N"),
        Address = "1 Test", City = "Da Nang", Status = TenantStatus.Active
    };
}
