using System.Globalization;
using System.Text;
using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/management/reports/property-revenue")]
[Authorize]
public class PropertyRevenueReportsController : ControllerBase
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentTenantService _tenantService;

    public PropertyRevenueReportsController(IApplicationDbContext context, ICurrentTenantService tenantService)
    {
        _context = context;
        _tenantService = tenantService;
    }

    [HttpGet]
    [Authorize(Policy = "report.read")]
    public async Task<ActionResult<PropertyRevenueReportDto>> Get([FromQuery] PropertyRevenueFilter filter)
    {
        var validation = Validate(filter);
        if (validation != null) return validation;
        return Ok(await Build(filter));
    }

    [HttpGet("export")]
    [Authorize(Policy = "report.export")]
    public async Task<IActionResult> Export([FromQuery] PropertyRevenueFilter filter, [FromQuery] string format = "CSV")
    {
        var validation = Validate(filter);
        if (validation != null) return validation;
        if (!string.Equals(format, "CSV", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { code = "EXPORT_FORMAT_NOT_SUPPORTED", message = "Hiện báo cáo doanh thu cơ sở hỗ trợ xuất CSV." });
        var report = await Build(filter);
        var csv = new StringBuilder("OccurredAt,PublicId,TransactionType,Method,Provider,GrossAmount,RefundAmount,CreditAmount,NetAmount,ReconciliationStatus\r\n");
        foreach (var row in report.Rows)
            csv.Append(Csv(row.OccurredAt.ToString("O"))).Append(',').Append(Csv(row.PublicId)).Append(',')
                .Append(Csv(row.TransactionType)).Append(',').Append(Csv(row.Method)).Append(',').Append(Csv(row.Provider)).Append(',')
                .Append(row.GrossAmount.ToString(CultureInfo.InvariantCulture)).Append(',')
                .Append(row.RefundAmount.ToString(CultureInfo.InvariantCulture)).Append(',')
                .Append(row.CreditAmount.ToString(CultureInfo.InvariantCulture)).Append(',')
                .Append(row.NetAmount.ToString(CultureInfo.InvariantCulture)).Append(',')
                .Append(Csv(row.ReconciliationStatus)).Append("\r\n");
        return File(new UTF8Encoding(true).GetBytes(csv.ToString()), "text/csv; charset=utf-8",
            $"property-revenue-{filter.From:yyyyMMdd}-{filter.To:yyyyMMdd}.csv");
    }

    private ObjectResult? Validate(PropertyRevenueFilter filter)
    {
        if (!_tenantService.TenantId.HasValue || filter.PropertyId != _tenantService.TenantId.Value)
            return NotFound(new { message = "Không tìm thấy cơ sở trong phạm vi tài khoản." });
        if (filter.From == default || filter.To == default || filter.From > filter.To || filter.To.DayNumber - filter.From.DayNumber > 366)
            return BadRequest(new { message = "Khoảng báo cáo phải hợp lệ và không vượt quá 366 ngày." });
        if (filter.Basis?.ToUpperInvariant() is not (null or "NET" or "CASH_COLLECTED" or "INVOICED"))
            return BadRequest(new { message = "Cơ sở ghi nhận doanh thu không hợp lệ." });
        return null;
    }

    private async Task<PropertyRevenueReportDto> Build(PropertyRevenueFilter filter)
    {
        var fromUtc = filter.From.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var toExclusiveUtc = filter.To.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var payments = await _context.Payments.AsNoTracking()
            .Include(item => item.Reservation!).ThenInclude(reservation => reservation!.Folio)
            .Include(item => item.Reservation!).ThenInclude(reservation => reservation!.Details).ThenInclude(detail => detail.RoomType)
            .Include(item => item.Refunds)
            .Where(item => item.TenantId == filter.PropertyId && item.CreatedAtUtc >= fromUtc && item.CreatedAtUtc < toExclusiveUtc)
            .Where(item => string.IsNullOrEmpty(filter.Method) || item.Method.ToString().ToUpper() == filter.Method.ToUpper())
            .Where(item => string.IsNullOrEmpty(filter.RoomType) || item.Reservation!.Details.Any(detail => detail.RoomType!.Code == filter.RoomType))
            .OrderByDescending(item => item.PaidAtUtc ?? item.CreatedAtUtc).ToListAsync();

        var rows = payments.Select(payment =>
        {
            var provider = payment.Method == PaymentMethod.VNPay ? "VNPAY" : "MANUAL";
            var method = MethodName(payment.Method);
            var refunds = payment.Refunds.Where(refund => refund.Status == "SUCCEEDED").Sum(refund => refund.RequestedAmount);
            var gross = payment.Status is PaymentStatus.Completed or PaymentStatus.Refunded ? payment.Amount : 0;
            var reconciliation = payment.Status is PaymentStatus.Completed or PaymentStatus.Refunded ? "RECONCILED" : "UNRECONCILED";
            return new PropertyRevenueRowDto("PROPERTY_COMMERCE", payment.Id.ToString(), payment.PaidAtUtc ?? payment.CreatedAtUtc,
                "PAYMENT", "RESERVATION", payment.ReservationId.ToString(), payment.TenantId, method, provider,
                gross, refunds, 0, gross - refunds,
                new Dictionary<string, string> { ["BOOKING_CODE"] = payment.Reservation?.BookingCode ?? string.Empty }, reconciliation);
        }).Where(row => (string.IsNullOrEmpty(filter.Provider) || row.Provider.Equals(filter.Provider, StringComparison.OrdinalIgnoreCase)) &&
            (string.IsNullOrEmpty(filter.TransactionType) || row.TransactionType.Equals(filter.TransactionType, StringComparison.OrdinalIgnoreCase))).ToList();

        var grossPayments = rows.Sum(row => row.GrossAmount);
        var refundsTotal = rows.Sum(row => row.RefundAmount);
        var reservations = payments.Select(payment => payment.Reservation).Where(item => item?.Folio != null).DistinctBy(item => item!.Id).ToList();
        var invoiced = reservations.Where(item => item!.Folio!.IsClosed).Sum(item => item!.Folio!.TotalCharges);
        var credits = reservations.Sum(item => Math.Max(0, item!.Folio!.TotalCredits -
            payments.Where(payment => payment.ReservationId == item.Id && payment.Status is PaymentStatus.Completed or PaymentStatus.Refunded).Sum(payment => payment.Amount)));
        var basis = filter.Basis?.ToUpperInvariant() ?? "NET";
        var gross = basis == "INVOICED" ? invoiced : grossPayments;
        var unpaid = reservations.Sum(item => Math.Max(0, item!.Folio!.BalanceDue));
        var held = payments.Where(payment => payment.Status == PaymentStatus.Pending).Sum(payment => payment.Amount);
        var breakdowns = rows.GroupBy(row => row.TransactionType).Select(group => new PropertyRevenueBreakdownDto(
            "TRANSACTION_TYPE", group.Key, group.Key == "PAYMENT" ? "Thanh toán booking" : group.Key,
            group.Count(), group.Sum(row => row.GrossAmount), group.Sum(row => row.RefundAmount),
            group.Sum(row => row.CreditAmount), group.Sum(row => row.NetAmount), false)).ToList();
        var issues = rows.Where(row => row.ReconciliationStatus != "RECONCILED").Select(row => new PropertyRevenueIssueDto(
            "PAYMENT_UNRECONCILED", row.SourceType, row.SourceId, row.GrossAmount, 0, row.GrossAmount,
            "Giao dịch chưa hoàn tất hoặc chưa đối soát.")).ToList();
        var generatedAt = DateTime.UtcNow;
        return new PropertyRevenueReportDto("PROPERTY_COMMERCE", basis,
            new PropertyRevenueAppliedFilterDto("PROPERTY_COMMERCE", basis, fromUtc, toExclusiveUtc, "UTC", filter.PropertyId,
                filter.Provider, filter.Method, filter.TransactionType, filter.RoomType),
            new PropertyRevenueTotalsDto(gross, refundsTotal, credits, gross - refundsTotal - credits,
                grossPayments, invoiced, unpaid, held, rows.Count(row => row.ReconciliationStatus == "RECONCILED"),
                payments.Count(payment => payment.Status == PaymentStatus.Failed), issues.Count),
            breakdowns, rows, issues, rows.Count, generatedAt.ToString("O"), generatedAt);
    }

    private static string MethodName(PaymentMethod method) => method switch
    {
        PaymentMethod.BankTransfer => "BANK_TRANSFER", PaymentMethod.CreditCard => "CREDIT_CARD",
        PaymentMethod.VNPay => "VNPAY", _ => "CASH"
    };
    private static string Csv(string? value) => $"\"{(value ?? string.Empty).Replace("\"", "\"\"")}\"";
}

