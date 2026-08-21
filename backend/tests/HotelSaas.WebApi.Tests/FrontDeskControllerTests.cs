using HotelSaas.Application.DTOs.FrontDesk;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using HotelSaas.Infrastructure.Persistence;
using HotelSaas.Infrastructure.Services;
using HotelSaas.WebApi.Controllers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace HotelSaas.WebApi.Tests;

public class FrontDeskControllerTests
{
    [Fact]
    public async Task Check_in_rejects_reservation_that_is_not_confirmed()
    {
        var setup = await Setup(ReservationStatus.PendingPayment);
        await using var db = setup.Db;
        var controller = new FrontDeskController(db, setup.TenantService);

        var response = await controller.CheckIn(new(setup.Reservation.Id, [setup.Room.Id], null));

        Assert.IsType<ConflictObjectResult>(response.Result);
        Assert.Equal(RoomStatus.Clean, setup.Room.Status);
    }

    [Fact]
    public async Task Check_in_requires_exact_room_count_and_matching_room_type()
    {
        var setup = await Setup();
        await using var db = setup.Db;
        var otherType = new RoomType
        {
            TenantId = setup.Tenant.Id, Name = "Suite", Code = "STE", BasePricePerNight = 2_000_000, IsActive = true
        };
        var wrongRoom = new Room
        {
            TenantId = setup.Tenant.Id, RoomType = otherType, RoomTypeId = otherType.Id,
            RoomNumber = "901", Status = RoomStatus.Clean, IsActive = true
        };
        db.AddRange(otherType, wrongRoom);
        await db.SaveChangesAsync();
        var controller = new FrontDeskController(db, setup.TenantService);

        var missing = await controller.CheckIn(new(setup.Reservation.Id, [], null));
        var wrongType = await controller.CheckIn(new(setup.Reservation.Id, [wrongRoom.Id], null));

        Assert.IsType<BadRequestObjectResult>(missing.Result);
        Assert.IsType<BadRequestObjectResult>(wrongType.Result);
        Assert.Equal(ReservationStatus.Confirmed, setup.Reservation.Status);
        Assert.Equal(RoomStatus.Clean, wrongRoom.Status);
    }

    [Fact]
    public async Task Check_in_assigns_clean_matching_room_atomically()
    {
        var setup = await Setup();
        await using var db = setup.Db;
        var controller = new FrontDeskController(db, setup.TenantService);

        var response = await controller.CheckIn(new(setup.Reservation.Id, [setup.Room.Id], "012345678901"));

        Assert.IsType<OkObjectResult>(response.Result);
        Assert.Equal(ReservationStatus.CheckedIn, setup.Reservation.Status);
        Assert.Equal(setup.Room.Id, setup.Reservation.Details.Single().RoomId);
        Assert.Equal(RoomStatus.Occupied, setup.Room.Status);
    }

    [Theory]
    [InlineData(ReservationStatus.Confirmed, 0)]
    [InlineData(ReservationStatus.CheckedOut, 0)]
    [InlineData(ReservationStatus.CheckedIn, -1)]
    public async Task Check_out_rejects_invalid_state_or_negative_payment(ReservationStatus status, decimal additionalPayment)
    {
        var setup = await Setup(status);
        await using var db = setup.Db;
        var controller = new FrontDeskController(db, setup.TenantService);

        var response = await controller.CheckOut(new(setup.Reservation.Id, additionalPayment));

        Assert.True(response.Result is ConflictObjectResult or BadRequestObjectResult);
        Assert.Equal(status, setup.Reservation.Status);
    }

