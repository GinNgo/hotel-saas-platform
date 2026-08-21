using System.Security.Claims;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using HotelSaas.Infrastructure.Persistence;
using HotelSaas.Infrastructure.Services;
using HotelSaas.WebApi.Controllers;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace HotelSaas.WebApi.Tests;

public class HousekeepingControllerTests
{
    [Fact]
    public async Task Housekeeper_can_claim_start_and_complete_own_task()
    {
        var setup = await Setup();
        await using var db = setup.Db;
        var controller = Controller(db, setup.TenantService, setup.Housekeeper.UserId, StaffRole.Housekeeper);

        var claimed = Dto(await controller.Claim(setup.Task.Id, new(null)));
        var started = Dto(await controller.Start(setup.Task.Id, new(claimed.Version)));
        var completed = Dto(await controller.Complete(setup.Task.Id, new(started.Version)));

        Assert.Equal("COMPLETED", completed.Status);
        Assert.True(completed.RoomReleased);
        Assert.Equal(RoomStatus.Clean, setup.Room.Status);
        Assert.NotNull(completed.AssignedAt);
        Assert.NotNull(completed.StartedAt);
        Assert.True(completed.StartedAt >= completed.AssignedAt);
        Assert.NotNull(setup.Task.CompletedAtUtc);
    }

    [Fact]
    public async Task Queue_exposes_the_source_booking_code_for_checkout_cleaning()
    {
        var setup = await Setup();
        await using var db = setup.Db;
        var controller = Controller(db, setup.TenantService, setup.Housekeeper.UserId, StaffRole.Housekeeper);

        var response = await controller.ListTasks(setup.Tenant.Id, null);

        var tasks = Assert.IsType<List<HousekeepingTaskDto>>(Assert.IsType<OkObjectResult>(response.Result).Value);
        var task = Assert.Single(tasks);
        Assert.Equal(setup.Reservation.Id, task.ReservationId);
        Assert.Equal(setup.Reservation.BookingCode, task.BookingCode);
        Assert.Equal("CheckoutCleaning", task.TaskType);
        Assert.Equal("HIGH", task.Priority);
    }

    [Fact]
    public async Task Queue_uses_operational_status_then_priority_order()
    {
        var setup = await Setup();
        await using var db = setup.Db;
        var controller = Controller(db, setup.TenantService, setup.Housekeeper.UserId, StaffRole.Housekeeper);
        setup.Task.Status = HousekeepingTaskStatus.Completed;

        var inProgress = TaskFor(setup, "102", HousekeepingTaskStatus.InProgress, HousekeepingPriority.Low);
        var claimed = TaskFor(setup, "103", HousekeepingTaskStatus.Claimed, HousekeepingPriority.Normal);
        var pendingNormal = TaskFor(setup, "104", HousekeepingTaskStatus.Pending, HousekeepingPriority.Normal);
        var pendingUrgent = TaskFor(setup, "105", HousekeepingTaskStatus.Pending, HousekeepingPriority.Urgent);
        db.AddRange(inProgress, claimed, pendingNormal, pendingUrgent);
        await db.SaveChangesAsync();

        var response = await controller.ListTasks(setup.Tenant.Id, null);

        var tasks = Assert.IsType<List<HousekeepingTaskDto>>(Assert.IsType<OkObjectResult>(response.Result).Value);
        Assert.Equal(
            [inProgress.Id, claimed.Id, pendingUrgent.Id, pendingNormal.Id, setup.Task.Id],
            tasks.Select(task => task.Id).ToArray());
    }

    [Fact]
    public async Task Stale_version_is_rejected_without_overwriting_task()
    {
        var setup = await Setup();
        await using var db = setup.Db;
        var controller = Controller(db, setup.TenantService, setup.Housekeeper.UserId, StaffRole.Housekeeper);

        var response = await controller.Claim(setup.Task.Id, new("stale-version"));

        Assert.IsType<ConflictObjectResult>(response.Result);
        Assert.Equal(HousekeepingTaskStatus.Pending, setup.Task.Status);
        Assert.Null(setup.Task.AssignedToStaffId);
    }

    [Fact]
    public async Task Different_housekeeper_cannot_start_assigned_task()
    {
        var setup = await Setup();
        await using var db = setup.Db;
        var otherUser = User("other-housekeeper");
        var otherStaff = new TenantStaff
        {
            TenantId = setup.Tenant.Id, User = otherUser, UserId = otherUser.Id,
            Role = StaffRole.Housekeeper, IsActive = true
        };
        db.AddRange(otherUser, otherStaff);
        setup.Task.AssignedToStaff = setup.Housekeeper;
        setup.Task.AssignedToStaffId = setup.Housekeeper.Id;
        setup.Task.Status = HousekeepingTaskStatus.Claimed;
        await db.SaveChangesAsync();
        var controller = Controller(db, setup.TenantService, otherUser.Id, StaffRole.Housekeeper);

        var response = await controller.Start(setup.Task.Id, new(null));

        Assert.IsType<ConflictObjectResult>(response.Result);
        Assert.Equal(HousekeepingTaskStatus.Claimed, setup.Task.Status);
        Assert.Equal(RoomStatus.Dirty, setup.Room.Status);
    }

