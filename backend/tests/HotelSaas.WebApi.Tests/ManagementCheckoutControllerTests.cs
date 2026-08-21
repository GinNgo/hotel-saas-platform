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

public class ManagementCheckoutControllerTests
{
    [Fact]
    public async Task Service_charge_uses_catalog_price_and_replays_idempotently()
    {
        var setup = await Setup(totalCredits: 1_000_000);
        await using var db = setup.Db;
        var controller = Controller(db);
        var request = new AddServiceChargeRequest(setup.Service.Id, "MINIBAR", 2, null);

        var first = Charge(await controller.AddServiceCharge(setup.Reservation.Id, request, "service-key"));
        var replay = Charge(await controller.AddServiceCharge(setup.Reservation.Id, request, "service-key"));

        Assert.Equal(300_000, first.TotalAmount);
        Assert.False(first.Replayed);
        Assert.True(replay.Replayed);
        Assert.Equal(1_300_000, setup.Reservation.Folio!.TotalCharges);
        Assert.Equal(2, setup.Reservation.Folio.Items.Count);
    }

    [Fact]
    public async Task Laundry_charge_is_preserved_as_a_laundry_folio_item()
    {
        var setup = await Setup(totalCredits: 1_000_000);
        await using var db = setup.Db;
        var controller = Controller(db);

        var result = Charge(await controller.AddServiceCharge(setup.Reservation.Id,
            new(setup.Service.Id, "LAUNDRY", 1, null), "laundry-key"));

        Assert.Equal("LAUNDRY", result.ChargeType);
        Assert.Equal(FolioItemType.Laundry, setup.Reservation.Folio!.Items.Single(item => item.Id == result.Id).ItemType);
    }

    [Fact]
    public async Task Basic_tier_cannot_add_advanced_folio_charges()
    {
        var setup = await Setup(totalCredits: 1_000_000, tier: SubscriptionTier.Basic);
        await using var db = setup.Db;
        var controller = Controller(db);

        var service = await controller.AddServiceCharge(setup.Reservation.Id,
            new(setup.Service.Id, "MINIBAR", 1, null), "basic-service-key");
        var adjustment = await controller.AddAdjustment(setup.Reservation.Id,
            new("OTHER", null, "Phụ thu", 100_000, false), "basic-adjustment-key");

        Assert.IsType<ConflictObjectResult>(service.Result);
        Assert.IsType<ConflictObjectResult>(adjustment.Result);
        Assert.Equal(1_000_000, setup.Reservation.Folio!.TotalCharges);
        Assert.Single(setup.Reservation.Folio.Items);
    }

    [Fact]
    public async Task Checkout_blocks_outstanding_folio_without_manager_override()
    {
        var setup = await Setup(totalCredits: 500_000);
        await using var db = setup.Db;
        var controller = Controller(db);

        var response = await controller.Checkout(setup.Reservation.Id, null);

        Assert.IsType<ConflictObjectResult>(response.Result);
        Assert.Equal(ReservationStatus.CheckedIn, setup.Reservation.Status);
        Assert.False(setup.Reservation.Folio!.IsClosed);
    }

    [Fact]
    public async Task Authorized_debt_checkout_closes_folio_and_creates_one_housekeeping_task()
    {
        var setup = await Setup(totalCredits: 500_000);
        await using var db = setup.Db;
        var controller = Controller(db);
        var overrideResult = await controller.AuthorizeDebtOverride(
            setup.Reservation.Id, new("Khách doanh nghiệp thanh toán công nợ", null));
        var overrideDto = Assert.IsType<CheckoutOverrideDto>(Assert.IsType<OkObjectResult>(overrideResult.Result).Value);

        var first = await controller.Checkout(setup.Reservation.Id, new(overrideDto.OverrideId));
        var replay = await controller.Checkout(setup.Reservation.Id, new(overrideDto.OverrideId));

        Assert.IsType<OkObjectResult>(first.Result);
        Assert.IsType<OkObjectResult>(replay.Result);
        Assert.Equal(ReservationStatus.CheckedOut, setup.Reservation.Status);
        Assert.True(setup.Reservation.Folio!.IsClosed);
        Assert.Equal(RoomStatus.Dirty, setup.Room.Status);
        Assert.Single(db.HousekeepingTasks);
        var housekeeping = Assert.Single(db.HousekeepingTasks);
        Assert.Equal(setup.Reservation.Id, housekeeping.ReservationId);
        Assert.Equal("CheckoutCleaning", housekeeping.TaskType);
    }

    [Fact]
    public async Task Unrelated_open_room_task_does_not_suppress_checkout_cleaning()
    {
        var setup = await Setup(totalCredits: 1_000_000);
        await using var db = setup.Db;
        db.HousekeepingTasks.Add(new HousekeepingTask
        {
            TenantId = setup.Reservation.TenantId,
            RoomId = setup.Room.Id,
            TaskType = "Inspection",
            Status = HousekeepingTaskStatus.Pending,
            Notes = "Kiểm tra minibar"
        });
        await db.SaveChangesAsync();
        var controller = Controller(db);

        var response = await controller.Checkout(setup.Reservation.Id, null);

        Assert.IsType<OkObjectResult>(response.Result);
        var tasks = db.HousekeepingTasks.IgnoreQueryFilters().ToList();
        Assert.Equal(2, tasks.Count);
        Assert.Contains(tasks, task => task.TaskType == "Inspection");
        Assert.Contains(tasks, task => task.TaskType == "CheckoutCleaning" && task.ReservationId == setup.Reservation.Id);
    }

