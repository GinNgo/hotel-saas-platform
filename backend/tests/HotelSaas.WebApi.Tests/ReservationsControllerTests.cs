using HotelSaas.Application.DTOs.Reservations;
using HotelSaas.Application.DTOs.Rooms;
using HotelSaas.Application.Common.Models;
using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using HotelSaas.Infrastructure.Persistence;
using HotelSaas.Infrastructure.Services;
using HotelSaas.WebApi.Controllers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using Xunit;

namespace HotelSaas.WebApi.Tests;

public class ReservationsControllerTests
{
    [Theory]
    [InlineData(0)]
    [InlineData(11)]
    public async Task Hold_rejects_invalid_quantity(int quantity)
    {
        await using var db = CreateContext();
        var controller = new ReservationsController(db);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var response = await controller.CreateBookingHold(new(Guid.NewGuid(), Guid.NewGuid(), today.AddDays(1), today.AddDays(2), quantity), "invalid-quantity-key");

        Assert.IsType<BadRequestObjectResult>(response.Result);
    }

    [Fact]
    public async Task Hold_rejects_quantity_above_remaining_inventory()
    {
        var (tenant, roomType) = Inventory(1);
        await using var db = CreateContext(tenant);
        db.RoomTypes.Add(roomType);
        db.BookingHolds.Add(new BookingHold
        {
            TenantId = tenant.Id,
            RoomTypeId = roomType.Id,
            CheckInDate = DateTime.UtcNow.Date.AddDays(1),
            CheckOutDate = DateTime.UtcNow.Date.AddDays(3),
            Quantity = 1,
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(10)
        });
        await db.SaveChangesAsync();
        var controller = new ReservationsController(db);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var response = await controller.CreateBookingHold(new(tenant.Id, roomType.Id, today.AddDays(1), today.AddDays(3), 1), "inventory-hold-key");

        Assert.IsType<ConflictObjectResult>(response.Result);
    }

    [Fact]
    public async Task Hold_creation_is_idempotent_and_cannot_reuse_a_key_for_another_request()
    {
        var (tenant, roomType) = Inventory(2);
        await using var db = CreateContext(tenant);
        db.RoomTypes.Add(roomType);
        await db.SaveChangesAsync();
        var controller = new ReservationsController(db);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var request = new CreateBookingHoldRequestDto(tenant.Id, roomType.Id, today.AddDays(1), today.AddDays(3), 1);

        var first = await controller.CreateBookingHold(request, "shared-hold-key");
        var replay = await controller.CreateBookingHold(request, "shared-hold-key");
        var conflict = await controller.CreateBookingHold(request with { Quantity = 2 }, "shared-hold-key");

        var firstDto = Assert.IsType<Result<BookingHoldResponseDto>>(Assert.IsType<OkObjectResult>(first.Result).Value).Data!;
        var replayDto = Assert.IsType<Result<BookingHoldResponseDto>>(Assert.IsType<OkObjectResult>(replay.Result).Value).Data!;
        Assert.Equal(firstDto.HoldToken, replayDto.HoldToken);
        Assert.IsType<ConflictObjectResult>(conflict.Result);
        Assert.Single(db.BookingHolds.IgnoreQueryFilters());
    }

    [Fact]
    public async Task Hold_release_is_idempotent_but_cannot_release_a_converted_hold()
    {
        var (tenant, roomType) = Inventory(1);
        var active = new BookingHold { TenantId = tenant.Id, RoomTypeId = roomType.Id };
        var converted = new BookingHold { TenantId = tenant.Id, RoomTypeId = roomType.Id, IsConvertedToReservation = true };
        await using var db = CreateContext(tenant);
        db.AddRange(roomType, active, converted);
        await db.SaveChangesAsync();
        var controller = new ReservationsController(db);

        var released = await controller.ReleaseBookingHold(active.HoldToken);
        var replay = await controller.ReleaseBookingHold(active.HoldToken);
        var blocked = await controller.ReleaseBookingHold(converted.HoldToken);

        Assert.IsType<OkObjectResult>(released.Result);
        Assert.IsType<OkObjectResult>(replay.Result);
        Assert.True(active.IsReleased);
        Assert.IsType<ConflictObjectResult>(blocked.Result);
    }

    [Fact]
    public async Task Confirmed_hold_cannot_be_reused()
    {
        var (tenant, roomType) = Inventory(1);
        var hold = new BookingHold
        {
            TenantId = tenant.Id,
            RoomTypeId = roomType.Id,
            CheckInDate = DateTime.UtcNow.Date.AddDays(1),
            CheckOutDate = DateTime.UtcNow.Date.AddDays(2),
            Quantity = 1,
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(10)
        };
        await using var db = CreateContext(tenant);
        db.RoomTypes.Add(roomType);
        db.BookingHolds.Add(hold);
        await db.SaveChangesAsync();
        var controller = new ReservationsController(db);
        var request = new ConfirmBookingRequestDto(hold.HoldToken, "Nguyen Guest", "GUEST@EXAMPLE.COM", "0901234567", null, null, PaymentMethod.Cash, 1, 1);

        var first = await controller.ConfirmBooking(request);
        var second = await controller.ConfirmBooking(request);

        Assert.IsType<OkObjectResult>(first.Result);
        Assert.IsType<BadRequestObjectResult>(second.Result);
        Assert.Single(db.Reservations.IgnoreQueryFilters());
        Assert.Equal("guest@example.com", db.Reservations.IgnoreQueryFilters().Single().GuestEmail);
        Assert.Equal(1, db.Reservations.IgnoreQueryFilters().Single().AdultCount);
        Assert.Equal(1, db.Reservations.IgnoreQueryFilters().Single().ChildCount);
        Assert.Equal(PaymentMethod.Cash, db.Reservations.IgnoreQueryFilters().Single().PaymentMethodSnapshot);
    }

    [Fact]
    public async Task Customer_booking_converts_its_matching_hold_without_counting_it_as_competing_inventory()
    {
        var (tenant, roomType) = Inventory(1);
        await using var db = CreateContext(tenant);
        db.RoomTypes.Add(roomType);
        await db.SaveChangesAsync();
        var controller = new ReservationsController(db);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var holdResult = await controller.CreateBookingHold(new(tenant.Id, roomType.Id, today.AddDays(1), today.AddDays(3), 1), "customer-hold-key");
        var hold = Assert.IsType<Result<BookingHoldResponseDto>>(Assert.IsType<OkObjectResult>(holdResult.Result).Value).Data!;
        var request = new CustomerBookingRequest(roomType.Id, today.AddDays(1), today.AddDays(3), 2,
            "An", "Nguyen", "0901234567", "PAY_AT_HOTEL", Email: "guest@example.com", HoldToken: hold.HoldToken);

        var booked = await controller.Book(request, "hold-booking-key");

        Assert.IsType<OkObjectResult>(booked.Result);
        Assert.True((await db.BookingHolds.IgnoreQueryFilters().SingleAsync()).IsConvertedToReservation);
        Assert.Single(db.Reservations.IgnoreQueryFilters());
    }

