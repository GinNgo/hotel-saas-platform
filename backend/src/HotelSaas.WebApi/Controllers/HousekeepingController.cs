using System.Globalization;
using System.Security.Claims;
using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class HousekeepingController : ControllerBase
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentTenantService _tenantService;

    public HousekeepingController(IApplicationDbContext context, ICurrentTenantService tenantService)
    {
        _context = context;
        _tenantService = tenantService;
    }

    [HttpGet("tasks")]
    [Authorize(Policy = "housekeeping.read")]
    public async Task<ActionResult<List<HousekeepingTaskDto>>> ListTasks([FromQuery] Guid? propertyId, [FromQuery] string? status)
    {
        if (!HasPropertyScope(propertyId)) return Forbid();
        if (!TryParseStatus(status, out var parsedStatus))
            return BadRequest(new { message = "Trạng thái housekeeping không hợp lệ." });

        var query = _context.HousekeepingTasks
            .Include(task => task.Room)
            .Include(task => task.Reservation)
            .Include(task => task.AssignedToStaff!).ThenInclude(staff => staff!.User)
            .Where(task => !task.IsDeleted);
        if (parsedStatus.HasValue) query = query.Where(task => task.Status == parsedStatus.Value);

        var tasks = await query
            .OrderBy(task => task.Status == HousekeepingTaskStatus.InProgress ? 0
                : task.Status == HousekeepingTaskStatus.Claimed ? 1
                : task.Status == HousekeepingTaskStatus.Pending ? 2
                : 3)
            .ThenByDescending(task => task.Priority)
            .ThenBy(task => task.CreatedAtUtc).ToListAsync();
        return Ok(tasks.Select(ToDto).ToList());
    }

    [HttpGet("assignees")]
    [Authorize(Policy = "housekeeping.read")]
    public async Task<ActionResult<List<HousekeepingAssigneeDto>>> ListAssignees([FromQuery] Guid? propertyId)
    {
        if (!HasPropertyScope(propertyId)) return Forbid();
        var staff = await _context.TenantStaffs.Include(item => item.User)
            .Where(item => item.IsActive && item.Role == StaffRole.Housekeeper && item.User != null && item.User.IsActive)
            .OrderBy(item => item.User!.FullName).ToListAsync();
        return Ok(staff.Select(item => new HousekeepingAssigneeDto(
            item.UserId, item.User!.Username, item.User.FullName)).ToList());
    }

    [HttpPost("tasks")]
    [Authorize(Policy = "housekeeping.create")]
    public async Task<ActionResult<HousekeepingTaskDto>> CreateTask([FromBody] CreateHousekeepingTaskRequest request)
    {
        var taskType = request.TaskType?.Trim().ToUpperInvariant() switch
        {
            "INSPECTION" => "Inspection",
            "TOUCH_UP" => "TouchUp",
            "DEEP_CLEANING" => "DeepCleaning",
            _ => null
        };
        if (taskType == null)
            return BadRequest(new { message = "Loại tác vụ housekeeping không hợp lệ." });
        if (!Enum.TryParse<HousekeepingPriority>(request.Priority, true, out var priority))
            return BadRequest(new { message = "Mức ưu tiên housekeeping không hợp lệ." });
        var notes = request.Notes?.Trim();
        if (notes is not { Length: >= 3 and <= 500 })
            return BadRequest(new { message = "Ghi chú tác vụ phải có từ 3 đến 500 ký tự." });

        var room = await _context.Rooms.FirstOrDefaultAsync(item => item.Id == request.RoomId && item.IsActive && !item.IsDeleted);
        if (room == null) return NotFound(new { message = "Không tìm thấy phòng trong cơ sở hiện tại." });
        if (room.Status == RoomStatus.Occupied)
            return Conflict(new { code = "ROOM_OCCUPIED", message = "Không thể tạo tác vụ housekeeping thủ công cho phòng đang có khách." });
        if (room.Status == RoomStatus.OutOfService)
            return Conflict(new { code = "ROOM_OUT_OF_SERVICE", message = "Không thể tạo tác vụ housekeeping thủ công khi phòng đang bảo trì." });
        var duplicate = await _context.HousekeepingTasks.AnyAsync(task => task.RoomId == room.Id &&
            task.TaskType == taskType && task.Status != HousekeepingTaskStatus.Completed && !task.IsDeleted);
        if (duplicate)
            return Conflict(new { code = "HOUSEKEEPING_TASK_EXISTS", message = "Phòng đã có tác vụ cùng loại đang mở." });

        var task = new HousekeepingTask
        {
            TenantId = room.TenantId, RoomId = room.Id, Room = room, TaskType = taskType,
            Priority = priority, Notes = notes, Status = HousekeepingTaskStatus.Pending
        };
        _context.HousekeepingTasks.Add(task);
        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateException exception) when (IsOpenTaskDuplicate(exception))
        {
            return Conflict(new { code = "HOUSEKEEPING_TASK_EXISTS", message = "Phòng đã có tác vụ cùng loại đang mở." });
        }
        return Ok(ToDto(task));
    }

    [HttpPost("tasks/{taskId:guid}/claim")]
    [Authorize(Policy = "housekeeping.execute")]
    public async Task<ActionResult<HousekeepingTaskDto>> Claim(Guid taskId, [FromBody] HousekeepingVersionRequest request)
    {
        var staff = await CurrentStaff();
        if (staff == null) return Forbid();
        var task = await FindTask(taskId);
        if (task == null) return NotFound(new { message = "Không tìm thấy tác vụ housekeeping." });
        var conflict = ValidateVersion(task, request.ExpectedVersion);
        if (conflict != null) return conflict;
        if (task.Status != HousekeepingTaskStatus.Pending)
            return Conflict(new { message = "Tác vụ đã được nhân viên khác xử lý." });

        task.AssignedToStaffId = staff.Id;
        task.AssignedToStaff = staff;
        task.AssignedAtUtc = DateTime.UtcNow;
        task.Status = HousekeepingTaskStatus.Claimed;
        await _context.SaveChangesAsync();
        return Ok(ToDto(task));
    }

    [HttpDelete("tasks/{taskId:guid}")]
    [Authorize(Policy = "housekeeping.delete")]
    public async Task<IActionResult> CancelTask(Guid taskId, [FromBody] CancelHousekeepingTaskRequest request)
    {
        var task = await FindTask(taskId);
        if (task == null) return NotFound(new { message = "Không tìm thấy tác vụ housekeeping." });
        var conflict = ValidateVersion(task, request.ExpectedVersion);
        if (conflict != null) return conflict;
        if (task.ReservationId.HasValue || task.TaskType == "CheckoutCleaning")
            return Conflict(new { code = "HOUSEKEEPING_SOURCE_TASK_LOCKED", message = "Tác vụ dọn sau checkout không thể hủy thủ công." });
        if (task.Status is HousekeepingTaskStatus.InProgress or HousekeepingTaskStatus.Completed)
            return Conflict(new { code = "HOUSEKEEPING_TASK_LOCKED", message = "Không thể hủy tác vụ đã bắt đầu hoặc hoàn tất." });
        var reason = request.Reason?.Trim();
        if (reason is not { Length: >= 3 and <= 500 })
            return BadRequest(new { code = "HOUSEKEEPING_CANCELLATION_REASON_INVALID", message = "Lý do hủy phải có từ 3 đến 500 ký tự." });
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Forbid();

        task.IsDeleted = true;
        task.CancelledAtUtc = DateTime.UtcNow;
        task.CancelledByUserId = userId;
        task.CancellationReason = reason;
        task.AssignedToStaffId = null;
        task.AssignedToStaff = null;
        await _context.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("tasks/{taskId:guid}/assign")]
    [Authorize(Policy = "housekeeping.update")]
    public async Task<ActionResult<HousekeepingTaskDto>> Assign(Guid taskId, [FromBody] AssignHousekeepingRequest request)
    {
        var task = await FindTask(taskId);
        if (task == null) return NotFound(new { message = "Không tìm thấy tác vụ housekeeping." });
        var conflict = ValidateVersion(task, request.ExpectedVersion);
        if (conflict != null) return conflict;
        if (task.Status is HousekeepingTaskStatus.InProgress or HousekeepingTaskStatus.Completed)
            return Conflict(new { message = "Không thể phân công lại tác vụ đã bắt đầu hoặc hoàn tất." });

        var assignee = await _context.TenantStaffs.Include(item => item.User)
            .FirstOrDefaultAsync(item => item.UserId == request.UserId && item.IsActive &&
                                         item.Role == StaffRole.Housekeeper && item.User != null && item.User.IsActive);
        if (assignee == null) return BadRequest(new { message = "Nhân viên buồng phòng không hợp lệ." });

        task.AssignedToStaffId = assignee.Id;
        task.AssignedToStaff = assignee;
        task.AssignedAtUtc = DateTime.UtcNow;
        task.Status = HousekeepingTaskStatus.Claimed;
        await _context.SaveChangesAsync();
        return Ok(ToDto(task));
    }

    [HttpPost("tasks/{taskId:guid}/start")]
    [Authorize(Policy = "housekeeping.execute")]
    public async Task<ActionResult<HousekeepingTaskDto>> Start(Guid taskId, [FromBody] HousekeepingVersionRequest request)
    {
        var staff = await CurrentStaff();
        if (staff == null) return Forbid();
        var task = await FindTask(taskId);
        if (task == null) return NotFound(new { message = "Không tìm thấy tác vụ housekeeping." });
        var conflict = ValidateVersion(task, request.ExpectedVersion);
        if (conflict != null) return conflict;
        if (task.Status != HousekeepingTaskStatus.Claimed || task.AssignedToStaffId != staff.Id)
            return Conflict(new { message = "Chỉ nhân viên được phân công mới có thể bắt đầu tác vụ." });
        if (task.Room?.Status == RoomStatus.Occupied)
            return Conflict(new { code = "ROOM_OCCUPIED", message = "Phòng đang có khách nên chưa thể bắt đầu dọn." });
        if (task.Room?.Status == RoomStatus.OutOfService)
            return Conflict(new { code = "ROOM_OUT_OF_SERVICE", message = "Phòng đang bảo trì nên chưa thể bắt đầu dọn." });

        task.Status = HousekeepingTaskStatus.InProgress;
        task.StartedAtUtc ??= DateTime.UtcNow;
        if (task.Room != null) task.Room.Status = RoomStatus.Cleaning;
        await _context.SaveChangesAsync();
        return Ok(ToDto(task));
    }

    [HttpPost("tasks/{taskId:guid}/complete")]
    [Authorize(Policy = "housekeeping.execute")]
    public async Task<ActionResult<HousekeepingTaskDto>> Complete(Guid taskId, [FromBody] HousekeepingVersionRequest request)
    {
        var staff = await CurrentStaff();
        if (staff == null) return Forbid();
        var task = await FindTask(taskId);
        if (task == null) return NotFound(new { message = "Không tìm thấy tác vụ housekeeping." });
        var conflict = ValidateVersion(task, request.ExpectedVersion);
        if (conflict != null) return conflict;
        if (task.Status != HousekeepingTaskStatus.InProgress || task.AssignedToStaffId != staff.Id)
            return Conflict(new { message = "Chỉ nhân viên đang thực hiện mới có thể hoàn tất tác vụ." });

        task.Status = HousekeepingTaskStatus.Completed;
        task.CompletedAtUtc = DateTime.UtcNow;
        if (task.Room is { Status: RoomStatus.Cleaning or RoomStatus.Dirty }) task.Room.Status = RoomStatus.Clean;
        await _context.SaveChangesAsync();
        return Ok(ToDto(task));
    }

    private async Task<HousekeepingTask?> FindTask(Guid taskId) => await _context.HousekeepingTasks
        .Include(task => task.Room)
        .Include(task => task.Reservation)
        .Include(task => task.AssignedToStaff!).ThenInclude(staff => staff!.User)
        .FirstOrDefaultAsync(task => task.Id == taskId && !task.IsDeleted);

    private async Task<TenantStaff?> CurrentStaff()
    {
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return null;
        return await _context.TenantStaffs.Include(staff => staff.User)
            .FirstOrDefaultAsync(staff => staff.UserId == userId && staff.IsActive && staff.User != null && staff.User.IsActive);
    }

    private bool HasPropertyScope(Guid? propertyId) =>
        _tenantService.TenantId.HasValue && (!propertyId.HasValue || propertyId == _tenantService.TenantId);

    private static ConflictObjectResult? ValidateVersion(HousekeepingTask task, string? expectedVersion)
    {
        if (string.IsNullOrWhiteSpace(expectedVersion)) return null;
        return string.Equals(expectedVersion, Version(task), StringComparison.Ordinal)
            ? null
            : new ConflictObjectResult(new { message = "Tác vụ đã được cập nhật. Vui lòng tải lại danh sách." });
    }

    private static bool TryParseStatus(string? value, out HousekeepingTaskStatus? status)
    {
        status = value?.Trim().ToUpperInvariant() switch
        {
            null or "" => null,
            "PENDING" => HousekeepingTaskStatus.Pending,
            "CLAIMED" => HousekeepingTaskStatus.Claimed,
            "IN_PROGRESS" => HousekeepingTaskStatus.InProgress,
            "COMPLETED" => HousekeepingTaskStatus.Completed,
            _ => (HousekeepingTaskStatus?)null
        };
        return string.IsNullOrWhiteSpace(value) || status.HasValue;
    }

    private static bool IsOpenTaskDuplicate(Exception exception)
    {
        for (var current = exception; current != null; current = current.InnerException)
            if (current.Message.Contains("IX_HousekeepingTasks_RoomId_TaskType", StringComparison.OrdinalIgnoreCase))
                return true;
        return false;
    }

    private static HousekeepingTaskDto ToDto(HousekeepingTask task)
    {
        var assignedUser = task.AssignedToStaff?.User;
        var released = task.Status == HousekeepingTaskStatus.Completed && task.Room?.Status == RoomStatus.Clean;
        return new HousekeepingTaskDto(
            task.Id, task.TenantId, task.RoomId, task.Room?.RoomNumber ?? string.Empty,
            task.ReservationId, task.Reservation?.BookingCode,
            task.TaskType ?? "Housekeeping", task.Priority.ToString().ToUpperInvariant(),
            StatusName(task.Status), task.AssignedToStaff?.UserId, assignedUser?.Username, assignedUser?.FullName,
            task.AssignedAtUtc, task.StartedAtUtc,
            task.CompletedAtUtc, task.Notes, Version(task),
            task.AssignedToStaff is { IsActive: false } || assignedUser is { IsActive: false },
            task.Room?.Status.ToString().ToUpperInvariant() ?? "UNKNOWN",
            task.Room?.Status == RoomStatus.Clean ? "CLEAN" : task.Room?.Status == RoomStatus.Cleaning ? "CLEANING" : "DIRTY",
            task.Room?.Status == RoomStatus.OutOfService ? "MAINTENANCE" : "NONE", released);
    }

    private static string Version(HousekeepingTask task) =>
        (task.UpdatedAtUtc ?? task.CreatedAtUtc).ToUniversalTime().ToString("O", CultureInfo.InvariantCulture);

    private static string StatusName(HousekeepingTaskStatus status) => status switch
    {
        HousekeepingTaskStatus.Pending => "PENDING",
        HousekeepingTaskStatus.Claimed => "CLAIMED",
        HousekeepingTaskStatus.InProgress => "IN_PROGRESS",
        HousekeepingTaskStatus.Completed => "COMPLETED",
        _ => "PENDING"
    };
}

public record HousekeepingVersionRequest(string? ExpectedVersion);
public record AssignHousekeepingRequest(Guid UserId, string? ExpectedVersion);
public record CreateHousekeepingTaskRequest(Guid RoomId, string TaskType, string Priority, string Notes);
public record CancelHousekeepingTaskRequest(string Reason, string? ExpectedVersion);
public record HousekeepingAssigneeDto(Guid UserId, string Username, string? FullName);
public record HousekeepingTaskDto(Guid Id, Guid HotelId, Guid RoomId, string RoomNumber, Guid? ReservationId, string? BookingCode,
    string TaskType, string Priority,
    string Status, Guid? AssignedToUserId, string? AssignedToUsername, string? AssignedToName,
    DateTime? AssignedAt, DateTime? StartedAt, DateTime? CompletedAt, string? Note, string Version,
    bool StaleAssignment, string RoomStatus, string RoomHousekeepingStatus, string RoomMaintenanceStatus,
    bool RoomReleased);
