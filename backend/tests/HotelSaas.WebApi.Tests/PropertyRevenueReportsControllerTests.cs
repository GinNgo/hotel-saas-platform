using System.Text;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using HotelSaas.Infrastructure.Persistence;
using HotelSaas.Infrastructure.Services;
using HotelSaas.WebApi.Controllers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace HotelSaas.WebApi.Tests;

public class PropertyRevenueReportsControllerTests
{
    [Fact]
    public async Task Report_uses_successful_payments_and_refunds_and_exports_csv()
    {
        var tenantService = new CurrentTenantService();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using var db = new ApplicationDbContext(options, tenantService);
        var tenant = new Tenant { Name = "Revenue Hotel", Code = "REV-01", Slug = "revenue-hotel", Address = "1 Report", City = "Da Nang", Status = TenantStatus.Active };
        tenantService.SetTenant(tenant.Id, SubscriptionTier.Pro);
        var reservation = new Reservation
        {
            TenantId = tenant.Id, Tenant = tenant, BookingCode = "LXS-REVENUE", GuestFullName = "Revenue Guest",
            GuestPhoneNumber = "0900000000", CheckInDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-2)),
            CheckOutDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1)), Status = ReservationStatus.Cancelled,
            TotalAmount = 1_000_000
        };
        var payment = new Payment
        {
            TenantId = tenant.Id, Reservation = reservation, ReservationId = reservation.Id, Amount = 1_000_000,
            Method = PaymentMethod.VNPay, Status = PaymentStatus.Refunded, PaidAtUtc = DateTime.UtcNow.AddHours(-2)
        };
        payment.Refunds.Add(new PropertyRefund
        {
            TenantId = tenant.Id, Payment = payment, PaymentId = payment.Id, PublicId = "RF-REPORT",
            IdempotencyKey = "report-refund-key", RequestedAmount = 400_000, Reason = "Partial refund",
            Status = "SUCCEEDED", CompletedAtUtc = DateTime.UtcNow.AddHours(-1)
        });
        db.AddRange(tenant, reservation, payment);
        await db.SaveChangesAsync();
        var controller = new PropertyRevenueReportsController(db, tenantService);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var filter = new PropertyRevenueFilter(today.AddDays(-1), today, tenant.Id, "NET", null, null, null, null);

        var response = await controller.Get(filter);
        var export = await controller.Export(filter, "CSV");

        var report = Assert.IsType<PropertyRevenueReportDto>(Assert.IsType<OkObjectResult>(response.Result).Value);
        Assert.Equal(1_000_000, report.Totals.GrossRevenue);
        Assert.Equal(400_000, report.Totals.Refunds);
        Assert.Equal(600_000, report.Totals.NetRevenue);
        Assert.Equal(400_000, Assert.Single(report.Rows).RefundAmount);
        var file = Assert.IsType<FileContentResult>(export);
        Assert.Contains(payment.Id.ToString(), Encoding.UTF8.GetString(file.FileContents));
    }

    [Fact]
    public async Task Report_rejects_another_tenant_scope()
    {
        var tenantService = new CurrentTenantService();
        tenantService.SetTenant(Guid.NewGuid(), SubscriptionTier.Pro);
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using var db = new ApplicationDbContext(options, tenantService);
        var controller = new PropertyRevenueReportsController(db, tenantService);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var response = await controller.Get(new(today, today, Guid.NewGuid(), "NET", null, null, null, null));

        Assert.IsType<NotFoundObjectResult>(response.Result);
    }
}
