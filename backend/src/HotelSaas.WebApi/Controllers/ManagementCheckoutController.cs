using System.Security.Claims;
using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/management/reservations")]
[Authorize]
public class ManagementCheckoutController : ControllerBase
{
    private readonly IApplicationDbContext _context;

    public ManagementCheckoutController(IApplicationDbContext context)
    {
        _context = context;
    }

    [HttpPost("{reservationId:guid}/charges/services")]
    [Authorize(Policy = "finance.create")]
    public async Task<ActionResult<ReservationChargeDto>> AddServiceCharge(
        Guid reservationId, [FromBody] AddServiceChargeRequest request,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey)
    {
        var reservation = await CheckoutQuery().FirstOrDefaultAsync(item => item.Id == reservationId);
        var stateError = ValidateOpenStay(reservation);
        if (stateError != null) return stateError;
        var entitlementError = ValidateAdvancedFolioEntitlement(reservation!);
        if (entitlementError != null) return entitlementError;
        if (request.Quantity <= 0 || request.Quantity != decimal.Truncate(request.Quantity))
            return BadRequest(new { message = "Số lượng dịch vụ phải là số nguyên lớn hơn 0." });
        if (request.ChargeType is not ("SERVICE" or "MINIBAR"))
            return BadRequest(new { message = "Loại phí dịch vụ không hợp lệ." });

        var replay = FindReplay(reservation!.Folio!, idempotencyKey);
        if (replay != null) return Ok(ToCharge(reservationId, replay, true));
        var service = await _context.HotelServices.FirstOrDefaultAsync(item =>
            item.Id == request.ServiceId && item.IsActive && !item.IsDeleted);
        if (service == null) return BadRequest(new { message = "Dịch vụ không tồn tại hoặc đã ngừng bán." });

        var item = new FolioItem
        {
            TenantId = reservation.TenantId, FolioId = reservation.Folio!.Id,
            ItemType = request.ChargeType == "MINIBAR" ? FolioItemType.Minibar : FolioItemType.Restaurant,
            Description = service.NameVi, UnitPrice = service.Price, Quantity = (int)request.Quantity,
            DateIncurredUtc = request.ServiceUsedAt ?? DateTime.UtcNow,
            CreatedByStaffName = MutationMarker(idempotencyKey)
        };
        reservation.Folio.TotalCharges += item.Amount;
        _context.FolioItems.Add(item);
        await _context.SaveChangesAsync();
        return Ok(ToCharge(reservationId, item, false, request.ChargeType, service.Code, service.NameVi));
    }

    [HttpPost("{reservationId:guid}/charges/surcharges")]
    [Authorize(Policy = "finance.create")]
    public async Task<ActionResult<ReservationChargeDto>> AddAdjustment(
        Guid reservationId, [FromBody] AddAdjustmentRequest request,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey)
    {
        var reservation = await CheckoutQuery().FirstOrDefaultAsync(item => item.Id == reservationId);
        var stateError = ValidateOpenStay(reservation);
        if (stateError != null) return stateError;
        var entitlementError = ValidateAdvancedFolioEntitlement(reservation!);
        if (entitlementError != null) return entitlementError;
        if (request.Amount <= 0 || string.IsNullOrWhiteSpace(request.Description))
            return BadRequest(new { message = "Mô tả và số tiền điều chỉnh hợp lệ là bắt buộc." });

        var replay = FindReplay(reservation!.Folio!, idempotencyKey);
        if (replay != null) return Ok(ToCharge(reservationId, replay, true));
        var signedAmount = request.NegativeAdjustment ? -request.Amount : request.Amount;
        if (reservation.Folio!.TotalCharges + signedAmount < 0)
            return Conflict(new { message = "Điều chỉnh giảm không thể làm tổng chi phí nhỏ hơn 0." });

        var item = new FolioItem
        {
            TenantId = reservation.TenantId, FolioId = reservation.Folio.Id,
            ItemType = request.NegativeAdjustment ? FolioItemType.Discount : FolioItemType.Surcharge,
            Description = request.Description.Trim(), UnitPrice = signedAmount, Quantity = 1,
            CreatedByStaffName = MutationMarker(idempotencyKey)
        };
        reservation.Folio.TotalCharges += item.Amount;
        _context.FolioItems.Add(item);
        await _context.SaveChangesAsync();
        return Ok(ToCharge(reservationId, item, false,
            request.NegativeAdjustment ? "ADJUSTMENT" : "SURCHARGE",
            request.NegativeType ?? request.Type ?? "OTHER", request.Description.Trim()));
    }