    [Fact]
    public async Task Customer_booking_uses_the_price_locked_by_its_hold_when_the_promotion_changes()
    {
        var (tenant, roomType) = Inventory(1);
        tenant.TaxRatePercent = 8;
        tenant.ServiceFeeRatePercent = 5;
        var promotion = new Promotion
        {
            TenantId = tenant.Id, Code = "HOLD10", Title = "Giá giữ chỗ", DiscountPercent = 10,
            StartDateUtc = DateTime.UtcNow.AddDays(-1), EndDateUtc = DateTime.UtcNow.AddDays(1), IsActive = true
        };
        await using var db = CreateContext(tenant);
        db.AddRange(roomType, promotion);
        await db.SaveChangesAsync();
        var controller = new ReservationsController(db);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var holdResult = await controller.CreateBookingHold(
            new(tenant.Id, roomType.Id, today.AddDays(1), today.AddDays(3), 1, "hold10"), "locked-price-hold-key");
        var hold = Assert.IsType<Result<BookingHoldResponseDto>>(Assert.IsType<OkObjectResult>(holdResult.Result).Value).Data!;
        promotion.IsActive = false;
        await db.SaveChangesAsync();
        var request = new CustomerBookingRequest(roomType.Id, today.AddDays(1), today.AddDays(3), 2,
            "An", "Nguyen", "0901234567", "PAY_AT_HOTEL", CouponCode: "HOLD10",
            Email: "guest@example.com", HoldToken: hold.HoldToken);

        var mismatchedCoupon = await controller.Book(request with { CouponCode = null }, "mismatched-coupon-key");
        var booked = await controller.Book(request, "locked-price-booking-key");

        Assert.IsType<ConflictObjectResult>(mismatchedCoupon.Result);
        var booking = Assert.IsType<CustomerBookingDto>(Assert.IsType<OkObjectResult>(booked.Result).Value);
        Assert.Equal(144_000, hold.TaxAmount);
        Assert.Equal(90_000, hold.FeeAmount);
        Assert.Equal(2_034_000, hold.EstimatedTotal);
        Assert.Equal(hold.EstimatedTotal, booking.TotalAmount);
        var folio = await db.Folios.IgnoreQueryFilters().Include(item => item.Items).SingleAsync();
        Assert.Contains(folio.Items, item => item.ItemType == FolioItemType.Discount && item.UnitPrice == -200_000);
        Assert.Contains(folio.Items, item => item.ItemType == FolioItemType.Tax && item.UnitPrice == 144_000);
        Assert.Contains(folio.Items, item => item.ItemType == FolioItemType.ServiceCharge && item.UnitPrice == 90_000);
    }

    [Fact]
    public async Task Customer_booking_uses_nightly_rate_snapshot_when_override_changes_after_hold()
    {
        var (tenant, roomType) = Inventory(1);
        await using var db = CreateContext(tenant);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var checkIn = today.AddDays(1);
        var rate = new RoomRateOverride
        {
            TenantId = tenant.Id, RoomTypeId = roomType.Id, StartDate = checkIn, EndDate = checkIn,
            NightlyPrice = 1_400_000, Priority = 10
        };
        db.AddRange(roomType, rate);
        await db.SaveChangesAsync();
        var controller = new ReservationsController(db);
        var holdResult = await controller.CreateBookingHold(
            new(tenant.Id, roomType.Id, checkIn, checkIn.AddDays(2), 1), "nightly-snapshot-hold-key");
        var holdDto = Assert.IsType<Result<BookingHoldResponseDto>>(Assert.IsType<OkObjectResult>(holdResult.Result).Value).Data!;
        var hold = await db.BookingHolds.IgnoreQueryFilters().SingleAsync();
        rate.NightlyPrice = 2_000_000;
        await db.SaveChangesAsync();

        var request = new CustomerBookingRequest(roomType.Id, checkIn, checkIn.AddDays(2), 2,
            "An", "Nguyen", "0901234567", "PAY_AT_HOTEL", Email: "guest@example.com", HoldToken: holdDto.HoldToken);
        var booked = await controller.Book(request, "nightly-snapshot-booking-key");

        var booking = Assert.IsType<CustomerBookingDto>(Assert.IsType<OkObjectResult>(booked.Result).Value);
        Assert.Equal(2_400_000, hold.FinalTotal);
        Assert.Equal(hold.FinalTotal, booking.TotalAmount);
        Assert.Contains("1400000", hold.NightlyRateBreakdownJson);
        Assert.DoesNotContain("2000000", hold.NightlyRateBreakdownJson);
    }

    [Fact]
    public async Task Confirm_booking_uses_hold_total_when_base_price_changes_after_hold()
    {
        var (tenant, roomType) = Inventory(1);
        await using var db = CreateContext(tenant);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var checkIn = today.AddDays(1);
        db.Add(roomType);
        await db.SaveChangesAsync();
        var controller = new ReservationsController(db);
        var holdResult = await controller.CreateBookingHold(
            new(tenant.Id, roomType.Id, checkIn, checkIn.AddDays(2), 1), "confirm-snapshot-hold-key");
        var holdDto = Assert.IsType<Result<BookingHoldResponseDto>>(Assert.IsType<OkObjectResult>(holdResult.Result).Value).Data!;
        var savedHold = await db.BookingHolds.IgnoreQueryFilters().SingleAsync();
        Assert.Equal(2_000_000, savedHold.FinalTotal);
        roomType.BasePricePerNight = 2_000_000;
        await db.SaveChangesAsync();

        var confirmed = await controller.ConfirmBooking(new ConfirmBookingRequestDto(
            holdDto.HoldToken, "Nguyen Guest", "guest@example.com", "0901234567", null, null, PaymentMethod.Cash, 1, 0));

        var booking = Assert.IsType<ReservationDto>(Assert.IsType<Result<ReservationDto>>(Assert.IsType<OkObjectResult>(confirmed.Result).Value).Data);
        Assert.Equal(2_000_000, booking.TotalAmount);
        var reservation = await db.Reservations.IgnoreQueryFilters().Include(item => item.Details).SingleAsync();
        Assert.Equal(1_000_000, reservation.Details.Single().NightlyPrice);
    }

    [Fact]
    public async Task Guest_resends_confirmation_email_only_with_the_booking_capability()
    {
        var (tenant, roomType) = Inventory(1);
        var reservation = ReservationFor(tenant, roomType, ReservationStatus.Confirmed, DateOnly.FromDateTime(DateTime.UtcNow));
        reservation.BookingCode = reservation.BookingCode.ToUpperInvariant();
        reservation.GuestAccessKey = "guest-email-capability";
        reservation.ConfirmationEmailStatus = "FAILED";
        await using var db = CreateContext(tenant);
        db.AddRange(roomType, reservation);
        await db.SaveChangesAsync();
        var controller = new ReservationsController(db, new SuccessfulEmailDelivery());

        var denied = await controller.ResendGuestConfirmationEmail(reservation.BookingCode, "wrong-capability");
        var sent = await controller.ResendGuestConfirmationEmail(reservation.BookingCode, reservation.GuestAccessKey);

        Assert.IsType<NotFoundObjectResult>(denied.Result);
        var booking = Assert.IsType<CustomerBookingDto>(Assert.IsType<OkObjectResult>(sent.Result).Value);
        Assert.Equal("SENT", booking.ConfirmationEmailStatus);
        Assert.True(booking.ConfirmationEmailSent);
        Assert.NotNull(reservation.ConfirmationEmailSentAtUtc);
    }

