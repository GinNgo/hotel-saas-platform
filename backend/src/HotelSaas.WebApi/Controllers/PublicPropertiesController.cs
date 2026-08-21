using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
public class PublicPropertiesController(IApplicationDbContext context) : ControllerBase
{
    [HttpGet("api/public/properties/search")]
    public async Task<ActionResult<PublicPropertyPage>> Search([FromQuery] PublicPropertySearchQuery query)
    {
        if (!ValidStay(query.CheckInDate, query.CheckOutDate, out var error)) return BadRequest(new { message = error });
        if (query.MinReviewScore is < 0 or > 10) return BadRequest(new { message = "Điểm đánh giá tối thiểu phải từ 0 đến 10." });
        if (query.MinPrice is < 0 || query.MaxPrice is < 0 || query.MinPrice > query.MaxPrice)
            return BadRequest(new { message = "Khoảng giá tìm kiếm không hợp lệ." });
        if (query.RadiusKm is <= 0 or > 200) return BadRequest(new { message = "Bán kính tìm kiếm phải lớn hơn 0 và không vượt quá 200 km." });
        var landmark = PublicLandmarks.Find(query.LandmarkId);
        var latitude = query.Latitude ?? landmark?.Latitude;
        var longitude = query.Longitude ?? landmark?.Longitude;
        if (latitude.HasValue != longitude.HasValue || latitude is < -90 or > 90 || longitude is < -180 or > 180)
            return BadRequest(new { message = "Tọa độ tìm kiếm không hợp lệ." });
        var radiusKm = query.RadiusKm ?? landmark?.DefaultRadiusKm;
        var inventories = await LoadInventory(query.CheckInDate, query.CheckOutDate);
        var keyword = query.Keyword?.Trim();
        var roomCount = Math.Max(1, query.RoomCount);
        var adults = Math.Max(1, query.AdultCount);
        var children = Math.Max(0, query.ChildCount);

        IEnumerable<PublicPropertyDto> results = inventories
            .Where(item => string.IsNullOrWhiteSpace(keyword) || MatchesText(item.Tenant.Name, keyword)
                || MatchesText(item.Tenant.City, keyword)
                || MatchesText(item.Tenant.Address, keyword))
            .Where(item => !query.PropertyId.HasValue || item.Tenant.Id == query.PropertyId)
            .Where(item => string.IsNullOrWhiteSpace(query.ProvinceId) || PublicLocationKeys.City(item.Tenant.City) == query.ProvinceId)
            .Where(item => string.IsNullOrWhiteSpace(query.WardId) || MatchesWard(item.Tenant, query.WardId))
            .Where(item => !query.MinReviewScore.HasValue || item.ReviewCount > 0 && item.ReviewScore >= query.MinReviewScore.Value)
            .Where(item => string.IsNullOrWhiteSpace(query.PropertyTypes) || query.PropertyTypes.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Contains(item.Tenant.PropertyType, StringComparer.OrdinalIgnoreCase))
            .Where(item => string.IsNullOrWhiteSpace(query.StarRatings) || query.StarRatings.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Select(value => int.TryParse(value, out var rating) ? rating : -1).Contains(item.Tenant.StarRating))
            .Where(item => string.IsNullOrWhiteSpace(query.AmenityCodes) || query.AmenityCodes.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .All(codeValue => item.AmenityCodes.Contains(codeValue, StringComparer.OrdinalIgnoreCase)))
            .Where(item => !latitude.HasValue || item.Tenant.Latitude.HasValue && item.Tenant.Longitude.HasValue
                && (!radiusKm.HasValue || DistanceKm(latitude.Value, longitude!.Value, item.Tenant.Latitude.Value, item.Tenant.Longitude.Value) <= radiusKm.Value))
            .Where(item => EligibleRoomRates(item, query.CheckInDate, query.CheckOutDate, roomCount, adults, children, query.MinPrice, query.MaxPrice).Any())
            .Select(item => ToPropertyDto(item, latitude, longitude, query.CheckInDate, query.CheckOutDate, roomCount, adults, children, query.MinPrice, query.MaxPrice));

        results = query.SortBy?.ToUpperInvariant() switch
        {
            "PRICE_DESC" => results.OrderByDescending(item => item.StartingPrice).ThenBy(item => item.Name),
            "PRICE_ASC" => results.OrderBy(item => item.StartingPrice).ThenBy(item => item.Name),
            "NAME_DESC" => results.OrderByDescending(item => item.Name),
            "NAME_ASC" => results.OrderBy(item => item.Name),
            "RATING" or "RATING_DESC" => results.OrderByDescending(item => item.ReviewScore).ThenByDescending(item => item.ReviewCount).ThenBy(item => item.StartingPrice),
            "POPULAR" => results.OrderByDescending(item => item.ReviewCount > 0).ThenByDescending(item => item.ReviewScore).ThenByDescending(item => item.ReviewCount).ThenByDescending(item => item.AvailableRoomCount).ThenBy(item => item.StartingPrice),
            "NEAREST" when latitude.HasValue => results.OrderBy(item => item.DistanceKm).ThenByDescending(item => item.ReviewScore).ThenBy(item => item.StartingPrice),
            _ => results.OrderByDescending(item => item.AvailableRoomCount).ThenBy(item => item.StartingPrice).ThenBy(item => item.Name)
        };

        var all = results.ToList();
        var page = Math.Max(1, query.PageNumber);
        var size = Math.Clamp(query.PageSize, 1, 50);
        return Ok(new PublicPropertyPage(all.Skip((page - 1) * size).Take(size).ToList(), all.Count,
            all.Count == 0 ? 0 : (int)Math.Ceiling(all.Count / (double)size), page - 1, size));
    }