    [Fact]
    public async Task Assignee_list_only_contains_active_housekeepers()
    {
        var setup = await Setup();
        await using var db = setup.Db;
        var managerUser = User("manager");
        db.AddRange(managerUser, new TenantStaff
        {
            TenantId = setup.Tenant.Id, User = managerUser, UserId = managerUser.Id,
            Role = StaffRole.Manager, IsActive = true
        });
        await db.SaveChangesAsync();
        var controller = Controller(db, setup.TenantService, managerUser.Id, StaffRole.Manager);

        var response = await controller.ListAssignees(setup.Tenant.Id);

        var ok = Assert.IsType<OkObjectResult>(response.Result);
        var assignees = Assert.IsType<List<HousekeepingAssigneeDto>>(ok.Value);
        Assert.Single(assignees);
        Assert.Equal(setup.Housekeeper.UserId, assignees[0].UserId);
    }

    [Fact]
    public async Task Manager_creates_a_valid_manual_task_and_duplicate_open_task_is_rejected()
    {
        var setup = await Setup();
        await using var db = setup.Db;
        var managerUser = User("task-manager");
        db.AddRange(managerUser, new TenantStaff
        {
            TenantId = setup.Tenant.Id, User = managerUser, UserId = managerUser.Id,
            Role = StaffRole.Manager, IsActive = true
        });
        await db.SaveChangesAsync();
        var controller = Controller(db, setup.TenantService, managerUser.Id, StaffRole.Manager);
        var request = new CreateHousekeepingTaskRequest(setup.Room.Id, "INSPECTION", "URGENT", "Kiểm tra minibar trước 14:00");

        var created = await controller.CreateTask(request);
        var duplicate = await controller.CreateTask(request);

        var task = Dto(created);
        Assert.Equal("Inspection", task.TaskType);
        Assert.Equal("URGENT", task.Priority);
        Assert.Null(task.ReservationId);
        Assert.IsType<ConflictObjectResult>(duplicate.Result);
        Assert.Equal(2, db.HousekeepingTasks.IgnoreQueryFilters().Count());
    }

    [Theory]
    [InlineData(RoomStatus.Occupied)]
    [InlineData(RoomStatus.OutOfService)]
    public async Task Manual_task_is_rejected_for_a_blocked_room(RoomStatus blockedStatus)
    {
        var setup = await Setup();
        await using var db = setup.Db;
        setup.Room.Status = blockedStatus;
        await db.SaveChangesAsync();
        var controller = Controller(db, setup.TenantService, setup.Housekeeper.UserId, StaffRole.Manager);

        var response = await controller.CreateTask(new(setup.Room.Id, "TOUCH_UP", "HIGH", "Dọn bổ sung khăn"));

        Assert.IsType<ConflictObjectResult>(response.Result);
        Assert.Single(db.HousekeepingTasks.IgnoreQueryFilters());
        Assert.Equal(blockedStatus, setup.Room.Status);
    }

    [Theory]
    [InlineData(RoomStatus.Occupied)]
    [InlineData(RoomStatus.OutOfService)]
    public async Task Claimed_task_cannot_start_when_room_becomes_blocked(RoomStatus blockedStatus)
    {
        var setup = await Setup();
        await using var db = setup.Db;
        setup.Task.AssignedToStaff = setup.Housekeeper;
        setup.Task.AssignedToStaffId = setup.Housekeeper.Id;
        setup.Task.AssignedAtUtc = DateTime.UtcNow.AddMinutes(-5);
        setup.Task.Status = HousekeepingTaskStatus.Claimed;
        setup.Room.Status = blockedStatus;
        await db.SaveChangesAsync();
        var controller = Controller(db, setup.TenantService, setup.Housekeeper.UserId, StaffRole.Housekeeper);

        var response = await controller.Start(setup.Task.Id, new(null));

        Assert.IsType<ConflictObjectResult>(response.Result);
        Assert.Equal(HousekeepingTaskStatus.Claimed, setup.Task.Status);
        Assert.Equal(blockedStatus, setup.Room.Status);
        Assert.Null(setup.Task.StartedAtUtc);
    }