    [Fact]
    public async Task Customer_booking_rejects_an_expired_or_mismatched_hold()
    {
        var (tenant, roomType) = Inventory(2);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var expired = new BookingHold
        {
            TenantId = tenant.Id, RoomTypeId = roomType.Id, Quantity = 1,
            CheckInDate = today.AddDays(1).ToDateTime(TimeOnly.MinValue),
            CheckOutDate = today.AddDays(3).ToDateTime(TimeOnly.MinValue),
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(-1)
        };
        await using var db = CreateContext(tenant);
        db.AddRange(roomType, expired);
        await db.SaveChangesAsync();
        var controller = new ReservationsController(db);
        var request = new CustomerBookingRequest(roomType.Id, today.AddDays(1), today.AddDays(3), 2,
            "An", "Nguyen", "0901234567", "PAY_AT_HOTEL", Email: "guest@example.com", HoldToken: expired.HoldToken);

        var expiredResult = await controller.Book(request, "expired-hold-key");
        expired.ExpiresAtUtc = DateTime.UtcNow.AddMinutes(10);
        await db.SaveChangesAsync();
        var mismatchResult = await controller.Book(request with { Quantity = 2 }, "mismatch-hold-key");

        Assert.IsType<ConflictObjectResult>(expiredResult.Result);
        Assert.IsType<ConflictObjectResult>(mismatchResult.Result);
        Assert.Empty(db.Reservations.IgnoreQueryFilters());
    }

    [Fact]
    public async Task Search_subtracts_confirmed_inventory_even_before_physical_room_assignment()
    {
        var (tenant, roomType) = Inventory(1);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var reservation = new Reservation
        {
            TenantId = tenant.Id,
            BookingCode = "LXS-TEST-001",
            GuestFullName = "Nguyen Guest",
            GuestEmail = "guest@example.com",
            GuestPhoneNumber = "0901234567",
            CheckInDate = today.AddDays(1),
            CheckOutDate = today.AddDays(2),
            Status = ReservationStatus.Confirmed,
            TotalAmount = roomType.BasePricePerNight
        };
        reservation.Details.Add(new ReservationDetail
        {
            TenantId = tenant.Id,
            RoomTypeId = roomType.Id,
            NightlyPrice = roomType.BasePricePerNight,
            NumberOfNights = 1,
            SubTotal = roomType.BasePricePerNight
        });
        await using var db = CreateContext(tenant);
        db.RoomTypes.Add(roomType);
        db.Reservations.Add(reservation);
        await db.SaveChangesAsync();
        var controller = new RoomsController(db);

        var response = await controller.SearchRooms(new SearchRoomsQueryDto(null, tenant.Id, today.AddDays(1), today.AddDays(2)));

        var ok = Assert.IsType<OkObjectResult>(response.Result);
        var result = Assert.IsType<Result<List<AvailableRoomResultDto>>>(ok.Value);
        Assert.Empty(result.Data!);
    }

    [Fact]
    public async Task Search_releases_inventory_immediately_when_pending_payment_window_expires()
    {
        var (tenant, roomType) = Inventory(1);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var reservation = ReservationFor(tenant, roomType, ReservationStatus.PendingPayment, today.AddDays(1));
        await using var db = CreateContext(tenant);
        db.AddRange(roomType, reservation);
        await db.SaveChangesAsync();
        reservation.CreatedAtUtc = DateTime.UtcNow.AddMinutes(-16);
        await db.SaveChangesAsync();
        var controller = new RoomsController(db);

        var response = await controller.SearchRooms(new SearchRoomsQueryDto(null, tenant.Id, today.AddDays(1), today.AddDays(2)));

        var result = Assert.IsType<Result<List<AvailableRoomResultDto>>>(Assert.IsType<OkObjectResult>(response.Result).Value);
        Assert.Single(result.Data!);
    }

    [Fact]
    public async Task Manual_confirmation_requires_completed_payment_covering_total()
    {
        var (tenant, roomType) = Inventory(1);
        var reservation = ReservationFor(tenant, roomType, ReservationStatus.PendingPayment);
        await using var db = CreateContext(tenant);
        db.AddRange(roomType, reservation);
        await db.SaveChangesAsync();
        var controller = new ReservationsController(db);

        var blocked = await controller.UpdateStatus(reservation.Id, "CONFIRMED");
        var payment = new Payment
        {
            TenantId = tenant.Id, ReservationId = reservation.Id,
            Amount = reservation.TotalAmount, Status = PaymentStatus.Completed, Method = PaymentMethod.VNPay
        };
        reservation.Payments.Add(payment);
        db.Payments.Add(payment);
        await db.SaveChangesAsync();
        var confirmed = await controller.UpdateStatus(reservation.Id, "CONFIRMED");

        Assert.IsType<ConflictObjectResult>(blocked.Result);
        Assert.IsType<OkObjectResult>(confirmed.Result);
        Assert.Equal(ReservationStatus.Confirmed, reservation.Status);
    }

    [Fact]
    public async Task Check_in_allocates_clean_rooms_of_matching_type()
    {
        var (tenant, roomType) = Inventory(1);
        var reservation = ReservationFor(tenant, roomType, ReservationStatus.Confirmed, DateOnly.FromDateTime(DateTime.UtcNow));
        await using var db = CreateContext(tenant);
        db.AddRange(roomType, reservation);
        await db.SaveChangesAsync();
        var controller = new ReservationsController(db);

        var response = await controller.CheckIn(reservation.Id);

        Assert.IsType<OkObjectResult>(response.Result);
        Assert.Equal(ReservationStatus.CheckedIn, reservation.Status);
        Assert.NotNull(reservation.Details.Single().RoomId);
        Assert.Equal(RoomStatus.Occupied, roomType.Rooms.Single().Status);
    }

    [Fact]
    public async Task Check_in_does_not_take_a_room_preassigned_to_an_overlapping_booking()
    {
        var (tenant, roomType) = Inventory(2);
        var start = DateOnly.FromDateTime(DateTime.UtcNow);
        var preassigned = ReservationFor(tenant, roomType, ReservationStatus.Confirmed, start);
        preassigned.Details.Single().RoomId = roomType.Rooms.First().Id;
        preassigned.Details.Single().Room = roomType.Rooms.First();
        var arriving = ReservationFor(tenant, roomType, ReservationStatus.Confirmed, DateOnly.FromDateTime(DateTime.UtcNow));
        await using var db = CreateContext(tenant);
        db.AddRange(roomType, preassigned, arriving);
        await db.SaveChangesAsync();
        var controller = StaffController(db, tenant.Id);

        var result = await controller.CheckIn(arriving.Id);

        Assert.IsType<OkObjectResult>(result.Result);
        Assert.Equal(roomType.Rooms.Last().Id, arriving.Details.Single().RoomId);
        Assert.Equal(RoomStatus.Clean, roomType.Rooms.First().Status);
        Assert.Equal(RoomStatus.Occupied, roomType.Rooms.Last().Status);
    }

