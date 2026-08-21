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

public class OperationalTasksControllerTests
{
    [Fact]
    public async Task Queue_materializes_sources_and_executes_refund_approval()
    {
        var setup = await Seed();
        await using var db = setup.Db;
        var controller = Controller(db, setup.TenantService, setup.ManagerId, "Manager");

        var listed = await controller.List(setup.TenantId, null);
        var tasks = Assert.IsType<List<OperationalTaskDto>>(Assert.IsType<OkObjectResult>(listed.Result).Value);
        Assert.Equal(3, tasks.Count);
        var refundTask = tasks.Single(item => item.AggregateType == "PROPERTY_REFUND");
        Assert.Equal("RF-TASK", refundTask.SourceReference);
        Assert.Contains("100 VND", refundTask.SourceDescription);
        Assert.All(tasks.Where(item => item.AggregateType is "HOUSEKEEPING" or "ROOM_MAINTENANCE"), item => Assert.Equal("101", item.SourceReference));
        var claimed = await controller.Claim(refundTask.Id, refundTask.Version);
        var claimedTask = Assert.IsType<OperationalTaskDto>(Assert.IsType<OkObjectResult>(claimed.Result).Value);
        var executed = await controller.Execute(claimedTask.Id, new(claimedTask.Version, "COMPLETE", "Đã kiểm tra", new { }));

        Assert.Equal("COMPLETED", Assert.IsType<OperationalTaskDto>(Assert.IsType<OkObjectResult>(executed.Result).Value).Status);
        Assert.Equal("PENDING_PROVIDER", setup.Refund.Status);
    }

    [Fact]
    public async Task Reassign_requires_current_version_and_active_tenant_staff()
    {
        var setup = await Seed();
        await using var db = setup.Db;
        var controller = Controller(db, setup.TenantService, setup.ManagerId, "Manager");
        var tasks = Assert.IsType<List<OperationalTaskDto>>(Assert.IsType<OkObjectResult>((await controller.List(setup.TenantId, null)).Result).Value);
        var task = tasks.First();

        var stale = await controller.Reassign(task.Id, new(task.Version - 1, setup.AssigneeUserId, "Phân công lại cho ca mới"));
        var updated = await controller.Reassign(task.Id, new(task.Version, setup.AssigneeUserId, "Phân công lại cho ca mới"));

        Assert.IsType<ConflictObjectResult>(stale.Result);
        var dto = Assert.IsType<OperationalTaskDto>(Assert.IsType<OkObjectResult>(updated.Result).Value);
        Assert.Equal(setup.AssigneeUserId, dto.AssignedToUserId);
        Assert.Equal("Assignee", dto.AssignedToName);
        Assert.Equal("Receptionist", dto.AssignedToRole);
        Assert.Equal("ASSIGNED", dto.Status);
    }

    [Fact]
    public async Task Assignees_returns_active_staff_with_user_identity()
    {
        var setup = await Seed();
        await using var db = setup.Db;
        var controller = Controller(db, setup.TenantService, setup.ManagerId, "Manager");

        var result = await controller.ListAssignees(setup.TenantId);

        var assignees = Assert.IsType<List<OperationalTaskAssigneeDto>>(Assert.IsType<OkObjectResult>(result.Result).Value);
        var assignee = Assert.Single(assignees);
        Assert.Equal(setup.AssigneeUserId, assignee.UserId);
        Assert.Equal("Assignee", assignee.FullName);
        Assert.Equal("Receptionist", assignee.Role);
    }

