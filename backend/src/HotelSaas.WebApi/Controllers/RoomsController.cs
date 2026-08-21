using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Application.Common.Models;
using HotelSaas.Application.DTOs.Rooms;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using System.Security.Claims;
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

    [HttpGet]
    [Authorize(Policy = "room.read")]
    public async Task<ActionResult<List<AdminRoomDto>>> GetAdminRooms([FromQuery] bool includeDeleted = false)
    {
        var query = _context.Rooms.IgnoreQueryFilters().AsNoTracking().Include(room => room.RoomType)
            .Where(room => includeDeleted || !room.IsDeleted);
        if (!User.IsInRole("SuperAdmin"))
        {
            if (!TryGetTenantId(out var tenantId)) return Forbid();
            query = query.Where(room => room.TenantId == tenantId);
        }

        var rooms = await query.OrderBy(room => room.Floor).ThenBy(room => room.RoomNumber).ToListAsync();
        return Ok(rooms.Select(ToAdminRoom).ToList());
    }

    [HttpGet("paged")]
    [Authorize(Policy = "room.read")]
    public async Task<ActionResult<PagedRoomResponse>> GetAdminRoomsPaged([FromQuery] RoomQuery options)
    {
        var includeDeleted = options.IncludeDeleted || options.Status?.Equals("DELETED", StringComparison.OrdinalIgnoreCase) == true;
        var query = _context.Rooms.IgnoreQueryFilters().AsNoTracking().Include(room => room.RoomType).Where(room => includeDeleted || !room.IsDeleted);
        if (!User.IsInRole("SuperAdmin")) { if (!TryGetTenantId(out var tenantId)) return Forbid(); query = query.Where(room => room.TenantId == tenantId); }
        if (options.PropertyId.HasValue) query = query.Where(room => room.TenantId == options.PropertyId.Value);
        if (options.RoomTypeId.HasValue) query = query.Where(room => room.RoomTypeId == options.RoomTypeId.Value);
        if (!string.IsNullOrWhiteSpace(options.Search)) query = query.Where(room => room.RoomNumber.Contains(options.Search));
        if (!string.IsNullOrWhiteSpace(options.Status)) query = options.Status.ToUpperInvariant() switch
        {
            "DELETED" => query.Where(room => room.IsDeleted),
            "AVAILABLE" => query.Where(room => !room.IsDeleted && room.Status == RoomStatus.Clean),
            "OCCUPIED" => query.Where(room => !room.IsDeleted && room.Status == RoomStatus.Occupied),
            "DIRTY" => query.Where(room => !room.IsDeleted && room.Status == RoomStatus.Dirty),
            "CLEANING" => query.Where(room => !room.IsDeleted && room.Status == RoomStatus.Cleaning),
            "MAINTENANCE" or "OUT_OF_SERVICE" => query.Where(room => !room.IsDeleted && room.Status == RoomStatus.OutOfService),
            _ => query.Where(_ => false)
        };
        if (!string.IsNullOrWhiteSpace(options.HousekeepingStatus)) query = options.HousekeepingStatus.ToUpperInvariant() switch
        {
            "CLEAN" => query.Where(room => room.Status == RoomStatus.Clean),
            "CLEANING" => query.Where(room => room.Status == RoomStatus.Cleaning),
            "DIRTY" => query.Where(room => room.Status != RoomStatus.Clean && room.Status != RoomStatus.Cleaning),
            _ => query.Where(_ => false)
        };
        if (!string.IsNullOrWhiteSpace(options.MaintenanceStatus)) query = options.MaintenanceStatus.ToUpperInvariant() switch
        {
            "NONE" => query.Where(room => room.Status != RoomStatus.OutOfService),
            "MAINTENANCE" or "OUT_OF_SERVICE" => query.Where(room => room.Status == RoomStatus.OutOfService),
            _ => query.Where(_ => false)
        };
        query = options.SortDirection?.Equals("DESC", StringComparison.OrdinalIgnoreCase) == true ? query.OrderByDescending(room => room.Floor).ThenByDescending(room => room.RoomNumber) : query.OrderBy(room => room.Floor).ThenBy(room => room.RoomNumber);
        var page = Math.Max(1, options.Page); var size = Math.Clamp(options.PageSize, 1, 100); var total = await query.CountAsync();
        var items = await query.Skip((page - 1) * size).Take(size).ToListAsync();
        return Ok(new PagedRoomResponse(items.Select(ToAdminRoom).ToList(), page, size, total, (int)Math.Ceiling(total / (double)size)));
    }

    [HttpGet("available")]
    [Authorize(Policy = "room.read")]
    public async Task<ActionResult<List<AdminRoomDto>>> GetAvailableAdminRooms(
        [FromQuery] DateOnly checkIn, [FromQuery] DateOnly checkOut, [FromQuery] Guid? hotelId = null)
    {
        if (checkIn < DateOnly.FromDateTime(DateTime.UtcNow) || checkIn >= checkOut)
            return BadRequest(new { message = "Khoảng ngày lưu trú không hợp lệ." });
        Guid tenantId;
        if (User.IsInRole("SuperAdmin"))
        {
            if (!hotelId.HasValue || hotelId == Guid.Empty) return BadRequest(new { message = "SuperAdmin phải chọn cơ sở lưu trú." });
            tenantId = hotelId.Value;
        }
        else if (!TryGetTenantId(out tenantId) || hotelId.HasValue && hotelId.Value != tenantId) return Forbid();

        var rooms = await _context.Rooms.IgnoreQueryFilters().AsNoTracking().Include(room => room.RoomType)
            .Where(room => room.TenantId == tenantId && room.IsActive && !room.IsDeleted && room.Status == RoomStatus.Clean &&
                room.RoomType != null && room.RoomType.IsActive && !room.RoomType.IsDeleted)
            .OrderBy(room => room.Floor).ThenBy(room => room.RoomNumber).ToListAsync();
        var now = DateTime.UtcNow;
        var overlappingDetails = await _context.ReservationDetails.IgnoreQueryFilters().AsNoTracking()
            .Where(detail => detail.TenantId == tenantId && detail.Reservation != null &&
                detail.Reservation.Status != ReservationStatus.Cancelled && detail.Reservation.Status != ReservationStatus.NoShow &&
                detail.Reservation.Status != ReservationStatus.CheckedOut &&
                (detail.Reservation.Status != ReservationStatus.PendingPayment || detail.Reservation.CreatedAtUtc > now.AddMinutes(-15)) &&
                detail.Reservation.CheckInDate < checkOut &&
                detail.Reservation.CheckOutDate > checkIn)
            .Select(detail => new { detail.RoomTypeId, detail.RoomId }).ToListAsync();
        var assignedRoomIds = overlappingDetails.Where(detail => detail.RoomId.HasValue).Select(detail => detail.RoomId!.Value).ToHashSet();
        var unassignedByType = overlappingDetails.Where(detail => !detail.RoomId.HasValue).GroupBy(detail => detail.RoomTypeId)
            .ToDictionary(group => group.Key, group => group.Count());
        var start = checkIn.ToDateTime(TimeOnly.MinValue);
        var end = checkOut.ToDateTime(TimeOnly.MinValue);
        var heldByType = (await _context.BookingHolds.IgnoreQueryFilters().AsNoTracking()
            .Where(hold => hold.TenantId == tenantId && !hold.IsReleased && !hold.IsConvertedToReservation &&
                hold.ExpiresAtUtc > now && hold.CheckInDate < end && hold.CheckOutDate > start)
            .GroupBy(hold => hold.RoomTypeId).Select(group => new { RoomTypeId = group.Key, Count = group.Sum(item => item.Quantity) })
            .ToListAsync()).ToDictionary(item => item.RoomTypeId, item => item.Count);

        var available = new List<Room>();
        foreach (var group in rooms.Where(room => !assignedRoomIds.Contains(room.Id)).GroupBy(room => room.RoomTypeId))
        {
            var inventoryOffset = unassignedByType.GetValueOrDefault(group.Key) + heldByType.GetValueOrDefault(group.Key);
            available.AddRange(group.Skip(inventoryOffset));
        }
        return Ok(available.OrderBy(room => room.Floor).ThenBy(room => room.RoomNumber).Select(ToAdminRoom).ToList());
    }

    [HttpPost]
    [Authorize(Policy = "room.create")]
    public async Task<ActionResult<AdminRoomDto>> CreateAdminRoom([FromBody] SaveAdminRoomRequest request)
    {
        if (!CanAccess(request.HotelId)) return Forbid();
        var validation = await ValidateAdminRoom(request, null);
        if (validation is not null) return validation;

        var room = new Room
        {
            TenantId = request.HotelId, RoomTypeId = request.RoomTypeId, RoomNumber = request.RoomNumber.Trim(),
            Floor = request.Floor, Notes = Clean(request.Note), Status = RoomStatus.Clean, IsActive = true
        };
        _context.Rooms.Add(room);
        await _context.SaveChangesAsync();
        room.RoomType = await _context.RoomTypes.IgnoreQueryFilters().FirstAsync(type => type.Id == room.RoomTypeId);
        return Ok(ToAdminRoom(room));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "room.update")]
    public async Task<ActionResult<AdminRoomDto>> UpdateAdminRoom(Guid id, [FromBody] SaveAdminRoomRequest request)
    {
        var room = await _context.Rooms.IgnoreQueryFilters().Include(item => item.RoomType)
            .FirstOrDefaultAsync(item => item.Id == id && !item.IsDeleted);
        if (room is null) return NotFound(new { message = "Không tìm thấy phòng." });
        if (!CanAccess(room.TenantId) || request.HotelId != room.TenantId) return Forbid();
        var validation = await ValidateAdminRoom(request, id);
        if (validation is not null) return validation;
        if (room.Status == RoomStatus.Occupied && room.RoomTypeId != request.RoomTypeId)
            return Conflict(new { message = "Không thể đổi loại phòng khi phòng đang có khách." });

        room.RoomTypeId = request.RoomTypeId;
        room.RoomNumber = request.RoomNumber.Trim();
        room.Floor = request.Floor;
        room.Notes = Clean(request.Note);
        room.RoomType = await _context.RoomTypes.IgnoreQueryFilters().FirstAsync(type => type.Id == request.RoomTypeId);
        await _context.SaveChangesAsync();
        return Ok(ToAdminRoom(room));
    }

    [HttpPost("bulk")]
    [Authorize(Policy = "room.create")]
    public async Task<ActionResult<BulkAdminRoomResult>> CreateAdminRoomsBulk([FromBody] BulkAdminRoomRequest request)
    {
        if (!CanAccess(request.HotelId)) return Forbid();
        if (request.FromNumber <= 0 || request.ToNumber < request.FromNumber || request.ToNumber - request.FromNumber + 1 > 100)
            return BadRequest(new { message = "Dải số phòng phải hợp lệ và không vượt quá 100 phòng mỗi lần." });
        if (request.Floor is < 0 or > 200 || (request.Prefix?.Trim().Length ?? 0) > 20)
            return BadRequest(new { message = "Tầng hoặc tiền tố phòng không hợp lệ." });
        var roomType = await _context.RoomTypes.IgnoreQueryFilters().FirstOrDefaultAsync(type =>
            type.Id == request.RoomTypeId && type.TenantId == request.HotelId && type.IsActive && !type.IsDeleted);
        if (roomType is null) return BadRequest(new { message = "Loại phòng không hợp lệ hoặc đã ngừng hoạt động." });

        var prefix = request.Prefix?.Trim() ?? string.Empty;
        var requestedNumbers = Enumerable.Range(request.FromNumber, request.ToNumber - request.FromNumber + 1)
            .Select(number => $"{prefix}{number}").ToList();
        var duplicates = (await _context.Rooms.IgnoreQueryFilters()
            .Where(room => room.TenantId == request.HotelId && !room.IsDeleted && requestedNumbers.Contains(room.RoomNumber))
            .Select(room => room.RoomNumber).ToListAsync()).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var rooms = requestedNumbers.Where(number => !duplicates.Contains(number)).Select(number => new Room
        {
            TenantId = request.HotelId, RoomTypeId = request.RoomTypeId, RoomType = roomType,
            RoomNumber = number, Floor = request.Floor, Status = RoomStatus.Clean, IsActive = true
        }).ToList();
        _context.Rooms.AddRange(rooms);
        await _context.SaveChangesAsync();
        return Ok(new BulkAdminRoomResult(rooms.Select(ToAdminRoom).ToList(), requestedNumbers.Where(duplicates.Contains).ToList()));
    }

    [HttpPost("{id:guid}/maintenance/start")]
    [Authorize(Policy = "room.execute")]
    public Task<ActionResult<AdminRoomDto>> StartAdminMaintenance(Guid id, [FromBody] RoomMaintenanceRequest request) =>
        SetAdminMaintenance(id, true, request.Reason);

    [HttpPost("{id:guid}/maintenance/complete")]
    [Authorize(Policy = "room.execute")]
    public Task<ActionResult<AdminRoomDto>> CompleteAdminMaintenance(Guid id) => SetAdminMaintenance(id, false, null);

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "room.delete")]
    public async Task<IActionResult> DeactivateAdminRoom(Guid id)
    {
        var room = await _context.Rooms.IgnoreQueryFilters().FirstOrDefaultAsync(item => item.Id == id && !item.IsDeleted);
        if (room is null) return NotFound();
        if (!CanAccess(room.TenantId)) return Forbid();
        if (room.Status == RoomStatus.Occupied) return Conflict(new { message = "Không thể ngừng sử dụng phòng đang có khách." });
        room.IsActive = false;
        room.Status = RoomStatus.OutOfService;
        room.IsDeleted = true;
        await _context.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("{id:guid}/restore")]
    [Authorize(Policy = "room.update")]
    public async Task<ActionResult<AdminRoomDto>> RestoreAdminRoom(Guid id)
    {
        var room = await _context.Rooms.IgnoreQueryFilters().Include(item => item.RoomType).FirstOrDefaultAsync(item => item.Id == id && item.IsDeleted);
        if (room is null) return NotFound();
        if (!CanAccess(room.TenantId)) return Forbid();
        if (await _context.Rooms.IgnoreQueryFilters().AnyAsync(item => item.Id != id && item.TenantId == room.TenantId && item.RoomNumber == room.RoomNumber && !item.IsDeleted))
            return Conflict(new { message = "Số phòng đã được sử dụng." });
        room.IsDeleted = false;
        room.IsActive = true;
        room.Status = RoomStatus.Clean;
        await _context.SaveChangesAsync();
        return Ok(ToAdminRoom(room));
    }

    [HttpGet("search")]
    public async Task<ActionResult<Result<List<AvailableRoomResultDto>>>> SearchRooms([FromQuery] SearchRoomsQueryDto query)
    {
        if (query.CheckInDate >= query.CheckOutDate)
            return BadRequest(Result<List<AvailableRoomResultDto>>.Failure("Ngày trả phòng phải sau ngày nhận phòng."));

        var checkInDt = query.CheckInDate.ToDateTime(TimeOnly.MinValue);
        var checkOutDt = query.CheckOutDate.ToDateTime(TimeOnly.MinValue);
        var now = DateTime.UtcNow;

        var reservedInventory = await _context.ReservationDetails
            .IgnoreQueryFilters()
            .Where(rd => rd.Reservation != null &&
                        rd.Reservation.Status != ReservationStatus.Cancelled &&
                        rd.Reservation.Status != ReservationStatus.NoShow &&
                        rd.Reservation.Status != ReservationStatus.CheckedOut &&
                        (rd.Reservation.Status != ReservationStatus.PendingPayment || rd.Reservation.CreatedAtUtc > now.AddMinutes(-15)) &&
                        rd.Reservation.CheckInDate < query.CheckOutDate &&
                        rd.Reservation.CheckOutDate > query.CheckInDate)
            .GroupBy(rd => rd.RoomTypeId)
            .Select(group => new { RoomTypeId = group.Key, ReservedCount = group.Count() })
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
            var totalInventory = rt.Rooms.Count(r => r.IsActive && !r.IsDeleted && r.Status != RoomStatus.OutOfService);
            var reserved = reservedInventory.FirstOrDefault(item => item.RoomTypeId == rt.Id)?.ReservedCount ?? 0;
            var held = activeHolds.FirstOrDefault(h => h.RoomTypeId == rt.Id)?.HoldCount ?? 0;
            var realAvailable = Math.Max(0, totalInventory - reserved - held);

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
    [Authorize(Policy = "room.read")]
    public async Task<ActionResult<Result<List<RoomDto>>>> GetTenantRooms()
    {
        var rooms = await _context.Rooms
            .Include(r => r.RoomType)
            .Where(r => !r.IsDeleted)
            .Select(r => new RoomDto(r.Id, r.RoomNumber, r.Floor, r.RoomTypeId, r.RoomType != null ? r.RoomType.Name : string.Empty, r.Status, r.IsActive))
            .ToListAsync();

        return Ok(Result<List<RoomDto>>.Success(rooms));
    }

    private async Task<ActionResult<AdminRoomDto>> SetAdminMaintenance(Guid id, bool enabled, string? reason)
    {
        var room = await _context.Rooms.IgnoreQueryFilters().Include(item => item.RoomType)
            .FirstOrDefaultAsync(item => item.Id == id && !item.IsDeleted);
        if (room is null) return NotFound(new { message = "Không tìm thấy phòng." });
        if (!CanAccess(room.TenantId)) return Forbid();
        if (enabled && room.Status == RoomStatus.Occupied)
            return Conflict(new { message = "Không thể bảo trì phòng đang có khách." });
        if (enabled && (string.IsNullOrWhiteSpace(reason) || reason.Trim().Length is < 3 or > 500))
            return BadRequest(new { message = "Vui lòng nhập lý do bảo trì từ 3 đến 500 ký tự." });
        if (!enabled && room.Status != RoomStatus.OutOfService)
            return Conflict(new { message = "Phòng không ở trạng thái bảo trì." });
        room.Status = enabled ? RoomStatus.OutOfService : RoomStatus.Clean;
        room.IsActive = true;
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var actorId);
        if (enabled)
        {
            room.MaintenanceReason = reason!.Trim();
            room.MaintenanceStartedAtUtc = DateTime.UtcNow;
            room.MaintenanceCompletedAtUtc = null;
            room.MaintenanceStartedByUserId = actorId == Guid.Empty ? null : actorId;
            room.MaintenanceCompletedByUserId = null;
        }
        else
        {
            room.MaintenanceCompletedAtUtc = DateTime.UtcNow;
            room.MaintenanceCompletedByUserId = actorId == Guid.Empty ? null : actorId;
        }
        await _context.SaveChangesAsync();
        return Ok(ToAdminRoom(room));
    }

    private async Task<ObjectResult?> ValidateAdminRoom(SaveAdminRoomRequest request, Guid? currentRoomId)
    {
        if (request.HotelId == Guid.Empty || request.RoomTypeId == Guid.Empty || string.IsNullOrWhiteSpace(request.RoomNumber) ||
            request.RoomNumber.Trim().Length > 50 || request.Floor is < 0 or > 200)
            return BadRequest(new { message = "Cơ sở, loại phòng, số phòng và tầng phải hợp lệ." });
        if (!await _context.RoomTypes.IgnoreQueryFilters().AnyAsync(type => type.Id == request.RoomTypeId &&
            type.TenantId == request.HotelId && type.IsActive && !type.IsDeleted))
            return BadRequest(new { message = "Loại phòng không thuộc cơ sở hoặc đã ngừng hoạt động." });
        if (await _context.Rooms.IgnoreQueryFilters().AnyAsync(room => room.Id != currentRoomId && room.TenantId == request.HotelId &&
            room.RoomNumber == request.RoomNumber.Trim() && !room.IsDeleted))
            return Conflict(new { message = "Số phòng đã tồn tại trong cơ sở." });
        return null;
    }

    private bool CanAccess(Guid tenantId) => User.IsInRole("SuperAdmin") || TryGetTenantId(out var scopedTenantId) && scopedTenantId == tenantId;
    private bool TryGetTenantId(out Guid tenantId) => Guid.TryParse(User.FindFirstValue("tenant_id"), out tenantId);
    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static AdminRoomDto ToAdminRoom(Room room) => new(room.Id, room.TenantId, room.RoomTypeId, room.RoomType?.Code,
        room.RoomType?.Name ?? string.Empty, room.RoomNumber, room.Floor, room.IsDeleted ? "DELETED" : RoomStatusName(room.Status),
        room.Status switch { RoomStatus.Clean => "CLEAN", RoomStatus.Cleaning => "CLEANING", _ => "DIRTY" },
        room.Status == RoomStatus.OutOfService ? "MAINTENANCE" : "NONE", room.Notes,
        room.MaintenanceReason, room.MaintenanceStartedAtUtc, room.MaintenanceCompletedAtUtc,
        room.MaintenanceStartedByUserId, room.MaintenanceCompletedByUserId);
    private static string RoomStatusName(RoomStatus status) => status switch
    {
        RoomStatus.Clean => "AVAILABLE", RoomStatus.Dirty => "DIRTY", RoomStatus.Cleaning => "CLEANING",
        RoomStatus.Occupied => "OCCUPIED", RoomStatus.OutOfService => "OUT_OF_SERVICE", _ => "AVAILABLE"
    };
}

