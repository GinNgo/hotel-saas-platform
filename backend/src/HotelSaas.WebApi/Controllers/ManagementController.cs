using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ManagementController : ControllerBase
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentTenantService _tenantService;

    public ManagementController(IApplicationDbContext context, ICurrentTenantService tenantService)
    {
        _context = context;
        _tenantService = tenantService;
    }

    [HttpGet("context")]
    [Authorize(Policy = "hotel.read")]
    public async Task<ActionResult<ManagementContextDto>> GetContext([FromQuery] Guid? activePropertyId)
    {
        if (!_tenantService.TenantId.HasValue) return Forbid();
        if (activePropertyId.HasValue && activePropertyId != _tenantService.TenantId) return Forbid();

        var tenant = await _context.Tenants.AsNoTracking()
            .FirstOrDefaultAsync(item => item.Id == _tenantService.TenantId && !item.IsDeleted);
        if (tenant == null) return NotFound(new { message = "Không tìm thấy cơ sở trong phiên đăng nhập." });

        var property = ToProperty(tenant);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var startOfMonth = new DateOnly(today.Year, today.Month, 1);
        var startOfNextMonth = startOfMonth.AddMonths(1);
        var roomStates = await _context.Rooms.AsNoTracking().Where(room => room.IsActive && !room.IsDeleted)
            .GroupBy(room => room.Status).Select(group => new { group.Key, Count = group.Count() })
            .ToDictionaryAsync(item => item.Key, item => item.Count);
        var revenueDetails = await _context.ReservationDetails.AsNoTracking().Include(detail => detail.Reservation)
            .Where(detail => detail.Reservation != null &&
                (detail.Reservation.Status == ReservationStatus.CheckedIn || detail.Reservation.Status == ReservationStatus.CheckedOut) &&
                detail.Reservation.CheckInDate < startOfNextMonth && detail.Reservation.CheckOutDate > startOfMonth)
            .ToListAsync();
        var roomRevenue = revenueDetails.Sum(detail =>
        {
            var stayStart = detail.Reservation!.CheckInDate > startOfMonth ? detail.Reservation.CheckInDate : startOfMonth;
            var stayEnd = detail.Reservation.CheckOutDate < startOfNextMonth ? detail.Reservation.CheckOutDate : startOfNextMonth;
            return detail.NightlyPrice * Math.Max(0, stayEnd.DayNumber - stayStart.DayNumber);
        });
        var soldRoomNights = revenueDetails.Sum(detail =>
        {
            var stayStart = detail.Reservation!.CheckInDate > startOfMonth ? detail.Reservation.CheckInDate : startOfMonth;
            var stayEnd = detail.Reservation.CheckOutDate < startOfNextMonth ? detail.Reservation.CheckOutDate : startOfNextMonth;
            return Math.Max(0, stayEnd.DayNumber - stayStart.DayNumber);
        });
        var totalRooms = roomStates.Values.Sum();
        var elapsedDays = Math.Max(1, today.Day);
        var dashboard = new Dictionary<string, decimal>
        {
            ["totalRooms"] = totalRooms,
            ["availableRooms"] = roomStates.GetValueOrDefault(RoomStatus.Clean),
            ["occupiedRooms"] = roomStates.GetValueOrDefault(RoomStatus.Occupied),
            ["dirtyRooms"] = roomStates.GetValueOrDefault(RoomStatus.Dirty) + roomStates.GetValueOrDefault(RoomStatus.Cleaning),
            ["maintenanceRooms"] = roomStates.GetValueOrDefault(RoomStatus.OutOfService),
            ["reservedRooms"] = await _context.ReservationDetails.CountAsync(detail => detail.Reservation != null &&
                detail.Reservation.Status == ReservationStatus.Confirmed && detail.Reservation.CheckInDate <= today && detail.Reservation.CheckOutDate > today),
            ["arrivalsToday"] = await _context.Reservations.CountAsync(reservation =>
                reservation.CheckInDate == today && reservation.Status == ReservationStatus.Confirmed),
            ["departuresToday"] = await _context.Reservations.CountAsync(reservation =>
                reservation.CheckOutDate == today && reservation.Status == ReservationStatus.CheckedIn),
            ["pendingHousekeeping"] = await _context.HousekeepingTasks.CountAsync(task =>
                task.Status != HousekeepingTaskStatus.Completed && !task.IsDeleted),
            ["monthlyRoomRevenue"] = roomRevenue,
            ["adr"] = soldRoomNights > 0 ? decimal.Round(roomRevenue / soldRoomNights, 0, MidpointRounding.AwayFromZero) : 0,
            ["revPar"] = totalRooms > 0 ? decimal.Round(roomRevenue / (totalRooms * elapsedDays), 0, MidpointRounding.AwayFromZero) : 0
        };

        return Ok(new ManagementContextDto(
            [property], tenant.Id, tenant.Status == TenantStatus.Active,
            tenant.SubscriptionTier.ToString().ToUpperInvariant(), tenant.Status.ToString().ToUpperInvariant(),
            "TENANT", null, false, Limits(tenant.SubscriptionTier),
            new ManagementUsageDto(1,
                await _context.RoomTypes.CountAsync(type => type.IsActive && !type.IsDeleted),
                (int)dashboard["totalRooms"],
                await _context.TenantStaffs.CountAsync(staff => staff.IsActive), 0),
            false, dashboard));
    }

    [HttpGet("properties")]
    [Authorize(Policy = "hotel.read")]
    public async Task<ActionResult<List<ManagedPropertyDto>>> GetProperties()
    {
        if (!_tenantService.TenantId.HasValue) return Forbid();
        var tenant = await _context.Tenants.AsNoTracking()
            .FirstOrDefaultAsync(item => item.Id == _tenantService.TenantId && !item.IsDeleted);
        return tenant == null ? Ok(new List<ManagedPropertyDto>()) : Ok(new List<ManagedPropertyDto> { ToProperty(tenant) });
    }

    [HttpGet("room-types")]
    [Authorize(Policy = "room_type.read")]
    public async Task<ActionResult<List<ManagementRoomTypeDto>>> GetRoomTypes([FromQuery] Guid propertyId)
    {
        if (!HasPropertyScope(propertyId)) return Forbid();
        var roomTypes = await _context.RoomTypes.AsNoTracking().Include(type => type.Amenities).Where(type => !type.IsDeleted)
            .OrderBy(type => type.Name).ToListAsync();
        return Ok(roomTypes.Select(ToRoomType).ToList());
    }

    [HttpPost("room-types")]
    [Authorize(Policy = "room_type.create")]
    public async Task<ActionResult<ManagementRoomTypeDto>> CreateRoomType([FromBody] CreateManagementRoomTypeRequest request)
    {
        if (!HasPropertyScope(request.HotelId)) return Forbid();
        var code = request.Code.Trim().ToUpperInvariant();
        var name = request.NameVi.Trim();
        if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(name))
            return BadRequest(new { message = "Mã và tên loại phòng là bắt buộc." });
        if (request.BasePrice <= 0 || request.MaxAdults <= 0 || request.MaxChildren < 0)
            return BadRequest(new { message = "Giá và sức chứa loại phòng không hợp lệ." });
        if (request.FreeCancellationHours is < 0 or > 720)
            return BadRequest(new { message = "Thời hạn hủy miễn phí phải từ 0 đến 720 giờ." });
        var amenityCodes = NormalizeRoomAmenities(request.AmenityCodes);
        if ((request.AmenityCodes ?? []).Any(code => !AllowedRoomAmenities.Contains(code.Trim())))
            return BadRequest(new { message = "Danh sách tiện nghi phòng có mã không hợp lệ." });
        if (await _context.RoomTypes.AnyAsync(type => type.Code == code && !type.IsDeleted))
            return Conflict(new { message = "Mã loại phòng đã tồn tại trong cơ sở." });

        var limit = RoomTypeLimit(_tenantService.Tier);
        if (await _context.RoomTypes.CountAsync(type => !type.IsDeleted) >= limit)
            return Conflict(new { message = $"Gói hiện tại chỉ cho phép tối đa {limit} loại phòng." });

        var roomType = new RoomType
        {
            TenantId = request.HotelId,
            Code = code,
            Name = name,
            NameEn = string.IsNullOrWhiteSpace(request.NameEn) ? null : request.NameEn.Trim(),
            Description = string.IsNullOrWhiteSpace(request.DescriptionVi) ? null : request.DescriptionVi.Trim(),
            DescriptionEn = string.IsNullOrWhiteSpace(request.DescriptionEn) ? null : request.DescriptionEn.Trim(),
            BedType = string.IsNullOrWhiteSpace(request.BedType) ? null : request.BedType.Trim(),
            BedCount = Math.Max(1, request.BedCount), AreaSquareMeters = Math.Max(0, request.Area),
            CapacityAdults = request.MaxAdults,
            CapacityChildren = request.MaxChildren,
            BasePricePerNight = request.BasePrice,
            IncludesBreakfast = request.IncludesBreakfast,
            IsRefundable = request.IsRefundable,
            FreeCancellationHours = request.IsRefundable ? request.FreeCancellationHours : 0,
            SmokingAllowed = request.SmokingAllowed,
            IsActive = !string.Equals(request.Status, "INACTIVE", StringComparison.OrdinalIgnoreCase)
        };
        foreach (var amenityCode in amenityCodes)
            roomType.Amenities.Add(new RoomTypeAmenity { TenantId = request.HotelId, RoomTypeId = roomType.Id, Code = amenityCode });
        _context.RoomTypes.Add(roomType);
        await _context.SaveChangesAsync();
        return CreatedAtAction(nameof(GetRoomTypes), new { propertyId = request.HotelId }, ToRoomType(roomType));
    }

    [HttpGet("rooms")]
    [Authorize(Policy = "room.read")]
    public async Task<ActionResult<List<ManagementRoomDto>>> GetRooms([FromQuery] Guid propertyId)
    {
        if (!HasPropertyScope(propertyId)) return Forbid();
        var rooms = await _context.Rooms.AsNoTracking().Include(room => room.RoomType)
            .Where(room => !room.IsDeleted).OrderBy(room => room.Floor).ThenBy(room => room.RoomNumber).ToListAsync();
        return Ok(rooms.Select(ToRoom).ToList());
    }

    [HttpPost("rooms")]
    [Authorize(Policy = "room.create")]
    public async Task<ActionResult<ManagementRoomDto>> CreateRoom([FromBody] CreateManagementRoomRequest request)
    {
        if (!HasPropertyScope(request.HotelId)) return Forbid();
        var error = await ValidateRoomInput(request.HotelId, request.RoomTypeId, request.RoomNumber, request.Floor);
        if (error != null) return error;
        var room = new Room
        {
            TenantId = request.HotelId, RoomTypeId = request.RoomTypeId,
            RoomNumber = request.RoomNumber.Trim(), Floor = request.Floor,
            Status = RoomStatus.Clean, IsActive = true
        };
        _context.Rooms.Add(room);
        await _context.SaveChangesAsync();
        room.RoomType = await _context.RoomTypes.FindAsync(room.RoomTypeId);
        return Ok(ToRoom(room));
    }

    [HttpPost("rooms/bulk")]
    [Authorize(Policy = "room.create")]
    public async Task<ActionResult<List<ManagementRoomDto>>> CreateRoomsBulk([FromBody] CreateManagementRoomsBulkRequest request)
    {
        if (!HasPropertyScope(request.HotelId)) return Forbid();
        if (request.FromNumber <= 0 || request.ToNumber < request.FromNumber || request.ToNumber - request.FromNumber + 1 > 100)
            return BadRequest(new { message = "Dải số phòng phải hợp lệ và không vượt quá 100 phòng mỗi lần." });
        if (request.Floor is < 0 or > 200)
            return BadRequest(new { message = "Tầng phòng không hợp lệ." });
        var roomType = await _context.RoomTypes.FirstOrDefaultAsync(type =>
            type.Id == request.RoomTypeId && type.IsActive && !type.IsDeleted);
        if (roomType == null) return BadRequest(new { message = "Loại phòng không hợp lệ hoặc đã ngừng hoạt động." });

        var roomLimit = RoomLimit(_tenantService.Tier);
        var requestedCount = request.ToNumber - request.FromNumber + 1;
        var currentCount = await _context.Rooms.CountAsync(room => room.IsActive && !room.IsDeleted);
        if (currentCount + requestedCount > roomLimit)
            return Conflict(new { message = $"Gói hiện tại chỉ cho phép tối đa {roomLimit} phòng." });

        var roomNumbers = Enumerable.Range(request.FromNumber, requestedCount).Select(number => number.ToString()).ToList();
        var duplicates = await _context.Rooms.Where(room => roomNumbers.Contains(room.RoomNumber) && !room.IsDeleted)
            .Select(room => room.RoomNumber).ToListAsync();
        if (duplicates.Count > 0)
            return Conflict(new { message = $"Số phòng đã tồn tại: {string.Join(", ", duplicates)}." });

        var rooms = roomNumbers.Select(number => new Room
        {
            TenantId = request.HotelId, RoomTypeId = request.RoomTypeId, RoomType = roomType,
            RoomNumber = number, Floor = request.Floor, Status = RoomStatus.Clean, IsActive = true
        }).ToList();
        _context.Rooms.AddRange(rooms);
        await _context.SaveChangesAsync();
        return Ok(rooms.Select(ToRoom).ToList());
    }

    [HttpPost("rooms/{roomId:guid}/maintenance/start")]
    [Authorize(Policy = "room.execute")]
    public async Task<ActionResult<ManagementRoomDto>> StartMaintenance(Guid roomId, [FromBody] ManagementMaintenanceRequest request)
    {
        var room = await _context.Rooms.Include(item => item.RoomType).FirstOrDefaultAsync(item => item.Id == roomId && !item.IsDeleted);
        if (room == null) return NotFound(new { message = "Không tìm thấy phòng." });
        if (room.Status == RoomStatus.Occupied)
            return Conflict(new { message = "Không thể bảo trì phòng đang có khách." });
        if (room.Status == RoomStatus.OutOfService)
            return Conflict(new { message = "Phòng đã ở trạng thái bảo trì." });
        if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length is < 3 or > 500)
            return BadRequest(new { message = "Vui lòng nhập lý do bảo trì từ 3 đến 500 ký tự." });

        room.Status = RoomStatus.OutOfService;
        room.MaintenanceReason = request.Reason.Trim();
        room.MaintenanceStartedAtUtc = DateTime.UtcNow;
        room.MaintenanceCompletedAtUtc = null;
        room.MaintenanceCompletedByUserId = null;
        room.MaintenanceStartedByUserId = Guid.TryParse(User?.FindFirstValue(ClaimTypes.NameIdentifier), out var actorId) ? actorId : null;
        await _context.SaveChangesAsync();
        return Ok(ToRoom(room));
    }

    [HttpPost("rooms/{roomId:guid}/maintenance/complete")]
    [Authorize(Policy = "room.execute")]
    public async Task<ActionResult<ManagementRoomDto>> CompleteMaintenance(Guid roomId)
    {
        var room = await _context.Rooms.Include(item => item.RoomType).FirstOrDefaultAsync(item => item.Id == roomId && !item.IsDeleted);
        if (room == null) return NotFound(new { message = "Không tìm thấy phòng." });
        if (room.Status != RoomStatus.OutOfService)
            return Conflict(new { message = "Phòng không ở trạng thái bảo trì." });

        room.Status = RoomStatus.Clean;
        room.MaintenanceCompletedAtUtc = DateTime.UtcNow;
        room.MaintenanceCompletedByUserId = Guid.TryParse(User?.FindFirstValue(ClaimTypes.NameIdentifier), out var actorId) ? actorId : null;
        await _context.SaveChangesAsync();
        return Ok(ToRoom(room));
    }

    private async Task<ObjectResult?> ValidateRoomInput(Guid hotelId, Guid roomTypeId, string roomNumber, int floor)
    {
        if (string.IsNullOrWhiteSpace(roomNumber) || floor is < 0 or > 200)
            return BadRequest(new { message = "Số phòng hoặc tầng không hợp lệ." });
        if (!await _context.RoomTypes.AnyAsync(type => type.Id == roomTypeId && type.IsActive && !type.IsDeleted))
            return BadRequest(new { message = "Loại phòng không hợp lệ hoặc đã ngừng hoạt động." });
        if (await _context.Rooms.AnyAsync(room => room.RoomNumber == roomNumber.Trim() && !room.IsDeleted))
            return Conflict(new { message = "Số phòng đã tồn tại trong cơ sở." });
        if (await _context.Rooms.CountAsync(room => room.IsActive && !room.IsDeleted) >= RoomLimit(_tenantService.Tier))
            return Conflict(new { message = "Cơ sở đã đạt giới hạn số phòng của gói hiện tại." });
        return null;
    }

    private static ManagedPropertyDto ToProperty(Tenant tenant) => new(
        tenant.Id, tenant.Code, tenant.Name, tenant.Name, tenant.Name, tenant.PropertyType, tenant.Address,
        tenant.Status.ToString().ToUpperInvariant(), tenant.Status == TenantStatus.Active ? "OPERATIONAL" : "INACTIVE",
        tenant.Status == TenantStatus.Active, tenant.LogoUrl, false);

    private static Dictionary<string, int> Limits(SubscriptionTier tier) => tier switch
    {
        SubscriptionTier.Basic => new() { ["properties"] = 1, ["rooms"] = 30, ["staff"] = 5, ["MAX_ROOM_TYPES"] = 5 },
        SubscriptionTier.Pro => new() { ["properties"] = 1, ["rooms"] = 150, ["staff"] = 30, ["MAX_ROOM_TYPES"] = 20 },
        _ => new() { ["properties"] = 10, ["rooms"] = 1000, ["staff"] = 200, ["MAX_ROOM_TYPES"] = 100 }
    };

    private bool HasPropertyScope(Guid propertyId) => _tenantService.TenantId == propertyId;
    private static int RoomLimit(SubscriptionTier? tier) => tier switch
    {
        SubscriptionTier.Basic => 30, SubscriptionTier.Pro => 150, _ => 1000
    };
    private static int RoomTypeLimit(SubscriptionTier? tier) => tier switch
    {
        SubscriptionTier.Basic => 5, SubscriptionTier.Pro => 20, _ => 100
    };
    private static ManagementRoomTypeDto ToRoomType(RoomType type) => new(
        type.Id, type.TenantId, type.Code, type.Name, type.NameEn, type.BedType,
        type.CapacityAdults, type.CapacityChildren, type.CapacityAdults + type.CapacityChildren,
        type.BasePricePerNight, type.IsActive ? "ACTIVE" : "INACTIVE", type.IncludesBreakfast, type.IsRefundable,
        type.FreeCancellationHours, type.SmokingAllowed, type.Amenities.Where(item => !item.IsDeleted).Select(item => item.Code).OrderBy(item => item).ToList());
    private static readonly HashSet<string> AllowedRoomAmenities = new(StringComparer.OrdinalIgnoreCase)
        { "AIR_CONDITIONING", "PRIVATE_BATHROOM", "BATHTUB", "BALCONY", "CITY_VIEW", "SEA_VIEW", "MINIBAR", "TV", "SAFE", "WORK_DESK", "SOUNDPROOF", "KITCHEN" };
    private static HashSet<string> NormalizeRoomAmenities(IReadOnlyList<string>? values) => (values ?? [])
        .Select(value => value.Trim().ToUpperInvariant()).Where(AllowedRoomAmenities.Contains).ToHashSet(StringComparer.OrdinalIgnoreCase);
    private static ManagementRoomDto ToRoom(Room room) => new(
        room.Id, room.TenantId, room.RoomTypeId, room.RoomType?.Code, room.RoomType?.Name ?? string.Empty,
        room.RoomNumber, room.Floor, RoomStatusName(room.Status),
        room.Status == RoomStatus.Clean ? "CLEAN" : room.Status == RoomStatus.Cleaning ? "CLEANING" : "DIRTY",
        room.Status == RoomStatus.OutOfService ? "MAINTENANCE" : "NONE", room.Notes,
        room.MaintenanceReason, room.MaintenanceStartedAtUtc, room.MaintenanceCompletedAtUtc,
        room.MaintenanceStartedByUserId, room.MaintenanceCompletedByUserId);
    private static string RoomStatusName(RoomStatus status) => status switch
    {
        RoomStatus.Clean => "AVAILABLE", RoomStatus.Dirty => "DIRTY", RoomStatus.Cleaning => "CLEANING",
        RoomStatus.Occupied => "OCCUPIED", RoomStatus.OutOfService => "OUT_OF_SERVICE", _ => "AVAILABLE"
    };
}

