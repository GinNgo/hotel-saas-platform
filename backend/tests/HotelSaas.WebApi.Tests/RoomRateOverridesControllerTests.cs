using System.Security.Claims;
using HotelSaas.Domain.Entities;
using HotelSaas.Infrastructure.Persistence;
using HotelSaas.Infrastructure.Services;
using HotelSaas.WebApi.Controllers;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace HotelSaas.WebApi.Tests;

public class RoomRateOverridesControllerTests
{
    [Fact]
    public async Task Tenant_can_create_list_update_and_soft_delete_own_rate()
    {
        var tenant = Tenant("Own"); var roomType = RoomType(tenant);
        await using var db = Context(); db.Add(roomType); await db.SaveChangesAsync();
        var controller = Controller(db, tenant.Id);
        var start = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1));

        var createdResult = await controller.Create(new(roomType.Id, start, start.AddDays(2), 1_200_000, 5));
        var created = Assert.IsType<RoomRateOverrideDto>(Assert.IsType<CreatedAtActionResult>(createdResult.Result).Value);
        var listed = Assert.IsType<List<RoomRateOverrideDto>>(Assert.IsType<OkObjectResult>((await controller.List(roomType.Id)).Result).Value);
        Assert.Equal(created.Id, Assert.Single(listed).Id);

        var updatedResult = await controller.Update(created.Id, new(roomType.Id, start, start.AddDays(2), 1_350_000, 10));
        Assert.Equal(1_350_000, Assert.IsType<RoomRateOverrideDto>(Assert.IsType<OkObjectResult>(updatedResult.Result).Value).NightlyPrice);
        Assert.IsType<NoContentResult>(await controller.Delete(created.Id));
        Assert.True((await db.RoomRateOverrides.IgnoreQueryFilters().SingleAsync()).IsDeleted);
    }

    [Fact]
    public async Task Tenant_cannot_access_rate_from_another_property()
    {
        var mine = Tenant("Mine"); var other = Tenant("Other"); var roomType = RoomType(other);
        await using var db = Context(); db.Add(roomType); await db.SaveChangesAsync();
        var controller = Controller(db, mine.Id);
        Assert.IsType<ForbidResult>((await controller.List(roomType.Id)).Result);
        Assert.IsType<ForbidResult>((await controller.Create(new(roomType.Id, DateOnly.FromDateTime(DateTime.UtcNow), DateOnly.FromDateTime(DateTime.UtcNow), 1_000_000))).Result);
    }

    private static ApplicationDbContext Context() => new(new DbContextOptionsBuilder<ApplicationDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options, new CurrentTenantService());
    private static RoomRateOverridesController Controller(ApplicationDbContext db, Guid tenantId) => new(db)
    {
        ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext
        { User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("tenant_id", tenantId.ToString())], "test")) } }
    };
    private static Tenant Tenant(string name) => new() { Name = name, Code = Guid.NewGuid().ToString("N"),
        Slug = Guid.NewGuid().ToString("N"), Address = "1 Street", City = "Da Nang" };
    private static RoomType RoomType(Tenant tenant) => new() { TenantId = tenant.Id, Tenant = tenant,
        Name = "Deluxe", Code = "DLX", BasePricePerNight = 1_000_000 };
}
