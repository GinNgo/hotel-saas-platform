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

public class PropertyRefundsControllerTests
{
    [Fact]
    public async Task Customer_can_request_owned_payment_and_idempotent_replay_rejects_changed_payload()
    {
        var setup = await Seed();
        await using var db = setup.Db;
        var controller = new PropertyRefundsController(db);
        SetUser(controller, setup.CustomerId, "Customer");

        var created = await controller.RequestRefund(setup.Payment.Id.ToString(), new(400_000, "Thay đổi kế hoạch"), "refund-request-0001");
        var replay = await controller.RequestRefund(setup.Payment.Id.ToString(), new(400_000, "Thay đổi kế hoạch"), "refund-request-0001");
        var conflict = await controller.RequestRefund(setup.Payment.Id.ToString(), new(300_000, "Thay đổi kế hoạch"), "refund-request-0001");

        var createdDto = Assert.IsType<PropertyRefundDto>(Assert.IsType<OkObjectResult>(created.Result).Value);
        var replayDto = Assert.IsType<PropertyRefundDto>(Assert.IsType<OkObjectResult>(replay.Result).Value);
        Assert.Equal("PENDING_APPROVAL", createdDto.Status);
        Assert.Equal(600_000, createdDto.RemainingRefundableAmount);
        Assert.True(replayDto.Replayed);
        Assert.IsType<ConflictObjectResult>(conflict.Result);
        Assert.Single(db.PropertyRefunds.IgnoreQueryFilters());
    }

    [Fact]
    public async Task Manager_can_approve_dispatch_and_complete_simulator_refund()
    {
        var setup = await Seed();
        await using var db = setup.Db;
        var controller = new PropertyRefundsController(db);
        SetUser(controller, setup.CustomerId, "Customer");
        var requested = await controller.RequestRefund(setup.Payment.Id.ToString(), new(1_000_000, "Dịch vụ không đúng cam kết"), "refund-request-0002");
        var refund = Assert.IsType<PropertyRefundDto>(Assert.IsType<OkObjectResult>(requested.Result).Value);

        SetUser(controller, Guid.NewGuid(), "Manager", setup.TenantId);
        var approved = await controller.Approve(refund.PublicId);
        var attempt = await controller.CreateAttempt(refund.PublicId, new("SIMULATOR", "SIMULATOR"));
        var completed = await controller.ConfirmSimulator(refund.PublicId);

        Assert.Equal("PENDING_PROVIDER", Assert.IsType<PropertyRefundDto>(Assert.IsType<OkObjectResult>(approved.Result).Value).Status);
        Assert.Equal(1, Assert.IsType<PropertyRefundAttemptDto>(Assert.IsType<OkObjectResult>(attempt.Result).Value).AttemptNumber);
        Assert.Equal("SUCCEEDED", Assert.IsType<PropertyRefundDto>(Assert.IsType<OkObjectResult>(completed.Result).Value).Status);
        Assert.Equal(PaymentStatus.Refunded, setup.Payment.Status);
    }

    [Fact]
    public async Task Customer_cannot_access_another_customers_refund()
    {
        var setup = await Seed();
        await using var db = setup.Db;
        var refund = new PropertyRefund
        {
            TenantId = setup.TenantId, PaymentId = setup.Payment.Id, Payment = setup.Payment,
            PublicId = "RF-PRIVATE", IdempotencyKey = "private-refund-key", RequestedAmount = 100_000,
            Reason = "Yêu cầu riêng", Status = "PENDING_APPROVAL", RequestedByUserId = setup.CustomerId
        };
        db.PropertyRefunds.Add(refund);
        await db.SaveChangesAsync();
        var controller = new PropertyRefundsController(db);
        SetUser(controller, Guid.NewGuid(), "Customer");

        var denied = await controller.Get(refund.PublicId);

        Assert.IsType<NotFoundObjectResult>(denied.Result);
    }

