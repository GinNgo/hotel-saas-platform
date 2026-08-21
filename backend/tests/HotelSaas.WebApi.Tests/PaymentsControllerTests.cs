using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using HotelSaas.Infrastructure.Persistence;
using HotelSaas.Infrastructure.Services;
using HotelSaas.WebApi.Controllers;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Primitives;
using System.Security.Claims;
using Xunit;

namespace HotelSaas.WebApi.Tests;

public class PaymentsControllerTests
{
    [Fact]
    public async Task Create_session_requires_a_bounded_idempotency_key()
    {
        var (db, reservation) = await SeedReservation();
        await using var context = db;
        var controller = Controller(context, new FakeVnPayService());

        var missing = await controller.CreateSession(new(reservation.Id, "VNPAY"), null, "guest-booking-key");
        var tooShort = await controller.CreateSession(new(reservation.Id, "VNPAY"), "short", "guest-booking-key");

        Assert.IsType<BadRequestObjectResult>(missing.Result);
        Assert.IsType<BadRequestObjectResult>(tooShort.Result);
        Assert.Empty(context.Payments.IgnoreQueryFilters());
    }

    [Fact]
    public async Task Create_session_rejects_reservation_that_is_not_pending_payment()
    {
        var (db, reservation) = await SeedReservation(ReservationStatus.Confirmed);
        await using var context = db;
        var controller = Controller(context, new FakeVnPayService());

        var response = await controller.CreateSession(new(reservation.Id, "VNPAY"), "retry-key", "guest-booking-key");

        Assert.IsType<ConflictObjectResult>(response.Result);
        Assert.Empty(context.Payments.IgnoreQueryFilters());
    }

    [Fact]
    public async Task Create_session_rejects_vnpay_after_the_property_disables_it()
    {
        var (db, reservation) = await SeedReservation();
        await using var context = db;
        var configuration = Assert.Single(context.PropertyPaymentConfigurations.IgnoreQueryFilters());
        configuration.MethodsJson = "[{\"Method\":\"VNPAY\",\"Enabled\":false,\"Provider\":\"VNPAY\"}]";
        await context.SaveChangesAsync();
        var controller = Controller(context, new FakeVnPayService());

        var response = await controller.CreateSession(new(reservation.Id, "VNPAY"), "disabled-vnpay-key", "guest-booking-key");

        Assert.IsType<ConflictObjectResult>(response.Result);
        Assert.Empty(context.Payments.IgnoreQueryFilters());
    }

    [Fact]
    public async Task Anonymous_guest_must_present_the_booking_access_key()
    {
        var (db, reservation) = await SeedReservation();
        await using var context = db;
        reservation.GuestAccessKey = "separate-guest-access-key";
        await context.SaveChangesAsync();
        var controller = Controller(context, new FakeVnPayService());

        var denied = await controller.CreateSession(new(reservation.Id, "VNPAY"), "attempt-1", "wrong-key");
        var idempotencyKeyDenied = await controller.CreateSession(new(reservation.Id, "VNPAY"), "attempt-2", "guest-booking-key");
        var allowed = await controller.CreateSession(new(reservation.Id, "VNPAY"), "attempt-3", "separate-guest-access-key");

        Assert.IsType<NotFoundObjectResult>(denied.Result);
        Assert.IsType<NotFoundObjectResult>(idempotencyKeyDenied.Result);
        Assert.IsType<OkObjectResult>(allowed.Result);
        Assert.Single(context.Payments.IgnoreQueryFilters());
    }

    [Fact]
    public async Task Authenticated_customer_cannot_start_payment_for_another_customers_booking()
    {
        var ownerId = Guid.NewGuid();
        var (db, reservation) = await SeedReservation();
        await using var context = db;
        reservation.CustomerUserId = ownerId;
        await context.SaveChangesAsync();
        var controller = Controller(context, new FakeVnPayService());
        SetUser(controller, Guid.NewGuid(), "Customer");

        var denied = await controller.CreateSession(new(reservation.Id, "VNPAY"), "attempt-1");
        SetUser(controller, ownerId, "Customer");
        var allowed = await controller.CreateSession(new(reservation.Id, "VNPAY"), "attempt-2");

        Assert.IsType<NotFoundObjectResult>(denied.Result);
        Assert.IsType<OkObjectResult>(allowed.Result);
    }