public sealed record SaveAdminRoomRequest(Guid HotelId, Guid RoomTypeId, string RoomNumber, int Floor, string? Note = null);
public sealed record RoomMaintenanceRequest(string? Reason);
public sealed record BulkAdminRoomRequest(Guid HotelId, Guid RoomTypeId, int Floor, int FromNumber, int ToNumber, string? Prefix = null, string? Status = null);
public sealed record BulkAdminRoomResult(List<AdminRoomDto> Created, List<string> FailedRoomNumbers);
public sealed record AdminRoomDto(Guid Id, Guid HotelId, Guid RoomTypeId, string? RoomTypeCode, string RoomTypeNameVi,
    string RoomNumber, int Floor, string Status, string HousekeepingStatus, string MaintenanceStatus, string? Note,
    string? MaintenanceReason, DateTime? MaintenanceStartedAt, DateTime? MaintenanceCompletedAt,
    Guid? MaintenanceStartedByUserId, Guid? MaintenanceCompletedByUserId);
public sealed record RoomQuery(string? Search = null, Guid? PropertyId = null, Guid? RoomTypeId = null,
    string? Status = null, string? HousekeepingStatus = null, string? MaintenanceStatus = null,
    int Page = 1, int PageSize = 20, string? SortBy = "floor", string? SortDirection = "ASC", bool IncludeDeleted = false);
public sealed record PagedRoomResponse(List<AdminRoomDto> Items, int Page, int PageSize, int TotalItems, int TotalPages);
