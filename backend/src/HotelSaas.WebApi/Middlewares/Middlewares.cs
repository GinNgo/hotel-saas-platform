using System.Security.Claims;
using System.Text.Json;
using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Application.Common.Models;
using HotelSaas.Domain.Entities;
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

        // 1. Kiểm tra từ Header X-Tenant-Id
        if (context.Request.Headers.TryGetValue("X-Tenant-Id", out var tenantHeader) &&
            Guid.TryParse(tenantHeader, out var tenantIdFromHeader))
        {
            resolvedTenantId = tenantIdFromHeader;
        }
        // 2. Hoặc lấy từ Claim tenant_id trong JWT
        else if (context.User.Identity?.IsAuthenticated == true)
        {
            var tenantClaim = context.User.FindFirst("tenant_id")?.Value;
            if (Guid.TryParse(tenantClaim, out var tenantIdFromClaim))
            {
                resolvedTenantId = tenantIdFromClaim;
            }
        }

        if (resolvedTenantId.HasValue)
        {
            var tenant = await dbContext.Tenants
                .AsNoTracking()
                .FirstOrDefaultAsync(t => t.Id == resolvedTenantId.Value);

            if (tenant != null)
            {
                tenantService.SetTenant(tenant.Id, tenant.SubscriptionTier);
            }
        }

        await _next(context);
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