    [Fact]
    public async Task Manager_cancels_an_unstarted_task_but_cannot_delete_operational_history()
    {
        var setup = await Setup();
        await using var db = setup.Db;
        var controller = Controller(db, setup.TenantService, setup.Housekeeper.UserId, StaffRole.Manager);

        var manual = new HousekeepingTask
        {
            TenantId = setup.Tenant.Id, RoomId = setup.Room.Id, TaskType = "TouchUp",
            Status = HousekeepingTaskStatus.Pending, Priority = HousekeepingPriority.Normal
        };
        db.HousekeepingTasks.Add(manual);
        await db.SaveChangesAsync();

        var invalidReason = await controller.CancelTask(manual.Id, new(" ", null));
        var invalidReasonResult = Assert.IsType<BadRequestObjectResult>(invalidReason);
        Assert.Contains("HOUSEKEEPING_CANCELLATION_REASON_INVALID", invalidReasonResult.Value!.ToString());
        Assert.False(manual.IsDeleted);

        var cancelled = await controller.CancelTask(manual.Id, new("Yêu cầu đã được xử lý tại quầy", null));
        Assert.IsType<NoContentResult>(cancelled);
        Assert.True(manual.IsDeleted);
        Assert.Equal(setup.Housekeeper.UserId, manual.CancelledByUserId);
        Assert.NotNull(manual.CancelledAtUtc);
        Assert.Equal("Yêu cầu đã được xử lý tại quầy", manual.CancellationReason);

        var sourceBlocked = await controller.CancelTask(setup.Task.Id, new("Không còn cần dọn", null));
        Assert.IsType<ConflictObjectResult>(sourceBlocked);
        Assert.False(setup.Task.IsDeleted);

        var historical = new HousekeepingTask
        {
            TenantId = setup.Tenant.Id, RoomId = setup.Room.Id, TaskType = "Inspection",
            Status = HousekeepingTaskStatus.InProgress, Priority = HousekeepingPriority.Normal
        };
        db.HousekeepingTasks.Add(historical);
        await db.SaveChangesAsync();
        var blocked = await controller.CancelTask(historical.Id, new("Không còn cần xử lý", null));

        Assert.IsType<ConflictObjectResult>(blocked);
        Assert.False(historical.IsDeleted);
    }

    private static HousekeepingTaskDto Dto(ActionResult<HousekeepingTaskDto> response)
    {
        var ok = Assert.IsType<OkObjectResult>(response.Result);
        return Assert.IsType<HousekeepingTaskDto>(ok.Value);
    }

    private static HousekeepingController Controller(ApplicationDbContext db, CurrentTenantService tenantService,
        Guid userId, StaffRole role)
    {
        var controller = new HousekeepingController(db, tenantService)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
        controller.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity([
            new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
            new Claim(ClaimTypes.Role, role.ToString())
        ], "test"));
        return controller;
    }

    private static async Task<SetupResult> Setup()
    {
        var tenantService = new CurrentTenantService();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        var db = new ApplicationDbContext(options, tenantService);
        var tenant = new Tenant
        {
            Name = "Housekeeping Test Hotel", Code = $"HK-{Guid.NewGuid():N}", Slug = $"hk-{Guid.NewGuid():N}",
            Address = "1 Clean Street", City = "Da Nang", Status = TenantStatus.Active
        };
        tenantService.SetTenant(tenant.Id, SubscriptionTier.Pro);
        var user = User("housekeeper");
        var staff = new TenantStaff
        {
            TenantId = tenant.Id, User = user, UserId = user.Id,
            Role = StaffRole.Housekeeper, IsActive = true
        };
        var roomType = new RoomType
        {
            TenantId = tenant.Id, Name = "Deluxe", Code = "DLX", BasePricePerNight = 1_000_000, IsActive = true
        };
        var room = new Room
        {
            TenantId = tenant.Id, RoomType = roomType, RoomTypeId = roomType.Id,
            RoomNumber = "101", Status = RoomStatus.Dirty, IsActive = true
        };
        var reservation = new Reservation
        {
            TenantId = tenant.Id, Tenant = tenant, BookingCode = "LXS-HOUSEKEEPING-55",
            GuestFullName = "Checkout Guest", GuestPhoneNumber = "0900000000",
            CheckInDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1)),
            CheckOutDate = DateOnly.FromDateTime(DateTime.UtcNow), Status = ReservationStatus.CheckedOut
        };
        var task = new HousekeepingTask
        {
            TenantId = tenant.Id, Room = room, RoomId = room.Id,
            Reservation = reservation, ReservationId = reservation.Id, TaskType = "CheckoutCleaning",
            Status = HousekeepingTaskStatus.Pending, Priority = HousekeepingPriority.High
        };
        db.AddRange(tenant, user, staff, roomType, room, reservation, task);
        await db.SaveChangesAsync();
        return new SetupResult(db, tenantService, tenant, staff, room, reservation, task);
    }

    private static User User(string username) => new()
    {
        Username = username, Email = $"{username}@example.com", FullName = username,
        PasswordHash = "test", GlobalRole = GlobalUserRole.TenantStaff, IsActive = true
    };

    private static HousekeepingTask TaskFor(SetupResult setup, string roomNumber,
        HousekeepingTaskStatus status, HousekeepingPriority priority)
    {
        var room = new Room
        {
            TenantId = setup.Tenant.Id, RoomTypeId = setup.Room.RoomTypeId,
            RoomNumber = roomNumber, Status = RoomStatus.Dirty, IsActive = true
        };
        return new HousekeepingTask
        {
            TenantId = setup.Tenant.Id, Room = room, RoomId = room.Id,
            TaskType = "Inspection", Status = status, Priority = priority
        };
    }

    private sealed record SetupResult(ApplicationDbContext Db, CurrentTenantService TenantService,
        Tenant Tenant, TenantStaff Housekeeper, Room Room, Reservation Reservation, HousekeepingTask Task);
}