public record ManagedPropertyDto(Guid Id, string Code, string NameVi, string Name, string NameEn,
    string PropertyType, string Address, string ApprovalStatus, string OperationStatus,
    bool Operational, string? MainImage, bool IsDemo);
public record ManagementUsageDto(int Properties, int RoomTypes, int Rooms, int Staff, int Images);
public record ManagementContextDto(List<ManagedPropertyDto> Properties, Guid ActivePropertyId,
    bool ActivePropertyOperational, string PlanCode, string SubscriptionStatus, string SubscriptionSource,
    DateTime? EndAt, bool Lifetime, Dictionary<string, int> Limits, ManagementUsageDto Usage,
    bool UpgradeRequired, Dictionary<string, decimal> Dashboard);
public record CreateManagementRoomTypeRequest(Guid HotelId, string Code, string NameVi, string? NameEn,
    string? BedType, int MaxAdults, int MaxChildren, int MaxGuests, decimal BasePrice, string? Status,
    bool IncludesBreakfast = false, bool IsRefundable = true, int FreeCancellationHours = 24,
    bool SmokingAllowed = false, IReadOnlyList<string>? AmenityCodes = null, string? DescriptionVi = null,
    string? DescriptionEn = null, int BedCount = 1, double Area = 0);
public record CreateManagementRoomRequest(Guid HotelId, Guid RoomTypeId, string RoomNumber, int Floor, string? Status);
public record CreateManagementRoomsBulkRequest(Guid HotelId, Guid RoomTypeId, int Floor, int FromNumber, int ToNumber, string? Status);
public record ManagementMaintenanceRequest(string? Reason);
public record ManagementRoomTypeDto(Guid Id, Guid HotelId, string Code, string NameVi, string? NameEn,
    string? BedType, int MaxAdults, int MaxChildren, int MaxGuests, decimal BasePrice, string Status,
    bool IncludesBreakfast, bool IsRefundable, int FreeCancellationHours, bool SmokingAllowed, List<string> AmenityCodes);
public record ManagementRoomDto(Guid Id, Guid HotelId, Guid RoomTypeId, string? RoomTypeCode,
    string RoomTypeNameVi, string RoomNumber, int Floor, string Status, string HousekeepingStatus,
    string MaintenanceStatus, string? Note, string? MaintenanceReason = null,
    DateTime? MaintenanceStartedAt = null, DateTime? MaintenanceCompletedAt = null,
    Guid? MaintenanceStartedByUserId = null, Guid? MaintenanceCompletedByUserId = null);
