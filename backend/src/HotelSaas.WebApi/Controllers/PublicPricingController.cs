using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/public")]
public class PublicPricingController(IApplicationDbContext context) : ControllerBase
{
    [HttpPost("quotes")]
    [AllowAnonymous]
    public async Task<ActionResult<PublicQuoteDto>> Quote([FromBody] PublicQuoteRequest request)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        if (request.CheckInDate < today || request.CheckInDate >= request.CheckOutDate)
            return BadRequest(new { message = "Ngày lưu trú không hợp lệ." });
        if (request.Quantity is < 1 or > 10 || request.AdultCount < 1 || request.ChildCount < 0)
            return BadRequest(new { message = "Số khách hoặc số phòng không hợp lệ." });

        var roomType = await context.RoomTypes.IgnoreQueryFilters().Include(type => type.Tenant).Include(type => type.Rooms)
            .FirstOrDefaultAsync(type => type.Id == request.RoomTypeId && type.TenantId == request.PropertyId
                && type.IsActive && !type.IsDeleted);
        if (roomType?.Tenant?.Status != TenantStatus.Active || roomType.Tenant.IsDeleted)
            return NotFound(new { message = "Loại phòng không còn mở bán." });
        if (request.AdultCount > roomType.CapacityAdults * request.Quantity ||
            request.ChildCount > roomType.CapacityChildren * request.Quantity)
            return BadRequest(new { message = "Số khách vượt quá sức chứa của phương án phòng." });

        var remaining = await RemainingInventory(roomType, request.CheckInDate, request.CheckOutDate);
        if (remaining < request.Quantity)
            return Conflict(new { message = "Số phòng vừa được khách khác giữ hoặc đặt hết." });

        var pricing = await PublicPricing.Calculate(context, roomType, request.CheckInDate, request.CheckOutDate,
            request.Quantity, request.CouponCode);
        if (!string.IsNullOrWhiteSpace(request.CouponCode) && pricing.Promotions.Count == 0)
            return BadRequest(new { message = "Mã ưu đãi không hợp lệ hoặc đã hết hạn." });
        return Ok(new PublicQuoteDto(Guid.NewGuid().ToString("N"), DateTime.UtcNow.AddMinutes(15),
            roomType.TenantId, roomType.Id, pricing.BaseSubtotal / pricing.Nights / request.Quantity, pricing.Nights, request.Quantity,
            pricing.BaseSubtotal, pricing.TaxAmount, pricing.FeeAmount, pricing.TaxAmount + pricing.FeeAmount, pricing.Promotions,
            new MemberBenefitDto(false, null, null, null, "Đăng nhập thành viên để nhận ưu đãi dành riêng."),
            pricing.Discount, pricing.FinalTotal, "VND"));
    }

    [HttpGet("promotions")]
    [AllowAnonymous]
    public async Task<ActionResult<List<PublicPromotionDto>>> Promotions([FromQuery] int limit = 6)
    {
        var now = DateTime.UtcNow;
        var promotions = await context.Promotions.IgnoreQueryFilters()
            .Where(item => item.IsActive && !item.IsDeleted && item.ApplicationType == "AUTOMATIC" && item.StartDateUtc <= now && item.EndDateUtc > now)
            .OrderBy(item => item.EndDateUtc).Take(Math.Clamp(limit, 1, 12)).ToListAsync();
        return Ok(promotions.Select(item => new PublicPromotionDto(item.Id, item.Code, item.TenantId, item.Title,
            null, "AUTOMATIC", "PERCENT", item.DiscountPercent, item.MaxDiscountAmount,
            item.EndDateUtc, false, [])).ToList());
    }

    [HttpGet("promotions/membership")]
    [AllowAnonymous]
    public ActionResult<MemberBenefitDto> Membership() => Ok(new MemberBenefitDto(false, null, null, null,
        "Chương trình hạng thành viên chưa được cấu hình cho tài khoản này."));

    private async Task<int> RemainingInventory(RoomType roomType, DateOnly checkIn, DateOnly checkOut)
    {
        var paymentExpiryCutoff = DateTime.UtcNow.AddMinutes(-15);
        var reserved = await context.ReservationDetails.IgnoreQueryFilters().CountAsync(detail =>
            detail.RoomTypeId == roomType.Id && detail.Reservation != null &&
            detail.Reservation.Status != ReservationStatus.Cancelled && detail.Reservation.Status != ReservationStatus.NoShow &&
            detail.Reservation.Status != ReservationStatus.CheckedOut &&
            (detail.Reservation.Status != ReservationStatus.PendingPayment || detail.Reservation.CreatedAtUtc > paymentExpiryCutoff) &&
            detail.Reservation.CheckInDate < checkOut &&
            detail.Reservation.CheckOutDate > checkIn);
        var start = checkIn.ToDateTime(TimeOnly.MinValue);
        var end = checkOut.ToDateTime(TimeOnly.MinValue);
        var held = await context.BookingHolds.IgnoreQueryFilters().Where(hold => hold.RoomTypeId == roomType.Id &&
            !hold.IsReleased && !hold.IsConvertedToReservation && hold.ExpiresAtUtc > DateTime.UtcNow &&
            hold.CheckInDate < end && hold.CheckOutDate > start).SumAsync(hold => (int?)hold.Quantity) ?? 0;
        var total = roomType.Rooms.Count(room => room.IsActive && !room.IsDeleted && room.Status != RoomStatus.OutOfService);
        return Math.Max(0, total - reserved - held);
    }
}

