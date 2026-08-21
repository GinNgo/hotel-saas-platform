using HotelSaas.Application.Common.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/public/home")]
[AllowAnonymous]
public class HomeRecommendationsController(IApplicationDbContext context) : ControllerBase
{
    [HttpGet("recommendations")]
    public async Task<ActionResult<HomeRecommendationResponseDto>> Recommendations([FromQuery] HomeRecommendationQuery query)
    {
        if (string.IsNullOrWhiteSpace(query.ProvinceId)) return BadRequest(new { message = "Vui lòng chọn điểm đến." });
        var overnight = !string.Equals(query.StayType, "DAY_USE", StringComparison.OrdinalIgnoreCase);
        if (overnight && query.CheckInDate.HasValue != query.CheckOutDate.HasValue)
            return BadRequest(new { message = "Ngày nhận và trả phòng phải được cung cấp cùng nhau." });

        var searchResult = await new PublicPropertiesController(context).Search(new PublicPropertySearchQuery(
            null, null, overnight ? query.CheckInDate : null, overnight ? query.CheckOutDate : null,
            Math.Max(1, query.AdultCount), Math.Max(0, query.ChildCount), Math.Max(1, query.RoomCount),
            SortBy: "POPULAR", PageNumber: 1, PageSize: Math.Clamp(query.Limit, 1, 12), ProvinceId: query.ProvinceId));
        if (searchResult.Result is BadRequestObjectResult badRequest) return badRequest;
        var page = (searchResult.Result as OkObjectResult)?.Value as PublicPropertyPage;
        if (page is null) return StatusCode(500, new { message = "Không thể tải gợi ý chỗ nghỉ." });

        var city = page.Content.FirstOrDefault()?.ProvinceName ?? query.ProvinceId;
        var items = new List<HomeRecommendationItemDto>();
        foreach (var property in page.Content)
        {
            var lowestType = await context.RoomTypes.IgnoreQueryFilters().FirstAsync(type => type.Id == property.LowestRoomType.Id);
            PublicQuoteDto? quote = null;
            HomeRecommendationPricingDto pricing;
            if (overnight && query.CheckInDate.HasValue && query.CheckOutDate.HasValue)
            {
                var calculated = await PublicPricing.Calculate(context, lowestType, query.CheckInDate.Value,
                    query.CheckOutDate.Value, Math.Max(1, query.RoomCount), null);
                quote = new PublicQuoteDto(Guid.NewGuid().ToString("N"), DateTime.UtcNow.AddMinutes(15),
                    property.Id, lowestType.Id, lowestType.BasePricePerNight, calculated.Nights, Math.Max(1, query.RoomCount),
                    calculated.BaseSubtotal, calculated.TaxAmount, calculated.FeeAmount,
                    calculated.TaxAmount + calculated.FeeAmount, calculated.Promotions,
                    new MemberBenefitDto(false, null, null, null, null), calculated.Discount, calculated.FinalTotal, "VND");
                var finalNightly = calculated.FinalTotal / calculated.Nights / Math.Max(1, query.RoomCount);
                pricing = new(lowestType.BasePricePerNight, finalNightly, calculated.Discount, "VND");
            }
            else pricing = new(lowestType.BasePricePerNight, null, null, "VND");

            items.Add(new(property.Id, property.Name, property.PropertyType, query.ProvinceId, property.ProvinceName,
                null, property.MainImageUrl, property.Name, property.StarRating, property.ReviewScore,
                property.ReviewCount, property.AvailableRoomCount, pricing, quote, "POPULAR_DESTINATION", false));
        }

        return Ok(new HomeRecommendationResponseDto(
            new HomeRecommendationDestinationDto(query.ProvinceId, city, city, page.TotalElements, true), items, page.TotalElements));
    }
}

public sealed record HomeRecommendationQuery(string ProvinceId, DateOnly? CheckInDate, DateOnly? CheckOutDate,
    string? StayType = "OVERNIGHT", int AdultCount = 2, int ChildCount = 0, int RoomCount = 1,
    int Limit = 8, string Locale = "vi");
public sealed record HomeRecommendationDestinationDto(string Id, string Name, string DisplayName, int PropertyCount,
    bool SelectedByDefault);
public sealed record HomeRecommendationPricingDto(decimal NightlyPrice, decimal? FinalNightlyPrice,
    decimal? TotalDiscount, string Currency);
public sealed record HomeRecommendationItemDto(Guid PropertyId, string Name, string PropertyType, string ProvinceId,
    string ProvinceName, string? WardName, string? ImageUrl, string? ImageAlt, int? StarRating, double? ReviewScore,
    int? ReviewCount, int? AvailableRoomCount, HomeRecommendationPricingDto? Pricing, PublicQuoteDto? Quote,
    string RecommendationReason, bool Sponsored);
public sealed record HomeRecommendationResponseDto(HomeRecommendationDestinationDto Destination,
    List<HomeRecommendationItemDto> Items, int TotalAvailable);
