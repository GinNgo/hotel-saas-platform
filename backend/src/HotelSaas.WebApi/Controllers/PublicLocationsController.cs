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
[Route("api/public")]
[AllowAnonymous]
public class PublicLocationsController(IApplicationDbContext context) : ControllerBase
{
    [HttpGet("locations")]
    [HttpGet("locations/provinces")]
    public async Task<ActionResult<List<PublicLocationDto>>> Provinces()
        => Ok((await CityGroups()).Select(ToLocation).OrderBy(item => item.NameVi).ToList());

    [HttpGet("locations/provinces/popular")]
    public async Task<ActionResult<List<LocationSuggestionDto>>> PopularProvinces([FromQuery] int size = 6)
        => Ok((await CityGroups()).Where(item => item.PropertyCount > 0).OrderByDescending(item => item.PropertyCount).ThenBy(item => item.City)
            .Take(Math.Clamp(size, 1, 12)).Select(ToSuggestion).ToList());

    [HttpGet("locations/{parentId}/children")]
    [HttpGet("locations/provinces/{parentId}/wards")]
    public async Task<ActionResult<List<PublicLocationDto>>> Children(string parentId)
    {
        var properties = await ActiveProperties();
        var wards = PublicWards.All.Where(item => item.ProvinceId.Equals(parentId, StringComparison.OrdinalIgnoreCase))
            .Select(item => new PublicLocationDto(item.Id, item.Id, item.Name, item.Name,
                "WARD", "WARD", PublicLocationKeys.Slug(item.Name), item.Name,
                properties.Count(property => MatchesWard(property, item)))).ToList();
        return Ok(wards);
    }

    [HttpGet("locations/search")]
    public async Task<ActionResult<List<LocationSuggestionDto>>> Search([FromQuery] string? keyword, [FromQuery] int size = 20)
    {
        var normalized = keyword?.Trim() ?? string.Empty;
        var cities = (await CityGroups()).Where(item => Matches(item.City, normalized)).Select(ToSuggestion);
        var properties = await ActiveProperties();
        var propertyResults = properties.Where(item => Matches(item.Name, normalized) || Matches(item.City, normalized) || Matches(item.Address, normalized))
            .Select(ToPropertySuggestion);
        var wards = PublicWards.All.Where(item => Matches(item.Name, normalized) || Matches(item.ProvinceName, normalized))
            .Select(item => ToWardSuggestion(item, properties.Count(property => MatchesWard(property, item))));
        var landmarks = PublicLandmarks.All.Where(item => Matches(item.Name, normalized) || Matches(item.City, normalized)).Select(ToLandmarkSuggestion);
        return Ok(cities.Concat(wards).Concat(propertyResults).Concat(landmarks).Take(Math.Clamp(size, 1, 50)).ToList());
    }

    [HttpGet("search/suggestions")]
    public async Task<ActionResult<SearchSuggestionGroupsDto>> Suggestions([FromQuery] string? keyword, [FromQuery] int limit = 10,
        [FromQuery] string? provinceId = null)
    {
        var normalized = keyword?.Trim() ?? string.Empty;
        var cityGroups = await CityGroups();
        var cities = cityGroups.Where(item => Matches(item.City, normalized) &&
            (string.IsNullOrWhiteSpace(provinceId) || item.Id == provinceId)).Take(Math.Clamp(limit, 1, 20)).Select(ToSuggestion).ToList();
        var activeProperties = await ActiveProperties();
        var properties = activeProperties.Where(item =>
            (string.IsNullOrWhiteSpace(provinceId) || PublicLocationKeys.City(item.City) == provinceId) &&
            (Matches(item.Name, normalized) || Matches(item.City, normalized) || Matches(item.Address, normalized)))
            .Take(Math.Clamp(limit, 1, 20)).Select(ToPropertySuggestion).ToList();
        var wards = PublicWards.All.Where(item => (string.IsNullOrWhiteSpace(provinceId) || item.ProvinceId == provinceId)
            && (Matches(item.Name, normalized) || Matches(item.ProvinceName, normalized))).Take(Math.Clamp(limit, 1, 20))
            .Select(item => ToWardSuggestion(item, activeProperties.Count(property => MatchesWard(property, item)))).ToList();
        var landmarks = PublicLandmarks.All.Where(item => (string.IsNullOrWhiteSpace(provinceId) || PublicLocationKeys.City(item.City) == provinceId)
            && (Matches(item.Name, normalized) || Matches(item.City, normalized)))
            .Take(Math.Clamp(limit, 1, 20)).Select(ToLandmarkSuggestion).ToList();
        return Ok(new SearchSuggestionGroupsDto(cities, wards, properties, landmarks));
    }