    [HttpGet("api/v1/hotels/public/{propertyId:guid}")]
    public async Task<ActionResult<PublicPropertyDto>> Detail(Guid propertyId)
    {
        var item = (await LoadInventory(null, null)).SingleOrDefault(candidate => candidate.Tenant.Id == propertyId);
        return item is null || item.RoomTypes.All(room => room.Available == 0) ? NotFound() : Ok(ToPropertyDto(item));
    }

    [HttpGet("api/v1/hotels/accessible")]
    [Authorize(Policy = "hotel.read")]
    public async Task<ActionResult<List<PublicPropertyDto>>> Accessible()
    {
        var inventories = (await LoadInventory(null, null)).Where(item => item.RoomTypes.Any(room => room.Available > 0));
        if (!User.IsInRole(nameof(GlobalUserRole.SuperAdmin)))
        {
            if (!Guid.TryParse(User.FindFirstValue("tenant_id"), out var tenantId)) return Forbid();
            inventories = inventories.Where(item => item.Tenant.Id == tenantId);
        }
        return Ok(inventories.Select(item => ToPropertyDto(item)).OrderBy(item => item.Name).ToList());
    }

    [HttpGet("api/room-types/public/hotel/{propertyId:guid}")]
    [HttpGet("api/hotels/{propertyId:guid}/available-rooms")]
    public async Task<ActionResult<List<PublicRoomTypeDto>>> RoomTypes(Guid propertyId,
        [FromQuery] DateOnly? checkIn, [FromQuery] DateOnly? checkOut, [FromQuery] int guests = 1)
    {
        if (!ValidStay(checkIn, checkOut, out var error)) return BadRequest(new { message = error });
        var item = (await LoadInventory(checkIn, checkOut)).SingleOrDefault(candidate => candidate.Tenant.Id == propertyId);
        if (item is null) return NotFound();
        return Ok(item.RoomTypes.Where(room => room.Available > 0 && room.Adults + room.Children >= Math.Max(1, guests))
            .OrderBy(room => room.Price)
            .Select(room => new PublicRoomTypeDto(room.Id, propertyId, room.Code, room.Name, room.NameEn ?? room.Name,
                room.Adults + room.Children, room.Adults, room.Children, room.BedType, room.Price,
                room.Description ?? string.Empty, room.DescriptionEn ?? room.Description ?? string.Empty, room.Available, room.Images,
                room.IncludesBreakfast, room.IsRefundable, room.FreeCancellationHours, room.SmokingAllowed, room.Amenities)).ToList());
    }

