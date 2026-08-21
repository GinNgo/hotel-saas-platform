using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using HotelSaas.Infrastructure.Persistence;
using HotelSaas.Infrastructure.Services;
using HotelSaas.WebApi.Controllers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace HotelSaas.WebApi.Tests;

public class ManagementControllerTests
{
    [Fact]
    public async Task Context_returns_only_authenticated_tenant_with_operational_counts()
    {
        var tenantService = new CurrentTenantService();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using var db = new ApplicationDbContext(options, tenantService);
        var tenant = Tenant("Scoped Hotel");
        var otherTenant = Tenant("Other Hotel");
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var arrival = new Reservation
        {
            TenantId = tenant.Id, BookingCode = "PMS-ARRIVAL", GuestFullName = "Arrival", GuestEmail = "arrival@example.com",
            GuestPhoneNumber = "0901", CheckInDate = today, CheckOutDate = today.AddDays(2), Status = ReservationStatus.Confirmed
        };
        arrival.Details.Add(new ReservationDetail { TenantId = tenant.Id, RoomTypeId = Guid.NewGuid(), NightlyPrice = 800_000, NumberOfNights = 2, SubTotal = 1_600_000 });
        var departure = new Reservation
        {
            TenantId = tenant.Id, BookingCode = "PMS-DEPARTURE", GuestFullName = "Departure", GuestEmail = "departure@example.com",
            GuestPhoneNumber = "0902", CheckInDate = today.AddDays(-1), CheckOutDate = today, Status = ReservationStatus.CheckedIn
        };
        departure.Details.Add(new ReservationDetail { TenantId = tenant.Id, RoomTypeId = Guid.NewGuid(), NightlyPrice = 1_000_000, NumberOfNights = 1, SubTotal = 1_000_000 });
        tenantService.SetTenant(tenant.Id, SubscriptionTier.Pro);
        db.AddRange(tenant, otherTenant,
            new Room { TenantId = tenant.Id, RoomNumber = "101", IsActive = true, Status = RoomStatus.Occupied },
            new Room { TenantId = tenant.Id, RoomNumber = "102", IsActive = true, Status = RoomStatus.Clean },
            new Room { TenantId = tenant.Id, RoomNumber = "103", IsActive = true, Status = RoomStatus.Dirty },
            new Room { TenantId = tenant.Id, RoomNumber = "104", IsActive = true, Status = RoomStatus.OutOfService },
            arrival, departure,
            new Room { TenantId = otherTenant.Id, RoomNumber = "999", IsActive = true, Status = RoomStatus.Occupied });
        await db.SaveChangesAsync();
        var controller = new ManagementController(db, tenantService);

        var response = await controller.GetContext(tenant.Id);

        var ok = Assert.IsType<OkObjectResult>(response.Result);
        var context = Assert.IsType<ManagementContextDto>(ok.Value);
        Assert.Equal(tenant.Id, context.ActivePropertyId);
        Assert.Single(context.Properties);
        Assert.Equal(4, context.Dashboard["totalRooms"]);
        Assert.Equal(1, context.Dashboard["availableRooms"]);
        Assert.Equal(1, context.Dashboard["occupiedRooms"]);
        Assert.Equal(1, context.Dashboard["dirtyRooms"]);
        Assert.Equal(1, context.Dashboard["maintenanceRooms"]);
        Assert.Equal(1, context.Dashboard["reservedRooms"]);
        Assert.Equal(1, context.Dashboard["arrivalsToday"]);
        Assert.Equal(1, context.Dashboard["departuresToday"]);
        Assert.Equal(1_000_000, context.Dashboard["adr"]);
        Assert.True(context.Dashboard["revPar"] > 0);
    }

    [Fact]
    public async Task Context_rejects_property_outside_token_scope()
    {
        var tenantService = new CurrentTenantService();
        tenantService.SetTenant(Guid.NewGuid(), SubscriptionTier.Basic);
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using var db = new ApplicationDbContext(options, tenantService);
        var controller = new ManagementController(db, tenantService);

        var response = await controller.GetContext(Guid.NewGuid());

        Assert.IsType<ForbidResult>(response.Result);
    }

    [Fact]
    public async Task Room_type_and_bulk_rooms_are_created_inside_tenant_scope()
    {
        var setup = await ScopedContext();
        await using var db = setup.Db;
        var controller = new ManagementController(db, setup.TenantService);

        var createdType = await controller.CreateRoomType(new(
            setup.Tenant.Id, "dlx", "Deluxe", "Deluxe", "DOUBLE", 2, 1, 3, 1_200_000, "ACTIVE"));
        var typeResult = Assert.IsType<CreatedAtActionResult>(createdType.Result);
        var roomType = Assert.IsType<ManagementRoomTypeDto>(typeResult.Value);
        var createdRooms = await controller.CreateRoomsBulk(new(
            setup.Tenant.Id, roomType.Id, 1, 101, 103, "AVAILABLE"));

        var ok = Assert.IsType<OkObjectResult>(createdRooms.Result);
        var rooms = Assert.IsType<List<ManagementRoomDto>>(ok.Value);
        Assert.Equal(3, rooms.Count);
        Assert.All(rooms, room => Assert.Equal("AVAILABLE", room.Status));
        Assert.All(rooms, room => Assert.Equal(setup.Tenant.Id, room.HotelId));
    }