    [Fact]
    public async Task Cancelled_refund_cannot_be_confirmed_again()
    {
        var setup = await Seed();
        await using var db = setup.Db;
        var refund = new PropertyRefund
        {
            TenantId = setup.TenantId, PaymentId = setup.Payment.Id, Payment = setup.Payment,
            PublicId = "RF-CANCELLED", IdempotencyKey = "cancelled-refund-key", RequestedAmount = 100_000,
            Reason = "Khách yêu cầu hủy", Status = "CANCELLED", RequestedByUserId = setup.CustomerId,
            Environment = "SIMULATOR", AttemptNumber = 1
        };
        db.PropertyRefunds.Add(refund);
        await db.SaveChangesAsync();
        var controller = new PropertyRefundsController(db);
        SetUser(controller, Guid.NewGuid(), "Manager", setup.TenantId);

        var result = await controller.ConfirmSimulator(refund.PublicId);

        Assert.IsType<ConflictObjectResult>(result.Result);
        Assert.Equal("CANCELLED", refund.Status);
        Assert.Equal(PaymentStatus.Completed, setup.Payment.Status);
    }

    [Fact]
    public async Task Failed_refund_can_be_retried_but_succeeded_refund_cannot()
    {
        var setup = await Seed();
        await using var db = setup.Db;
        var refund = new PropertyRefund
        {
            TenantId = setup.TenantId, PaymentId = setup.Payment.Id, Payment = setup.Payment,
            PublicId = "RF-FAILED", IdempotencyKey = "failed-refund-key", RequestedAmount = 100_000,
            Reason = "Cổng lỗi", Status = "FAILED", FailureCode = "TIMEOUT", RequestedByUserId = setup.CustomerId
        };
        db.PropertyRefunds.Add(refund);
        await db.SaveChangesAsync();
        var controller = new PropertyRefundsController(db);
        SetUser(controller, Guid.NewGuid(), "Manager", setup.TenantId);

        var retried = await controller.Retry(refund.PublicId);
        var result = Assert.IsType<PropertyRefundDto>(Assert.IsType<OkObjectResult>(retried.Result).Value);
        Assert.Equal("PENDING_PROVIDER", result.Status);
        Assert.Null(result.FailureCode);

        refund.Status = "SUCCEEDED";
        await db.SaveChangesAsync();
        var rejected = await controller.Retry(refund.PublicId);
        Assert.IsType<ConflictObjectResult>(rejected.Result);
    }

    private static async Task<Setup> Seed()
    {
        var tenantService = new CurrentTenantService();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        var db = new ApplicationDbContext(options, tenantService);
        var tenantId = Guid.NewGuid();
        var customerId = Guid.NewGuid();
        var reservation = new Reservation
        {
            TenantId = tenantId, CustomerUserId = customerId, BookingCode = "LXS-REFUND01",
            CheckInDate = DateOnly.FromDateTime(DateTime.Today.AddDays(5)), CheckOutDate = DateOnly.FromDateTime(DateTime.Today.AddDays(6)),
            Status = ReservationStatus.Cancelled, TotalAmount = 1_000_000, GuestFullName = "Refund Customer", GuestPhoneNumber = "0900000000"
        };
        var payment = new Payment
        {
            TenantId = tenantId, ReservationId = reservation.Id, Reservation = reservation,
            Amount = 1_000_000, Method = PaymentMethod.VNPay, Status = PaymentStatus.Completed, PaidAtUtc = DateTime.UtcNow
        };
        db.AddRange(reservation, payment);
        await db.SaveChangesAsync();
        return new Setup(db, tenantId, customerId, payment);
    }

    private static void SetUser(ControllerBase controller, Guid userId, string role, Guid? tenantId = null)
    {
        var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, userId.ToString()), new(ClaimTypes.Role, role) };
        if (tenantId.HasValue) claims.Add(new("tenant_id", tenantId.Value.ToString()));
        controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Test")) } };
    }

    private sealed record Setup(ApplicationDbContext Db, Guid TenantId, Guid CustomerId, Payment Payment);
}
