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

public sealed class RoomsAdminControllerTests
{
    [Fact]
    public async Task Admin_room_lifecycle_round_trips_inventory_contract()
    {
        var tenant = Hotel("Lifecycle Hotel");
        var roomType = Type(tenant, "DLX");
        await using var db = CreateContext(tenant, roomType);
        var controller = WithUser(new RoomsController(db), "Manager", tenant.Id);

        var createdResult = await controller.CreateAdminRoom(new SaveAdminRoomRequest(tenant.Id, roomType.Id, "101", 1, "Near lift"));
        var created = Assert.IsType<AdminRoomDto>(Assert.IsType<OkObjectResult>(createdResult.Result).Value);
        Assert.Equal("AVAILABLE", created.Status);
        Assert.Equal("CLEAN", created.HousekeepingStatus);

        var updatedResult = await controller.UpdateAdminRoom(created.Id,
            new SaveAdminRoomRequest(tenant.Id, roomType.Id, "102", 2, "Sea side"));
        var updated = Assert.IsType<AdminRoomDto>(Assert.IsType<OkObjectResult>(updatedResult.Result).Value);
        Assert.Equal("102", updated.RoomNumber);
        Assert.Equal("Sea side", updated.Note);

        var maintenance = Assert.IsType<AdminRoomDto>(Assert.IsType<OkObjectResult>(
            (await controller.StartAdminMaintenance(created.Id, new("Điều hòa không hoạt động"))).Result).Value);
        Assert.Equal("MAINTENANCE", maintenance.MaintenanceStatus);
        Assert.Equal("Điều hòa không hoạt động", maintenance.MaintenanceReason);
        Assert.NotNull(maintenance.MaintenanceStartedAt);
        var completed = Assert.IsType<AdminRoomDto>(Assert.IsType<OkObjectResult>(
            (await controller.CompleteAdminMaintenance(created.Id)).Result).Value);
        Assert.Equal("AVAILABLE", completed.Status);

        Assert.IsType<NoContentResult>(await controller.DeactivateAdminRoom(created.Id));
        Assert.Equal(RoomStatus.OutOfService, (await db.Rooms.IgnoreQueryFilters().SingleAsync()).Status);
    }

    [Fact]
    public async Task Bulk_create_keeps_prefix_and_reports_duplicates_without_cross_tenant_access()
    {
        var mine = Hotel("Mine");
        var other = Hotel("Other");
        var mineType = Type(mine, "STD");
        var otherType = Type(other, "STD");
        var existing = new Room { TenantId = mine.Id, RoomTypeId = mineType.Id, RoomNumber = "A102", Floor = 1 };
        await using var db = CreateContext(mine, other, mineType, otherType, existing);
        var controller = WithUser(new RoomsController(db), "Manager", mine.Id);

        var result = await controller.CreateAdminRoomsBulk(new BulkAdminRoomRequest(mine.Id, mineType.Id, 1, 101, 103, "A"));
        var payload = Assert.IsType<BulkAdminRoomResult>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal(["A101", "A103"], payload.Created.Select(room => room.RoomNumber).ToList());
        Assert.Equal(["A102"], payload.FailedRoomNumbers);

        var forbidden = await controller.CreateAdminRoom(new SaveAdminRoomRequest(other.Id, otherType.Id, "201", 2));
        Assert.IsType<ForbidResult>(forbidden.Result);
    }