    [Fact]
    public async Task Tenant_staff_can_only_start_payment_for_their_property()
    {
        var (db, reservation) = await SeedReservation();
        await using var context = db;
        var controller = Controller(context, new FakeVnPayService());
        SetUser(controller, Guid.NewGuid(), "Receptionist", Guid.NewGuid());

        var denied = await controller.CreateSession(new(reservation.Id, "VNPAY"), "attempt-1");
        SetUser(controller, Guid.NewGuid(), "Receptionist", reservation.TenantId);
        var allowed = await controller.CreateSession(new(reservation.Id, "VNPAY"), "attempt-2");

        Assert.IsType<NotFoundObjectResult>(denied.Result);
        Assert.IsType<OkObjectResult>(allowed.Result);
    }

    [Fact]
    public async Task Session_status_requires_the_same_booking_access_scope()
    {
        var (db, reservation) = await SeedReservation();
        await using var context = db;
        var payment = await AddPendingPayment(context, reservation);
        var controller = Controller(context, new FakeVnPayService());

        var denied = await controller.GetSession(payment.Id, "wrong-key");
        var allowed = await controller.GetSession(payment.Id, "guest-booking-key");

        Assert.IsType<NotFoundObjectResult>(denied.Result);
        var session = Assert.IsType<PaymentSessionStatusDto>(Assert.IsType<OkObjectResult>(allowed.Result).Value);
        Assert.Equal(reservation.Id, session.ReservationId);
        Assert.Equal(reservation.BookingCode, session.BookingCode);
        Assert.Equal("NOT_CONFIGURED", session.ConfirmationEmailStatus);
        Assert.Equal(reservation.GuestEmail, session.ConfirmationEmailRecipient);
        Assert.False(session.ConfirmationEmailSent);
    }

    [Fact]
    public async Task Guest_can_recover_only_its_active_payment_session()
    {
        var (db, reservation) = await SeedReservation();
        await using var context = db;
        reservation.GuestAccessKey = "separate-guest-access-key";
        var payment = await AddPendingPayment(context, reservation);
        var controller = Controller(context, new FakeVnPayService());

        var denied = await controller.GetActiveSession(reservation.Id, "guest-booking-key");
        var recovered = await controller.GetActiveSession(reservation.Id, "separate-guest-access-key");

        Assert.IsType<NotFoundObjectResult>(denied.Result);
        var session = Assert.IsType<PaymentSessionDto>(Assert.IsType<OkObjectResult>(recovered.Result).Value);
        Assert.Equal(payment.Id, session.SessionId);
        Assert.Equal(reservation.BookingCode, session.BookingCode);
        Assert.NotEmpty(session.Url);
    }

    [Fact]
    public async Task Reading_an_expired_session_cancels_the_unpaid_reservation()
    {
        var (db, reservation) = await SeedReservation();
        await using var context = db;
        var payment = await AddPendingPayment(context, reservation);
        reservation.CreatedAtUtc = DateTime.UtcNow.AddMinutes(-16);
        payment.CreatedAtUtc = DateTime.UtcNow.AddMinutes(-16);
        await context.SaveChangesAsync();
        var controller = Controller(context, new FakeVnPayService());

        var response = await controller.GetSession(payment.Id, "guest-booking-key");
        var session = Assert.IsType<PaymentSessionStatusDto>(Assert.IsType<OkObjectResult>(response.Result).Value);

        Assert.Equal("EXPIRED", session.Status);
        Assert.Equal(ReservationStatus.Cancelled, reservation.Status);
        Assert.Equal("PAYMENT_TIMEOUT", reservation.CancellationReasonCode);
        Assert.Equal(PaymentStatus.Expired, payment.Status);
    }

