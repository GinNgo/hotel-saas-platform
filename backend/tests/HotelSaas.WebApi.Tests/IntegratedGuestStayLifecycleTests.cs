using System.Security.Claims;
using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Application.Common.Models;
using HotelSaas.Application.DTOs.FrontDesk;
using HotelSaas.Application.DTOs.Reservations;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using HotelSaas.Infrastructure.Persistence;
using HotelSaas.Infrastructure.Services;
using HotelSaas.WebApi.Controllers;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace HotelSaas.WebApi.Tests;

public class IntegratedGuestStayLifecycleTests
{
    [Fact]
    public async Task Hold_vnpay_checkin_folio_and_checkout_share_one_reservation_identity()
    {
        var tenant = new Tenant
        {
            Name = "Integrated Journey Hotel", Code = "JOURNEY", Slug = "integrated-journey",
            Address = "1 Lifecycle Street", City = "Da Nang", Status = TenantStatus.Active,
            SubscriptionTier = SubscriptionTier.Pro
        };
        var roomType = new RoomType
        {
            TenantId = tenant.Id, Tenant = tenant, Name = "Deluxe", Code = "DLX",
            BasePricePerNight = 1_000_000, IsActive = true
        };
        var room = new Room
        {
            TenantId = tenant.Id, RoomTypeId = roomType.Id, RoomType = roomType,
            RoomNumber = "1204", Status = RoomStatus.Clean, IsActive = true
        };
        roomType.Rooms.Add(room);
        var breakfast = new HotelService
        {
            TenantId = tenant.Id, Code = "BREAKFAST", NameVi = "Bữa sáng", Price = 150_000, IsActive = true
        };
        var paymentConfiguration = new PropertyPaymentConfiguration
        {
            TenantId = tenant.Id, Enabled = true, Environment = "SIMULATOR",
            MethodsJson = "[{\"Method\":\"VNPAY\",\"Enabled\":true,\"Provider\":\"VNPAY\"}]"
        };

        var tenantContext = new CurrentTenantService();
        tenantContext.SetTenant(tenant.Id, tenant.SubscriptionTier);
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        await using var db = CreateContext(tenantContext, connection);
        await db.Database.EnsureCreatedAsync();
        db.AddRange(tenant, roomType, breakfast, paymentConfiguration);
        await db.SaveChangesAsync();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var checkIn = today;
        var checkOut = today.AddDays(1);
        var reservations = Anonymous(new ReservationsController(db));

        var holdResult = await reservations.CreateBookingHold(
            new CreateBookingHoldRequestDto(tenant.Id, roomType.Id, checkIn, checkOut), "journey-hold-key");
        var hold = Assert.IsType<Result<BookingHoldResponseDto>>(
            Assert.IsType<OkObjectResult>(holdResult.Result).Value).Data!;

        var bookingResult = await reservations.Book(new CustomerBookingRequest(
            roomType.Id, checkIn, checkOut, 2, "An", "Nguyen", "0901234567", "VNPAY",
            Adults: 2, Email: "journey@example.test", HoldToken: hold.HoldToken), "journey-booking-key");
        var booking = Assert.IsType<CustomerBookingDto>(Assert.IsType<OkObjectResult>(bookingResult.Result).Value);
        var reservationId = booking.Id;

        var paymentGateway = new SuccessfulVnPayService();
        var payments = Anonymous(new PaymentsController(db, paymentGateway));
        var sessionResult = await payments.CreateSession(
            new CreatePaymentSessionRequest(reservationId, "VNPAY"), "journey-payment-key", booking.GuestAccessKey);
        var session = Assert.IsType<PaymentSessionDto>(Assert.IsType<OkObjectResult>(sessionResult.Result).Value);

        SetIpnQuery(payments, session.SessionId, session.Amount);
        var ipnResult = Assert.IsType<OkObjectResult>(await payments.VnPayIpn());
        Assert.Equal("00", ReadProperty(ipnResult.Value, "RspCode"));

        var persisted = await db.Reservations.IgnoreQueryFilters()
            .Include(item => item.Folio).Include(item => item.Details)
            .SingleAsync(item => item.Id == reservationId);
        Assert.Equal(ReservationStatus.Confirmed, persisted.Status);
        Assert.Equal(persisted.TotalAmount, persisted.Folio!.TotalCredits);

        var frontDesk = Staff(new FrontDeskController(db, tenantContext));
        var checkInResult = await frontDesk.CheckIn(new CheckInRequestDto(reservationId, [room.Id], null));
        Assert.IsType<OkObjectResult>(checkInResult.Result);

        var checkout = Staff(new ManagementCheckoutController(db));
        var chargeResult = await checkout.AddServiceCharge(reservationId,
            new AddServiceChargeRequest(breakfast.Id, "SERVICE", 1, null), "journey-service-key");
        var charge = Assert.IsType<ReservationChargeDto>(Assert.IsType<OkObjectResult>(chargeResult.Result).Value);
        Assert.Equal(breakfast.Price, charge.TotalAmount);

        var checkOutResult = await frontDesk.CheckOut(
            new CheckOutRequestDto(reservationId, breakfast.Price, PaymentMethod.Cash));
        Assert.IsType<OkObjectResult>(checkOutResult.Result);

        var completed = await db.Reservations.IgnoreQueryFilters()
            .Include(item => item.Folio).Include(item => item.Payments)
            .Include(item => item.Details).ThenInclude(item => item.Room)
            .SingleAsync(item => item.Id == reservationId);
        Assert.Equal(ReservationStatus.CheckedOut, completed.Status);
        Assert.True(completed.Folio!.IsClosed);
        Assert.Equal(completed.Folio.TotalCharges, completed.Folio.TotalCredits);
        Assert.Equal(RoomStatus.Dirty, Assert.Single(completed.Details).Room!.Status);
        Assert.Equal(2, completed.Payments.Count);
        var cleaningTask = Assert.Single(db.HousekeepingTasks.IgnoreQueryFilters());
        Assert.Equal(reservationId, cleaningTask.ReservationId);
        Assert.Equal(room.Id, cleaningTask.RoomId);
        Assert.Equal("CheckoutCleaning", cleaningTask.TaskType);
    }