    [Fact]
    public async Task Check_in_rejects_a_legacy_room_assignment_that_now_overlaps_another_booking()
    {
        var (tenant, roomType) = Inventory(1);
        var start = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(1);
        var first = ReservationFor(tenant, roomType, ReservationStatus.Confirmed, DateOnly.FromDateTime(DateTime.UtcNow));
        var second = ReservationFor(tenant, roomType, ReservationStatus.Confirmed, DateOnly.FromDateTime(DateTime.UtcNow));
        foreach (var reservation in new[] { first, second })
        {
            reservation.Details.Single().RoomId = roomType.Rooms.Single().Id;
            reservation.Details.Single().Room = roomType.Rooms.Single();
        }
        await using var db = CreateContext(tenant);
        db.AddRange(roomType, first, second);
        await db.SaveChangesAsync();
        var controller = StaffController(db, tenant.Id);

        var result = await controller.CheckIn(second.Id);

        Assert.IsType<ConflictObjectResult>(result.Result);
        Assert.Equal(ReservationStatus.Confirmed, second.Status);
        Assert.Equal(RoomStatus.Clean, roomType.Rooms.Single().Status);
    }

    [Fact]
    public async Task Check_in_rejects_a_future_arrival_without_mutating_inventory()
    {
        var (tenant, roomType) = Inventory(1);
        var reservation = ReservationFor(tenant, roomType, ReservationStatus.Confirmed, DateOnly.FromDateTime(DateTime.UtcNow).AddDays(1));
        await using var db = CreateContext(tenant);
        db.AddRange(roomType, reservation);
        await db.SaveChangesAsync();
        var controller = StaffController(db, tenant.Id);

        var result = await controller.CheckIn(reservation.Id);

        Assert.IsType<ConflictObjectResult>(result.Result);
        var conflict = (ConflictObjectResult)result.Result!;
        var code = conflict.Value!.GetType().GetProperty("code")?.GetValue(conflict.Value)?.ToString();
        Assert.Equal("CHECK_IN_TOO_EARLY", code);
        Assert.Equal(ReservationStatus.Confirmed, reservation.Status);
        Assert.Equal(RoomStatus.Clean, roomType.Rooms.Single().Status);
    }

    [Fact]
    public async Task Staff_can_preassign_a_matching_room_without_overlapping_another_stay()
    {
        var (tenant, roomType) = Inventory(2);
        var start = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(5);
        var existing = ReservationFor(tenant, roomType, ReservationStatus.Confirmed, start);
        existing.Details.Single().RoomId = roomType.Rooms.First().Id;
        existing.Details.Single().Room = roomType.Rooms.First();
        var target = ReservationFor(tenant, roomType, ReservationStatus.Confirmed, start);
        await using var db = CreateContext(tenant);
        db.AddRange(roomType, existing, target);
        await db.SaveChangesAsync();
        var controller = StaffController(db, tenant.Id);

        var result = await controller.AssignRooms(target.Id);

        Assert.IsType<OkObjectResult>(result.Result);
        Assert.Equal(roomType.Rooms.Last().Id, target.Details.Single().RoomId);
        Assert.Equal(RoomStatus.Clean, roomType.Rooms.Last().Status);
    }

    [Fact]
    public async Task Preassignment_failure_does_not_partially_assign_a_multi_room_booking()
    {
        var (tenant, roomType) = Inventory(1);
        var target = ReservationFor(tenant, roomType, ReservationStatus.Confirmed);
        target.Details.Add(new ReservationDetail
        {
            TenantId = tenant.Id, Reservation = target, ReservationId = target.Id,
            RoomType = roomType, RoomTypeId = roomType.Id, NightlyPrice = roomType.BasePricePerNight,
            NumberOfNights = 1, SubTotal = roomType.BasePricePerNight
        });
        await using var db = CreateContext(tenant);
        db.AddRange(roomType, target);
        await db.SaveChangesAsync();
        var controller = StaffController(db, tenant.Id);

        var result = await controller.AssignRooms(target.Id);

        Assert.IsType<ConflictObjectResult>(result.Result);
        Assert.All(target.Details, detail => Assert.Null(detail.RoomId));
    }

    [Fact]
    public async Task Operational_cancel_rejects_collected_payment()
    {
        var (tenant, roomType) = Inventory(1);
        var reservation = ReservationFor(tenant, roomType, ReservationStatus.Confirmed);
        reservation.Payments.Add(new Payment
        {
            TenantId = tenant.Id, ReservationId = reservation.Id,
            Amount = reservation.TotalAmount, Status = PaymentStatus.Completed, Method = PaymentMethod.Cash
        });
        await using var db = CreateContext(tenant);
        db.AddRange(roomType, reservation);
        await db.SaveChangesAsync();
        var controller = new ReservationsController(db);

        var response = await controller.CancelOperational(reservation.Id);

        Assert.IsType<ConflictObjectResult>(response.Result);
        Assert.Equal(ReservationStatus.Confirmed, reservation.Status);
    }

    [Fact]
    public async Task No_show_releases_reservation_inventory_from_search()
    {
        var (tenant, roomType) = Inventory(1);
        var reservation = ReservationFor(tenant, roomType, ReservationStatus.Confirmed, DateOnly.FromDateTime(DateTime.UtcNow));
        await using var db = CreateContext(tenant);
        db.AddRange(roomType, reservation);
        await db.SaveChangesAsync();
        var controller = new ReservationsController(db);

        var response = await controller.MarkNoShow(reservation.Id);

        Assert.IsType<OkObjectResult>(response.Result);
        Assert.Equal(ReservationStatus.NoShow, reservation.Status);
    }

    [Fact]
    public async Task No_show_rejects_a_future_arrival_without_mutating_reservation()
    {
        var (tenant, roomType) = Inventory(1);
        var reservation = ReservationFor(tenant, roomType, ReservationStatus.Confirmed,
            DateOnly.FromDateTime(DateTime.UtcNow).AddDays(1));
        await using var db = CreateContext(tenant);
        db.AddRange(roomType, reservation);
        await db.SaveChangesAsync();
        var controller = new ReservationsController(db);

        var response = await controller.MarkNoShow(reservation.Id);

        Assert.IsType<ConflictObjectResult>(response.Result);
        Assert.Equal(ReservationStatus.Confirmed, reservation.Status);
    }

    [Fact]
    public async Task Customer_booking_replays_same_idempotency_key_without_consuming_inventory_twice()
    {
        var (tenant, roomType) = Inventory(2);
        var customer = Customer();
        await using var db = CreateContext(tenant);
        db.AddRange(roomType, customer, new PropertyPaymentConfiguration
        {
            TenantId = tenant.Id,
            Enabled = true,
            Environment = "SIMULATOR",
            MethodsJson = "[{\"Method\":\"VNPAY\",\"Enabled\":true,\"Provider\":\"VNPAY\"}]"
        });
        await db.SaveChangesAsync();
        var controller = CustomerController(db, customer);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var request = new CustomerBookingRequest(roomType.Id, today.AddDays(1), today.AddDays(2), 2,
            "An", "Nguyen", "0901234567", "VNPAY", 1);

        var first = await controller.Book(request, "booking-key");
        var replay = await controller.Book(request, "booking-key");
        var conflictingReplay = await controller.Book(request with { CheckOutDate = request.CheckOutDate.AddDays(1) }, "booking-key");
        var changedCoupon = await controller.Book(request with { CouponCode = "SAVE10" }, "booking-key");
        var changedSpecialRequests = await controller.Book(request with { SpecialRequests = "Late arrival" }, "booking-key");

        var firstDto = Assert.IsType<CustomerBookingDto>(Assert.IsType<OkObjectResult>(first.Result).Value);
        var replayDto = Assert.IsType<CustomerBookingDto>(Assert.IsType<OkObjectResult>(replay.Result).Value);
        Assert.Equal(firstDto.Id, replayDto.Id);
        Assert.IsType<ConflictObjectResult>(conflictingReplay.Result);
        Assert.IsType<ConflictObjectResult>(changedCoupon.Result);
        Assert.IsType<ConflictObjectResult>(changedSpecialRequests.Result);
        Assert.StartsWith("LXS-", firstDto.BookingCode);
        Assert.Equal(23, firstDto.BookingCode.Length);
        Assert.Equal(2, firstDto.Guests);
        Assert.Equal(2, firstDto.Adults);
        Assert.Equal(0, firstDto.Children);
        Assert.Equal("VNPAY", firstDto.PaymentMethod);
        Assert.Single(db.Reservations.IgnoreQueryFilters());
        var stored = db.Reservations.IgnoreQueryFilters().Single();
        Assert.Equal(customer.Id, stored.CustomerUserId);
        Assert.Equal(64, stored.ClientRequestFingerprint?.Length);
    }