    [HttpPost("{reservationId:guid}/checkout-preview")]
    [Authorize(Policy = "checkout.read")]
    public async Task<ActionResult<CheckoutPreviewDto>> Preview(Guid reservationId)
    {
        var reservation = await CheckoutQuery().FirstOrDefaultAsync(item => item.Id == reservationId);
        if (reservation == null) return NotFound(new { message = "Không tìm thấy đơn đặt phòng." });
        if (reservation.Folio == null) return Conflict(new { message = "Đơn đặt phòng chưa có folio." });
        return Ok(ToPreview(reservation));
    }

    [HttpPost("{reservationId:guid}/checkout-override")]
    [Authorize(Policy = "checkout.approve")]
    public async Task<ActionResult<CheckoutOverrideDto>> AuthorizeDebtOverride(Guid reservationId, [FromBody] CheckoutOverrideRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length < 10)
            return BadRequest(new { message = "Lý do phê duyệt ghi nợ phải có ít nhất 10 ký tự." });
        var reservation = await CheckoutQuery().FirstOrDefaultAsync(item => item.Id == reservationId);
        var stateError = ValidateOpenStay(reservation);
        if (stateError != null) return stateError;
        var activeReservation = reservation!;
        if (ToPreview(activeReservation).Folio.Balance <= 0)
            return Conflict(new { message = "Folio không còn dư nợ cần phê duyệt." });

