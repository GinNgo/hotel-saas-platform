using System.Security.Claims;
using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/management/tasks")]
[Authorize]
public class OperationalTasksController : ControllerBase
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentTenantService _tenantService;

    public OperationalTasksController(IApplicationDbContext context, ICurrentTenantService tenantService)
    {
        _context = context;
        _tenantService = tenantService;
    }

    [HttpGet]
    [Authorize(Policy = "operational_task.read")]
    public async Task<ActionResult<object>> List([FromQuery] Guid hotelId, [FromQuery] string? status = null, [FromQuery] string? taskType = null, [FromQuery] string? toolName = null, [FromQuery] DateTime? from = null, [FromQuery] DateTime? to = null, [FromQuery] string? sort = null, [FromQuery] int? page = null, [FromQuery] int? pageSize = null)
    {
        if (_tenantService.TenantId != hotelId) return NotFound(new { message = "Không tìm thấy cơ sở." });
        await Materialize(hotelId);
        var query = _context.OperationalTasks.Where(item => !item.IsDeleted);
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(item => item.Status == status.Trim().ToUpperInvariant());
        if (!string.IsNullOrWhiteSpace(taskType)) query = query.Where(item => item.TaskType == taskType.Trim());
        if (!string.IsNullOrWhiteSpace(toolName)) query = query.Where(item => item.ToolName == toolName.Trim());
        if (from.HasValue) query = query.Where(item => item.CreatedAtUtc >= from.Value.ToUniversalTime());
        if (to.HasValue) query = query.Where(item => item.CreatedAtUtc < to.Value.ToUniversalTime().AddDays(1));
        var normalizedSort = sort?.Trim().ToLowerInvariant();
        var tasks = normalizedSort switch
        {
            "createdasc" => await query.OrderBy(item => item.CreatedAtUtc).ToListAsync(),
            "status" => await query.OrderBy(item => item.Status).ThenByDescending(item => item.CreatedAtUtc).ToListAsync(),
            "tool" => await query.OrderBy(item => item.ToolName).ThenByDescending(item => item.CreatedAtUtc).ToListAsync(),
            _ => await query.OrderBy(item => item.Status == "COMPLETED").ThenByDescending(item => item.CreatedAtUtc).ToListAsync(),
        };
        var totalItems = tasks.Count;
        var requestedPage = Math.Max(1, page ?? 1);
        var requestedPageSize = Math.Clamp(pageSize ?? (totalItems == 0 ? 1 : totalItems), 1, 100);
        if (page.HasValue || pageSize.HasValue)
            tasks = tasks.Skip((requestedPage - 1) * requestedPageSize).Take(requestedPageSize).ToList();
        var result = new List<OperationalTaskDto>(tasks.Count);
        foreach (var task in tasks) result.Add(await ToDto(task));
        if (page.HasValue || pageSize.HasValue)
            return Ok(new { items = result, page = requestedPage, pageSize = requestedPageSize, totalItems, totalPages = (int)Math.Ceiling(totalItems / (double)requestedPageSize) });
        return Ok(result);
    }

    [HttpGet("assignees")]
    [Authorize(Policy = "operational_task.update")]
    public async Task<ActionResult<List<OperationalTaskAssigneeDto>>> ListAssignees([FromQuery] Guid hotelId)
    {
        if (_tenantService.TenantId != hotelId) return NotFound(new { message = "Không tìm thấy cơ sở." });
        var staff = await _context.TenantStaffs.Include(item => item.User)
            .Where(item => item.IsActive && !item.IsDeleted && item.User != null && item.User.IsActive)
            .OrderBy(item => item.User!.FullName).ThenBy(item => item.User!.Username)
            .Select(item => new OperationalTaskAssigneeDto(item.UserId, item.User!.Username, item.User.FullName, item.Role.ToString()))
            .ToListAsync();
        return Ok(staff);
    }

    [HttpGet("{taskId:guid}/ai-context")]
    [Authorize(Policy = "operational_task.read")]
    public async Task<ActionResult<AiTaskContextDto>> AiContext(Guid taskId)
    {
        var task = await Find(taskId);
        if (task is null || task.TaskType != "AI_TOOL") return NotFound(new { message = "Không tìm thấy AI task." });
        if (_tenantService.TenantId != task.TenantId) return NotFound(new { message = "Không tìm thấy tác vụ." });
        var route = task.ToolName switch { "reservation.checkin" => "/management/front-desk", "pricing.update" => "/management/room-rates", "refund.request" => "/management/refunds", "rbac.update" => "/admin/role-permissions", _ => "/management/tasks" };
        return Ok(new AiTaskContextDto(task.Id, task.PublicId, task.ToolName, task.FunctionCode, task.RequiredAction, task.AggregateType, task.AggregateId, task.ResultReference, route, task.Status, task.Version));
    }

    [HttpPost("{taskId:guid}/claim")]
    [Authorize(Policy = "operational_task.execute")]
    public async Task<ActionResult<OperationalTaskDto>> Claim(Guid taskId, [FromQuery] int expectedVersion)
    {
        var task = await Find(taskId);
        if (task == null) return NotFound(new { message = "Không tìm thấy tác vụ." });
        var conflict = VersionConflict(task, expectedVersion); if (conflict != null) return conflict;
        var userId = UserId(); if (!userId.HasValue) return Forbid();
        if (task.Status != "OPEN") return Conflict(new { message = "Tác vụ đã được nhận hoặc đã kết thúc." });
        task.AssignedToUserId = userId; task.Status = "ASSIGNED"; task.Version++;
        await _context.SaveChangesAsync();
        return Ok(await ToDto(task));
    }

    [HttpPost("{taskId:guid}/reassign")]
    [Authorize(Policy = "operational_task.update")]
    public async Task<ActionResult<OperationalTaskDto>> Reassign(Guid taskId, [FromBody] ReassignOperationalTaskRequest request)
    {
        var task = await Find(taskId);
        if (task == null) return NotFound(new { message = "Không tìm thấy tác vụ." });
        var conflict = VersionConflict(task, request.ExpectedVersion); if (conflict != null) return conflict;
        if (task.Status is "COMPLETED" or "CANCELLED") return Conflict(new { message = "Tác vụ đã kết thúc." });
        if (request.Reason?.Trim().Length is not (>= 5 and <= 500)) return BadRequest(new { message = "Lý do phân công lại phải có từ 5 đến 500 ký tự." });
        var exists = await _context.TenantStaffs.AnyAsync(item => item.UserId == request.AssigneeUserId && item.IsActive && !item.IsDeleted);
        if (!exists) return BadRequest(new { message = "Người nhận không thuộc nhân sự đang hoạt động của cơ sở." });
        task.AssignedToUserId = request.AssigneeUserId; task.Status = "ASSIGNED"; task.Version++;
        await _context.SaveChangesAsync();
        return Ok(await ToDto(task));
    }

    [HttpPost("{taskId:guid}/execute")]
    [Authorize(Policy = "operational_task.execute")]
    public async Task<ActionResult<OperationalTaskDto>> Execute(Guid taskId, [FromBody] ExecuteOperationalTaskRequest request)
    {
        var task = await Find(taskId);
        if (task == null) return NotFound(new { message = "Không tìm thấy tác vụ." });
        var conflict = VersionConflict(task, request.ExpectedVersion); if (conflict != null) return conflict;
        var userId = UserId();
        if (task.AssignedToUserId != userId && !HasPermission("OPERATIONAL_TASK", 4))
            return Conflict(new { message = "Chỉ người được phân công hoặc quản lý mới có thể hoàn tất tác vụ." });
        if (task.Status == "COMPLETED") return Ok(await ToDto(task));
        if (request.Command?.Trim().ToUpperInvariant() != "COMPLETE") return BadRequest(new { message = "Command tác vụ không hợp lệ." });

        var result = await ExecuteSource(task, userId);
        if (result != null) return result;
        var previousStatus = task.Status;
        task.Status = "COMPLETED"; task.CompletedAtUtc = DateTime.UtcNow; task.Version++;
        _context.OperationalAuditEvents.Add(new OperationalAuditEvent
        {
            TenantId = task.TenantId, Scope = "TENANT", Domain = "OPERATIONAL_TASK",
            EventType = "TASK_COMPLETED", AggregateType = "OperationalTask", AggregateId = task.Id.ToString(),
            ActorType = "USER", ActorId = userId, Reason = request.Reason?.Trim() ?? "Hoàn tất tác vụ",
            BeforeState = "{\"status\":\"" + previousStatus + "\"}", AfterState = "{\"status\":\"COMPLETED\"}",
            CorrelationId = task.PublicId, StatusCode = 200
        });
        await _context.SaveChangesAsync();
        return Ok(await ToDto(task));
    }

    [HttpPost("{taskId:guid}/cancel")]
    [Authorize(Policy = "operational_task.execute")]
    public async Task<ActionResult<OperationalTaskDto>> Cancel(Guid taskId, [FromBody] CancelOperationalTaskRequest request)
    {
        var task = await Find(taskId);
        if (task == null) return NotFound(new { message = "Không tìm thấy tác vụ." });
        var conflict = VersionConflict(task, request.ExpectedVersion); if (conflict != null) return conflict;
        if (task.Status is "COMPLETED" or "CANCELLED") return Ok(await ToDto(task));
        if (request.Reason?.Trim().Length is not (>= 5 and <= 500))
            return BadRequest(new { message = "Lý do hủy phải có từ 5 đến 500 ký tự." });
        var userId = UserId();
        var previousStatus = task.Status;
        task.Status = "CANCELLED";
        task.CompletedAtUtc = DateTime.UtcNow;
        task.Version++;
        _context.OperationalAuditEvents.Add(new OperationalAuditEvent
        {
            TenantId = task.TenantId, Scope = "TENANT", Domain = "OPERATIONAL_TASK",
            EventType = "TASK_CANCELLED", AggregateType = "OperationalTask", AggregateId = task.Id.ToString(),
            ActorType = "USER", ActorId = userId, Reason = request.Reason.Trim(),
            BeforeState = "{\"status\":\"" + previousStatus + "\"}", AfterState = "{\"status\":\"CANCELLED\"}",
            CorrelationId = task.PublicId, StatusCode = 200
        });
        await _context.SaveChangesAsync();
        return Ok(await ToDto(task));
    }

    private async Task<ObjectResult?> ExecuteSource(OperationalTask task, Guid? userId)
    {
        if (task.AggregateType == "PROPERTY_REFUND")
        {
            var refund = await _context.PropertyRefunds.FirstOrDefaultAsync(item => item.Id == task.AggregateId && !item.IsDeleted);
            if (refund == null) return NotFound(new { message = "Yêu cầu hoàn tiền nguồn không còn tồn tại." });
            if (refund.Status is "PENDING_APPROVAL" or "REQUESTED")
            {
                refund.Status = "PENDING_PROVIDER"; refund.ApprovedAtUtc = DateTime.UtcNow; refund.ApprovedByUserId = userId;
                task.ResultReference = refund.PublicId;
            }
        }
        else if (task.AggregateType == "HOUSEKEEPING")
        {
            var housekeeping = await _context.HousekeepingTasks.Include(item => item.Room).FirstOrDefaultAsync(item => item.Id == task.AggregateId && !item.IsDeleted);
            if (housekeeping == null) return NotFound(new { message = "Tác vụ housekeeping nguồn không còn tồn tại." });
            housekeeping.Status = HousekeepingTaskStatus.Completed; housekeeping.CompletedAtUtc = DateTime.UtcNow;
            if (housekeeping.Room != null) housekeeping.Room.Status = RoomStatus.Clean;
            task.ResultReference = housekeeping.Id.ToString();
        }
        else if (task.AggregateType == "ROOM_MAINTENANCE")
        {
            var room = await _context.Rooms.FirstOrDefaultAsync(item => item.Id == task.AggregateId && !item.IsDeleted);
            if (room == null) return NotFound(new { message = "Phòng bảo trì nguồn không còn tồn tại." });
            if (room.Status == RoomStatus.OutOfService)
            {
                room.Status = RoomStatus.Clean; room.MaintenanceCompletedAtUtc = DateTime.UtcNow; room.MaintenanceCompletedByUserId = userId;
            }
            task.ResultReference = room.RoomNumber;
        }
        return null;
    }

    private async Task Materialize(Guid tenantId)
    {
        var existing = await _context.OperationalTasks.Select(item => new { item.AggregateType, item.AggregateId }).ToListAsync();
        var keys = existing.Select(item => $"{item.AggregateType}:{item.AggregateId}").ToHashSet();
        var additions = new List<OperationalTask>();
        var refunds = await _context.PropertyRefunds.Where(item => item.Status == "PENDING_APPROVAL" || item.Status == "REQUESTED").ToListAsync();
        additions.AddRange(refunds.Where(item => !keys.Contains($"PROPERTY_REFUND:{item.Id}")).Select(item => NewTask(tenantId, "REFUND_APPROVAL", "OPERATIONAL_TASK", "PROPERTY_REFUND", item.Id)));
        var housekeeping = await _context.HousekeepingTasks.Where(item => item.Status != HousekeepingTaskStatus.Completed && !item.IsDeleted).ToListAsync();
        additions.AddRange(housekeeping.Where(item => !keys.Contains($"HOUSEKEEPING:{item.Id}")).Select(item => NewTask(tenantId, "HOUSEKEEPING", "OPERATIONAL_TASK", "HOUSEKEEPING", item.Id)));
        var rooms = await _context.Rooms.Where(item => item.Status == RoomStatus.OutOfService && !item.IsDeleted).ToListAsync();
        additions.AddRange(rooms.Where(item => !keys.Contains($"ROOM_MAINTENANCE:{item.Id}")).Select(item => NewTask(tenantId, "MAINTENANCE", "OPERATIONAL_TASK", "ROOM_MAINTENANCE", item.Id)));
        if (additions.Count == 0) return;
        _context.OperationalTasks.AddRange(additions);
        await _context.SaveChangesAsync();
    }

    private static OperationalTask NewTask(Guid tenantId, string type, string function, string aggregate, Guid id) => new()
    {
        TenantId = tenantId, PublicId = $"TASK-{Guid.NewGuid():N}".ToUpperInvariant(), TaskType = type,
        FunctionCode = function, AggregateType = aggregate, AggregateId = id, Status = "OPEN", Version = 1
    };
    private async Task<OperationalTask?> Find(Guid id) => await _context.OperationalTasks.FirstOrDefaultAsync(item => item.Id == id && !item.IsDeleted);
    private Guid? UserId() => Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;
    private bool HasPermission(string function, int action) => User.FindAll("permission").Any(claim =>
    {
        var parts = claim.Value.Split(':', 2, StringSplitOptions.TrimEntries);
        return parts.Length == 2 && parts[0].Equals(function, StringComparison.OrdinalIgnoreCase) &&
            int.TryParse(parts[1], out var mask) && (mask & action) == action;
    });
    private static ConflictObjectResult? VersionConflict(OperationalTask task, int expected) => task.Version == expected ? null : new(new { code = "VERSION_CONFLICT", message = "Tác vụ đã thay đổi. Hãy tải lại.", currentVersion = task.Version });
    private async Task<OperationalTaskDto> ToDto(OperationalTask task)
    {
        string? assignedToName = null;
        string? assignedToRole = null;
        if (task.AssignedToUserId.HasValue)
        {
            var staff = await _context.TenantStaffs.Include(item => item.User)
                .FirstOrDefaultAsync(item => item.UserId == task.AssignedToUserId && item.IsActive && !item.IsDeleted);
            assignedToName = staff?.User?.FullName ?? staff?.User?.Username;
            assignedToRole = staff?.Role.ToString();
        }

        string? sourceReference = null;
        string? sourceDescription = null;
        if (task.AggregateType == "PROPERTY_REFUND")
        {
            var refund = await _context.PropertyRefunds.AsNoTracking()
                .FirstOrDefaultAsync(item => item.Id == task.AggregateId && !item.IsDeleted);
            sourceReference = refund?.PublicId;
            sourceDescription = refund == null ? null : $"{refund.RequestedAmount:0.##} VND · {refund.Reason}";
        }
        else if (task.AggregateType == "HOUSEKEEPING")
        {
            var housekeeping = await _context.HousekeepingTasks.AsNoTracking().Include(item => item.Room)
                .FirstOrDefaultAsync(item => item.Id == task.AggregateId && !item.IsDeleted);
            sourceReference = housekeeping?.Room?.RoomNumber;
            sourceDescription = housekeeping?.Notes;
        }
        else if (task.AggregateType == "ROOM_MAINTENANCE")
        {
            var room = await _context.Rooms.AsNoTracking()
                .FirstOrDefaultAsync(item => item.Id == task.AggregateId && !item.IsDeleted);
            sourceReference = room?.RoomNumber;
            sourceDescription = room?.MaintenanceReason;
        }

        return new OperationalTaskDto(task.Id, task.PublicId, task.TenantId, task.TaskType, task.ToolName, task.FunctionCode,
            task.RequiredAction, task.AggregateType, task.AggregateId.ToString(), task.Status, task.AssignedToUserId,
            assignedToName, assignedToRole, sourceReference, sourceDescription, task.ResultReference, task.Version);
    }
}

public record ReassignOperationalTaskRequest(int ExpectedVersion, Guid AssigneeUserId, string? Reason);
public record ExecuteOperationalTaskRequest(int ExpectedVersion, string? Command, string? Reason, object? Payload);
public record CancelOperationalTaskRequest(int ExpectedVersion, string? Reason);
public record OperationalTaskAssigneeDto(Guid UserId, string Username, string? FullName, string Role);
public record OperationalTaskDto(Guid Id, string PublicId, Guid HotelId, string TaskType, string? ToolName, string FunctionCode,
    int RequiredAction, string AggregateType, string AggregateId, string Status, Guid? AssignedToUserId,
    string? AssignedToName, string? AssignedToRole, string? SourceReference, string? SourceDescription,
    string? ResultReference, int Version);
public record AiTaskContextDto(Guid Id, string PublicId, string? ToolName, string FunctionCode, int RequiredAction, string AggregateType, Guid AggregateId, string? SanitizedPayload, string AuthoritativeRoute, string Status, int Version);