    [Fact]
    public async Task Customer_booking_rejects_disabled_or_unknown_payment_method_before_creating_reservation()
    {
        var (tenant, roomType) = Inventory(1);
        await using var db = CreateContext(tenant);
        db.AddRange(roomType, new PropertyPaymentConfiguration
        {
            TenantId = tenant.Id,
            Enabled = true,
            Environment = "SIMULATOR",
            MethodsJson = "[{\"Method\":\"CASH\",\"Enabled\":true,\"Provider\":\"CASH\"},{\"Method\":\"VNPAY\",\"Enabled\":false,\"Provider\":\"VNPAY\"}]"
        });
        await db.SaveChangesAsync();
        var controller = new ReservationsController(db);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var request = new CustomerBookingRequest(roomType.Id, today.AddDays(1), today.AddDays(2), 2,
            "An", "Nguyen", "0901234567", "VNPAY", Email: "guest@example.com");

        var disabled = await controller.Book(request, "disabled-method-key");
        var unknown = await controller.Book(request with { PaymentMethod = "FAKE_WALLET" }, "unknown-method-key");

        Assert.IsType<ConflictObjectResult>(disabled.Result);
        Assert.IsType<BadRequestObjectResult>(unknown.Result);
        Assert.Empty(db.Reservations.IgnoreQueryFilters());
    }

    [Fact]
    public async Task Customer_booking_requires_a_bounded_idempotency_capability()
    {
        var (tenant, roomType) = Inventory(1);
        await using var db = CreateContext(tenant);
        db.RoomTypes.Add(roomType);
        await db.SaveChangesAsync();
        var controller = new ReservationsController(db);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var request = new CustomerBookingRequest(roomType.Id, today.AddDays(1), today.AddDays(2), 2,
            "An", "Nguyen", "0901234567", "PAY_AT_HOTEL");

        var missing = await controller.Book(request, null);
        var tooShort = await controller.Book(request, "short");

        Assert.IsType<BadRequestObjectResult>(missing.Result);
        Assert.IsType<BadRequestObjectResult>(tooShort.Result);
        Assert.Empty(db.Reservations.IgnoreQueryFilters());
    }

    [Fact]
    public async Task Guest_booking_requires_and_normalizes_confirmation_email()
    {
        var (tenant, roomType) = Inventory(2);
        await using var db = CreateContext(tenant);
        db.RoomTypes.Add(roomType);
        await db.SaveChangesAsync();
        var controller = new ReservationsController(db);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var request = new CustomerBookingRequest(roomType.Id, today.AddDays(1), today.AddDays(2), 2,
            "An", "Nguyen", "0901234567", "PAY_AT_HOTEL", Email: " Guest@Example.COM ");

        var invalid = await controller.Book(request with { Email = "not-an-email" }, "guest-email-invalid");
        var created = await controller.Book(request, "guest-email-valid");
        var changedEmail = await controller.Book(request with { Email = "other@example.com" }, "guest-email-valid");

        Assert.IsType<BadRequestObjectResult>(invalid.Result);
        var booking = Assert.IsType<CustomerBookingDto>(Assert.IsType<OkObjectResult>(created.Result).Value);
        var stored = Assert.Single(db.Reservations.IgnoreQueryFilters());
        Assert.Equal(booking.Id, stored.Id);
        Assert.Equal("guest@example.com", stored.GuestEmail);
        Assert.Null(stored.CustomerUserId);
        Assert.NotNull(booking.GuestAccessKey);
        Assert.Equal(43, booking.GuestAccessKey.Length);
        Assert.NotEqual(stored.ClientRequestKey, booking.GuestAccessKey);
        Assert.Equal("NOT_CONFIGURED", booking.ConfirmationEmailStatus);
        Assert.Equal("guest@example.com", booking.ConfirmationEmailRecipient);
        Assert.False(booking.ConfirmationEmailSent);
        Assert.IsType<ConflictObjectResult>(changedEmail.Result);
    }

    [Fact]
    public async Task Guest_can_recover_a_fresh_capability_with_matching_contact_details()
    {
        var (tenant, roomType) = Inventory(1);
        var reservation = ReservationFor(tenant, roomType, ReservationStatus.Confirmed);
        reservation.BookingCode = "LXS-20260819-RECOVER123";
        reservation.GuestEmail = "guest@example.com";
        reservation.GuestPhoneNumber = "0901234567";
        reservation.ClientRequestKey = "original-idempotency-key";
        await using var db = CreateContext(tenant);
        db.AddRange(roomType, reservation);
        await db.SaveChangesAsync();
        var controller = new ReservationsController(db);

        var wrongEmail = await controller.RecoverGuestBooking(new(reservation.BookingCode, "other@example.com", reservation.GuestPhoneNumber));
        var wrongPhone = await controller.RecoverGuestBooking(new(reservation.BookingCode, reservation.GuestEmail, "0999999999"));
        var recovered = await controller.RecoverGuestBooking(new(reservation.BookingCode.ToLowerInvariant(), " GUEST@EXAMPLE.COM ", " 0901234567 "));

        Assert.IsType<NotFoundObjectResult>(wrongEmail.Result);
        Assert.IsType<NotFoundObjectResult>(wrongPhone.Result);
        var booking = Assert.IsType<CustomerBookingDto>(Assert.IsType<OkObjectResult>(recovered.Result).Value);
        Assert.NotNull(booking.GuestAccessKey);
        Assert.Equal(43, booking.GuestAccessKey.Length);
        Assert.NotEqual(reservation.ClientRequestKey, booking.GuestAccessKey);
        Assert.IsType<OkObjectResult>((await controller.GuestBooking(reservation.BookingCode, booking.GuestAccessKey)).Result);
    }

    [Fact]
    public async Task Guest_booking_lookup_requires_matching_booking_code_and_access_key()
    {
        var (tenant, roomType) = Inventory(1);
        var reservation = ReservationFor(tenant, roomType, ReservationStatus.Confirmed);
        reservation.BookingCode = "LXS-20260819-GUEST12345";
        reservation.ClientRequestKey = "guest-access-key";
        await using var db = CreateContext(tenant);
        db.AddRange(roomType, reservation);
        await db.SaveChangesAsync();
        var controller = new ReservationsController(db);

        var wrongKey = await controller.GuestBooking(reservation.BookingCode, "wrong-access-key");
        var wrongCode = await controller.GuestBooking("LXS-20260819-MISSING0000", "guest-access-key");
        var allowed = await controller.GuestBooking(reservation.BookingCode.ToLowerInvariant(), "guest-access-key");

        Assert.IsType<NotFoundObjectResult>(wrongKey.Result);
        Assert.IsType<NotFoundObjectResult>(wrongCode.Result);
        var booking = Assert.IsType<CustomerBookingDto>(Assert.IsType<OkObjectResult>(allowed.Result).Value);
        Assert.Equal(reservation.BookingCode, booking.BookingCode);
        Assert.Equal(reservation.Id, booking.Id);
    }