        var marker = new FolioItem
        {
            TenantId = activeReservation.TenantId, FolioId = activeReservation.Folio!.Id,
            ItemType = FolioItemType.Discount, Description = $"Debt override: {request.Reason.Trim()}",
            UnitPrice = 0, Quantity = 1,
            CreatedByStaffName = $"OVERRIDE:{User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "unknown"}"
        };
        _context.FolioItems.Add(marker);
        await _context.SaveChangesAsync();
        return Ok(new CheckoutOverrideDto(marker.Id, true, ToPreview(activeReservation)));
    }

    [HttpPost("{reservationId:guid}/checkout")]
    [Authorize(Policy = "checkout.execute")]
    public async Task<ActionResult<CheckoutResultDto>> Checkout(Guid reservationId, [FromBody] CheckoutRequest? request)
    {
        var reservation = await CheckoutQuery().FirstOrDefaultAsync(item => item.Id == reservationId);
        if (reservation == null) return NotFound(new { message = "Không tìm thấy đơn đặt phòng." });
        if (reservation.Folio == null) return Conflict(new { message = "Đơn đặt phòng chưa có folio." });
        if (reservation.Status == ReservationStatus.CheckedOut) return Ok(ToCheckoutResult(reservation));
        if (reservation.Status != ReservationStatus.CheckedIn)
            return Conflict(new { message = "Chỉ đơn đang lưu trú mới có thể checkout." });

        if (ToPreview(reservation).Folio.Balance > 0)
        {
            if (!request?.CheckoutOverrideId.HasValue ?? true)
                return Conflict(new { message = "Folio còn dư nợ và chưa có phê duyệt ghi nợ." });
            var validOverride = reservation.Folio.Items.Any(item =>
                item.Id == request!.CheckoutOverrideId && item.Description.StartsWith("Debt override:"));
            if (!validOverride) return Conflict(new { message = "Phê duyệt ghi nợ không hợp lệ hoặc không thuộc folio này." });
        }

        reservation.Status = ReservationStatus.CheckedOut;
        reservation.ActualCheckOutUtc = DateTime.UtcNow;
        reservation.Folio.IsClosed = true;
        reservation.Folio.ClosedAtUtc = DateTime.UtcNow;
        foreach (var detail in reservation.Details.Where(item => item.Room != null))
        {
            detail.Room!.Status = RoomStatus.Dirty;
            var hasOpenTask = await _context.HousekeepingTasks.AnyAsync(task =>
                task.ReservationId == reservation.Id && task.RoomId == detail.RoomId &&
                task.TaskType == "CheckoutCleaning" && task.Status != HousekeepingTaskStatus.Completed && !task.IsDeleted);
            if (!hasOpenTask)
            {
                _context.HousekeepingTasks.Add(new HousekeepingTask
                {
                    TenantId = reservation.TenantId, RoomId = detail.Room.Id, ReservationId = reservation.Id,
                    TaskType = "CheckoutCleaning",
                    Status = HousekeepingTaskStatus.Pending, Priority = HousekeepingPriority.High,
                    Notes = $"Dọn phòng sau checkout {reservation.BookingCode}."
                });
            }
        }
        var dateLocks = await _context.RoomDateLocks.IgnoreQueryFilters()
            .Where(item => item.ReservationId == reservation.Id).ToListAsync();
        _context.RoomDateLocks.RemoveRange(dateLocks);
        await _context.SaveChangesAsync();
        return Ok(ToCheckoutResult(reservation));
    }

    private IQueryable<Reservation> CheckoutQuery() => _context.Reservations
        .Include(item => item.Tenant)
        .Include(item => item.Folio!).ThenInclude(folio => folio!.Items)
        .Include(item => item.Payments).ThenInclude(payment => payment.Refunds)
        .Include(item => item.Details).ThenInclude(detail => detail.Room)
        .Where(item => !item.IsDeleted);

    private static ObjectResult? ValidateOpenStay(Reservation? reservation)
    {
        if (reservation == null) return new NotFoundObjectResult(new { message = "Không tìm thấy đơn đặt phòng." });
        if (reservation.Status != ReservationStatus.CheckedIn)
            return new ConflictObjectResult(new { message = "Chỉ đơn đang lưu trú mới có thể cập nhật folio." });
        if (reservation.Folio == null || reservation.Folio.IsClosed)
            return new ConflictObjectResult(new { message = "Folio không tồn tại hoặc đã đóng." });
        return null;
    }

    private static ObjectResult? ValidateAdvancedFolioEntitlement(Reservation reservation) =>
        reservation.Tenant?.SubscriptionTier == SubscriptionTier.Basic
            ? new ConflictObjectResult(new
            {
                code = "FOLIO_UPGRADE_REQUIRED",
                message = "Thêm dịch vụ và điều chỉnh folio chỉ khả dụng từ gói PRO. Vui lòng nâng cấp gói dịch vụ."
            })
            : null;

    private static FolioItem? FindReplay(Folio folio, string? key) => string.IsNullOrWhiteSpace(key)
        ? null : folio.Items.FirstOrDefault(item => item.CreatedByStaffName == MutationMarker(key));
    private static string? MutationMarker(string? key) => string.IsNullOrWhiteSpace(key) ? null : $"IDEMP:{key.Trim()}";

    private static ReservationChargeDto ToCharge(Guid reservationId, FolioItem item, bool replayed,
        string? category = null, string? code = null, string? name = null) => new(
        item.Id, reservationId, category ?? ItemCategory(item.ItemType), code ?? item.ItemType.ToString().ToUpperInvariant(),
        name ?? item.Description, item.Description, item.Quantity, item.UnitPrice, 0, 0, item.Amount,
        item.DateIncurredUtc, null, replayed);

    private static CheckoutPreviewDto ToPreview(Reservation reservation)
    {
        var folio = reservation.Folio!;
        var successfulPayments = reservation.Payments.Where(payment => payment.Status is PaymentStatus.Completed or PaymentStatus.Refunded).Sum(payment => payment.Amount);
        var successfulRefunds = reservation.Payments.SelectMany(payment => payment.Refunds).Where(refund => refund.Status == "SUCCEEDED").Sum(refund => refund.RequestedAmount);
        var otherCredits = Math.Max(0, folio.TotalCredits - successfulPayments);
        var netSettled = successfulPayments - successfulRefunds + otherCredits;
        var balance = folio.TotalCharges - netSettled;
        var state = balance > 0 ? "OUTSTANDING" : balance < 0 ? "OVERPAID" : "SETTLED";
        var lines = folio.Items.Where(item => !item.Description.StartsWith("Debt override:"))
            .Select(item => new FolioLineDto(
                "FOLIO_ITEM", item.Id, ItemCategory(item.ItemType), item.ItemType.ToString().ToUpperInvariant(),
                item.Description, item.Description, item.Quantity, item.UnitPrice, 0, 0,
                item.Amount, item.Amount, item.DateIncurredUtc, null)).ToList();
        var room = folio.Items.Where(item => item.ItemType == FolioItemType.RoomCharge).Sum(item => item.Amount);
        var services = folio.Items.Where(item => item.ItemType is FolioItemType.Minibar or FolioItemType.Laundry or FolioItemType.Restaurant).Sum(item => item.Amount);
        var surcharges = folio.Items.Where(item => item.ItemType == FolioItemType.Surcharge).Sum(item => item.Amount);
        var discounts = -folio.Items.Where(item => item.ItemType == FolioItemType.Discount && item.Amount < 0).Sum(item => item.Amount);
        var version = (folio.UpdatedAtUtc ?? folio.CreatedAtUtc).Ticks;
        return new CheckoutPreviewDto(reservation.Id, reservation.TenantId, state,
            reservation.Status == ReservationStatus.CheckedIn && balance <= 0,
            balance > 0 ? $"Folio còn thiếu {balance:N0} VND." : null, version, DateTime.UtcNow,
            new ReservationFolioDto(room, services, surcharges, 0, 0, discounts, folio.TotalCharges,
                reservation.TotalAmount, successfulPayments, successfulRefunds, otherCredits, netSettled,
                balance, lines, version, DateTime.UtcNow));
    }

    private static CheckoutResultDto ToCheckoutResult(Reservation reservation)
    {
        var preview = ToPreview(reservation);
        return new CheckoutResultDto(reservation.Id, "CHECKED_OUT", reservation.Folio!.Id,
            reservation.Folio.FolioNumber, "FINALIZED", reservation.Folio.TotalCharges,
            reservation.Details.Where(item => item.RoomId.HasValue).Select(item => item.RoomId!.Value).ToList(),
            new CheckoutFinancialSummaryDto(reservation.Folio.TotalCharges, reservation.TotalAmount,
                preview.Folio.SuccessfulPayments, preview.Folio.SuccessfulRefunds, preview.Folio.Balance,
                preview.SettlementState, preview.SourceVersion, DateTime.UtcNow));
    }

    private static string ItemCategory(FolioItemType type) => type switch
    {
        FolioItemType.RoomCharge => "ROOM", FolioItemType.Minibar or FolioItemType.Laundry or FolioItemType.Restaurant => "SERVICE",
        FolioItemType.Surcharge => "SURCHARGE", FolioItemType.Discount => "DISCOUNT", _ => "ADJUSTMENT"
    };
}

