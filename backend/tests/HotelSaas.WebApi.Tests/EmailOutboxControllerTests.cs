using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using HotelSaas.Infrastructure.Persistence;
using HotelSaas.Infrastructure.Services;
using HotelSaas.WebApi.Controllers;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace HotelSaas.WebApi.Tests;

public class EmailOutboxControllerTests
{
    [Fact]
    public async Task Failed_booking_email_is_masked_and_can_be_retried()
    {
        var tenantService = new CurrentTenantService();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using var db = new ApplicationDbContext(options, tenantService);
        var tenant = new Tenant
        {
            Name = "Email Hotel", Code = "EMAIL", Slug = "email-hotel", Address = "1 Mail Street", City = "Da Nang"
        };
        var reservation = new Reservation
        {
            TenantId = tenant.Id, Tenant = tenant, BookingCode = "LXS-EMAIL-001", GuestFullName = "Email Guest",
            GuestEmail = "guest@example.com", GuestPhoneNumber = "0900000000",
            CheckInDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1)),
            CheckOutDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(2)),
            Status = ReservationStatus.Confirmed, TotalAmount = 1_000_000,
            ConfirmationEmailStatus = "FAILED", ConfirmationEmailFailureReason = "SMTP_TIMEOUT",
            ConfirmationEmailLastAttemptUtc = DateTime.UtcNow.AddMinutes(-2)
        };
        db.AddRange(tenant, reservation);
        await db.SaveChangesAsync();
        var delivery = new SuccessfulDelivery();
        var controller = new EmailOutboxController(db, delivery);

        var page = Assert.IsType<EmailOutboxPageDto>(Assert.IsType<OkObjectResult>((await controller.Failures()).Result).Value);
        var failure = Assert.Single(page.Content);
        Assert.Equal("g***@example.com", failure.MaskedRecipient);
        Assert.Equal("SMTP_TIMEOUT", failure.LastErrorCode);

        var attempts = Assert.IsType<EmailDeliveryAttemptDto[]>(Assert.IsType<OkObjectResult>((await controller.Attempts(reservation.Id)).Result).Value);
        Assert.Equal("FAILED", Assert.Single(attempts).Outcome);

        var retried = Assert.IsType<EmailOutboxFailureDto>(Assert.IsType<OkObjectResult>((await controller.Retry(reservation.Id)).Result).Value);
        Assert.Equal("SENT", retried.Status);
        Assert.Equal("SENT", reservation.ConfirmationEmailStatus);
        Assert.NotNull(reservation.ConfirmationEmailSentAtUtc);
        Assert.Contains("LXS-EMAIL-001", delivery.Subject);
    }

    [Fact]
    public async Task Manager_cannot_read_or_retry_email_from_another_tenant()
    {
        var tenantService = new CurrentTenantService();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using var db = new ApplicationDbContext(options, tenantService);
        var tenant = new Tenant { Name = "Private Hotel", Code = "PRIVATE", Slug = "private-hotel", Address = "1 Test", City = "Hue" };
        var reservation = new Reservation { TenantId = tenant.Id, Tenant = tenant, BookingCode = "LXS-PRIVATE", GuestFullName = "Private", GuestEmail = "private@example.com", GuestPhoneNumber = "0900000000", CheckInDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1)), CheckOutDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(2)), Status = ReservationStatus.Confirmed, TotalAmount = 100_000, ConfirmationEmailStatus = "FAILED" };
        db.AddRange(tenant, reservation);
        await db.SaveChangesAsync();
        var controller = new EmailOutboxController(db, new SuccessfulDelivery());
        var claims = new[] { new Claim(ClaimTypes.NameIdentifier, Guid.NewGuid().ToString()), new Claim(ClaimTypes.Role, "Manager"), new Claim("tenant_id", Guid.NewGuid().ToString()) };
        controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(claims, "test")) } };

        var page = Assert.IsType<EmailOutboxPageDto>(Assert.IsType<OkObjectResult>((await controller.Failures()).Result).Value);
        Assert.Empty(page.Content);
        Assert.IsType<NotFoundObjectResult>((await controller.Retry(reservation.Id)).Result);
    }

    private sealed class SuccessfulDelivery : IEmailDeliveryService
    {
        public bool IsConfigured => true;
        public string Subject { get; private set; } = string.Empty;
        public Task<EmailDeliveryResult> SendAsync(string recipient, string subject, string htmlBody,
            CancellationToken cancellationToken = default)
        {
            Subject = subject;
            return Task.FromResult(new EmailDeliveryResult(true, "SENT"));
        }
    }
}