    [Fact]
    public async Task Guest_can_cancel_paid_booking_and_create_refund_with_capability()
    {
        var (tenant, roomType) = Inventory(2);
        var cancellable = ReservationFor(tenant, roomType, ReservationStatus.Confirmed);
        cancellable.BookingCode = "LXS-20260819-CANCEL1234";
        cancellable.ClientRequestKey = "cancel-access-key";
        var paid = ReservationFor(tenant, roomType, ReservationStatus.Confirmed);
        paid.BookingCode = "LXS-20260819-PAID123456";
        paid.ClientRequestKey = "paid-access-key";
        paid.Payments.Add(new Payment
        {
            TenantId = tenant.Id, ReservationId = paid.Id, Amount = paid.TotalAmount,
            Status = PaymentStatus.Completed, Method = PaymentMethod.VNPay
        });
        await using var db = CreateContext(tenant);
        db.AddRange(roomType, cancellable, paid);
        await db.SaveChangesAsync();
        var controller = new ReservationsController(db);

        var wrongKey = await controller.CancelGuestBooking(cancellable.BookingCode, new("CHANGE_OF_PLAN", null), "wrong-key");
        var cancelled = await controller.CancelGuestBooking(cancellable.BookingCode, new("CHANGE_OF_PLAN", null), "cancel-access-key");
        var cancelledPaid = await controller.CancelGuestBooking(
            paid.BookingCode, new("CHANGE_OF_PLAN", null), "paid-access-key", "guest-cancel-paid-01");

        Assert.IsType<NotFoundObjectResult>(wrongKey.Result);
        var booking = Assert.IsType<CustomerBookingDto>(Assert.IsType<OkObjectResult>(cancelled.Result).Value);
        Assert.Equal("CANCELLED", booking.Status);
        Assert.Equal("CHANGE_OF_PLAN", booking.CancellationReasonCode);
        var paidBooking = Assert.IsType<CustomerBookingDto>(Assert.IsType<OkObjectResult>(cancelledPaid.Result).Value);
        Assert.Equal("CANCELLED", paidBooking.Status);
        var refund = Assert.Single(paidBooking.Refunds!);
        Assert.Equal("PENDING_APPROVAL", refund.Status);
        Assert.Equal(paid.TotalAmount, refund.Amount);
    }

    [Fact]
    public async Task My_bookings_only_returns_authenticated_customers_reservations()
    {
        var (tenant, roomType) = Inventory(2);
        var customer = Customer();
        var other = Customer();
        var mine = ReservationFor(tenant, roomType, ReservationStatus.Confirmed);
        mine.CustomerUserId = customer.Id;
        var theirs = ReservationFor(tenant, roomType, ReservationStatus.Confirmed);
        theirs.CustomerUserId = other.Id;
        await using var db = CreateContext(tenant);
        db.AddRange(roomType, customer, other, mine, theirs);
        await db.SaveChangesAsync();
        var controller = CustomerController(db, customer);

        var response = await controller.MyBookings();

        var bookings = Assert.IsType<List<CustomerBookingDto>>(Assert.IsType<OkObjectResult>(response.Result).Value);
        Assert.Single(bookings);
        Assert.Equal(mine.Id, bookings[0].Id);
    }

    [Fact]
    public async Task My_bookings_materializes_payment_timeout_state()
    {
        var (tenant, roomType) = Inventory(1);
        var customer = Customer();
        var reservation = ReservationFor(tenant, roomType, ReservationStatus.PendingPayment);
        reservation.CustomerUserId = customer.Id;
        reservation.Payments.Add(new Payment
        {
            TenantId = tenant.Id, ReservationId = reservation.Id,
            Amount = reservation.TotalAmount, Status = PaymentStatus.Pending, Method = PaymentMethod.VNPay
        });
        await using var db = CreateContext(tenant);
        db.AddRange(roomType, customer, reservation);
        await db.SaveChangesAsync();
        reservation.CreatedAtUtc = DateTime.UtcNow.AddMinutes(-16);
        await db.SaveChangesAsync();
        var controller = CustomerController(db, customer);

        var response = await controller.MyBookings();

        var booking = Assert.Single(Assert.IsType<List<CustomerBookingDto>>(Assert.IsType<OkObjectResult>(response.Result).Value));
        Assert.Equal("CANCELLED", booking.Status);
        Assert.Equal("PAYMENT_TIMEOUT", booking.CancellationReasonCode);
        Assert.Equal(PaymentStatus.Expired, reservation.Payments.Single().Status);
    }

    [Fact]
    public async Task Customer_cancels_paid_booking_and_creates_idempotent_refund_request()
    {
        var (tenant, roomType) = Inventory(1);
        var customer = Customer();
        var reservation = ReservationFor(tenant, roomType, ReservationStatus.Confirmed);
        reservation.CustomerUserId = customer.Id;
        reservation.Payments.Add(new Payment
        {
            TenantId = tenant.Id, ReservationId = reservation.Id,
            Amount = reservation.TotalAmount, Status = PaymentStatus.Completed, Method = PaymentMethod.VNPay
        });
        await using var db = CreateContext(tenant);
        db.AddRange(roomType, customer, reservation);
        await db.SaveChangesAsync();
        var controller = CustomerController(db, customer);

        var response = await controller.CancelMine(reservation.Id, new("CHANGE_OF_PLAN", null), "customer-cancel-paid-01");
        var replay = await controller.CancelMine(reservation.Id, new("CHANGE_OF_PLAN", null), "customer-cancel-paid-01");

        var booking = Assert.IsType<CustomerBookingDto>(Assert.IsType<OkObjectResult>(response.Result).Value);
        Assert.IsType<OkObjectResult>(replay.Result);
        Assert.Equal("CANCELLED", booking.Status);
        Assert.Equal("PENDING_APPROVAL", Assert.Single(booking.Refunds!).Status);
        Assert.Single(db.PropertyRefunds.IgnoreQueryFilters());
    }

    [Fact]
    public async Task Customer_booking_uses_same_server_promotion_price_as_public_quote()
    {
        var (tenant, roomType) = Inventory(1);
        var customer = Customer();
        await using var db = CreateContext(tenant);
        db.AddRange(roomType, customer, new Promotion
        {
            TenantId = tenant.Id, Code = "SAVE10", Title = "Giảm 10%", DiscountPercent = 10,
            StartDateUtc = DateTime.UtcNow.AddDays(-1), EndDateUtc = DateTime.UtcNow.AddDays(1), IsActive = true
        });
        await db.SaveChangesAsync();
        var controller = CustomerController(db, customer);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var response = await controller.Book(new(roomType.Id, today.AddDays(1), today.AddDays(3), 2,
            "An", "Nguyen", "0901234567", "PAY_AT_HOTEL", 1, 2, 0, null, "save10"), "priced-booking");

        var booking = Assert.IsType<CustomerBookingDto>(Assert.IsType<OkObjectResult>(response.Result).Value);
        Assert.Equal(1_800_000, booking.TotalAmount);
        var reservation = db.Reservations.IgnoreQueryFilters().Include(item => item.Folio).ThenInclude(item => item!.Items).Single();
        Assert.Equal(1_800_000, reservation.Folio!.TotalCharges);
        Assert.Contains(reservation.Folio.Items, item => item.ItemType == FolioItemType.Discount && item.UnitPrice == -200_000);
    }

