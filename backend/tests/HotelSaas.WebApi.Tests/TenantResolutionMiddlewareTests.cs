using System.Security.Claims;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using HotelSaas.Infrastructure.Persistence;
using HotelSaas.Infrastructure.Services;
using HotelSaas.WebApi.Middlewares;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace HotelSaas.WebApi.Tests;

public class TenantResolutionMiddlewareTests
{
    [Fact]
    public async Task Tenant_staff_claim_cannot_be_overridden_by_header()
    {
        var claimTenant = ActiveTenant();
        var headerTenant = ActiveTenant();
        await using var db = CreateContext(claimTenant, headerTenant);
        var tenantService = new CurrentTenantService();
        var nextCalled = false;
        var middleware = new TenantResolutionMiddleware(_ => { nextCalled = true; return Task.CompletedTask; });
        var http = StaffContext(StaffRole.Owner, claimTenant.Id);
        http.Request.Headers["X-Tenant-Id"] = headerTenant.Id.ToString();

        await middleware.InvokeAsync(http, tenantService, db);

        Assert.True(nextCalled);
        Assert.Equal(claimTenant.Id, tenantService.TenantId);
    }

    [Fact]
    public async Task Tenant_staff_without_tenant_claim_is_forbidden()
    {
        await using var db = CreateContext();
        var tenantService = new CurrentTenantService();
        var nextCalled = false;
        var middleware = new TenantResolutionMiddleware(_ => { nextCalled = true; return Task.CompletedTask; });
        var http = StaffContext(StaffRole.Manager, null);

        await middleware.InvokeAsync(http, tenantService, db);

        Assert.False(nextCalled);
        Assert.Equal(StatusCodes.Status403Forbidden, http.Response.StatusCode);
        Assert.Null(tenantService.TenantId);
    }

    [Fact]
    public async Task Pending_tenant_cannot_enter_operational_scope()
    {
        var tenant = ActiveTenant();
        tenant.Status = TenantStatus.PendingApproval;
        await using var db = CreateContext(tenant);
        var tenantService = new CurrentTenantService();
        var nextCalled = false;
        var middleware = new TenantResolutionMiddleware(_ => { nextCalled = true; return Task.CompletedTask; });
        var http = StaffContext(StaffRole.Receptionist, tenant.Id);

        await middleware.InvokeAsync(http, tenantService, db);

        Assert.False(nextCalled);
        Assert.Equal(StatusCodes.Status403Forbidden, http.Response.StatusCode);
        Assert.Null(tenantService.TenantId);
    }

    private static ApplicationDbContext CreateContext(params Tenant[] tenants)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var db = new ApplicationDbContext(options, new CurrentTenantService());
        db.Tenants.AddRange(tenants);
        db.SaveChanges();
        return db;
    }

    private static DefaultHttpContext StaffContext(StaffRole role, Guid? tenantId)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, Guid.NewGuid().ToString()),
            new(ClaimTypes.Role, role.ToString())
        };
        if (tenantId.HasValue) claims.Add(new Claim("tenant_id", tenantId.Value.ToString()));
        return new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(claims, "test")),
            Response = { Body = new MemoryStream() }
        };
    }

    private static Tenant ActiveTenant() => new()
    {
        Name = "Audit Hotel",
        Code = $"AUDIT-{Guid.NewGuid():N}",
        Slug = $"audit-{Guid.NewGuid():N}",
        Address = "1 Audit Street",
        City = "Da Nang",
        Status = TenantStatus.Active
    };
}
