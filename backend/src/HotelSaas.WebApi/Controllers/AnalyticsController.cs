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

    [HttpGet("dashboard")]
    [Authorize(Policy = "report.read")]
    public async Task<ActionResult<object>> GetDashboard()
    {
        var businessNow = DateTime.UtcNow.AddHours(7);
        var today = DateOnly.FromDateTime(businessNow);
        var firstDay = today.AddDays(-6);
        var lastDayExclusive = today.AddDays(1);
        var totalRooms = await _context.Rooms.CountAsync(room => room.IsActive && !room.IsDeleted && room.Status != RoomStatus.OutOfService);
        var details = await _context.ReservationDetails.AsNoTracking().Include(detail => detail.Reservation)
            .Where(detail => detail.Reservation != null &&
                (detail.Reservation.Status == ReservationStatus.CheckedIn || detail.Reservation.Status == ReservationStatus.CheckedOut) &&
                detail.Reservation.CheckInDate < lastDayExclusive && detail.Reservation.CheckOutDate > firstDay)
            .ToListAsync();
        var labels = new List<string>();
        var revenueData = new List<decimal>();
        var occupancyData = new List<decimal>();
        for (var offset = 0; offset < 7; offset++)
        {
            var day = firstDay.AddDays(offset);
            var occupiedRoomNights = details.Count(detail => detail.Reservation!.CheckInDate <= day && detail.Reservation.CheckOutDate > day);
            var revenue = details.Where(detail => detail.Reservation!.CheckInDate <= day && detail.Reservation.CheckOutDate > day)
                .Sum(detail => detail.NightlyPrice);
            labels.Add(day.ToString("dd/MM"));
            revenueData.Add(revenue);
            occupancyData.Add(totalRooms > 0
                ? decimal.Round(occupiedRoomNights * 100m / totalRooms, 2, MidpointRounding.AwayFromZero)
                : 0);
        }
        var activeStatuses = new[] { ReservationStatus.Confirmed, ReservationStatus.CheckedIn, ReservationStatus.CheckedOut };
        var totalBookings = await _context.Reservations.CountAsync(reservation => activeStatuses.Contains(reservation.Status) &&
            reservation.CheckInDate < lastDayExclusive && reservation.CheckOutDate > firstDay);
        var startOfTodayUtc = businessNow.Date.AddHours(-7);
        var bookingsToday = await _context.Reservations.CountAsync(reservation =>
            reservation.CreatedAtUtc >= startOfTodayUtc && reservation.CreatedAtUtc < startOfTodayUtc.AddDays(1));
        return Ok(new
        {
            TotalRevenue = revenueData.Sum(),
            TotalBookings = totalBookings,
            BookingsToday = bookingsToday,
            OccupancyRate = occupancyData.LastOrDefault(),
            Labels = labels,
            RevenueData = revenueData,
            OccupancyData = occupancyData
        });
    }

    [HttpGet("tenant-dashboard")]
    [Authorize(Policy = "report.read")]
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
    [Authorize(Policy = "system.read")]
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