public record PropertyRevenueFilter(DateOnly From, DateOnly To, Guid PropertyId, string? Basis,
    string? Provider, string? Method, string? TransactionType, string? RoomType);
public record PropertyRevenueAppliedFilterDto(string Context, string Basis, DateTime FromInclusive, DateTime ToExclusive,
    string ZoneId, Guid PropertyId, string? Provider, string? Method, string? TransactionType, string? RoomType);
public record PropertyRevenueTotalsDto(decimal GrossRevenue, decimal Refunds, decimal Credits, decimal NetRevenue,
    decimal CashCollected, decimal InvoicedRevenue, decimal UnpaidBalance, decimal HeldDeposits,
    int SuccessfulTransactionCount, int FailedTransactionCount, int UnreconciledTransactionCount);
public record PropertyRevenueBreakdownDto(string Dimension, string Code, string Label, int TransactionCount,
    decimal GrossRevenue, decimal Refunds, decimal Credits, decimal NetRevenue, bool RecurringEligible);
public record PropertyRevenueRowDto(string Context, string PublicId, DateTime OccurredAt, string TransactionType,
    string SourceType, string SourceId, Guid PropertyId, string Method, string Provider, decimal GrossAmount,
    decimal RefundAmount, decimal CreditAmount, decimal NetAmount, Dictionary<string, string> Dimensions,
    string ReconciliationStatus);
public record PropertyRevenueIssueDto(string Code, string SourceType, string SourceId, decimal ExpectedAmount,
    decimal ActualAmount, decimal DeltaAmount, string Message);
public record PropertyRevenueReportDto(string Context, string Basis, PropertyRevenueAppliedFilterDto Filters,
    PropertyRevenueTotalsDto Totals, List<PropertyRevenueBreakdownDto> Breakdowns, List<PropertyRevenueRowDto> Rows,
    List<PropertyRevenueIssueDto> ReconciliationIssues, int TotalRowCount, string SourceWatermark, DateTime GeneratedAt);
