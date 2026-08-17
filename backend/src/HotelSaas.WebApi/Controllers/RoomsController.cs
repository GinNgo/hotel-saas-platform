using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Application.Common.Models;
using HotelSaas.Application.DTOs.Rooms;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class RoomsController : ControllerBase
{
    private readonly IApplicationDbContext _context;

    public RoomsController(IApplicationDbContext context)
    {
        _context = context;
    }

    [HttpGet("search")]
    public async Task<ActionResult<Result<List<AvailableRoomResultDto>>>> SearchRooms([FromQuery] SearchRoomsQueryDto query)
    {
        if (query.CheckInDate >= query.CheckOutDate)
            return BadRequest(Result<List<AvailableRoomResultDto>>.Failure("Ngày trả phòng phải sau ngày nhận phòng."));

        var checkInDt = query.CheckInDate.ToDateTime(TimeOnly.MinValue);
        var checkOutDt = query.CheckOutDate.ToDateTime(TimeOnly.MinValue);
        var now = DateTime.UtcNow;

        var busyRoomIds = await _context.ReservationDetails
            .IgnoreQueryFilters()
            .Where(rd => rd.Reservation != null &&
                        (rd.Reservation.Status == ReservationStatus.Confirmed || rd.Reservation.Status == ReservationStatus.CheckedIn) &&
                        rd.Reservation.CheckInDate < query.CheckOutDate &&
                        rd.Reservation.CheckOutDate > query.CheckInDate &&
                        rd.RoomId != null)
            .Select(rd => rd.RoomId!.Value)
            .Distinct()
            .ToListAsync();

        var activeHolds = await _context.BookingHolds
            .IgnoreQueryFilters()
            .Where(h => !h.IsReleased && !h.IsConvertedToReservation &&
                        h.ExpiresAtUtc > now &&
                        h.CheckInDate < checkOutDt &&
                        h.CheckOutDate > checkInDt)
            .GroupBy(h => h.RoomTypeId)
            .Select(g => new { RoomTypeId = g.Key, HoldCount = g.Sum(x => x.Quantity) })
            .ToListAsync();

        var roomTypesQuery = _context.RoomTypes
            .IgnoreQueryFilters()
            .Include(rt => rt.Tenant)
            .Include(rt => rt.Rooms)
            .Where(rt => rt.IsActive && !rt.IsDeleted &&
                        rt.CapacityAdults >= query.Adults &&
                        rt.CapacityChildren >= query.Children);

        if (query.TenantId.HasValue)
            roomTypesQuery = roomTypesQuery.Where(rt => rt.TenantId == query.TenantId.Value);

        if (!string.IsNullOrWhiteSpace(query.City))
            roomTypesQuery = roomTypesQuery.Where(rt => rt.Tenant != null && rt.Tenant.City.Contains(query.City));

        var roomTypes = await roomTypesQuery.ToListAsync();
        var results = new List<AvailableRoomResultDto>();

        foreach (var rt in roomTypes)
        {
            var totalAvailable = rt.Rooms.Count(r => r.IsActive && r.Status != RoomStatus.OutOfService && !busyRoomIds.Contains(r.Id));
            var held = activeHolds.FirstOrDefault(h => h.RoomTypeId == rt.Id)?.HoldCount ?? 0;
            var realAvailable = Math.Max(0, totalAvailable - held);

            if (realAvailable > 0)
            {
                results.Add(new AvailableRoomResultDto(
                    rt.TenantId,
                    rt.Tenant?.Name ?? string.Empty,
                    rt.Tenant?.City ?? string.Empty,
                    rt.Id,
                    rt.Name,
                    rt.BasePricePerNight,
                    realAvailable,
                    rt.CapacityAdults,
                    rt.CapacityChildren
                ));
            }
        }

        return Ok(Result<List<AvailableRoomResultDto>>.Success(results));
    }

    [HttpGet("tenant-rooms")]
    [Authorize(Roles = "Owner,Manager,Receptionist")]
    public async Task<ActionResult<Result<List<RoomDto>>>> GetTenantRooms()
    {
        var rooms = await _context.Rooms
            .Include(r => r.RoomType)
            .Where(r => !r.IsDeleted)
            .Select(r => new RoomDto(r.Id, r.RoomNumber, r.Floor, r.RoomTypeId, r.RoomType != null ? r.RoomType.Name : string.Empty, r.Status, r.IsActive))
            .ToListAsync();

        return Ok(Result<List<RoomDto>>.Success(rooms));
    }
}
