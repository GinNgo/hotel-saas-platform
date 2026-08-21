using System.Security.Claims;
using System.Text;
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

public class InvoicesControllerTests
{
    [Fact]
    public async Task Staff_can_read_finalized_invoice_and_download_valid_pdf()
    {
        var setup = await Setup();
        await using var db = setup.Db;
        var controller = Controller(db, Guid.NewGuid(), StaffRole.Manager.ToString(), "INVOICE:1");

        var detailResponse = await controller.GetInvoice(setup.Reservation.Folio!.Id);
        var pdfResponse = await controller.DownloadPdf(setup.Reservation.Folio.Id);

        var detail = Assert.IsType<PropertyInvoiceDetailDto>(Assert.IsType<OkObjectResult>(detailResponse.Result).Value);
        Assert.Equal(setup.Reservation.Folio.FolioNumber, detail.InvoiceNumber);
        Assert.Equal(1_000_000, detail.TotalAmount);
        Assert.Equal(250_000, detail.RefundedAmount);
        Assert.Single(detail.CreditNotes);
        var pdf = Assert.IsType<FileContentResult>(pdfResponse);
        Assert.StartsWith("%PDF-1.4", Encoding.ASCII.GetString(pdf.FileContents));
        Assert.Equal("application/pdf", pdf.ContentType);
    }

    [Fact]
    public async Task Customer_cannot_read_another_customers_invoice()
    {
        var setup = await Setup();
        await using var db = setup.Db;
        var controller = Controller(db, Guid.NewGuid(), GlobalUserRole.Customer.ToString());

        var response = await controller.GetInvoice(setup.Reservation.Folio!.Id);

        Assert.IsType<NotFoundObjectResult>(response.Result);
    }

    [Fact]
    public async Task Legacy_staff_role_without_invoice_permission_cannot_read_invoice_detail()
    {
        var setup = await Setup();
        await using var db = setup.Db;
        var controller = Controller(db, Guid.NewGuid(), StaffRole.Manager.ToString());

        var response = await controller.GetInvoice(setup.Reservation.Folio!.Id);

        Assert.IsType<NotFoundObjectResult>(response.Result);
    }

    [Fact]
    public async Task Invoice_email_reports_not_sent_without_delivery_provider_and_has_stable_content_hash()
    {
        var setup = await Setup();
        await using var db = setup.Db;
        var controller = Controller(db, setup.Customer.Id, GlobalUserRole.Customer.ToString());
        controller.Request.Headers["X-Correlation-ID"] = "invoice-test";

        var response = await controller.EmailInvoice(setup.Reservation.Folio!.Id);

        var result = Assert.IsType<InvoiceEmailResultDto>(Assert.IsType<OkObjectResult>(response.Result).Value);
        Assert.False(result.Sent);
        Assert.Equal(setup.Reservation.GuestEmail, result.Recipient);
        Assert.Equal(64, result.ContentSha256.Length);
        Assert.Equal("invoice-test", result.CorrelationId);
    }

    private static InvoicesController Controller(ApplicationDbContext db, Guid userId, string role, string? permission = null)
    {
        var controller = new InvoicesController(db)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, userId.ToString()), new(ClaimTypes.Role, role)
        };
        if (permission != null) claims.Add(new Claim("permission", permission));
        controller.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "test"));
        return controller;
    }

    private static async Task<SetupResult> Setup()
    {
        var tenantService = new CurrentTenantService();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        var db = new ApplicationDbContext(options, tenantService);
        var tenant = new Tenant
        {
            Name = "Invoice Hotel", Code = $"INV-{Guid.NewGuid():N}", Slug = $"inv-{Guid.NewGuid():N}",
            Address = "1 Invoice Street", City = "Da Nang", Status = TenantStatus.Active
        };
        tenantService.SetTenant(tenant.Id, SubscriptionTier.Pro);
        var customer = new User
        {
            Username = "invoice-customer", Email = "invoice@example.com", FullName = "Invoice Customer",
            PasswordHash = "test", GlobalRole = GlobalUserRole.Customer, IsActive = true
        };
        var reservation = new Reservation
        {
            TenantId = tenant.Id, Tenant = tenant, CustomerUser = customer, CustomerUserId = customer.Id,
            BookingCode = "LXS-INVOICE", GuestFullName = customer.FullName, GuestEmail = customer.Email,
            GuestPhoneNumber = "0901234567", CheckInDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-2)),
            CheckOutDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1)),
            Status = ReservationStatus.CheckedOut, TotalAmount = 1_000_000
        };
        reservation.Folio = new Folio
        {
            TenantId = tenant.Id, Reservation = reservation, ReservationId = reservation.Id,
            FolioNumber = "FOL-LXS-INVOICE", TotalCharges = 1_000_000, TotalCredits = 1_000_000,
            IsClosed = true, ClosedAtUtc = DateTime.UtcNow
        };
        reservation.Folio.Items.Add(new FolioItem
        {
            TenantId = tenant.Id, Folio = reservation.Folio, FolioId = reservation.Folio.Id,
            ItemType = FolioItemType.RoomCharge, Description = "Tien phong", UnitPrice = 1_000_000, Quantity = 1
        });
        var payment = new Payment
        {
            TenantId = tenant.Id, Reservation = reservation, ReservationId = reservation.Id,
            Amount = 1_000_000, Method = PaymentMethod.VNPay, Status = PaymentStatus.Completed,
            TransactionReference = "TXN-INVOICE", PaidAtUtc = DateTime.UtcNow
        };
        payment.Refunds.Add(new PropertyRefund
        {
            TenantId = tenant.Id, Payment = payment, PaymentId = payment.Id, PublicId = "RF-INVOICE",
            IdempotencyKey = "invoice-refund-key", RequestedAmount = 250_000, Reason = "Partial refund",
            Status = "SUCCEEDED", CompletedAtUtc = DateTime.UtcNow
        });
        reservation.Payments.Add(payment);
        db.AddRange(tenant, customer, reservation);
        await db.SaveChangesAsync();
        return new SetupResult(db, customer, reservation);
    }

    private sealed record SetupResult(ApplicationDbContext Db, User Customer, Reservation Reservation);
}