    [Fact]
    public async Task Same_key_replays_the_original_session_even_after_it_expires()
    {
        var (db, reservation) = await SeedReservation();
        await using var context = db;
        var controller = Controller(context, new FakeVnPayService());

        var first = await controller.CreateSession(new(reservation.Id, "VNPAY"), "payment-key-1", "guest-booking-key");
        var firstSession = Assert.IsType<PaymentSessionDto>(Assert.IsType<OkObjectResult>(first.Result).Value);
        var payment = context.Payments.IgnoreQueryFilters().Single();
        payment.CreatedAtUtc = DateTime.UtcNow.AddMinutes(-20);
        await context.SaveChangesAsync();

        var replay = await controller.CreateSession(new(reservation.Id, "VNPAY"), "payment-key-1", "guest-booking-key");
        var replaySession = Assert.IsType<PaymentSessionDto>(Assert.IsType<OkObjectResult>(replay.Result).Value);

        Assert.Equal(firstSession.SessionId, replaySession.SessionId);
        Assert.Equal("EXPIRED", replaySession.Status);
        Assert.Single(context.Payments.IgnoreQueryFilters());
    }

    [Fact]
    public async Task Fresh_key_creates_a_new_session_after_the_previous_one_expires()
    {
        var (db, reservation) = await SeedReservation();
        await using var context = db;
        var controller = Controller(context, new FakeVnPayService());

        var first = await controller.CreateSession(new(reservation.Id, "VNPAY"), "payment-key-1", "guest-booking-key");
        var firstSession = Assert.IsType<PaymentSessionDto>(Assert.IsType<OkObjectResult>(first.Result).Value);
        var payment = context.Payments.IgnoreQueryFilters().Single();
        payment.CreatedAtUtc = DateTime.UtcNow.AddMinutes(-20);
        await context.SaveChangesAsync();

        var retry = await controller.CreateSession(new(reservation.Id, "VNPAY"), "payment-key-2", "guest-booking-key");
        var retrySession = Assert.IsType<PaymentSessionDto>(Assert.IsType<OkObjectResult>(retry.Result).Value);

        Assert.NotEqual(firstSession.SessionId, retrySession.SessionId);
        Assert.Equal(2, context.Payments.IgnoreQueryFilters().Count());
    }

    [Fact]
    public async Task Different_key_cannot_take_over_an_active_session()
    {
        var (db, reservation) = await SeedReservation();
        await using var context = db;
        var controller = Controller(context, new FakeVnPayService());

        var first = await controller.CreateSession(new(reservation.Id, "VNPAY"), "payment-key-1", "guest-booking-key");
        var conflict = await controller.CreateSession(new(reservation.Id, "VNPAY"), "payment-key-2", "guest-booking-key");

        Assert.IsType<OkObjectResult>(first.Result);
        Assert.IsType<ConflictObjectResult>(conflict.Result);
        Assert.Single(context.Payments.IgnoreQueryFilters());
        Assert.Equal("payment-key-1", context.Payments.IgnoreQueryFilters().Single().ClientRequestKey);
    }

    [Fact]
    public async Task First_retry_claims_an_active_legacy_session_without_a_request_key()
    {
        var (db, reservation) = await SeedReservation();
        await using var context = db;
        var legacyPayment = await AddPendingPayment(context, reservation);
        var controller = Controller(context, new FakeVnPayService());

        var response = await controller.CreateSession(new(reservation.Id, "VNPAY"), "payment-key-1", "guest-booking-key");

        var session = Assert.IsType<PaymentSessionDto>(Assert.IsType<OkObjectResult>(response.Result).Value);
        Assert.Equal(legacyPayment.Id, session.SessionId);
        Assert.Equal(reservation.BookingCode, session.BookingCode);
        Assert.Equal("payment-key-1", legacyPayment.ClientRequestKey);
        Assert.Single(context.Payments.IgnoreQueryFilters());
    }

    [Fact]
    public async Task Callback_uses_tenant_secret_and_confirms_payment()
    {
        var (db, reservation) = await SeedReservation();
        await using var context = db;
        var payment = await AddPendingPayment(context, reservation);
        var gateway = new FakeVnPayService { Result = (true, true, "TXN-001", "00") };
        var controller = Controller(context, gateway, payment.Id);

        var result = await controller.VnPayCallback();

        Assert.IsType<RedirectResult>(result);
        Assert.Equal("tenant-secret", gateway.ReceivedSecret);
        Assert.Equal(ReservationStatus.Confirmed, reservation.Status);
        Assert.Equal(PaymentStatus.Completed, payment.Status);
        Assert.Single(context.PaymentTransactions.IgnoreQueryFilters());
    }