    [Fact]
    public async Task Booking_snapshots_non_refundable_policy_and_blocks_customer_cancellation()
    {
        var (tenant, roomType) = Inventory(1);
        roomType.IsRefundable = false;
        roomType.FreeCancellationHours = 0;
        var customer = Customer();
        await using var db = CreateContext(tenant);
        db.AddRange(roomType, customer);
        await db.SaveChangesAsync();
        var controller = CustomerController(db, customer);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var booked = await controller.Book(new(roomType.Id, today.AddDays(3), today.AddDays(4), 2,
            "An", "Nguyen", "0901234567", "PAY_AT_HOTEL"), "non-refundable");
        var booking = Assert.IsType<CustomerBookingDto>(Assert.IsType<OkObjectResult>(booked.Result).Value);
        var cancelled = await controller.CancelMine(booking.Id, new("CHANGE_OF_PLAN", null));

        Assert.False(booking.IsRefundable);
        Assert.False(booking.CanSelfCancel);
        Assert.Contains("không áp dụng hoàn hủy", booking.CancellationBlockReason);
        Assert.IsType<ConflictObjectResult>(cancelled.Result);
        Assert.Equal(ReservationStatus.Confirmed, db.Reservations.IgnoreQueryFilters().Single().Status);
    }

    [Fact]
    public async Task Customer_cancellation_is_blocked_after_snapshotted_free_cancellation_deadline()
    {
        var (tenant, roomType) = Inventory(1);
        var customer = Customer();
        var reservation = ReservationFor(tenant, roomType, ReservationStatus.Confirmed);
        reservation.CustomerUserId = customer.Id;
        reservation.IsRefundableSnapshot = true;
        reservation.FreeCancellationHoursSnapshot = 24;
        reservation.CancellationDeadlineUtc = DateTime.UtcNow.AddMinutes(-1);
        await using var db = CreateContext(tenant);
        db.AddRange(roomType, customer, reservation);
        await db.SaveChangesAsync();
        var controller = CustomerController(db, customer);

        var response = await controller.CancelMine(reservation.Id, new("CHANGE_OF_PLAN", null));

        Assert.IsType<ConflictObjectResult>(response.Result);
        Assert.Equal(ReservationStatus.Confirmed, reservation.Status);
    }

    [Fact]
    public async Task Staff_can_create_authoritative_walk_in_reservation_for_selected_room()
    {
        var (tenant, roomType) = Inventory(1);
        roomType.CapacityAdults = 2;
        roomType.CapacityChildren = 1;
        await using var db = CreateContext(tenant);
        db.RoomTypes.Add(roomType);
        await db.SaveChangesAsync();
        var room = roomType.Rooms.Single();
        var controller = StaffController(db, tenant.Id);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var quoteResult = await controller.OperationalQuote(room.Id, today.AddDays(2), today.AddDays(4), 2, 1);
        var quote = Assert.IsType<OperationalQuoteDto>(Assert.IsType<OkObjectResult>(quoteResult.Result).Value);
        var stalePrice = await controller.CreateOperational(new(room.Id, null, today.AddDays(2), today.AddDays(4), 3,
            "Nguyen Van An", "0901234567", "an@example.com", "CREDIT_CARD", "Tang cao", quote.FinalTotal - 1, 2, 1), "stale-price");

        var result = await controller.CreateOperational(new(room.Id, null, today.AddDays(2), today.AddDays(4), 3,
            "Nguyen Van An", "0901234567", "an@example.com", "CREDIT_CARD", "Tang cao", 2_000_000, 2, 1), "walk-in-create");
        var created = Assert.IsType<OperationalReservationDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        var replayResult = await controller.CreateOperational(new(room.Id, null, today.AddDays(2), today.AddDays(4), 3,
            "Nguyen Van An", "0901234567", "an@example.com", "CREDIT_CARD", "Tang cao", 2_000_000, 2, 1), "walk-in-create");
        var replay = Assert.IsType<OperationalReservationDto>(Assert.IsType<OkObjectResult>(replayResult.Result).Value);
        var conflictingReplay = await controller.CreateOperational(new(room.Id, null, today.AddDays(3), today.AddDays(5), 3,
            "Nguyen Van An", "0901234567", "an@example.com", "CREDIT_CARD", "Tang cao", 2_000_000, 2, 1), "walk-in-create");
        var changedEmail = await controller.CreateOperational(new(room.Id, null, today.AddDays(2), today.AddDays(4), 3,
            "Nguyen Van An", "0901234567", "other@example.com", "CREDIT_CARD", "Tang cao", 2_000_000, 2, 1), "walk-in-create");
        var changedPayment = await controller.CreateOperational(new(room.Id, null, today.AddDays(2), today.AddDays(4), 3,
            "Nguyen Van An", "0901234567", "an@example.com", "CASH", "Tang cao", 2_000_000, 2, 1), "walk-in-create");
        var changedSpecialRequests = await controller.CreateOperational(new(room.Id, null, today.AddDays(2), today.AddDays(4), 3,
            "Nguyen Van An", "0901234567", "an@example.com", "CREDIT_CARD", "Gan thang may", 2_000_000, 2, 1), "walk-in-create");

        Assert.Equal(2_000_000, quote.FinalTotal);
        Assert.IsType<ConflictObjectResult>(stalePrice.Result);
        Assert.Equal(quote.FinalTotal, created.TotalAmount);
        Assert.StartsWith("PMS-", created.BookingCode);
        Assert.Equal(23, created.BookingCode.Length);
        Assert.Equal(3, created.Guests);
        Assert.Equal("CREDIT_CARD", created.PaymentMethod);
        Assert.Equal(created.Id, replay.Id);
        Assert.IsType<ConflictObjectResult>(conflictingReplay.Result);
        Assert.IsType<ConflictObjectResult>(changedEmail.Result);
        Assert.IsType<ConflictObjectResult>(changedPayment.Result);
        Assert.IsType<ConflictObjectResult>(changedSpecialRequests.Result);
        Assert.Single(db.Reservations);
        Assert.Equal("CONFIRMED", created.Status);
        Assert.Equal(room.Id, Assert.Single(created.Details).RoomId);
        var stored = await db.Reservations.Include(item => item.Folio).ThenInclude(folio => folio!.Items).SingleAsync();
        Assert.Equal(2_000_000, stored.Folio!.TotalCharges);
        Assert.Equal("Nguyen Van An", stored.GuestFullName);
        Assert.Equal(2, stored.AdultCount);
        Assert.Equal(1, stored.ChildCount);
        Assert.Equal(PaymentMethod.CreditCard, stored.PaymentMethodSnapshot);
        Assert.Equal(64, stored.ClientRequestFingerprint?.Length);
    }