    private async Task<List<PropertyInventory>> LoadInventory(DateOnly? checkIn, DateOnly? checkOut)
    {
        var tenants = await context.Tenants.IgnoreQueryFilters()
            .Where(tenant => tenant.Status == TenantStatus.Active && !tenant.IsDeleted)
            .Include(tenant => tenant.RoomTypes.Where(type => type.IsActive && !type.IsDeleted)).ThenInclude(type => type.Rooms)
            .Include(tenant => tenant.RoomTypes.Where(type => type.IsActive && !type.IsDeleted)).ThenInclude(type => type.Images)
            .Include(tenant => tenant.RoomTypes.Where(type => type.IsActive && !type.IsDeleted)).ThenInclude(type => type.Amenities)
            .AsSplitQuery().ToListAsync();
        var amenityRows = await context.PropertyAmenities.IgnoreQueryFilters().AsNoTracking()
            .Where(amenity => !amenity.IsDeleted).Select(amenity => new { amenity.TenantId, amenity.Code }).ToListAsync();
        var amenities = amenityRows.GroupBy(amenity => amenity.TenantId)
            .ToDictionary(group => group.Key, group => group.Select(amenity => amenity.Code).ToList());
        var reviewSummaries = await context.PropertyReviews.AsNoTracking()
            .Where(review => review.IsPublished && !review.IsDeleted)
            .GroupBy(review => review.TenantId)
            .Select(group => new { TenantId = group.Key, Score = group.Average(review => review.Score), Count = group.Count() })
            .ToDictionaryAsync(item => item.TenantId);
        var promotionNow = DateTime.UtcNow;
        var promotionRows = await context.Promotions.IgnoreQueryFilters().AsNoTracking()
            .Where(promotion => promotion.IsActive && !promotion.IsDeleted && promotion.ApplicationType == "AUTOMATIC" && promotion.StartDateUtc <= promotionNow && promotion.EndDateUtc > promotionNow)
            .ToListAsync();
        var promotions = promotionRows.GroupBy(promotion => promotion.TenantId).ToDictionary(group => group.Key, group => group.ToList());
        var rateOverrideRows = await context.RoomRateOverrides.IgnoreQueryFilters().AsNoTracking()
            .Where(rate => rate.IsActive && !rate.IsDeleted && (!checkIn.HasValue || rate.EndDate >= checkIn)
                && (!checkOut.HasValue || rate.StartDate < checkOut)).ToListAsync();
        var rateOverrides = rateOverrideRows.GroupBy(rate => rate.RoomTypeId).ToDictionary(group => group.Key, group => group.ToList());
        var reserved = new Dictionary<Guid, int>();
        var held = new Dictionary<Guid, int>();
        if (checkIn.HasValue && checkOut.HasValue)
        {
            var paymentExpiryCutoff = DateTime.UtcNow.AddMinutes(-15);
            var reservedCounts = await context.ReservationDetails.IgnoreQueryFilters()
                .Where(detail => detail.Reservation != null && detail.Reservation.CheckInDate < checkOut && detail.Reservation.CheckOutDate > checkIn
                    && detail.Reservation.Status != ReservationStatus.Cancelled && detail.Reservation.Status != ReservationStatus.NoShow
                    && detail.Reservation.Status != ReservationStatus.CheckedOut
                    && (detail.Reservation.Status != ReservationStatus.PendingPayment || detail.Reservation.CreatedAtUtc > paymentExpiryCutoff))
                .GroupBy(detail => detail.RoomTypeId)
                .Select(group => new { RoomTypeId = group.Key, Count = group.Count() }).ToListAsync();
            reserved = reservedCounts.ToDictionary(item => item.RoomTypeId, item => item.Count);
            var start = checkIn.Value.ToDateTime(TimeOnly.MinValue);
            var end = checkOut.Value.ToDateTime(TimeOnly.MinValue);
            var now = DateTime.UtcNow;
            var heldCounts = await context.BookingHolds.IgnoreQueryFilters()
                .Where(hold => !hold.IsReleased && !hold.IsConvertedToReservation && hold.ExpiresAtUtc > now
                    && hold.CheckInDate < end && hold.CheckOutDate > start)
                .GroupBy(hold => hold.RoomTypeId)
                .Select(group => new { RoomTypeId = group.Key, Count = group.Sum(hold => hold.Quantity) }).ToListAsync();
            held = heldCounts.ToDictionary(item => item.RoomTypeId, item => item.Count);
        }

        return tenants.Select(tenant => new PropertyInventory(tenant, tenant.RoomTypes.Select(type =>
        {
            var total = type.Rooms.Count(room => room.IsActive && !room.IsDeleted && room.Status != RoomStatus.OutOfService);
            return new RoomInventory(type.Id, type.Code, type.Name, type.NameEn, type.Description, type.DescriptionEn, type.BasePricePerNight,
                type.CapacityAdults, type.CapacityChildren, type.BedType,
                Math.Max(0, total - reserved.GetValueOrDefault(type.Id) - held.GetValueOrDefault(type.Id)),
                type.Images.OrderBy(image => image.DisplayOrder).Select(image => image.ImageUrl).ToList(),
                type.IncludesBreakfast, type.IsRefundable, type.FreeCancellationHours, type.SmokingAllowed,
                type.Amenities.Where(amenity => !amenity.IsDeleted).Select(amenity => RoomAmenityName(amenity.Code)).ToList(),
                rateOverrides.GetValueOrDefault(type.Id) ?? []);
        }).ToList(), reviewSummaries.GetValueOrDefault(tenant.Id)?.Score ?? 0, reviewSummaries.GetValueOrDefault(tenant.Id)?.Count ?? 0,
            amenities.GetValueOrDefault(tenant.Id) ?? [], promotions.GetValueOrDefault(tenant.Id) ?? [])).ToList();
    }