public record AddServiceChargeRequest(Guid ServiceId, string ChargeType, decimal Quantity, DateTime? ServiceUsedAt);
public record AddAdjustmentRequest(string? Type, string? NegativeType, string Description, decimal Amount, bool NegativeAdjustment);
public record CheckoutOverrideRequest(string Reason, string? CorrelationId);
public record CheckoutRequest(Guid? CheckoutOverrideId);
public record ReservationChargeDto(Guid Id, Guid ReservationId, string ChargeType, string Code, string Name,
    string? Description, int Quantity, decimal UnitPrice, decimal TaxAmount, decimal DiscountAmount,
    decimal TotalAmount, DateTime? ServiceUsedAt, string? CorrelationId, bool Replayed);
public record FolioLineDto(string SourceType, Guid? SourceId, string Category, string Code, string Name,
    string? Description, int Quantity, decimal UnitPrice, decimal TaxAmount, decimal DiscountAmount,
    decimal SnapshotAmount, decimal SignedEffect, DateTime? UsageStartedAt, DateTime? UsageEndedAt);
public record ReservationFolioDto(decimal RoomCharges, decimal ServiceCharges, decimal SurchargeCharges,
    decimal TaxCharges, decimal FeeCharges, decimal Discounts, decimal GrossCharges, decimal DepositRequired,
    decimal SuccessfulPayments, decimal SuccessfulRefunds, decimal OtherCredits, decimal NetSettled,
    decimal Balance, List<FolioLineDto> Lines, long SourceVersion, DateTime CalculatedAt);
public record CheckoutPreviewDto(Guid ReservationId, Guid HotelId, string SettlementState, bool CheckoutAllowed,
    string? BlockingError, long SourceVersion, DateTime CalculatedAt, ReservationFolioDto Folio);
public record CheckoutOverrideDto(Guid OverrideId, bool DebtOverrideApplied, CheckoutPreviewDto Preview);
public record CheckoutFinancialSummaryDto(decimal GrossCharges, decimal DepositRequired, decimal SuccessfulPayments,
    decimal SuccessfulRefunds, decimal RemainingBalance, string FinancialState, long SourceVersion, DateTime CalculatedAt);
public record CheckoutResultDto(Guid ReservationId, string ReservationStatus, Guid InvoiceId, string InvoiceNumber,
    string InvoiceStatus, decimal TotalAmount, List<Guid> DirtyRoomIds, CheckoutFinancialSummaryDto FinancialSummary);