    [Fact]
    public async Task Successful_callback_rejects_an_amount_that_does_not_match_the_payment()
    {
        var (db, reservation) = await SeedReservation();
        await using var context = db;
        var payment = await AddPendingPayment(context, reservation);
        var gateway = new FakeVnPayService { Result = (true, true, "TXN-WRONG-AMOUNT", "00") };
        var controller = Controller(context, gateway, payment.Id, callbackAmount: payment.Amount - 1);

        await controller.VnPayCallback();

        Assert.Equal(ReservationStatus.PendingPayment, reservation.Status);
        Assert.Equal(PaymentStatus.Failed, payment.Status);
        var transaction = Assert.Single(context.PaymentTransactions.IgnoreQueryFilters());
        Assert.False(transaction.IsSuccess);
        Assert.Equal("AMOUNT_MISMATCH", transaction.ResponseCode);
    }

    [Fact]
    public async Task Successful_callback_cannot_reuse_a_provider_transaction_for_another_payment()
    {
        var (db, reservation) = await SeedReservation();
        await using var context = db;
        var payment = await AddPendingPayment(context, reservation);
        context.PaymentTransactions.Add(new PaymentTransaction
        {
            TenantId = reservation.TenantId,
            PaymentId = Guid.NewGuid(),
            Provider = "VNPay",
            TransactionNo = "TXN-ALREADY-USED",
            ResponseCode = "00",
            IsSuccess = true
        });
        await context.SaveChangesAsync();
        var gateway = new FakeVnPayService { Result = (true, true, "TXN-ALREADY-USED", "00") };
        var controller = Controller(context, gateway, payment.Id);

        await controller.VnPayCallback();

        Assert.Equal(ReservationStatus.PendingPayment, reservation.Status);
        Assert.Equal(PaymentStatus.Failed, payment.Status);
        var rejected = context.PaymentTransactions.IgnoreQueryFilters().Single(item => item.PaymentId == payment.Id);
        Assert.False(rejected.IsSuccess);
        Assert.Equal("TRANSACTION_REUSED", rejected.ResponseCode);
    }

    [Fact]
    public async Task Invalid_signature_does_not_mutate_payment_or_reservation()
    {
        var (db, reservation) = await SeedReservation();
        await using var context = db;
        var payment = await AddPendingPayment(context, reservation);
        var gateway = new FakeVnPayService { Result = (false, false, "TXN-TAMPERED", "00") };
        var controller = Controller(context, gateway, payment.Id);

        await controller.VnPayCallback();

        Assert.Equal(ReservationStatus.PendingPayment, reservation.Status);
        Assert.Equal(PaymentStatus.Pending, payment.Status);
        Assert.Empty(context.PaymentTransactions.IgnoreQueryFilters());
    }

    [Fact]
    public async Task Repeated_successful_callback_records_one_transaction_and_one_credit()
    {
        var (db, reservation) = await SeedReservation();
        await using var context = db;
        reservation.Folio = new Folio { TenantId = reservation.TenantId, ReservationId = reservation.Id };
        context.Folios.Add(reservation.Folio);
        await context.SaveChangesAsync();
        var payment = await AddPendingPayment(context, reservation);
        var gateway = new FakeVnPayService { Result = (true, true, "TXN-REPLAY", "00") };
        var controller = Controller(context, gateway, payment.Id);

        await controller.VnPayCallback();
        await controller.VnPayCallback();

        Assert.Single(context.PaymentTransactions.IgnoreQueryFilters());
        Assert.Equal(payment.Amount, reservation.Folio.TotalCredits);
    }

    [Fact]
    public async Task Successful_callback_for_an_expired_session_requires_reconciliation()
    {
        var (db, reservation) = await SeedReservation();
        await using var context = db;
        var payment = await AddPendingPayment(context, reservation);
        payment.CreatedAtUtc = DateTime.UtcNow.AddMinutes(-20);
        await context.SaveChangesAsync();
        var gateway = new FakeVnPayService { Result = (true, true, "TXN-LATE", "00") };
        var controller = Controller(context, gateway, payment.Id);

        await controller.VnPayCallback();
        var response = await controller.GetSession(payment.Id, "guest-booking-key");
        var status = Assert.IsType<PaymentSessionStatusDto>(Assert.IsType<OkObjectResult>(response.Result).Value);

        Assert.Equal(PaymentStatus.Completed, payment.Status);
        Assert.Equal(ReservationStatus.PendingPayment, reservation.Status);
        Assert.Equal(0, reservation.DepositAmount);
        Assert.True(status.ReconciliationRequired);
    }