    private static ApplicationDbContext CreateContext(CurrentTenantService tenantContext, SqliteConnection connection)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlite(connection).Options;
        return new ApplicationDbContext(options, tenantContext);
    }

    private static T Anonymous<T>(T controller) where T : ControllerBase
    {
        controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() };
        return controller;
    }

    private static T Staff<T>(T controller) where T : ControllerBase
    {
        controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() };
        controller.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity([
            new Claim(ClaimTypes.NameIdentifier, Guid.NewGuid().ToString()),
            new Claim(ClaimTypes.Name, "Journey Receptionist"),
            new Claim(ClaimTypes.Role, StaffRole.Receptionist.ToString())
        ], "test"));
        return controller;
    }

    private static void SetIpnQuery(PaymentsController controller, Guid sessionId, decimal amount)
    {
        controller.ControllerContext.HttpContext.Request.QueryString = QueryString.Create(new Dictionary<string, string?>
        {
            ["vnp_TxnRef"] = sessionId.ToString(), ["vnp_Amount"] = decimal.Truncate(amount * 100).ToString(),
            ["vnp_ResponseCode"] = "00", ["vnp_TransactionNo"] = "JOURNEY-TXN-001"
        });
    }

    private static string? ReadProperty(object? value, string name) =>
        value?.GetType().GetProperty(name)?.GetValue(value)?.ToString();

    private sealed class SuccessfulVnPayService : IVnPayService
    {
        public string CreatePaymentUrl(Guid reservationId, string bookingCode, decimal amount, string orderInfo,
            string ipAddress, string? customTmnCode = null, string? customHashSecret = null,
            string? transactionReference = null) => $"https://sandbox.vnpay.test/{transactionReference}";

        public (bool IsValidSignature, bool IsSuccess, string TransactionNo, string ResponseCode) ProcessIpn(
            IDictionary<string, string> queryParams, string? customHashSecret = null) =>
            (true, true, queryParams.TryGetValue("vnp_TransactionNo", out var transactionNo)
                ? transactionNo : "JOURNEY-TXN-001", "00");
    }
}