    [Fact]
    public async Task Date_availability_excludes_assigned_unassigned_and_held_inventory()
    {
        var tenant = Hotel("Availability Hotel");
        var roomType = Type(tenant, "DLX");
        var rooms = Enumerable.Range(101, 4).Select(number => new Room
        {
            TenantId = tenant.Id, RoomTypeId = roomType.Id, RoomType = roomType,
            RoomNumber = number.ToString(), Floor = 1, Status = RoomStatus.Clean, IsActive = true
        }).ToList();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var reservation = new Reservation
        {
            TenantId = tenant.Id, BookingCode = "TEST-AVAILABILITY", GuestFullName = "Guest", GuestPhoneNumber = "0901",
            CheckInDate = today.AddDays(2), CheckOutDate = today.AddDays(4), Status = ReservationStatus.Confirmed
        };
        reservation.Details.Add(new ReservationDetail { TenantId = tenant.Id, RoomTypeId = roomType.Id, RoomId = rooms[0].Id, Reservation = reservation });
        reservation.Details.Add(new ReservationDetail { TenantId = tenant.Id, RoomTypeId = roomType.Id, Reservation = reservation });
        var hold = new BookingHold
        {
            TenantId = tenant.Id, RoomTypeId = roomType.Id, Quantity = 1,
            CheckInDate = today.AddDays(2).ToDateTime(TimeOnly.MinValue), CheckOutDate = today.AddDays(3).ToDateTime(TimeOnly.MinValue),
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(10)
        };
        await using var db = CreateContext(tenant, roomType, reservation, hold, rooms[0], rooms[1], rooms[2], rooms[3]);
        var controller = WithUser(new RoomsController(db), "Manager", tenant.Id);

        var result = await controller.GetAvailableAdminRooms(today.AddDays(2), today.AddDays(4));
        var available = Assert.IsType<List<AdminRoomDto>>(Assert.IsType<OkObjectResult>(result.Result).Value);

        Assert.Equal("104", Assert.Single(available).RoomNumber);
    }

    [Fact]
    public async Task Paged_room_filters_apply_housekeeping_and_maintenance_on_the_server()
    {
        var tenant = Hotel("Matrix Hotel");
        var roomType = Type(tenant, "DLX");
        var clean = new Room { TenantId = tenant.Id, RoomTypeId = roomType.Id, RoomType = roomType, RoomNumber = "101", Status = RoomStatus.Clean, IsActive = true };
        var dirty = new Room { TenantId = tenant.Id, RoomTypeId = roomType.Id, RoomType = roomType, RoomNumber = "102", Status = RoomStatus.Dirty, IsActive = true };
        var maintenance = new Room { TenantId = tenant.Id, RoomTypeId = roomType.Id, RoomType = roomType, RoomNumber = "103", Status = RoomStatus.OutOfService, IsActive = true };
        await using var db = CreateContext(tenant, roomType, clean, dirty, maintenance);
        var controller = WithUser(new RoomsController(db), "Manager", tenant.Id);

        var cleanResult = await controller.GetAdminRoomsPaged(new RoomQuery(HousekeepingStatus: "CLEAN"));
        var maintenanceResult = await controller.GetAdminRoomsPaged(new RoomQuery(MaintenanceStatus: "MAINTENANCE"));
        var availableResult = await controller.GetAdminRoomsPaged(new RoomQuery(Status: "AVAILABLE"));

        var cleanPage = Assert.IsType<PagedRoomResponse>(Assert.IsType<OkObjectResult>(cleanResult.Result).Value);
        var maintenancePage = Assert.IsType<PagedRoomResponse>(Assert.IsType<OkObjectResult>(maintenanceResult.Result).Value);
        var availablePage = Assert.IsType<PagedRoomResponse>(Assert.IsType<OkObjectResult>(availableResult.Result).Value);
        Assert.Equal("101", Assert.Single(cleanPage.Items).RoomNumber);
        Assert.Equal("103", Assert.Single(maintenancePage.Items).RoomNumber);
        Assert.Equal("101", Assert.Single(availablePage.Items).RoomNumber);
    }

    private static RoomsController WithUser(RoomsController controller, string role, Guid tenantId)
    {
        var claims = new[] { new Claim(ClaimTypes.Role, role), new Claim("tenant_id", tenantId.ToString()) };
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(claims, "test")) }
        };
        return controller;
    }

    private static ApplicationDbContext CreateContext(params object[] entities)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        var db = new ApplicationDbContext(options, new CurrentTenantService());
        db.AddRange(entities);
        db.SaveChanges();
        return db;
    }

    private static Tenant Hotel(string name) => new()
    {
        Name = name, Code = Guid.NewGuid().ToString("N"), Slug = Guid.NewGuid().ToString("N"),
        Address = "1 Test", City = "Da Nang", Status = TenantStatus.Active
    };

    private static RoomType Type(Tenant tenant, string code) => new()
    {
        TenantId = tenant.Id, Tenant = tenant, Code = code, Name = $"Room {code}", BasePricePerNight = 1_000_000,
        CapacityAdults = 2, CapacityChildren = 1, IsActive = true
    };
}
