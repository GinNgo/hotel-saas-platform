using System.Security.Claims;
using System.Text.Json;
using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Application.Common.Models;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Middlewares;

public class TenantResolutionMiddleware
{
    private readonly RequestDelegate _next;

    public TenantResolutionMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, ICurrentTenantService tenantService, IApplicationDbContext dbContext)
    {
        Guid? resolvedTenantId = null;
        var authenticated = context.User.Identity?.IsAuthenticated == true;
        var isSuperAdmin = context.User.IsInRole(nameof(GlobalUserRole.SuperAdmin));
        var isTenantStaff = TenantStaffRoles.Any(context.User.IsInRole);

        if (authenticated && isTenantStaff)
        {
            // A signed tenant token is authoritative; a caller cannot switch tenant with a header.
            var tenantClaim = context.User.FindFirst("tenant_id")?.Value;
            if (!Guid.TryParse(tenantClaim, out var tenantIdFromClaim))
            {
                await WriteForbiddenAsync(context, "Phiên đăng nhập nhân sự không có phạm vi cơ sở hợp lệ.");
                return;
            }
            resolvedTenantId = tenantIdFromClaim;
        }
        else if (authenticated && isSuperAdmin &&
                 context.Request.Headers.TryGetValue("X-Tenant-Id", out var tenantHeader) &&
                 Guid.TryParse(tenantHeader, out var tenantIdFromHeader))
        {
            resolvedTenantId = tenantIdFromHeader;
        }

        if (resolvedTenantId.HasValue)
        {
            var tenant = await dbContext.Tenants
                .AsNoTracking()
                .FirstOrDefaultAsync(t => t.Id == resolvedTenantId.Value && !t.IsDeleted);

            if (tenant == null || (isTenantStaff && tenant.Status != TenantStatus.Active))
            {
                await WriteForbiddenAsync(context, tenant == null
                    ? "Cơ sở trong phiên đăng nhập không tồn tại."
                    : "Cơ sở chưa được duyệt hoặc đang bị tạm ngừng.");
                return;
            }

            tenantService.SetTenant(tenant.Id, tenant.SubscriptionTier);
        }

        await _next(context);
    }

    private static readonly string[] TenantStaffRoles =
    [
        nameof(StaffRole.Owner),
        nameof(StaffRole.Manager),
        nameof(StaffRole.Receptionist),
        nameof(StaffRole.Housekeeper)
    ];

    private static async Task WriteForbiddenAsync(HttpContext context, string message)
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsJsonAsync(Result.Failure(message));
    }
}

public class GlobalExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<GlobalExceptionMiddleware> _logger;

    public GlobalExceptionMiddleware(RequestDelegate next, ILogger<GlobalExceptionMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi máy chủ: {Message}", ex.Message);
            context.Response.ContentType = "application/json";
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;

            var result = Result.Failure("Đã xảy ra lỗi máy chủ nội bộ.", new List<string> { ex.Message });
            await context.Response.WriteAsync(JsonSerializer.Serialize(result));
        }
    }
}

public sealed class OperationalAuditMiddleware(RequestDelegate next, ILogger<OperationalAuditMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext httpContext, IApplicationDbContext dbContext)
    {
        await next(httpContext);
        if (!IsAuditable(httpContext)) return;

        try
        {
            var path = httpContext.Request.Path.Value?.Trim('/') ?? string.Empty;
            var segments = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
            var domain = Domain(segments);
            var aggregateId = segments.LastOrDefault(segment => Guid.TryParse(segment, out _) || segment.Contains('_')) ?? string.Empty;
            Guid? actorId = Guid.TryParse(httpContext.User.FindFirstValue(ClaimTypes.NameIdentifier), out var parsedActor) ? parsedActor : null;
            Guid? tenantId = Guid.TryParse(httpContext.User.FindFirstValue("tenant_id"), out var parsedTenant) ? parsedTenant : null;
            var correlationId = httpContext.Response.Headers["X-Correlation-ID"].FirstOrDefault()
                ?? httpContext.Request.Headers["X-Correlation-ID"].FirstOrDefault()
                ?? httpContext.TraceIdentifier;
            dbContext.OperationalAuditEvents.Add(new OperationalAuditEvent
            {
                TenantId = tenantId,
                Scope = tenantId.HasValue ? "TENANT" : "SYSTEM",
                Domain = domain,
                EventType = $"{httpContext.Request.Method}_{domain}",
                AggregateType = segments.Length > 1 ? segments[^2].ToUpperInvariant() : domain,
                AggregateId = aggregateId,
                ActorType = actorId.HasValue ? "USER" : "ANONYMOUS",
                ActorId = actorId,
                Reason = $"{httpContext.Request.Method} /{path}",
                CorrelationId = correlationId,
                StatusCode = httpContext.Response.StatusCode,
                AfterState = JsonSerializer.Serialize(new { httpContext.Response.StatusCode })
            });
            await dbContext.SaveChangesAsync(httpContext.RequestAborted);
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Không thể ghi operational audit cho {Method} {Path}",
                httpContext.Request.Method, httpContext.Request.Path);
        }
    }

    private static bool IsAuditable(HttpContext context) =>
        context.User.Identity?.IsAuthenticated == true &&
        context.Request.Method is "POST" or "PUT" or "PATCH" or "DELETE" &&
        !context.Request.Path.StartsWithSegments("/api/admin/audit-events") &&
        context.Response.StatusCode is >= 200 and < 400;

    private static string Domain(string[] segments)
    {
        var value = segments.SkipWhile(segment => segment.Equals("api", StringComparison.OrdinalIgnoreCase))
            .FirstOrDefault(segment => !segment.Equals("admin", StringComparison.OrdinalIgnoreCase) &&
                !segment.Equals("management", StringComparison.OrdinalIgnoreCase)) ?? "SYSTEM";
        return value.Replace('-', '_').ToUpperInvariant();
    }
}
