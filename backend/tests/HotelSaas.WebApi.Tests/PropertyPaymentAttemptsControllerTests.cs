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

public class PropertyPaymentAttemptsControllerTests
{
    [Fact]
    public async Task Guest_creates_idempotent_attempt_and_simulator_confirmation_updates_folio()
    {
        var setup = await Seed();
        await using var db = setup.Db;
        var controller = Controller(db);

        var created = await controller.Create(setup.Reservation.Id,
            new("DEPOSIT", "MANUAL_TRANSFER"), "payment-attempt-001", setup.Reservation.GuestAccessKey);
        var replay = await controller.Create(setup.Reservation.Id,
            new("DEPOSIT", "MANUAL_TRANSFER"), "payment-attempt-001", setup.Reservation.GuestAccessKey);
        var attempt = Assert.IsType<PropertyPaymentAttemptDto>(Assert.IsType<OkObjectResult>(created.Result).Value);
        var replayDto = Assert.IsType<PropertyPaymentAttemptDto>(Assert.IsType<OkObjectResult>(replay.Result).Value);
        var confirmed = await controller.ConfirmSimulator(attempt.AttemptId);

        Assert.Equal(1_000_000, attempt.ExpectedAmount);
        Assert.True(replayDto.Replayed);
        Assert.IsType<OkObjectResult>(confirmed.Result);
        Assert.Equal(1_000_000, setup.Reservation.Folio!.TotalCredits);
        Assert.Equal(ReservationStatus.Confirmed, setup.Reservation.Status);
        Assert.Single(db.Payments.IgnoreQueryFilters());
    }

    [Fact]
    public async Task Wrong_guest_capability_and_changed_idempotency_payload_are_rejected()
    {
        var setup = await Seed();
        await using var db = setup.Db;
        var controller = Controller(db);

        var denied = await controller.Create(setup.Reservation.Id,
            new("DEPOSIT", "MANUAL_TRANSFER"), "payment-attempt-002", "wrong-key");
        var first = await controller.Create(setup.Reservation.Id,
            new("DEPOSIT", "MANUAL_TRANSFER"), "payment-attempt-002", setup.Reservation.GuestAccessKey);
        var conflict = await controller.Create(setup.Reservation.Id,
            new("BALANCE", "CASH"), "payment-attempt-002", setup.Reservation.GuestAccessKey);

        Assert.IsType<NotFoundObjectResult>(denied.Result);
        Assert.IsType<OkObjectResult>(first.Result);
        Assert.IsType<ConflictObjectResult>(conflict.Result);
    }

    [Fact]
    public async Task Tenant_manager_can_confirm_manual_attempt()
    {
        var setup = await Seed();
        await using var db = setup.Db;
        var controller = Controller(db);
        var created = await controller.Create(setup.Reservation.Id,
            new("DEPOSIT", "QR_TRANSFER"), "payment-attempt-003", setup.Reservation.GuestAccessKey);
        var attempt = Assert.IsType<PropertyPaymentAttemptDto>(Assert.IsType<OkObjectResult>(created.Result).Value);
        SetUser(controller, Guid.NewGuid(), "Manager", setup.Reservation.TenantId);

        var confirmed = await controller.ConfirmManual(attempt.AttemptId,
            new("Đã kiểm tra sao kê ngân hàng", "BANK-STMT-001"));

        var result = Assert.IsType<ManualPaymentConfirmationDto>(Assert.IsType<OkObjectResult>(confirmed.Result).Value);
        Assert.Equal("SUCCESS", result.Status);
        Assert.Equal(1_000_000, result.Amount);
    }

    [Fact]
    public async Task Cancelled_attempt_cannot_be_confirmed_again()
    {
        var setup = await Seed();
        await using var db = setup.Db;
        var controller = Controller(db);
        var created = await controller.Create(setup.Reservation.Id,
            new("DEPOSIT", "MANUAL_TRANSFER"), "payment-attempt-004", setup.Reservation.GuestAccessKey);
        var attempt = Assert.IsType<PropertyPaymentAttemptDto>(Assert.IsType<OkObjectResult>(created.Result).Value);

        var cancelled = await controller.Cancel(attempt.AttemptId);
        var confirmed = await controller.ConfirmSimulator(attempt.AttemptId);

        Assert.IsType<OkObjectResult>(cancelled.Result);
        Assert.IsType<ConflictObjectResult>(confirmed.Result);
        Assert.Empty(db.Payments.IgnoreQueryFilters());
    }

    private static async Task<Setup> Seed()
    {
        var service = new CurrentTenantService();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        var db = new ApplicationDbContext(options, service);
        var tenant = new Tenant { Name = "Payment Hotel", Code = "PAY-01", Slug = "payment-hotel", Address = "1 Pay", City = "Da Nang", Status = TenantStatus.Active };
        var reservation = new Reservation
        {
            TenantId = tenant.Id, Tenant = tenant, BookingCode = "LXS-PAYMENT", GuestAccessKey = "guest-payment-access-key",
            GuestFullName = "Payment Guest", GuestPhoneNumber = "0900000000", CheckInDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1)),
            CheckOutDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(2)), Status = ReservationStatus.PendingPayment, TotalAmount = 1_000_000
        };
        reservation.Folio = new Folio { TenantId = tenant.Id, Reservation = reservation, ReservationId = reservation.Id,
            FolioNumber = "FOL-PAYMENT", TotalCharges = 1_000_000, TotalCredits = 0 };
        var configuration = new PropertyPaymentConfiguration
        {
            TenantId = tenant.Id, Enabled = true, Environment = "SIMULATOR", DepositPolicyType = "NONE",
            PaymentExpiryMinutes = 15, TransferTemplate = "BOOKING {paymentCode}",
            BankName = "Test Bank", BankCode = "TEST", AccountName = "PAYMENT HOTEL", AccountNumber = "123456789",
            InstructionsVi = "Thanh toán theo hướng dẫn.", InstructionsEn = "Pay as instructed.",
            MethodsJson = System.Text.Json.JsonSerializer.Serialize(new[]
            {
                new StoredPaymentMethod("MANUAL_TRANSFER", true, "BANK", null),
                new StoredPaymentMethod("QR_TRANSFER", true, "VIETQR", null)
            })
        };
        db.AddRange(tenant, reservation, configuration);
        await db.SaveChangesAsync();
        return new Setup(db, reservation);
    }

    private static PropertyPaymentAttemptsController Controller(ApplicationDbContext db) => new(db)
    {
        ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
    };

    private static void SetUser(ControllerBase controller, Guid userId, string role, Guid tenantId)
    {
        controller.ControllerContext.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity([
            new Claim(ClaimTypes.NameIdentifier, userId.ToString()), new Claim(ClaimTypes.Role, role),
            new Claim("tenant_id", tenantId.ToString())], "test"));
    }

    private sealed record Setup(ApplicationDbContext Db, Reservation Reservation);
}
