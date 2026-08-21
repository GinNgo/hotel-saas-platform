using System.Security.Claims;
using HotelSaas.Infrastructure.Persistence;
using HotelSaas.Infrastructure.Services;
using HotelSaas.WebApi.Middlewares;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace HotelSaas.WebApi.Tests;

public sealed class OperationalAuditMiddlewareTests
{
    [Fact]
    public async Task Captures_successful_tenant_mutation_without_request_body_or_secret()
    {
        await using var db = Context();
        var tenantId = Guid.NewGuid();
        var actorId = Guid.NewGuid();
        var correlationId = "corr-audit-1";
        var context = Http("/api/rooms/" + Guid.NewGuid(), "PUT", tenantId, actorId, correlationId);
        context.Request.Body = new MemoryStream(System.Text.Encoding.UTF8.GetBytes("{\"secret\":\"do-not-log\"}"));

        var middleware = new OperationalAuditMiddleware(_ =>
        {
            context.Response.StatusCode = StatusCodes.Status204NoContent;
            return Task.CompletedTask;
        }, NullLogger<OperationalAuditMiddleware>.Instance);

        await middleware.InvokeAsync(context, db);

        var audit = Assert.Single(db.OperationalAuditEvents);
        Assert.Equal(tenantId, audit.TenantId);
        Assert.Equal(actorId, audit.ActorId);
        Assert.Equal("ROOMS", audit.Domain);
        Assert.Equal(correlationId, audit.CorrelationId);
        Assert.DoesNotContain("do-not-log", audit.Reason);
        Assert.DoesNotContain("do-not-log", audit.AfterState);
    }

    [Fact]
    public async Task Ignores_failed_mutations_and_anonymous_requests()
    {
        await using var db = Context();
        var failed = Http("/api/rooms", "POST", Guid.NewGuid(), Guid.NewGuid(), "corr-failed");
        var failedMiddleware = new OperationalAuditMiddleware(_ =>
        {
            failed.Response.StatusCode = StatusCodes.Status400BadRequest;
            return Task.CompletedTask;
        }, NullLogger<OperationalAuditMiddleware>.Instance);
        await failedMiddleware.InvokeAsync(failed, db);

        var anonymous = Http("/api/rooms", "POST", null, null, "corr-anonymous");
        var anonymousMiddleware = new OperationalAuditMiddleware(_ =>
        {
            anonymous.Response.StatusCode = StatusCodes.Status201Created;
            return Task.CompletedTask;
        }, NullLogger<OperationalAuditMiddleware>.Instance);
        await anonymousMiddleware.InvokeAsync(anonymous, db);

        Assert.Empty(db.OperationalAuditEvents);
    }

    private static DefaultHttpContext Http(string path, string method, Guid? tenantId, Guid? actorId, string correlationId)
    {
        var context = new DefaultHttpContext();
        context.Request.Path = path;
        context.Request.Method = method;
        context.Request.Headers["X-Correlation-ID"] = correlationId;
        var claims = new List<Claim>();
        if (actorId.HasValue) claims.Add(new Claim(ClaimTypes.NameIdentifier, actorId.Value.ToString()));
        if (tenantId.HasValue) claims.Add(new Claim("tenant_id", tenantId.Value.ToString()));
        context.User = new ClaimsPrincipal(new ClaimsIdentity(claims, actorId.HasValue ? "test" : null));
        return context;
    }

    private static ApplicationDbContext Context()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        return new ApplicationDbContext(options, new CurrentTenantService());
    }
}