    [HttpGet("popular-destinations")]
    public async Task<ActionResult<List<LocationSuggestionDto>>> PopularDestinations([FromQuery] int limit = 8)
        => Ok((await CityGroups()).Where(item => item.PropertyCount > 0).OrderByDescending(item => item.PropertyCount).ThenBy(item => item.City)
            .Take(Math.Clamp(limit, 1, 12)).Select(ToSuggestion).ToList());

    [HttpGet("home/recommendation-destinations")]
    public async Task<ActionResult<List<HomeDestinationDto>>> RecommendationDestinations([FromQuery] string? preferredProvinceId,
        [FromQuery] int limit = 5)
    {
        var groups = (await CityGroups()).OrderByDescending(item => item.PropertyCount).ThenBy(item => item.City).ToList();
        var selected = groups.Any(item => item.Id == preferredProvinceId) ? preferredProvinceId : groups.FirstOrDefault()?.Id;
        return Ok(groups.Take(Math.Clamp(limit, 1, 8)).Select(item => new HomeDestinationDto(
            item.Id, item.City, item.City, item.PropertyCount, item.Id == selected)).ToList());
    }

    private async Task<List<CityGroup>> CityGroups()
    {
        var properties = await ActiveProperties();
        var groups = properties.Where(item => !string.IsNullOrWhiteSpace(item.City)).GroupBy(item => item.City.Trim(), StringComparer.OrdinalIgnoreCase)
            .Select(group => new CityGroup(PublicLocationKeys.City(group.Key), group.Key, group.Count())).ToList();
        foreach (var city in PublicProvinceCatalog.All)
            if (groups.All(item => !item.Id.Equals(PublicLocationKeys.City(city), StringComparison.OrdinalIgnoreCase)))
                groups.Add(new CityGroup(PublicLocationKeys.City(city), city, 0));
        return groups;
    }

    private Task<List<Tenant>> ActiveProperties() => context.Tenants.IgnoreQueryFilters()
        .Where(item => !item.IsDeleted && item.Status == TenantStatus.Active).OrderBy(item => item.Name).ToListAsync();

    private static bool MatchesWard(Tenant property, PublicWard ward) =>
        PublicLocationKeys.Slug($"{property.Address} {property.City}")
            .Contains(PublicLocationKeys.Slug(ward.Name), StringComparison.OrdinalIgnoreCase);

    private static PublicLocationDto ToLocation(CityGroup item) => new(item.Id, item.Id, item.City, item.City,
        "PROVINCE", "PROVINCE", PublicLocationKeys.Slug(item.City), item.City, item.PropertyCount);
    private static LocationSuggestionDto ToSuggestion(CityGroup item) => new("PROVINCE", item.Id, item.City, item.City,
        null, null, item.Id, item.City, null, null, item.PropertyCount, PublicLocationKeys.Slug(item.City), null, null);
    private static LocationSuggestionDto ToPropertySuggestion(Tenant item) => new("PROPERTY", item.Id.ToString(), item.Name,
        $"{item.Name}, {item.City}", item.City, item.Address, PublicLocationKeys.City(item.City), item.City,
        null, null, null, item.Slug, item.PropertyType, item.LogoUrl, item.Latitude, item.Longitude);
    private static LocationSuggestionDto ToWardSuggestion(PublicWard item, int propertyCount) => new("WARD", item.Id, item.Name,
        $"{item.Name}, {item.ProvinceName}", item.ProvinceName, null, item.ProvinceId, item.ProvinceName,
        item.Id, item.Name, propertyCount, PublicLocationKeys.Slug(item.Name), null, null, null, null);
    private static LocationSuggestionDto ToLandmarkSuggestion(PublicLandmark item) => new("LANDMARK", item.Id, item.Name,
        $"{item.Name}, {item.City}", "Địa danh", null, PublicLocationKeys.City(item.City), item.City,
        null, null, null, PublicLocationKeys.Slug(item.Name), null, null, item.Latitude, item.Longitude, item.DefaultRadiusKm);
    private static bool Matches(string? source, string keyword) => string.IsNullOrWhiteSpace(keyword) ||
        (source?.Contains(keyword, StringComparison.OrdinalIgnoreCase) ?? false) ||
        (!string.IsNullOrWhiteSpace(source) && PublicLocationKeys.Slug(source).Contains(PublicLocationKeys.Slug(keyword), StringComparison.OrdinalIgnoreCase));

