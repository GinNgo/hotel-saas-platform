using HotelSaas.Domain.Entities;
using HotelSaas.Infrastructure.Persistence;
using HotelSaas.Application.Common.Interfaces;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using HotelSaas.WebApi.Realtime;

namespace HotelSaas.WebApi.Realtime;

public sealed class RoomStatusRealtimeMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext httpContext, IHubContext<RoomStatusHub> hub, ApplicationDbContext db, ICurrentTenantService tenantService)
    {
        await next(httpContext);
        if (httpContext.Response.StatusCode >= 400) return;
        var path = httpContext.Request.Path.Value?.ToLowerInvariant() ?? string.Empty;
        if (!path.Contains("check-in") && !path.Contains("check-out") && !path.Contains("maintenance")) return;
        var tenantId = tenantService.TenantId;
        if (!tenantId.HasValue) return;
        var snapshot = await db.Rooms.AsNoTracking().Where(room => room.TenantId == tenantId && !room.IsDeleted)
            .Select(room => new { TenantId = room.TenantId, RoomId = room.Id, RoomNumber = room.RoomNumber, Status = room.Status.ToString().ToUpperInvariant() }).ToListAsync();
        await hub.Clients.Group(RoomStatusHub.GroupName(tenantId.Value)).SendAsync("RoomStatusChanged", snapshot);
    }
}