    [Fact]
    public async Task Staff_walk_in_rejects_room_from_another_tenant_and_overlapping_stay()
    {
        var (mine, mineType) = Inventory(1);
        var (other, otherType) = Inventory(1);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var existing = ReservationFor(mine, mineType, ReservationStatus.Confirmed, today.AddDays(2));
        existing.Details.Single().Room = mineType.Rooms.Single();
        existing.Details.Single().RoomId = mineType.Rooms.Single().Id;
        await using var db = CreateContext(mine, other);
        db.AddRange(mineType, otherType, existing);
        await db.SaveChangesAsync();
        var controller = StaffController(db, mine.Id);

        var overlap = await controller.CreateOperational(new(mineType.Rooms.Single().Id, null, today.AddDays(2), today.AddDays(3), 1,
            "Guest", "0901", null, "CASH", null, 1_000_000), "overlap");
        var crossTenant = await controller.CreateOperational(new(otherType.Rooms.Single().Id, null, today.AddDays(4), today.AddDays(5), 1,
            "Guest", "0901", null, "CASH", null, 1_000_000), "cross-tenant");

        Assert.IsType<ConflictObjectResult>(overlap.Result);
        Assert.IsType<BadRequestObjectResult>(crossTenant.Result);
    }

    [Fact]
    public async Task Staff_walk_in_cannot_bypass_room_type_inventory_consumed_by_unassigned_reservation()
    {
        var (tenant, roomType) = Inventory(1);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var existing = ReservationFor(tenant, roomType, ReservationStatus.Confirmed, today.AddDays(2));
        await using var db = CreateContext(tenant);
        db.AddRange(roomType, existing);
        await db.SaveChangesAsync();
        var controller = StaffController(db, tenant.Id);

        var result = await controller.CreateOperational(new(roomType.Rooms.Single().Id, null, today.AddDays(2), today.AddDays(3), 1,
            "Guest", "0901", null, "CASH", null, 1_000_000), "inventory-bypass");

        Assert.IsType<ConflictObjectResult>(result.Result);
        Assert.Single(db.Reservations);
    }

    [Fact]
    public async Task Operational_list_filters_stays_that_overlap_the_requested_range()
    {
        var (tenant, roomType) = Inventory(1);
        var start = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(10);
        var before = ReservationFor(tenant, roomType, ReservationStatus.Confirmed, start.AddDays(-2));
        var overlapsStart = ReservationFor(tenant, roomType, ReservationStatus.Confirmed, start.AddDays(-1));
        overlapsStart.CheckOutDate = start.AddDays(1);
        var inside = ReservationFor(tenant, roomType, ReservationStatus.Confirmed, start.AddDays(2));
        var checkoutBoundary = ReservationFor(tenant, roomType, ReservationStatus.Confirmed, start.AddDays(5));
        await using var db = CreateContext(tenant);
        db.AddRange(roomType, before, overlapsStart, inside, checkoutBoundary);
        await db.SaveChangesAsync();
        var controller = StaffController(db, tenant.Id);

        var result = await controller.GetReservations(start, start.AddDays(4));

        var reservations = Assert.IsType<List<OperationalReservationDto>>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal(2, reservations.Count);
        Assert.Contains(reservations, item => item.Id == overlapsStart.Id);
        Assert.Contains(reservations, item => item.Id == inside.Id);
    }

    [Theory]
    [InlineData(31)]
    [InlineData(-1)]
    public async Task Operational_list_rejects_invalid_date_ranges(int endOffset)
    {
        var (tenant, _) = Inventory(1);
        await using var db = CreateContext(tenant);
        var controller = StaffController(db, tenant.Id);
        var start = DateOnly.FromDateTime(DateTime.UtcNow);

        var result = await controller.GetReservations(start, start.AddDays(endOffset));

        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    private static ApplicationDbContext CreateContext(params Tenant[] tenants)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var tenantService = new CurrentTenantService();
        if (tenants.Length == 1) tenantService.SetTenant(tenants[0].Id, tenants[0].SubscriptionTier);
        var db = new ApplicationDbContext(options, tenantService);
        db.Tenants.AddRange(tenants);
        db.SaveChanges();
        return db;
    }

    private static (Tenant Tenant, RoomType RoomType) Inventory(int rooms)
    {
        var tenant = new Tenant
        {
            Name = "Booking Test Hotel",
            Code = $"BOOK-{Guid.NewGuid():N}",
            Slug = $"book-{Guid.NewGuid():N}",
            Address = "1 Booking Street",
            City = "Da Nang",
            Status = TenantStatus.Active
        };
        var roomType = new RoomType
        {
            TenantId = tenant.Id,
            Tenant = tenant,
            Name = "Deluxe",
            Code = "DLX",
            BasePricePerNight = 1_000_000,
            IsActive = true
        };
        for (var index = 0; index < rooms; index++)
        {
            roomType.Rooms.Add(new Room
            {
                TenantId = tenant.Id,
                RoomTypeId = roomType.Id,
                RoomNumber = $"10{index + 1}",
                Status = RoomStatus.Clean,
                IsActive = true
            });
        }
        return (tenant, roomType);
    }

    private static Reservation ReservationFor(Tenant tenant, RoomType roomType, ReservationStatus status, DateOnly? checkIn = null)
    {
        var start = checkIn ?? DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1));
        var reservation = new Reservation
        {
            TenantId = tenant.Id, Tenant = tenant, BookingCode = $"LXS-{Guid.NewGuid():N}",
            GuestFullName = "Operational Guest", GuestEmail = "ops@example.com", GuestPhoneNumber = "0901234567",
            CheckInDate = start, CheckOutDate = start.AddDays(1), Status = status, TotalAmount = roomType.BasePricePerNight
        };
        reservation.Details.Add(new ReservationDetail
        {
            TenantId = tenant.Id, Reservation = reservation, ReservationId = reservation.Id,
            RoomType = roomType, RoomTypeId = roomType.Id, NightlyPrice = roomType.BasePricePerNight,
            NumberOfNights = 1, SubTotal = roomType.BasePricePerNight
        });
        return reservation;
    }

    private sealed class SuccessfulEmailDelivery : IEmailDeliveryService
    {
        public bool IsConfigured => true;
        public Task<EmailDeliveryResult> SendAsync(string recipient, string subject, string htmlBody,
            CancellationToken cancellationToken = default) => Task.FromResult(new EmailDeliveryResult(true, "SENT"));
    }

    private static ReservationsController CustomerController(ApplicationDbContext db, User customer)
    {
        var controller = new ReservationsController(db)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
        controller.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity([
            new Claim(ClaimTypes.NameIdentifier, customer.Id.ToString()),
            new Claim(ClaimTypes.Email, customer.Email),
            new Claim(ClaimTypes.Role, GlobalUserRole.Customer.ToString())
        ], "test"));
        return controller;
    }

    private static ReservationsController StaffController(ApplicationDbContext db, Guid tenantId)
    {
        var controller = new ReservationsController(db)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
        controller.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity([
            new Claim(ClaimTypes.Role, StaffRole.Receptionist.ToString()), new Claim("tenant_id", tenantId.ToString())
        ], "test"));
        return controller;
    }

    private static User Customer() => new()
    {
        Username = $"customer-{Guid.NewGuid():N}", Email = $"{Guid.NewGuid():N}@example.com",
        FullName = "Customer Test", PasswordHash = "test", GlobalRole = GlobalUserRole.Customer, IsActive = true
    };
}
