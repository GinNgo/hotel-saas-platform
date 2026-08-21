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

public class OperationalAuditControllerTests
{
    [Fact]
    public async Task Tenant_search_never_returns_events_from_another_property()
    {
        await using var db = Context();
        var tenantId = Guid.NewGuid();
        db.OperationalAuditEvents.AddRange(
            Event(tenantId, "ROOM", "POST_ROOM"),
            Event(Guid.NewGuid(), "ROOM", "POST_ROOM"),
            Event(null, "SYSTEM", "POST_SYSTEM"));
        await db.SaveChangesAsync();
        var controller = Controller(db, tenantId);

        var result = await controller.Search(new(null, null, null, null, null, null, null, null, null, null, 0, 25));

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var content = ok.Value!.GetType().GetProperty("content")!.GetValue(ok.Value) as System.Collections.IEnumerable;
        Assert.Single(content!.Cast<object>());
    }

    [Fact]
    public async Task Export_uses_utf8_csv_and_protects_formula_values()
    {
        await using var db = Context();
        db.OperationalAuditEvents.Add(Event(null, "SYSTEM", "POST_SYSTEM", "=danger"));
        await db.SaveChangesAsync();
        var controller = Controller(db);

        var result = await controller.Export(new(null, null, null, null, null, null, null, null, null, null, null, null));

        var file = Assert.IsType<FileContentResult>(result);
        var csv = System.Text.Encoding.UTF8.GetString(file.FileContents);
        Assert.Contains("'=danger", csv);
        Assert.Equal("operational-audit.csv", file.FileDownloadName);
    }

    private static OperationalAuditEvent Event(Guid? tenantId, string domain, string eventType, string reason = "updated") => new()
    {
        TenantId = tenantId, Scope = tenantId.HasValue ? "TENANT" : "SYSTEM", Domain = domain,
        EventType = eventType, AggregateType = domain, AggregateId = Guid.NewGuid().ToString(),
        ActorType = "USER", ActorId = Guid.NewGuid(), Reason = reason, CorrelationId = Guid.NewGuid().ToString(), StatusCode = 200
    };

    private static ApplicationDbContext Context()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        return new ApplicationDbContext(options, new CurrentTenantService());
    }

    private static OperationalAuditController Controller(ApplicationDbContext db, Guid? tenantId = null)
    {
        var controller = new OperationalAuditController(db)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
        var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, Guid.NewGuid().ToString()) };
        if (tenantId.HasValue) claims.Add(new Claim("tenant_id", tenantId.Value.ToString()));
        controller.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "test"));
        return controller;
    }
}