    [Fact]
    public async Task Negative_adjustment_cannot_make_folio_total_negative()
    {
        var setup = await Setup(totalCredits: 0);
        await using var db = setup.Db;
        var controller = Controller(db);

        var response = await controller.AddAdjustment(setup.Reservation.Id,
            new("OTHER", "GOODWILL", "Điều chỉnh sai", 1_500_000, true), "adjustment-key");

        Assert.IsType<ConflictObjectResult>(response.Result);
        Assert.Equal(1_000_000, setup.Reservation.Folio!.TotalCharges);
        Assert.Single(setup.Reservation.Folio.Items);
    }

    [Fact]
    public async Task Checkout_preview_subtracts_successful_refunds_from_net_settlement()
    {
        var setup = await Setup(totalCredits: 1_000_000);
        await using var db = setup.Db;
        var payment = new Payment
        {
            TenantId = setup.Reservation.TenantId, Reservation = setup.Reservation,
            ReservationId = setup.Reservation.Id, Amount = 1_000_000, Status = PaymentStatus.Completed,
            Method = PaymentMethod.VNPay, PaidAtUtc = DateTime.UtcNow
        };
        payment.Refunds.Add(new PropertyRefund
        {
            TenantId = setup.Reservation.TenantId, Payment = payment, PaymentId = payment.Id,
            PublicId = "RF-CHECKOUT", IdempotencyKey = "checkout-refund-key", RequestedAmount = 200_000,
            Reason = "Partial refund", Status = "SUCCEEDED", CompletedAtUtc = DateTime.UtcNow
        });
        db.Payments.Add(payment);
        await db.SaveChangesAsync();
        var controller = Controller(db);

        var response = await controller.Preview(setup.Reservation.Id);

        var preview = Assert.IsType<CheckoutPreviewDto>(Assert.IsType<OkObjectResult>(response.Result).Value);
        Assert.Equal(1_000_000, preview.Folio.SuccessfulPayments);
        Assert.Equal(200_000, preview.Folio.SuccessfulRefunds);
        Assert.Equal(800_000, preview.Folio.NetSettled);
        Assert.Equal(200_000, preview.Folio.Balance);
        Assert.False(preview.CheckoutAllowed);
    }

    private static ReservationChargeDto Charge(ActionResult<ReservationChargeDto> response) =>
        Assert.IsType<ReservationChargeDto>(Assert.IsType<OkObjectResult>(response.Result).Value);

    private static ManagementCheckoutController Controller(ApplicationDbContext db)
    {
        var controller = new ManagementCheckoutController(db)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
        controller.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity([
            new Claim(ClaimTypes.NameIdentifier, Guid.NewGuid().ToString()),
            new Claim(ClaimTypes.Role, StaffRole.Manager.ToString())
        ], "test"));
        return controller;
    }

    private static async Task<SetupResult> Setup(decimal totalCredits, SubscriptionTier tier = SubscriptionTier.Pro)
    {
        var tenantService = new CurrentTenantService();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        var db = new ApplicationDbContext(options, tenantService);
        var tenant = new Tenant
        {
            Name = "Checkout Hotel", Code = $"CO-{Guid.NewGuid():N}", Slug = $"co-{Guid.NewGuid():N}",
            Address = "1 Checkout Street", City = "Da Nang", Status = TenantStatus.Active,
            SubscriptionTier = tier
        };
        tenantService.SetTenant(tenant.Id, tenant.SubscriptionTier);
        var roomType = new RoomType
        {
            TenantId = tenant.Id, Code = "DLX", Name = "Deluxe", BasePricePerNight = 1_000_000, IsActive = true
        };
        var room = new Room
        {
            TenantId = tenant.Id, RoomType = roomType, RoomTypeId = roomType.Id,
            RoomNumber = "101", Status = RoomStatus.Occupied, IsActive = true
        };
        var reservation = new Reservation
        {
            TenantId = tenant.Id, BookingCode = "LXS-CHECKOUT", GuestFullName = "Checkout Guest",
            GuestEmail = "checkout@example.com", GuestPhoneNumber = "0901234567",
            CheckInDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1)),
            CheckOutDate = DateOnly.FromDateTime(DateTime.UtcNow),
            Status = ReservationStatus.CheckedIn, TotalAmount = 1_000_000
        };
        reservation.Details.Add(new ReservationDetail
        {
            TenantId = tenant.Id, Reservation = reservation, ReservationId = reservation.Id,
            RoomType = roomType, RoomTypeId = roomType.Id, Room = room, RoomId = room.Id,
            NightlyPrice = 1_000_000, NumberOfNights = 1, SubTotal = 1_000_000
        });
        reservation.Folio = new Folio
        {
            TenantId = tenant.Id, Reservation = reservation, ReservationId = reservation.Id,
            FolioNumber = "FOL-LXS-CHECKOUT", TotalCharges = 1_000_000, TotalCredits = totalCredits
        };
        reservation.Folio.Items.Add(new FolioItem
        {
            TenantId = tenant.Id, Folio = reservation.Folio, FolioId = reservation.Folio.Id,
            ItemType = FolioItemType.RoomCharge, Description = "Tiền phòng", UnitPrice = 1_000_000, Quantity = 1
        });
        var service = new HotelService
        {
            TenantId = tenant.Id, Code = "MINIBAR", NameVi = "Minibar", Price = 150_000, IsActive = true
        };
        db.AddRange(tenant, roomType, room, reservation, service);
        await db.SaveChangesAsync();
        return new SetupResult(db, reservation, room, service);
    }

    private sealed record SetupResult(ApplicationDbContext Db, Reservation Reservation, Room Room, HotelService Service);
}