    private static PublicPropertyDto ToPropertyDto(PropertyInventory item, double? originLatitude = null, double? originLongitude = null,
        DateOnly? checkIn = null, DateOnly? checkOut = null, int roomQuantity = 1, int adults = 1, int children = 0,
        decimal? minPrice = null, decimal? maxPrice = null)
    {
        var available = item.RoomTypes.Where(room => room.Available > 0).ToList();
        var eligibleRates = EligibleRoomRates(item, checkIn, checkOut, roomQuantity, adults, children, minPrice, maxPrice)
            .OrderBy(candidate => candidate.Rate.EffectiveNightly).ThenBy(candidate => candidate.Room.Price).ToList();
        var selected = eligibleRates.First();
        var lowest = selected.Room;
        var rate = selected.Rate;
        var images = item.RoomTypes.SelectMany(room => room.Images).Distinct().ToList();
        var appliedPromotions = rate.Promotion is null ? [] : new List<AppliedPromotionDto>
        {
            new(rate.Promotion.Id, rate.Promotion.Code, "AUTOMATIC", rate.Promotion.Title, null, rate.Discount)
        };
        var quote = new PublicQuoteDto(Guid.NewGuid().ToString("N"), DateTime.UtcNow.AddMinutes(15), item.Tenant.Id, lowest.Id,
            rate.BaseSubtotal / rate.Nights / rate.Quantity, rate.Nights, rate.Quantity, rate.BaseSubtotal, rate.TaxAmount, rate.FeeAmount,
            rate.TaxAmount + rate.FeeAmount, appliedPromotions,
            new MemberBenefitDto(false, null, null, null, "Đăng nhập thành viên để nhận ưu đãi dành riêng."), rate.Discount, rate.FinalTotal, "VND");
        var pricing = new SearchPricingDto(rate.BaseSubtotal / rate.Nights / rate.Quantity, rate.EffectiveNightly, rate.EffectiveNightly, rate.Nights, rate.Quantity,
            rate.BaseSubtotal, rate.TaxAmount, rate.FeeAmount, rate.FinalTotal, "VND");
        var distance = originLatitude.HasValue && originLongitude.HasValue && item.Tenant.Latitude.HasValue && item.Tenant.Longitude.HasValue
            ? DistanceKm(originLatitude.Value, originLongitude.Value, item.Tenant.Latitude.Value, item.Tenant.Longitude.Value) : (double?)null;
        return new(item.Tenant.Id, item.Tenant.Name, item.Tenant.Address, images.FirstOrDefault() ?? item.Tenant.LogoUrl,
            item.Tenant.StarRating, item.Tenant.Latitude ?? 0, item.Tenant.Longitude ?? 0, rate.EffectiveNightly, item.Tenant.City, item.Tenant.Description, item.Tenant.Slug, images,
            item.Tenant.PropertyType, item.Tenant.City, item.ReviewScore, item.ReviewCount, available.Sum(room => room.Available),
            item.AmenityCodes.Select(AmenityName).ToList(),
            new LowestRoomTypeDto(lowest.Id, lowest.Name, lowest.Adults + lowest.Children), item.Tenant.CheckInTime, item.Tenant.CheckOutTime,
            item.Tenant.CancellationPolicy, item.Tenant.ChildrenPolicy, item.Tenant.PetPolicy, item.Tenant.HouseRules,
            distance, distance.HasValue ? $"Cách địa danh {distance.Value:0.0} km" : null, pricing, quote);
    }

