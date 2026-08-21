using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using HotelSaas.Infrastructure.Persistence;
using HotelSaas.Infrastructure.Services;
using HotelSaas.WebApi.Controllers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace HotelSaas.WebApi.Tests;

public class PublicLocationsControllerTests
{
    [Fact]
    public async Task Popular_destinations_group_active_properties_by_city_with_stable_string_key()
    {
        await using var db = CreateContext();
        db.Tenants.AddRange(Property("Hotel A", "Đà Nẵng"), Property("Hotel B", "Đà Nẵng"),
            Property("Hidden", "Hà Nội", TenantStatus.Suspended));
        await db.SaveChangesAsync();

        var result = await new PublicLocationsController(db).PopularDestinations(8);

        var destinations = Assert.IsType<List<LocationSuggestionDto>>(Assert.IsType<OkObjectResult>(result.Result).Value);
        var destination = Assert.Single(destinations);
        Assert.Equal("city:da-nang", destination.Id);
        Assert.Equal(2, destination.PropertyCount);
    }

    [Fact]
    public async Task Suggestions_return_matching_city_and_property_without_inactive_tenants()
    {
        await using var db = CreateContext();
        var active = Property("Biển Xanh Hotel", "Đà Nẵng");
        var hidden = Property("Biển Xanh Suspended", "Đà Nẵng", TenantStatus.Suspended);
        db.Tenants.AddRange(active, hidden);
        await db.SaveChangesAsync();

        var result = await new PublicLocationsController(db).Suggestions("Biển Xanh", 10);

        var groups = Assert.IsType<SearchSuggestionGroupsDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        var property = Assert.Single(groups.Properties);
        Assert.Equal(active.Id.ToString(), property.Id);
        Assert.DoesNotContain(groups.Properties, item => item.Id == hidden.Id.ToString());
    }

    [Fact]
    public async Task Property_search_filters_by_location_key()
    {
        await using var db = CreateContext();
        AddInventory(db, Property("Da Nang Stay", "Đà Nẵng"));
        AddInventory(db, Property("Ha Noi Stay", "Hà Nội"));
        await db.SaveChangesAsync();

        var result = await new PublicPropertiesController(db).Search(new(
            null, null, null, null, ProvinceId: "city:da-nang"));

        var page = Assert.IsType<PublicPropertyPage>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal("Da Nang Stay", Assert.Single(page.Content).Name);
    }

    [Fact]
    public async Task Suggestions_include_landmarks_with_search_coordinates()
    {
        await using var db = CreateContext();

        var result = await new PublicLocationsController(db).Suggestions("Cầu Rồng", 10);

        var groups = Assert.IsType<SearchSuggestionGroupsDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        var landmark = Assert.Single(groups.Landmarks);
        Assert.Equal("LANDMARK", landmark.Type);
        Assert.Equal("landmark:cau-rong", landmark.Id);
        Assert.Equal(16.0611, landmark.Latitude);
        Assert.Equal(108.2277, landmark.Longitude);
        Assert.Equal(5, landmark.DefaultRadiusKm);
    }

    [Fact]
    public async Task Suggestions_match_curated_wards_without_diacritics_and_children_use_province_key()
    {
        await using var db = CreateContext();
        var property = Property("Mỹ Tho Stay", "Tiền Giang");
        property.Address = "21 Đường Vườn Xanh, Mỹ Tho";
        db.Tenants.Add(property);
        await db.SaveChangesAsync();

        var result = await new PublicLocationsController(db).Suggestions("my tho", 10);
        var groups = Assert.IsType<SearchSuggestionGroupsDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        var ward = Assert.Single(groups.Wards);
        Assert.Equal("ward:my-tho", ward.Id);
        Assert.Equal("city:tien-giang", ward.ProvinceId);
        Assert.Equal(1, ward.PropertyCount);

        var children = await new PublicLocationsController(db).Children("city:tien-giang");
        var locations = Assert.IsType<List<PublicLocationDto>>(Assert.IsType<OkObjectResult>(children.Result).Value);
        var child = Assert.Single(locations, item => item.Id == "ward:my-tho");
        Assert.Equal(1, child.PropertyCount);
    }

    [Fact]
    public async Task Suggestions_include_catalog_province_without_requiring_seeded_property()
    {
        await using var db = CreateContext();

        var result = await new PublicLocationsController(db).Suggestions("gia lai", 10);
        var groups = Assert.IsType<SearchSuggestionGroupsDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        var province = Assert.Single(groups.Provinces);
        Assert.Equal("city:gia-lai", province.Id);
        Assert.Equal("Gia Lai", province.Name);
    }

    private static ApplicationDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        return new ApplicationDbContext(options, new CurrentTenantService());
    }

    private static Tenant Property(string name, string city, TenantStatus status = TenantStatus.Active) => new()
    {
        Name = name, Code = Guid.NewGuid().ToString("N"), Slug = Guid.NewGuid().ToString("N"),
        Address = "1 Location Street", City = city, Status = status
    };

    private static void AddInventory(ApplicationDbContext db, Tenant tenant)
    {
        var type = new RoomType
        {
            TenantId = tenant.Id, Tenant = tenant, Name = "Deluxe", Code = "DLX",
            BasePricePerNight = 1_000_000, CapacityAdults = 2, CapacityChildren = 1, IsActive = true
        };
        type.Rooms.Add(new Room
        {
            TenantId = tenant.Id, RoomTypeId = type.Id, RoomNumber = "101", IsActive = true, Status = RoomStatus.Clean
        });
        db.RoomTypes.Add(type);
    }
}
