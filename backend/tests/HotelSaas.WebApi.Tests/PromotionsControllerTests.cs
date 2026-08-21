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

public class PromotionsControllerTests
{
    [Fact]
    public async Task Tenant_can_create_list_update_and_deactivate_own_promotion()
    {
        var tenant = Tenant("Own");
        await using var db = Context(); db.Add(tenant); await db.SaveChangesAsync();
        var controller = Controller(db, tenant.Id);
        var request = Request("WEEKEND10");
        var created = Assert.IsType<PromotionDto>(Assert.IsType<CreatedAtActionResult>((await controller.Create(request)).Result).Value);
        Assert.Equal("WEEKEND10", created.Code);
        Assert.Single(Assert.IsType<List<PromotionDto>>(Assert.IsType<OkObjectResult>((await controller.List()).Result).Value));
        var updated = await controller.Update(created.Id, request with { DiscountPercent = 15 });
        Assert.Equal(15, Assert.IsType<PromotionDto>(Assert.IsType<OkObjectResult>(updated.Result).Value).DiscountPercent);
        Assert.IsType<NoContentResult>(await controller.Deactivate(created.Id));
        Assert.True((await db.Promotions.IgnoreQueryFilters().SingleAsync()).IsDeleted);
    }

    [Fact]
    public async Task Duplicate_code_and_invalid_window_are_rejected()
    {
        var tenant = Tenant("Own");
        await using var db = Context(); db.Add(new Promotion { TenantId = tenant.Id, Code = "FLASH", Title = "Flash", DiscountPercent = 10, StartDateUtc = DateTime.UtcNow, EndDateUtc = DateTime.UtcNow.AddDays(1) }); await db.SaveChangesAsync();
        var controller = Controller(db, tenant.Id);
        Assert.IsType<ConflictObjectResult>((await controller.Create(Request("flash"))).Result);
        var invalid = Request("NEW") with { StartDateUtc = DateTime.UtcNow.AddDays(2), EndDateUtc = DateTime.UtcNow.AddDays(1) };
        Assert.IsType<BadRequestObjectResult>((await controller.Create(invalid)).Result);
    }

    private static SavePromotionRequest Request(string code) => new(code, "Ưu đãi cuối tuần", 10, null, null, DateTime.UtcNow, DateTime.UtcNow.AddDays(3));
    private static ApplicationDbContext Context() => new(new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options, new CurrentTenantService());
    private static PromotionsController Controller(ApplicationDbContext db, Guid tenantId) => new(db) { ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("tenant_id", tenantId.ToString())], "test")) } } };
    private static Tenant Tenant(string name) => new() { Name = name, Code = Guid.NewGuid().ToString("N"), Slug = Guid.NewGuid().ToString("N"), Address = "1 Street", City = "Da Nang" };
}
