using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Application.Common.Models;
using HotelSaas.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AnalyticsController : ControllerBase
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentTenantService _tenantService;

    public AnalyticsController(IApplicationDbContext context, ICurrentTenantService tenantService)
    {
        _context = context;
        _tenantService = tenantService;
    }

    [HttpGet("tenant-dashboard")]
    [Authorize(Roles = "Owner,Manager")]
    public async Task<ActionResult<Result<object>>> GetTenantDashboard()
    {
        var totalRooms = await _context.Rooms.CountAsync(r => r.IsActive && !r.IsDeleted);
        var occupiedRooms = await _context.Rooms.CountAsync(r => r.Status == RoomStatus.Occupied);
        var occupancyRate = totalRooms > 0 ? (double)occupiedRooms / totalRooms * 100 : 0;

        var startOfMonth = new DateOnly(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1);
        var monthlyRev = await _context.Reservations
            .Where(r => (r.Status == ReservationStatus.Confirmed || r.Status == ReservationStatus.CheckedIn || r.Status == ReservationStatus.CheckedOut) && r.CheckInDate >= startOfMonth)
            .SumAsync(r => r.TotalAmount);

        var stats = new
        {
            Tier = _tenantService.Tier.ToString(),
            TotalRooms = totalRooms,
            OccupiedRooms = occupiedRooms,
            OccupancyRate = Math.Round(occupancyRate, 2),
            MonthlyRevenue = monthlyRev,
            RevPAR = totalRooms > 0 ? Math.Round(monthlyRev / (totalRooms * DateTime.UtcNow.Day), 0) : 0
        };

        return Ok(Result<object>.Success(stats));
    }

    [HttpGet("platform-overview")]
    [Authorize(Roles = "SuperAdmin")]
    public async Task<ActionResult<Result<object>>> GetPlatformOverview()
    {
        var totalTenants = await _context.Tenants.CountAsync(t => !t.IsDeleted);
        var activeTenants = await _context.Tenants.CountAsync(t => t.Status == TenantStatus.Active);
        var totalBookings = await _context.Reservations.IgnoreQueryFilters().CountAsync();
        var totalGmv = await _context.Reservations.IgnoreQueryFilters().Where(r => r.Status == ReservationStatus.Confirmed || r.Status == ReservationStatus.CheckedOut).SumAsync(r => r.TotalAmount);

        var overview = new
        {
            TotalTenants = totalTenants,
            ActiveTenants = activeTenants,
            TotalBookings = totalBookings,
            GrossMerchandiseValue = totalGmv
        };

        return Ok(Result<object>.Success(overview));
    }
}
