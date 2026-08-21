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

public class PermissionCatalogControllerTests
{
    [Fact]
    public async Task Platform_catalog_can_create_update_and_deactivate_a_permission_function()
    {
        await using var db = Context();
        var controller = Controller(db);

        var createdResult = await controller.Create(new("RATE_PLAN", "Rate plan", "INVENTORY", 7));
        var created = Assert.IsType<PermissionCatalogFunctionDto>(
            Assert.IsType<OkObjectResult>(createdResult.Result).Value);
        Assert.Equal("RATE_PLAN", created.Code);

        var updatedResult = await controller.Update(created.Id,
            new("RATE_PLAN", "Rate plan management", "PRICING", 15, true));
        var updated = Assert.IsType<PermissionCatalogFunctionDto>(
            Assert.IsType<OkObjectResult>(updatedResult.Result).Value);
        Assert.Equal("PRICING", updated.ModuleCode);
        Assert.Equal(15, updated.SupportedActionMask);

        Assert.IsType<NoContentResult>(await controller.Deactivate(created.Id));
        Assert.False(db.PermissionFunctions.IgnoreQueryFilters().Single().IsActive);
    }

    [Fact]
    public async Task Tenant_context_cannot_mutate_the_global_permission_catalog()
    {
        await using var db = Context();
        var controller = Controller(db, Guid.NewGuid());

        var result = await controller.Create(new("RATE_PLAN", "Rate plan", "INVENTORY", 7));

        Assert.IsType<ForbidResult>(result.Result);
        Assert.Empty(db.PermissionFunctions.IgnoreQueryFilters());
    }

    [Fact]
    public async Task System_permission_cannot_be_deactivated()
    {
        await using var db = Context();
        var function = new PermissionFunction
        {
            Code = "SYSTEM", Name = "System", ModuleCode = "SYSTEM", SupportedActionMask = 127
        };
        db.PermissionFunctions.Add(function);
        await db.SaveChangesAsync();
        var controller = Controller(db);

        var result = await controller.Deactivate(function.Id);

        Assert.IsType<ConflictObjectResult>(result);
        Assert.True(function.IsActive);
    }

    private static ApplicationDbContext Context()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        return new ApplicationDbContext(options, new CurrentTenantService());
    }

    private static PermissionCatalogController Controller(ApplicationDbContext db, Guid? tenantId = null)
    {
        var controller = new PermissionCatalogController(db)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
        var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, Guid.NewGuid().ToString()) };
        if (tenantId.HasValue) claims.Add(new Claim("tenant_id", tenantId.Value.ToString()));
        controller.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "test"));
        return controller;
    }
}