    [Fact]
    public async Task Bulk_rooms_reject_duplicate_numbers_without_partial_insert()
    {
        var setup = await ScopedContext();
        await using var db = setup.Db;
        var roomType = new RoomType
        {
            TenantId = setup.Tenant.Id, Code = "STD", Name = "Standard", BasePricePerNight = 800_000, IsActive = true
        };
        db.RoomTypes.Add(roomType);
        db.Rooms.Add(new Room
        {
            TenantId = setup.Tenant.Id, RoomType = roomType, RoomTypeId = roomType.Id,
            RoomNumber = "102", Floor = 1, Status = RoomStatus.Clean, IsActive = true
        });
        await db.SaveChangesAsync();
        var controller = new ManagementController(db, setup.TenantService);

        var response = await controller.CreateRoomsBulk(new(setup.Tenant.Id, roomType.Id, 1, 101, 103, "AVAILABLE"));

        Assert.IsType<ConflictObjectResult>(response.Result);
        Assert.Single(db.Rooms);
    }

    [Fact]
    public async Task Room_type_creation_persists_booking_benefits_and_normalized_amenities()
    {
        var setup = await ScopedContext();
        await using var db = setup.Db;
        var controller = new ManagementController(db, setup.TenantService);

        var response = await controller.CreateRoomType(new(setup.Tenant.Id, "sea", "Phòng hướng biển", null, "KING", 2, 1, 3,
            1_500_000, "ACTIVE", IncludesBreakfast: true, IsRefundable: true, FreeCancellationHours: 48,
            SmokingAllowed: false, AmenityCodes: ["sea_view", "BALCONY", "TV"]));

        var dto = Assert.IsType<ManagementRoomTypeDto>(Assert.IsType<CreatedAtActionResult>(response.Result).Value);
        Assert.True(dto.IncludesBreakfast);
        Assert.True(dto.IsRefundable);
        Assert.Equal(48, dto.FreeCancellationHours);
        Assert.Equal(["BALCONY", "SEA_VIEW", "TV"], dto.AmenityCodes);
        var entity = await db.RoomTypes.Include(item => item.Amenities).SingleAsync();
        Assert.Equal(3, entity.Amenities.Count);
    }

    [Fact]
    public async Task Maintenance_rejects_occupied_room_and_round_trips_available_room()
    {
        var setup = await ScopedContext();
        await using var db = setup.Db;
        var roomType = new RoomType
        {
            TenantId = setup.Tenant.Id, Code = "STD", Name = "Standard", BasePricePerNight = 800_000, IsActive = true
        };
        var occupied = new Room
        {
            TenantId = setup.Tenant.Id, RoomType = roomType, RoomTypeId = roomType.Id,
            RoomNumber = "201", Floor = 2, Status = RoomStatus.Occupied, IsActive = true
        };
        var available = new Room
        {
            TenantId = setup.Tenant.Id, RoomType = roomType, RoomTypeId = roomType.Id,
            RoomNumber = "202", Floor = 2, Status = RoomStatus.Clean, IsActive = true
        };
        db.AddRange(roomType, occupied, available);
        await db.SaveChangesAsync();
        var controller = new ManagementController(db, setup.TenantService);

        var blocked = await controller.StartMaintenance(
            occupied.Id,
            new ManagementMaintenanceRequest("Điều hòa không hoạt động"));
        var started = await controller.StartMaintenance(
            available.Id,
            new ManagementMaintenanceRequest("Điều hòa không hoạt động"));
        var completed = await controller.CompleteMaintenance(available.Id);

        Assert.IsType<ConflictObjectResult>(blocked.Result);
        var startedResult = Assert.IsType<OkObjectResult>(started.Result);
        var startedRoom = Assert.IsType<ManagementRoomDto>(startedResult.Value);
        Assert.Equal("Điều hòa không hoạt động", startedRoom.MaintenanceReason);
        Assert.NotNull(startedRoom.MaintenanceStartedAt);
        Assert.IsType<OkObjectResult>(completed.Result);
        Assert.Equal(RoomStatus.Clean, available.Status);
    }

    private static async Task<ScopedSetup> ScopedContext()
    {
        var tenantService = new CurrentTenantService();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        var db = new ApplicationDbContext(options, tenantService);
        var tenant = Tenant("Inventory Hotel");
        tenantService.SetTenant(tenant.Id, SubscriptionTier.Pro);
        db.Tenants.Add(tenant);
        await db.SaveChangesAsync();
        return new ScopedSetup(db, tenantService, tenant);
    }

    private static Tenant Tenant(string name) => new()
    {
        Name = name, Code = $"MGT-{Guid.NewGuid():N}", Slug = $"mgt-{Guid.NewGuid():N}",
        Address = "1 Management Street", City = "Da Nang", Status = TenantStatus.Active,
        SubscriptionTier = SubscriptionTier.Pro
    };

    private sealed record ScopedSetup(ApplicationDbContext Db, CurrentTenantService TenantService, Tenant Tenant);
}