internal static class PublicPricing
{
    public static async Task<PricingResult> Calculate(IApplicationDbContext context, RoomType roomType,
        DateOnly checkIn, DateOnly checkOut, int quantity, string? couponCode)
    {
        var nights = checkOut.DayNumber - checkIn.DayNumber;
        var overrides = await context.RoomRateOverrides.IgnoreQueryFilters().AsNoTracking()
            .Where(item => item.RoomTypeId == roomType.Id && item.IsActive && !item.IsDeleted
                && item.StartDate < checkOut && item.EndDate >= checkIn).ToListAsync();
        var nightlyRates = CalculateNightlyRates(roomType.BasePricePerNight, checkIn, checkOut, quantity, overrides);
        var subtotal = nightlyRates.Sum(item => item.TotalPrice);
        var now = DateTime.UtcNow;
        var active = await context.Promotions.IgnoreQueryFilters().Where(item => item.TenantId == roomType.TenantId &&
            item.IsActive && !item.IsDeleted && item.StartDateUtc <= now && item.EndDateUtc > now &&
            (string.IsNullOrWhiteSpace(couponCode) ? item.ApplicationType == "AUTOMATIC" : item.ApplicationType == "COUPON" || item.ApplicationType == "AUTOMATIC") &&
            (!item.MinBookingAmount.HasValue || subtotal >= item.MinBookingAmount)).ToListAsync();
        Promotion? selected;
        if (!string.IsNullOrWhiteSpace(couponCode))
            selected = active.FirstOrDefault(item => string.Equals(item.Code, couponCode.Trim(), StringComparison.OrdinalIgnoreCase));
        else
            selected = active.OrderByDescending(item => EffectiveDiscount(item, subtotal)).FirstOrDefault();
        var discount = selected is null ? 0 : EffectiveDiscount(selected, subtotal);
        var discountedSubtotal = Math.Max(0, subtotal - discount);
        var tenant = roomType.Tenant ?? await context.Tenants.IgnoreQueryFilters().AsNoTracking()
            .FirstAsync(item => item.Id == roomType.TenantId);
        var tax = RoundCurrency(discountedSubtotal * tenant.TaxRatePercent / 100m);
        var fee = RoundCurrency(discountedSubtotal * tenant.ServiceFeeRatePercent / 100m);
        var applied = selected is null ? [] : new List<AppliedPromotionDto>
        {
            new(selected.Id, selected.Code, string.IsNullOrWhiteSpace(couponCode) ? "AUTOMATIC" : "COUPON",
                selected.Title, null, discount)
        };
        return new(nights, subtotal, discount, tax, fee, discountedSubtotal + tax + fee, applied, nightlyRates);
    }