    private static bool ValidStay(DateOnly? checkIn, DateOnly? checkOut, out string error)
    {
        error = string.Empty;
        if (checkIn.HasValue != checkOut.HasValue) { error = "Ngày nhận và trả phòng phải được cung cấp cùng nhau."; return false; }
        if (checkIn.HasValue && checkIn >= checkOut) { error = "Ngày trả phòng phải sau ngày nhận phòng."; return false; }
        return true;
    }
    private static double DistanceKm(double latitude1, double longitude1, double latitude2, double longitude2)
    {
        const double earthRadiusKm = 6371.0088;
        static double Radians(double value) => value * Math.PI / 180;
        var latitudeDelta = Radians(latitude2 - latitude1);
        var longitudeDelta = Radians(longitude2 - longitude1);
        var value = Math.Pow(Math.Sin(latitudeDelta / 2), 2) + Math.Cos(Radians(latitude1)) * Math.Cos(Radians(latitude2)) * Math.Pow(Math.Sin(longitudeDelta / 2), 2);
        return earthRadiusKm * 2 * Math.Atan2(Math.Sqrt(value), Math.Sqrt(1 - value));
    }

    private static bool MatchesWard(Tenant tenant, string wardId)
    {
        var ward = PublicWards.All.FirstOrDefault(item => item.Id.Equals(wardId, StringComparison.OrdinalIgnoreCase));
        return ward is not null && PublicLocationKeys.Slug($"{tenant.Address} {tenant.City}")
            .Contains(PublicLocationKeys.Slug(ward.Name), StringComparison.OrdinalIgnoreCase);
    }

    private static bool MatchesText(string source, string keyword) =>
        source.Contains(keyword, StringComparison.OrdinalIgnoreCase)
        || PublicLocationKeys.Slug(source).Contains(PublicLocationKeys.Slug(keyword), StringComparison.OrdinalIgnoreCase);

    private static string AmenityName(string codeValue) => codeValue.ToUpperInvariant() switch
    {
        "WIFI" => "Wi-Fi miễn phí", "POOL" => "Hồ bơi", "PARKING" => "Bãi đỗ xe", "BREAKFAST" => "Bữa sáng",
        "AIRPORT_SHUTTLE" => "Đưa đón sân bay", "GYM" => "Phòng gym", "SPA" => "Spa", "RESTAURANT" => "Nhà hàng",
        "PET_FRIENDLY" => "Cho phép thú cưng", "FAMILY_ROOMS" => "Phòng gia đình", "BEACH" => "Bãi biển",
        "EV_CHARGING" => "Trạm sạc xe điện", _ => codeValue
    };
    private static string RoomAmenityName(string codeValue) => codeValue.ToUpperInvariant() switch
    {
        "AIR_CONDITIONING" => "Điều hòa", "PRIVATE_BATHROOM" => "Phòng tắm riêng", "BATHTUB" => "Bồn tắm",
        "BALCONY" => "Ban công", "CITY_VIEW" => "Hướng thành phố", "SEA_VIEW" => "Hướng biển", "MINIBAR" => "Minibar",
        "TV" => "TV", "SAFE" => "Két an toàn", "WORK_DESK" => "Bàn làm việc", "SOUNDPROOF" => "Cách âm",
        "KITCHEN" => "Bếp", _ => codeValue
    };
    private static decimal EffectiveDiscount(Promotion promotion, decimal subtotal)
    {
        var discount = decimal.Round(subtotal * promotion.DiscountPercent / 100m, 0, MidpointRounding.AwayFromZero);
        return Math.Min(subtotal, promotion.MaxDiscountAmount.HasValue ? Math.Min(discount, promotion.MaxDiscountAmount.Value) : discount);
    }
    private static IEnumerable<EligibleRoomRate> EligibleRoomRates(PropertyInventory item, DateOnly? checkIn, DateOnly? checkOut,
        int roomQuantity, int adults, int children, decimal? minPrice, decimal? maxPrice)
    {
        var quantity = Math.Max(1, roomQuantity);
        foreach (var room in item.RoomTypes.Where(room => room.Available >= quantity && room.Adults * quantity >= Math.Max(1, adults)
                     && room.Children * quantity >= Math.Max(0, children)))
        {
            var rate = BuildRate(item, room, checkIn, checkOut, quantity);
            if (minPrice.HasValue && rate.EffectiveNightly < minPrice.Value) continue;
            if (maxPrice.HasValue && rate.EffectiveNightly > maxPrice.Value) continue;
            yield return new EligibleRoomRate(room, rate);
        }
    }
    private static SearchRate BuildRate(PropertyInventory item, RoomInventory room, DateOnly? checkIn, DateOnly? checkOut, int quantity)
    {
        var nights = checkIn.HasValue && checkOut.HasValue ? Math.Max(1, checkOut.Value.DayNumber - checkIn.Value.DayNumber) : 1;
        var start = checkIn ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var end = checkOut ?? start.AddDays(1);
        var baseSubtotal = PublicPricing.CalculateBaseSubtotal(room.Price, start, end, quantity, room.RateOverrides);
        var promotion = item.Promotions.Where(candidate => !candidate.MinBookingAmount.HasValue || baseSubtotal >= candidate.MinBookingAmount.Value)
            .OrderByDescending(candidate => EffectiveDiscount(candidate, baseSubtotal)).FirstOrDefault();
        var discount = promotion is null ? 0 : EffectiveDiscount(promotion, baseSubtotal);
        var discountedSubtotal = Math.Max(0, baseSubtotal - discount);
        var tax = decimal.Round(discountedSubtotal * item.Tenant.TaxRatePercent / 100m, 0, MidpointRounding.AwayFromZero);
        var fee = decimal.Round(discountedSubtotal * item.Tenant.ServiceFeeRatePercent / 100m, 0, MidpointRounding.AwayFromZero);
        return new SearchRate(nights, quantity, baseSubtotal, discount, tax, fee, discountedSubtotal + tax + fee,
            decimal.Round(discountedSubtotal / nights / quantity, 0, MidpointRounding.AwayFromZero), promotion);
    }
    private sealed record PropertyInventory(Tenant Tenant, List<RoomInventory> RoomTypes, double ReviewScore, int ReviewCount,
        List<string> AmenityCodes, List<Promotion> Promotions);
    private sealed record EligibleRoomRate(RoomInventory Room, SearchRate Rate);
    private sealed record SearchRate(int Nights, int Quantity, decimal BaseSubtotal, decimal Discount, decimal TaxAmount,
        decimal FeeAmount, decimal FinalTotal,
        decimal EffectiveNightly, Promotion? Promotion);
    private sealed record RoomInventory(Guid Id, string Code, string Name, string? NameEn, string? Description, string? DescriptionEn, decimal Price,
        int Adults, int Children, string? BedType, int Available, List<string> Images, bool IncludesBreakfast,
        bool IsRefundable, int FreeCancellationHours, bool SmokingAllowed, List<string> Amenities, List<RoomRateOverride> RateOverrides);
}