    private sealed record CityGroup(string Id, string City, int PropertyCount);
}

internal static class PublicLocationKeys
{
    public static string City(string city) => $"city:{Slug(city)}";
    public static string Slug(string value)
    {
        var normalized = value.Trim().Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder();
        foreach (var character in normalized)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) == UnicodeCategory.NonSpacingMark) continue;
            if (character is 'đ' or 'Đ') { builder.Append('d'); continue; }
            if (char.IsLetterOrDigit(character)) builder.Append(char.ToLowerInvariant(character));
            else if (builder.Length > 0 && builder[^1] != '-') builder.Append('-');
        }
        return builder.ToString().Trim('-');
    }
}

public sealed record PublicLocationDto(string Id, string Code, string NameVi, string NameEn, string Type,
    string LocationType, string Slug, string DisplayName, int PropertyCount);
public sealed record LocationSuggestionDto(string Type, string Id, string Name, string DisplayName, string? SecondaryText,
    string? Address, string? ProvinceId, string? ProvinceName, string? WardId, string? WardName, int? PropertyCount,
    string? Slug, string? PropertyType, string? ThumbnailUrl, double? Latitude = null, double? Longitude = null, double? DefaultRadiusKm = null);
public sealed record SearchSuggestionGroupsDto(List<LocationSuggestionDto> Provinces, List<LocationSuggestionDto> Wards,
    List<LocationSuggestionDto> Properties, List<LocationSuggestionDto> Landmarks);
public sealed record HomeDestinationDto(string Id, string Name, string DisplayName, int PropertyCount, bool SelectedByDefault);
internal sealed record PublicLandmark(string Id, string Name, string City, double Latitude, double Longitude, double DefaultRadiusKm = 5);
internal static class PublicLandmarks
{
    public static readonly IReadOnlyList<PublicLandmark> All =
    [
        new("landmark:ho-guom", "Hồ Hoàn Kiếm", "Hà Nội", 21.0287, 105.8521),
        new("landmark:pho-co-ha-noi", "Phố cổ Hà Nội", "Hà Nội", 21.0340, 105.8500),
        new("landmark:cau-rong", "Cầu Rồng", "Đà Nẵng", 16.0611, 108.2277),
        new("landmark:ba-na-hills", "Bà Nà Hills", "Đà Nẵng", 15.9977, 107.9881, 10),
        new("landmark:cho-ben-thanh", "Chợ Bến Thành", "Hồ Chí Minh", 10.7725, 106.6980),
        new("landmark:nha-tho-duc-ba", "Nhà thờ Đức Bà", "Hồ Chí Minh", 10.7798, 106.6990),
        new("landmark:pho-co-hoi-an", "Phố cổ Hội An", "Quảng Nam", 15.8801, 108.3380),
        new("landmark:cho-dem-da-lat", "Chợ đêm Đà Lạt", "Lâm Đồng", 11.9420, 108.4369)
    ];
    public static PublicLandmark? Find(string? id) => All.FirstOrDefault(item => item.Id.Equals(id?.Trim(), StringComparison.OrdinalIgnoreCase));
}

internal sealed record PublicWard(string Id, string Name, string ProvinceId, string ProvinceName, int PropertyCount = 0);
internal static class PublicWards
{
    // Small curated fallback until a maintained administrative-data provider is connected.
    public static readonly IReadOnlyList<PublicWard> All =
    [
        new("ward:my-tho", "Mỹ Tho", PublicLocationKeys.City("Tiền Giang"), "Tiền Giang", 1),
        new("ward:phuc-xa", "Phúc Xá", PublicLocationKeys.City("Hà Nội"), "Hà Nội")
    ];
}
internal static class PublicProvinceCatalog
{
    public static readonly IReadOnlyList<string> All = ["Gia Lai", "Hà Nội", "Tiền Giang"];
}
