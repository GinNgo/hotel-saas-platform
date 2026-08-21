using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class InvoicesController : ControllerBase
{
    private readonly IApplicationDbContext _context;

    public InvoicesController(IApplicationDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    [Authorize(Policy = "invoice.read")]
    public async Task<ActionResult<List<InvoiceSummaryDto>>> GetAll() =>
        Ok((await InvoiceQuery().Where(item => item.Folio!.IsClosed).OrderByDescending(item => item.Folio!.ClosedAtUtc)
            .ToListAsync()).Select(ToSummary).ToList());

    [HttpGet("finalized/my")]
    [Authorize(Roles = "Customer")]
    public async Task<ActionResult<List<InvoiceSummaryDto>>> GetMine()
    {
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Forbid();
        var invoices = await InvoiceQuery().IgnoreQueryFilters()
            .Where(item => item.CustomerUserId == userId && item.Folio != null && item.Folio.IsClosed)
            .OrderByDescending(item => item.Folio!.ClosedAtUtc).ToListAsync();
        return Ok(invoices.Select(ToSummary).ToList());
    }

    [HttpGet("{invoiceId:guid}")]
    public async Task<ActionResult<PropertyInvoiceDetailDto>> GetInvoice(Guid invoiceId)
    {
        var reservation = await FindAccessibleInvoice(invoiceId);
        return reservation == null
            ? NotFound(new { message = "Không tìm thấy hóa đơn hoặc bạn không có quyền truy cập." })
            : Ok(ToDetail(reservation));
    }

    [HttpGet("{invoiceId:guid}/pdf")]
    public async Task<IActionResult> DownloadPdf(Guid invoiceId)
    {
        var reservation = await FindAccessibleInvoice(invoiceId);
        if (reservation == null) return NotFound(new { message = "Không tìm thấy hóa đơn hoặc bạn không có quyền truy cập." });
        var pdf = BuildPdf(reservation);
        var filename = SafeFilename(reservation.Folio!.FolioNumber) + ".pdf";
        return File(pdf, "application/pdf", filename);
    }

    [HttpPost("{invoiceId:guid}/email")]
    [Authorize(Policy = "invoice.read")]
    public async Task<ActionResult<InvoiceEmailResultDto>> EmailInvoice(Guid invoiceId)
    {
        var reservation = await FindAccessibleInvoice(invoiceId);
        if (reservation == null) return NotFound(new { message = "Không tìm thấy hóa đơn hoặc bạn không có quyền truy cập." });
        var pdf = BuildPdf(reservation);
        return Ok(new InvoiceEmailResultDto(invoiceId, reservation.Folio!.FolioNumber,
            reservation.GuestEmail, false, Convert.ToHexString(SHA256.HashData(pdf)).ToLowerInvariant(),
            Request.Headers["X-Correlation-ID"].FirstOrDefault()));
    }

    [HttpGet("/api/management/invoices/finalized")]
    [Authorize(Policy = "invoice.read")]
    public async Task<ActionResult<List<InvoiceSummaryDto>>> GetFinalized() => await GetAll();

    [HttpGet("/api/management/reservations/{reservationId:guid}/invoice")]
    [Authorize(Policy = "invoice.read")]
    public async Task<ActionResult<PropertyInvoiceDetailDto>> GetByReservation(Guid reservationId)
    {
        var reservation = await InvoiceQuery().FirstOrDefaultAsync(item => item.Id == reservationId && item.Folio!.IsClosed);
        return reservation == null
            ? NotFound(new { message = "Reservation chưa có hóa đơn đã chốt." })
            : Ok(ToDetail(reservation));
    }

    [HttpPost("reservation/{reservationId:guid}")]
    [Authorize(Policy = "invoice.execute")]
    public async Task<ActionResult<LegacyInvoiceDto>> ExistingInvoice(Guid reservationId)
    {
        var reservation = await InvoiceQuery().FirstOrDefaultAsync(item => item.Id == reservationId && item.Folio!.IsClosed);
        return reservation == null
            ? Conflict(new { message = "Hóa đơn chỉ được tạo khi checkout đã hoàn tất." })
            : Ok(new LegacyInvoiceDto(reservation.Folio!.Id, reservation.Folio.FolioNumber,
                reservation.Id, reservation.Folio.ClosedAtUtc, reservation.Folio.TotalCharges, "FINALIZED"));
    }

    private IQueryable<Reservation> InvoiceQuery() => _context.Reservations
        .Include(item => item.Tenant)
        .Include(item => item.Folio!).ThenInclude(folio => folio!.Items)
        .Include(item => item.Payments).ThenInclude(payment => payment.Refunds)
        .Where(item => !item.IsDeleted && item.Folio != null);

    private async Task<Reservation?> FindAccessibleInvoice(Guid invoiceId)
    {
        if (HasPermission("INVOICE", 1))
            return await InvoiceQuery().FirstOrDefaultAsync(item => item.Folio!.Id == invoiceId && item.Folio.IsClosed);

        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return null;
        return await InvoiceQuery().IgnoreQueryFilters().FirstOrDefaultAsync(item =>
            item.Folio!.Id == invoiceId && item.Folio.IsClosed && item.CustomerUserId == userId);
    }

    private bool HasPermission(string function, int action) => User.FindAll("permission").Any(claim =>
    {
        var parts = claim.Value.Split(':', 2, StringSplitOptions.TrimEntries);
        return parts.Length == 2 && parts[0].Equals(function, StringComparison.OrdinalIgnoreCase) &&
            int.TryParse(parts[1], out var mask) && (mask & action) == action;
    });

    private static InvoiceSummaryDto ToSummary(Reservation reservation) => new(
        reservation.Folio!.Id, reservation.Id, reservation.Folio.FolioNumber,
        reservation.Folio.ClosedAtUtc, reservation.Folio.ClosedAtUtc,
        reservation.Folio.TotalCharges, "FINALIZED", "VND",
        CustomerSnapshot(reservation), PropertySnapshot(reservation));

    private static PropertyInvoiceDetailDto ToDetail(Reservation reservation)
    {
        var folio = reservation.Folio!;
        var lines = folio.Items.Where(item => !item.Description.StartsWith("Debt override:"))
            .Select(item => new InvoiceLineDto(item.Id, ItemType(item.ItemType),
                item.ItemType.ToString().ToUpperInvariant(), item.Description, item.Description,
                item.Quantity, item.UnitPrice, 0, item.ItemType == FolioItemType.Discount ? -item.Amount : 0,
                item.Amount, item.DateIncurredUtc, null)).ToList();
        var allocations = reservation.Payments.Where(item => item.Status is PaymentStatus.Completed or PaymentStatus.Refunded)
            .Select(item => new InvoicePaymentAllocationDto(item.Id, item.Id,
                item.TransactionReference ?? item.Id.ToString("N"), item.Amount,
                item.Method.ToString().ToUpperInvariant(), item.Method == PaymentMethod.VNPay ? "VNPAY" : "MANUAL",
                item.PaidAtUtc ?? item.CreatedAtUtc)).ToList();
        var discount = -folio.Items.Where(item => item.ItemType == FolioItemType.Discount && item.Amount < 0).Sum(item => item.Amount);
        var paid = reservation.Payments.Where(item => item.Status is PaymentStatus.Completed or PaymentStatus.Refunded).Sum(item => item.Amount);
        var refunds = reservation.Payments.SelectMany(item => item.Refunds).Where(item => item.Status == "SUCCEEDED").Sum(item => item.RequestedAmount);
        var creditNotes = reservation.Payments.SelectMany(item => item.Refunds).Where(item => item.Status == "SUCCEEDED")
            .Select(item => (object)new { id = item.Id, publicId = item.PublicId, amount = item.RequestedAmount,
                currency = "VND", occurredAt = item.CompletedAtUtc, provider = item.Provider }).ToList();
        return new PropertyInvoiceDetailDto(folio.Id, reservation.Id, folio.FolioNumber, "FINALIZED", "VND",
            folio.TotalCharges + discount, 0, 0, discount, folio.TotalCharges, paid, refunds,
            folio.BalanceDue, CustomerSnapshot(reservation), PropertySnapshot(reservation),
            folio.ClosedAtUtc ?? folio.UpdatedAtUtc ?? folio.CreatedAtUtc, lines, allocations, creditNotes);
    }

    private static string CustomerSnapshot(Reservation reservation) => JsonSerializer.Serialize(new
    {
        fullName = reservation.GuestFullName, email = reservation.GuestEmail,
        phoneNumber = reservation.GuestPhoneNumber, identityCard = reservation.GuestIdentityCard
    });

    private static string PropertySnapshot(Reservation reservation) => JsonSerializer.Serialize(new
    {
        id = reservation.TenantId, name = reservation.Tenant?.Name,
        address = reservation.Tenant?.Address, city = reservation.Tenant?.City,
        phoneNumber = reservation.Tenant?.PhoneNumber, email = reservation.Tenant?.Email
    });

    private static byte[] BuildPdf(Reservation reservation)
    {
        var folio = reservation.Folio!;
        var lines = new List<string>
        {
            $"INVOICE {folio.FolioNumber}", $"Booking: {reservation.BookingCode}",
            $"Guest: {Ascii(reservation.GuestFullName)}", $"Finalized: {(folio.ClosedAtUtc ?? DateTime.UtcNow):yyyy-MM-dd HH:mm} UTC"
        };
        lines.AddRange(folio.Items.Where(item => !item.Description.StartsWith("Debt override:"))
            .Select(item => $"{Ascii(item.Description)} x{item.Quantity}: {item.Amount:N0} VND"));
        lines.Add($"TOTAL: {folio.TotalCharges:N0} VND");
        lines.Add($"PAID/CREDIT: {folio.TotalCredits:N0} VND");
        var refunded = reservation.Payments.SelectMany(item => item.Refunds).Where(item => item.Status == "SUCCEEDED").Sum(item => item.RequestedAmount);
        if (refunded > 0) lines.Add($"REFUNDED: {refunded:N0} VND");
        lines.Add($"BALANCE: {folio.BalanceDue:N0} VND");
        return SimplePdf(lines);
    }

    private static byte[] SimplePdf(IEnumerable<string> lines)
    {
        var content = new StringBuilder("BT /F1 11 Tf 50 790 Td 14 TL ");
        foreach (var line in lines) content.Append('(').Append(EscapePdf(line)).Append(") Tj T* ");
        content.Append("ET");
        var objects = new[]
        {
            "<< /Type /Catalog /Pages 2 0 R >>",
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
            $"<< /Length {Encoding.ASCII.GetByteCount(content.ToString())} >>\nstream\n{content}\nendstream",
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
        };
        var pdf = new StringBuilder("%PDF-1.4\n");
        var offsets = new List<int> { 0 };
        for (var index = 0; index < objects.Length; index++)
        {
            offsets.Add(Encoding.ASCII.GetByteCount(pdf.ToString()));
            pdf.Append(index + 1).Append(" 0 obj\n").Append(objects[index]).Append("\nendobj\n");
        }
        var xref = Encoding.ASCII.GetByteCount(pdf.ToString());
        pdf.Append("xref\n0 ").Append(objects.Length + 1).Append("\n0000000000 65535 f \n");
        foreach (var offset in offsets.Skip(1)) pdf.Append(offset.ToString("D10")).Append(" 00000 n \n");
        pdf.Append("trailer << /Size ").Append(objects.Length + 1).Append(" /Root 1 0 R >>\nstartxref\n")
            .Append(xref).Append("\n%%EOF");
        return Encoding.ASCII.GetBytes(pdf.ToString());
    }

    private static string EscapePdf(string value) => value.Replace("\\", "\\\\").Replace("(", "\\(").Replace(")", "\\)");
    private static string Ascii(string value) => string.Concat(value.Normalize(NormalizationForm.FormD)
        .Where(character => System.Globalization.CharUnicodeInfo.GetUnicodeCategory(character) != System.Globalization.UnicodeCategory.NonSpacingMark && character <= 127));
    private static string SafeFilename(string value) => string.Concat(value.Select(character => char.IsLetterOrDigit(character) || character is '-' or '_' ? character : '_'));
    private static string ItemType(FolioItemType type) => type switch
    {
        FolioItemType.RoomCharge => "ROOM", FolioItemType.Minibar or FolioItemType.Laundry or FolioItemType.Restaurant => "SERVICE",
        FolioItemType.Surcharge => "SURCHARGE", FolioItemType.Discount => "DISCOUNT", _ => "ADJUSTMENT"
    };
}

public record LegacyInvoiceDto(Guid Id, string InvoiceCode, Guid ReservationId, DateTime? IssueDate, decimal TotalAmount, string Status);
public record InvoiceSummaryDto(Guid Id, Guid ReservationId, string InvoiceNumber, DateTime? IssueDate,
    DateTime? FinalizedAt, decimal TotalAmount, string Status, string Currency,
    string CustomerSnapshotJson, string PropertySnapshotJson);
public record InvoiceLineDto(Guid Id, string LineType, string Code, string Name, string? Description,
    int Quantity, decimal UnitPrice, decimal TaxAmount, decimal DiscountAmount, decimal TotalAmount,
    DateTime? UsageStartedAt, DateTime? UsageEndedAt);
public record InvoicePaymentAllocationDto(Guid Id, Guid TransactionId, string TransactionPublicId,
    decimal AllocatedAmount, string Method, string Provider, DateTime OccurredAt);
public record PropertyInvoiceDetailDto(Guid Id, Guid ReservationId, string InvoiceNumber, string Status,
    string Currency, decimal Subtotal, decimal TaxAmount, decimal FeeAmount, decimal DiscountAmount,
    decimal TotalAmount, decimal PaidAmount, decimal RefundedAmount, decimal BalanceAmount,
    string CustomerSnapshotJson, string PropertySnapshotJson, DateTime FinalizedAt,
    List<InvoiceLineDto> Lines, List<InvoicePaymentAllocationDto> Allocations, List<object> CreditNotes);
public record InvoiceEmailResultDto(Guid InvoiceId, string InvoiceNumber, string Recipient,
    bool Sent, string ContentSha256, string? CorrelationId);