    [Fact]
    public async Task Cancel_requires_reason_and_writes_audit_with_version_check()
    {
        var setup = await Seed();
        await using var db = setup.Db;
        var controller = Controller(db, setup.TenantService, setup.ManagerId, "Manager");
        var tasks = Assert.IsType<List<OperationalTaskDto>>(Assert.IsType<OkObjectResult>((await controller.List(setup.TenantId, null)).Result).Value);
        var task = tasks.First();

        var invalid = await controller.Cancel(task.Id, new(task.Version, "no"));
        Assert.IsType<BadRequestObjectResult>(invalid.Result);
        var stale = await controller.Cancel(task.Id, new(task.Version - 1, "Không còn cần xử lý"));
        Assert.IsType<ConflictObjectResult>(stale.Result);
        var cancelled = await controller.Cancel(task.Id, new(task.Version, "Không còn cần xử lý"));
        var dto = Assert.IsType<OperationalTaskDto>(Assert.IsType<OkObjectResult>(cancelled.Result).Value);
        Assert.Equal("CANCELLED", dto.Status);
        Assert.Contains(db.OperationalAuditEvents, item => item.EventType == "TASK_CANCELLED" && item.AggregateId == task.Id.ToString());
    }

    private static async Task<Setup> Seed()
    {
        var tenantService = new CurrentTenantService();
        var tenantId = Guid.NewGuid(); tenantService.SetTenant(tenantId, SubscriptionTier.Pro);
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        var db = new ApplicationDbContext(options, tenantService);
        var managerId = Guid.NewGuid(); var assigneeId = Guid.NewGuid();
        var tenant = new Tenant { Id = tenantId, Name = "Task Hotel", Code = "TASK-01", Slug = "task-hotel", Address = "1 Task", City = "Da Nang", Status = TenantStatus.Active };
        var manager = new User { Id = managerId, Username = "manager", Email = "manager@task.test", FullName = "Manager", PasswordHash = "x", GlobalRole = GlobalUserRole.TenantStaff, IsActive = true };
        var assignee = new User { Id = assigneeId, Username = "assignee", Email = "assignee@task.test", FullName = "Assignee", PasswordHash = "x", GlobalRole = GlobalUserRole.TenantStaff, IsActive = true };
        var staff = new TenantStaff { TenantId = tenantId, UserId = assigneeId, User = assignee, Role = StaffRole.Receptionist, IsActive = true };
        var roomType = new RoomType { TenantId = tenantId, Code = "STD", Name = "Standard", BasePricePerNight = 1, IsActive = true };
        var room = new Room { TenantId = tenantId, RoomType = roomType, RoomTypeId = roomType.Id, RoomNumber = "101", Status = RoomStatus.OutOfService, IsActive = true };
        var housekeeping = new HousekeepingTask { TenantId = tenantId, Room = room, RoomId = room.Id, Status = HousekeepingTaskStatus.Pending };
        var reservation = new Reservation { TenantId = tenantId, BookingCode = "LXS-TASK", GuestFullName = "Guest", GuestPhoneNumber = "0900", CheckInDate = DateOnly.FromDateTime(DateTime.Today), CheckOutDate = DateOnly.FromDateTime(DateTime.Today.AddDays(1)), TotalAmount = 100, Status = ReservationStatus.Cancelled };
        var payment = new Payment { TenantId = tenantId, Reservation = reservation, ReservationId = reservation.Id, Amount = 100, Status = PaymentStatus.Completed };
        var refund = new PropertyRefund { TenantId = tenantId, Payment = payment, PaymentId = payment.Id, PublicId = "RF-TASK", IdempotencyKey = "task-refund-key", RequestedAmount = 100, Reason = "Task", Status = "PENDING_APPROVAL" };
        db.AddRange(tenant, manager, staff, roomType, room, housekeeping, reservation, payment, refund);
        await db.SaveChangesAsync();
        return new Setup(db, tenantService, tenantId, managerId, assigneeId, refund);
    }

    private static OperationalTasksController Controller(ApplicationDbContext db, CurrentTenantService tenant, Guid userId, string role)
    {
        var controller = new OperationalTasksController(db, tenant) { ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() } };
        controller.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, userId.ToString()), new Claim(ClaimTypes.Role, role), new Claim("tenant_id", tenant.TenantId!.Value.ToString())], "test"));
        return controller;
    }

    private sealed record Setup(ApplicationDbContext Db, CurrentTenantService TenantService, Guid TenantId,
        Guid ManagerId, Guid AssigneeUserId, PropertyRefund Refund);
}