    internal static decimal CalculateBaseSubtotal(decimal basePrice, DateOnly checkIn, DateOnly checkOut, int quantity,
        IReadOnlyCollection<RoomRateOverride> overrides)
        => CalculateNightlyRates(basePrice, checkIn, checkOut, quantity, overrides).Sum(item => item.TotalPrice);

    internal static List<NightlyRateDto> CalculateNightlyRates(decimal basePrice, DateOnly checkIn, DateOnly checkOut, int quantity,
        IReadOnlyCollection<RoomRateOverride> overrides)
    {
        var rates = new List<NightlyRateDto>();
        for (var date = checkIn; date < checkOut; date = date.AddDays(1))
        {
            var selected = overrides.Where(item => item.StartDate <= date && item.EndDate >= date)
                .OrderByDescending(item => item.Priority).ThenByDescending(item => item.UpdatedAtUtc ?? item.CreatedAtUtc).FirstOrDefault();
            var nightlyPrice = selected?.NightlyPrice ?? basePrice;
            rates.Add(new NightlyRateDto(date, nightlyPrice, quantity, nightlyPrice * quantity, selected?.Id));
        }
        return rates;
    }

    private static decimal EffectiveDiscount(Promotion promotion, decimal subtotal)
    {
        var discount = decimal.Round(subtotal * promotion.DiscountPercent / 100m, 0, MidpointRounding.AwayFromZero);
        return Math.Min(subtotal, promotion.MaxDiscountAmount.HasValue ? Math.Min(discount, promotion.MaxDiscountAmount.Value) : discount);
    }

    private static decimal RoundCurrency(decimal amount) => decimal.Round(amount, 0, MidpointRounding.AwayFromZero);
}

internal sealed record PricingResult(int Nights, decimal BaseSubtotal, decimal Discount, decimal TaxAmount, decimal FeeAmount, decimal FinalTotal,
    List<AppliedPromotionDto> Promotions, List<NightlyRateDto>? NightlyRates = null);
internal sealed record NightlyRateDto(DateOnly Date, decimal NightlyPrice, int Quantity, decimal TotalPrice, Guid? RateOverrideId);
public sealed record PublicQuoteRequest(Guid PropertyId, Guid RoomTypeId, DateOnly CheckInDate, DateOnly CheckOutDate,
    int Quantity, int AdultCount, int ChildCount, string? CouponCode);
public sealed record PublicQuoteDto(string QuoteId, DateTime ExpiresAt, Guid PropertyId, Guid RoomTypeId,
    decimal NightlyPrice, int NumberOfNights, int RoomQuantity, decimal BaseSubtotal, decimal TaxAmount,
    decimal FeeAmount, decimal TaxesAndFees, List<AppliedPromotionDto> AppliedPromotions,
    MemberBenefitDto MemberBenefit, decimal TotalDiscount, decimal FinalTotal, string Currency);
public sealed record AppliedPromotionDto(Guid CampaignId, string Code, string ApplicationType, string NameVi,
    string? NameEn, decimal DiscountAmount);
public sealed record MemberBenefitDto(bool Eligible, string? TierCode, string? TierNameVi, string? TierNameEn,
    string? Explanation);
public sealed record PublicPromotionDto(Guid Id, string Code, Guid? PropertyId, string NameVi, string? NameEn,
    string ApplicationType, string DiscountType, decimal DiscountValue, decimal? MaxDiscount, DateTime EndsAt,
    bool MemberOnly, List<string> RequiredTierCodes);