    [Fact]
    public async Task Check_out_records_additional_payment_and_closes_balanced_folio()
    {
        var setup = await Setup(ReservationStatus.CheckedIn);
        await using var db = setup.Db;
        setup.Reservation.Details.Single().Room = setup.Room;
        setup.Reservation.Details.Single().RoomId = setup.Room.Id;
        setup.Room.Status = RoomStatus.Occupied;
        setup.Reservation.Folio = new Folio
        {
            TenantId = setup.Tenant.Id, ReservationId = setup.Reservation.Id,
            TotalCharges = 250_000, TotalCredits = 0
        };
        db.Folios.Add(setup.Reservation.Folio);
        await db.SaveChangesAsync();
        var controller = new FrontDeskController(db, setup.TenantService);

        var response = await controller.CheckOut(new(setup.Reservation.Id, 250_000, PaymentMethod.Cash));

        Assert.IsType<OkObjectResult>(response.Result);
        Assert.True(setup.Reservation.Folio.IsClosed);
        Assert.Equal(ReservationStatus.CheckedOut, setup.Reservation.Status);
        Assert.Equal(RoomStatus.Dirty, setup.Room.Status);
        var payment = Assert.Single(db.Payments.IgnoreQueryFilters());
        Assert.Equal(250_000, payment.Amount);
        Assert.Equal(PaymentStatus.Completed, payment.Status);
        Assert.Single(db.HousekeepingTasks.IgnoreQueryFilters());
        var housekeeping = Assert.Single(db.HousekeepingTasks.IgnoreQueryFilters());
        Assert.Equal(setup.Reservation.Id, housekeeping.ReservationId);
        Assert.Equal("CheckoutCleaning", housekeeping.TaskType);
    }

    [Theory]
    [InlineData("", 1000, 1)]
    [InlineData("Minibar", 0, 1)]
    [InlineData("Minibar", 1000, 0)]
    public async Task Folio_item_rejects_invalid_financial_input(string description, decimal unitPrice, int quantity)
    {
        var setup = await Setup(ReservationStatus.CheckedIn);
        await using var db = setup.Db;
        var controller = new FrontDeskController(db, setup.TenantService);

        var response = await controller.AddFolioItem(new(Guid.NewGuid(), FolioItemType.Minibar, description, unitPrice, quantity));

        Assert.IsType<BadRequestObjectResult>(response.Result);
        Assert.Empty(db.FolioItems.IgnoreQueryFilters());
    }

    private static async Task<SetupResult> Setup(ReservationStatus status = ReservationStatus.Confirmed)
    {
        var tenantService = new CurrentTenantService();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        var db = new ApplicationDbContext(options, tenantService);
        var tenant = new Tenant
        {
            Name = "Front Desk Test Hotel", Code = $"FD-{Guid.NewGuid():N}", Slug = $"fd-{Guid.NewGuid():N}",
            Address = "1 Desk Street", City = "Da Nang", Status = TenantStatus.Active,
            SubscriptionTier = SubscriptionTier.Pro
        };
        tenantService.SetTenant(tenant.Id, tenant.SubscriptionTier);
        var roomType = new RoomType
        {
            TenantId = tenant.Id, Tenant = tenant, Name = "Deluxe", Code = "DLX",
            BasePricePerNight = 1_000_000, IsActive = true
        };
        var room = new Room
        {
            TenantId = tenant.Id, RoomType = roomType, RoomTypeId = roomType.Id,
            RoomNumber = "101", Status = RoomStatus.Clean, IsActive = true
        };
        var reservation = new Reservation
        {
            TenantId = tenant.Id, Tenant = tenant, BookingCode = "LXS-FD-001",
            GuestFullName = "Front Desk Guest", GuestEmail = "desk@example.com", GuestPhoneNumber = "0901234567",
            CheckInDate = DateOnly.FromDateTime(DateTime.UtcNow),
            CheckOutDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1)),
            Status = status, TotalAmount = 1_000_000
        };
        reservation.Details.Add(new ReservationDetail
        {
            TenantId = tenant.Id, Reservation = reservation, ReservationId = reservation.Id,
            RoomType = roomType, RoomTypeId = roomType.Id, NightlyPrice = 1_000_000,
            NumberOfNights = 1, SubTotal = 1_000_000
        });
        db.AddRange(tenant, roomType, room, reservation);
        await db.SaveChangesAsync();
        return new SetupResult(db, tenantService, tenant, room, reservation);
    }

    private sealed record SetupResult(ApplicationDbContext Db, CurrentTenantService TenantService,
        Tenant Tenant, Room Room, Reservation Reservation);
}