    private static PaymentsController Controller(ApplicationDbContext db, FakeVnPayService gateway, Guid? sessionId = null,
        decimal? callbackAmount = null)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Frontend:BaseUrl"] = "https://booking.example" })
            .Build();
        var controller = new PaymentsController(db, gateway, configuration)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
        if (sessionId.HasValue)
        {
            controller.Request.Query = new QueryCollection(new Dictionary<string, StringValues>
            {
                ["vnp_TxnRef"] = sessionId.Value.ToString("N"),
                ["vnp_ResponseCode"] = "00",
                ["vnp_TransactionNo"] = gateway.Result.TransactionNo,
                ["vnp_Amount"] = decimal.Round((callbackAmount ?? 1_250_000m) * 100m, 0).ToString("0", System.Globalization.CultureInfo.InvariantCulture),
                ["vnp_TmnCode"] = "TENANT-TMN"
            });
        }
        return controller;
    }

    private static async Task<(ApplicationDbContext Db, Reservation Reservation)> SeedReservation(
        ReservationStatus status = ReservationStatus.PendingPayment)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        var db = new ApplicationDbContext(options, new CurrentTenantService());
        var tenant = new Tenant
        {
            Name = "Payment Test Hotel", Code = $"PAY-{Guid.NewGuid():N}", Slug = $"pay-{Guid.NewGuid():N}",
            Address = "1 Test Street", City = "Da Nang", Status = TenantStatus.Active,
            CustomVnPayHashSecret = "tenant-secret", CustomVnPayTmnCode = "TENANT-TMN"
        };
        var reservation = new Reservation
        {
            TenantId = tenant.Id, Tenant = tenant, BookingCode = "LXS-PAY-001",
            GuestFullName = "Payment Guest", GuestEmail = "pay@example.com", GuestPhoneNumber = "0901234567",
            CheckInDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1)),
            CheckOutDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(2)),
            Status = status, TotalAmount = 1_250_000, ClientRequestKey = "guest-booking-key"
        };
        db.AddRange(tenant, reservation, new PropertyPaymentConfiguration
        {
            TenantId = tenant.Id,
            Enabled = true,
            Environment = "SIMULATOR",
            MethodsJson = "[{\"Method\":\"VNPAY\",\"Enabled\":true,\"Provider\":\"VNPAY\"}]"
        });
        await db.SaveChangesAsync();
        return (db, reservation);
    }

    private static void SetUser(PaymentsController controller, Guid userId, string role, Guid? tenantId = null)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, userId.ToString()),
            new(ClaimTypes.Role, role)
        };
        if (tenantId.HasValue) claims.Add(new Claim("tenant_id", tenantId.Value.ToString()));
        controller.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "test"));
    }

    private static async Task<Payment> AddPendingPayment(ApplicationDbContext db, Reservation reservation)
    {
        var payment = new Payment
        {
            TenantId = reservation.TenantId, ReservationId = reservation.Id, Reservation = reservation,
            Amount = reservation.TotalAmount, Method = PaymentMethod.VNPay, Status = PaymentStatus.Pending
        };
        db.Payments.Add(payment);
        await db.SaveChangesAsync();
        return payment;
    }

    private sealed class FakeVnPayService : IVnPayService
    {
        public (bool IsValidSignature, bool IsSuccess, string TransactionNo, string ResponseCode) Result { get; set; }
            = (true, true, "TXN", "00");
        public string? ReceivedSecret { get; private set; }

        public string CreatePaymentUrl(Guid reservationId, string bookingCode, decimal amount, string orderInfo,
            string ipAddress, string? customTmnCode = null, string? customHashSecret = null, string? transactionReference = null)
            => $"https://sandbox.example/pay?ref={transactionReference}";

        public (bool IsValidSignature, bool IsSuccess, string TransactionNo, string ResponseCode) ProcessIpn(
            IDictionary<string, string> queryParams, string? customHashSecret = null)
        {
            ReceivedSecret = customHashSecret;
            return Result;
        }
    }
}