public sealed record PublicPropertySearchQuery(string? Keyword, Guid? PropertyId, DateOnly? CheckInDate, DateOnly? CheckOutDate,
    int AdultCount = 1, int ChildCount = 0, int RoomCount = 1, decimal? MinPrice = null, decimal? MaxPrice = null,
    string? SortBy = null, int PageNumber = 1, int PageSize = 12, string? ProvinceId = null,
    string? WardId = null, double? MinReviewScore = null, string? PropertyTypes = null, string? StarRatings = null, string? AmenityCodes = null,
    string? LandmarkId = null, double? Latitude = null, double? Longitude = null, double? RadiusKm = null);
public sealed record PublicPropertyPage(List<PublicPropertyDto> Content, int TotalElements, int TotalPages, int Number, int Size);
public sealed record PublicPropertyDto(Guid Id, string Name, string AddressLine, string? MainImageUrl, int StarRating,
    double Latitude, double Longitude, decimal StartingPrice, string City, string? Description, string Slug,
    List<string> GalleryUrls, string PropertyType, string ProvinceName, double ReviewScore, int ReviewCount,
    int AvailableRoomCount, List<string> Amenities, LowestRoomTypeDto LowestRoomType, string CheckInTime, string CheckOutTime,
    string? CancellationPolicy, string? ChildrenPolicy, string? PetPolicy, string? HouseRules, double? DistanceKm, string? DistanceText,
    SearchPricingDto Pricing, PublicQuoteDto Quote);
public sealed record SearchPricingDto(decimal NightlyPrice, decimal DiscountedNightlyPrice, decimal DiscountedPrice,
    int NumberOfNights, int RoomQuantity, decimal Subtotal, decimal TaxAmount, decimal FeeAmount, decimal TotalAmount, string Currency);
public sealed record LowestRoomTypeDto(Guid Id, string Name, int MaxGuests);
public sealed record PublicRoomTypeDto(Guid Id, Guid HotelId, string Code, string NameVi, string NameEn, int MaxGuest,
    int MaxAdults, int MaxChildren, string? BedType, decimal BasePrice, string DescriptionVi, string DescriptionEn,
    int AvailableRooms, List<string> ImageUrls, bool IncludesBreakfast, bool IsRefundable, int FreeCancellationHours,
    bool SmokingAllowed, List<string> Amenities);
