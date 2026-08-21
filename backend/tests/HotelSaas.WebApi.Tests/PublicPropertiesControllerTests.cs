using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using HotelSaas.Infrastructure.Persistence;
using HotelSaas.Infrastructure.Services;
using HotelSaas.WebApi.Controllers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace HotelSaas.WebApi.Tests;

public class PublicPropertiesControllerTests
{
    [Fact]
    public async Task Search_only_returns_active_properties()
    {
        await using var db = CreateContext();
        AddInventory(db, TenantStatus.Active, "Active Hotel", 1);
        AddInventory(db, TenantStatus.Suspended, "Suspended Hotel", 1);
        await db.SaveChangesAsync();

        var result = await new PublicPropertiesController(db).Search(new(null, null, null, null));

        var page = Assert.IsType<PublicPropertyPage>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Single(page.Content);
        Assert.Equal("Active Hotel", page.Content[0].Name);
    }

    [Fact]
    public async Task Search_omits_property_when_overlapping_reservation_sells_last_room()
    {
        await using var db = CreateContext();
        var (tenant, roomType) = AddInventory(db, TenantStatus.Active, "Sold Out Hotel", 1);
        var start = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(2));
        var reservation = new Reservation
        {
            TenantId = tenant.Id, BookingCode = "DISCOVERY-001", GuestFullName = "Guest",
            GuestEmail = "guest@example.com", GuestPhoneNumber = "0900000000", CheckInDate = start,
            CheckOutDate = start.AddDays(2), Status = ReservationStatus.Confirmed, TotalAmount = roomType.BasePricePerNight
        };
        reservation.Details.Add(new ReservationDetail
        {
            TenantId = tenant.Id, RoomTypeId = roomType.Id, NightlyPrice = roomType.BasePricePerNight,
            NumberOfNights = 2, SubTotal = roomType.BasePricePerNight * 2
        });
        db.Reservations.Add(reservation);
        await db.SaveChangesAsync();

        var result = await new PublicPropertiesController(db).Search(new(null, null, start, start.AddDays(1)));

        var page = Assert.IsType<PublicPropertyPage>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Empty(page.Content);
    }

    [Fact]
    public async Task Room_types_subtract_active_holds()
    {
        await using var db = CreateContext();
        var (tenant, roomType) = AddInventory(db, TenantStatus.Active, "Hold Hotel", 2);
        var start = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(2));
        db.BookingHolds.Add(new BookingHold
        {
            TenantId = tenant.Id, RoomTypeId = roomType.Id, Quantity = 1,
            CheckInDate = start.ToDateTime(TimeOnly.MinValue), CheckOutDate = start.AddDays(1).ToDateTime(TimeOnly.MinValue),
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(10)
        });
        await db.SaveChangesAsync();

        var result = await new PublicPropertiesController(db).RoomTypes(tenant.Id, start, start.AddDays(1));

        var rooms = Assert.IsType<List<PublicRoomTypeDto>>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Single(rooms);
        Assert.Equal(1, rooms[0].AvailableRooms);
    }

    [Fact]
    public async Task Public_room_types_return_real_booking_benefits_and_room_amenities()
    {
        await using var db = CreateContext();
        var (tenant, roomType) = AddInventory(db, TenantStatus.Active, "Benefit Hotel", 1);
        roomType.IncludesBreakfast = true;
        roomType.IsRefundable = true;
        roomType.FreeCancellationHours = 48;
        roomType.Amenities.Add(new RoomTypeAmenity { TenantId = tenant.Id, RoomTypeId = roomType.Id, Code = "SEA_VIEW" });
        await db.SaveChangesAsync();

        var result = await new PublicPropertiesController(db).RoomTypes(tenant.Id, null, null);
        var room = Assert.Single(Assert.IsType<List<PublicRoomTypeDto>>(Assert.IsType<OkObjectResult>(result.Result).Value));

        Assert.True(room.IncludesBreakfast);
        Assert.True(room.IsRefundable);
        Assert.Equal(48, room.FreeCancellationHours);
        Assert.Contains("Hướng biển", room.Amenities);
    }

    [Fact]
    public async Task Search_sorts_by_price_and_paginates()
    {
        await using var db = CreateContext();
        AddInventory(db, TenantStatus.Active, "Premium", 1, 2_000_000);
        AddInventory(db, TenantStatus.Active, "Budget", 1, 500_000);
        await db.SaveChangesAsync();

        var result = await new PublicPropertiesController(db).Search(
            new(null, null, null, null, SortBy: "PRICE_ASC", PageNumber: 1, PageSize: 1));

        var page = Assert.IsType<PublicPropertyPage>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal(2, page.TotalElements);
        Assert.Equal(2, page.TotalPages);
        Assert.Equal("Budget", Assert.Single(page.Content).Name);
    }

    [Fact]
    public async Task Search_filters_and_sorts_by_verified_review_score()
    {
        await using var db = CreateContext();
        var (excellent, _) = AddInventory(db, TenantStatus.Active, "Excellent", 1);
        var (pleasant, _) = AddInventory(db, TenantStatus.Active, "Pleasant", 1);
        db.PropertyReviews.AddRange(
            Review(excellent.Id, 9, true), Review(excellent.Id, 10, true),
            Review(pleasant.Id, 7, true), Review(pleasant.Id, 10, false));
        await db.SaveChangesAsync();

        var filtered = await new PublicPropertiesController(db).Search(new(null, null, null, null, SortBy: "RATING", MinReviewScore: 8));
        var page = Assert.IsType<PublicPropertyPage>(Assert.IsType<OkObjectResult>(filtered.Result).Value);

        var property = Assert.Single(page.Content);
        Assert.Equal("Excellent", property.Name);
        Assert.Equal(9.5, property.ReviewScore);
        Assert.Equal(2, property.ReviewCount);
    }

    [Fact]
    public async Task Search_filters_by_persisted_property_type_and_star_rating()
    {
        await using var db = CreateContext();
        AddInventory(db, TenantStatus.Active, "Five Star Resort", 1, propertyType: "RESORT", starRating: 5);
        AddInventory(db, TenantStatus.Active, "Three Star Hotel", 1, propertyType: "HOTEL", starRating: 3);
        await db.SaveChangesAsync();

        var result = await new PublicPropertiesController(db).Search(new(null, null, null, null, PropertyTypes: "RESORT", StarRatings: "5"));
        var page = Assert.IsType<PublicPropertyPage>(Assert.IsType<OkObjectResult>(result.Result).Value);

        var property = Assert.Single(page.Content);
        Assert.Equal("Five Star Resort", property.Name);
        Assert.Equal("RESORT", property.PropertyType);
        Assert.Equal(5, property.StarRating);
    }

    [Fact]
    public async Task Landmark_search_filters_radius_and_sorts_by_real_distance()
    {
        await using var db = CreateContext();
        var (nearest, _) = AddInventory(db, TenantStatus.Active, "Riverside", 1);
        nearest.Latitude = 16.0620; nearest.Longitude = 108.2280;
        var (farther, _) = AddInventory(db, TenantStatus.Active, "Beachside", 1);
        farther.Latitude = 16.0900; farther.Longitude = 108.2450;
        var (outside, _) = AddInventory(db, TenantStatus.Active, "Hanoi Hotel", 1);
        outside.Latitude = 21.0287; outside.Longitude = 105.8521;
        await db.SaveChangesAsync();

        var result = await new PublicPropertiesController(db).Search(new(null, null, null, null,
            SortBy: "NEAREST", LandmarkId: "landmark:cau-rong", RadiusKm: 5));
        var page = Assert.IsType<PublicPropertyPage>(Assert.IsType<OkObjectResult>(result.Result).Value);

        Assert.Equal(2, page.TotalElements);
        Assert.Equal("Riverside", page.Content[0].Name);
        Assert.True(page.Content[0].DistanceKm < page.Content[1].DistanceKm);
        Assert.Contains("km", page.Content[0].DistanceText);
    }

    [Fact]
    public async Task Search_returns_authoritative_stay_pricing_and_best_automatic_promotion()
    {
        await using var db = CreateContext();
        var (tenant, _) = AddInventory(db, TenantStatus.Active, "Promotion Hotel", 3, 1_000_000);
        db.Promotions.Add(new Promotion
        {
            TenantId = tenant.Id, Code = "SAVE10", Title = "Giảm 10%", DiscountPercent = 10,
            StartDateUtc = DateTime.UtcNow.AddDays(-1), EndDateUtc = DateTime.UtcNow.AddDays(7), IsActive = true
        });
        await db.SaveChangesAsync();
        var checkIn = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(2));

        var result = await new PublicPropertiesController(db).Search(new(null, null, checkIn, checkIn.AddDays(2), RoomCount: 2));
        var property = Assert.Single(Assert.IsType<PublicPropertyPage>(Assert.IsType<OkObjectResult>(result.Result).Value).Content);

        Assert.Equal(1_000_000, property.Pricing.NightlyPrice);
        Assert.Equal(900_000, property.Pricing.DiscountedNightlyPrice);
        Assert.Equal(4_000_000, property.Pricing.Subtotal);
        Assert.Equal(3_600_000, property.Pricing.TotalAmount);
        Assert.Equal(400_000, property.Quote.TotalDiscount);
        Assert.Equal("SAVE10", Assert.Single(property.Quote.AppliedPromotions).Code);
        Assert.Equal(900_000, property.StartingPrice);
    }

    [Fact]
    public async Task Search_price_filter_uses_discounted_rate_instead_of_base_rate()
    {
        await using var db = CreateContext();
        var (tenant, _) = AddInventory(db, TenantStatus.Active, "Discount Filter", 1, 1_000_000);
        db.Promotions.Add(new Promotion
        {
            TenantId = tenant.Id, Code = "SAVE20", Title = "Giảm 20%", DiscountPercent = 20,
            StartDateUtc = DateTime.UtcNow.AddDays(-1), EndDateUtc = DateTime.UtcNow.AddDays(2)
        });
        await db.SaveChangesAsync();

        var included = await new PublicPropertiesController(db).Search(new(null, null, null, null, MaxPrice: 850_000));
        Assert.Single(Assert.IsType<PublicPropertyPage>(Assert.IsType<OkObjectResult>(included.Result).Value).Content);

        var excluded = await new PublicPropertiesController(db).Search(new(null, null, null, null, MinPrice: 900_000));
        Assert.Empty(Assert.IsType<PublicPropertyPage>(Assert.IsType<OkObjectResult>(excluded.Result).Value).Content);
    }

    [Fact]
    public async Task Search_card_selects_the_cheapest_room_that_actually_fits_the_guests()
    {
        await using var db = CreateContext();
        var (tenant, compact) = AddInventory(db, TenantStatus.Active, "Capacity Hotel", 1, 500_000);
        compact.CapacityAdults = 2;
        var family = new RoomType
        {
            TenantId = tenant.Id, Tenant = tenant, Name = "Family Suite", Code = "FAM", BasePricePerNight = 1_200_000,
            CapacityAdults = 4, CapacityChildren = 2, IsActive = true
        };
        family.Rooms.Add(new Room { TenantId = tenant.Id, RoomTypeId = family.Id, RoomNumber = "201", IsActive = true, Status = RoomStatus.Clean });
        db.RoomTypes.Add(family);
        await db.SaveChangesAsync();

        var result = await new PublicPropertiesController(db).Search(new(null, null, null, null, AdultCount: 3));
        var property = Assert.Single(Assert.IsType<PublicPropertyPage>(Assert.IsType<OkObjectResult>(result.Result).Value).Content);

        Assert.Equal(family.Id, property.LowestRoomType.Id);
        Assert.Equal("Family Suite", property.LowestRoomType.Name);
        Assert.Equal(1_200_000, property.Pricing.NightlyPrice);
    }

    [Fact]
    public async Task Search_filters_by_ward_id_using_property_address()
    {
        await using var db = CreateContext();
        var (matching, _) = AddInventory(db, TenantStatus.Active, "Mỹ Tho Stay", 1);
        matching.City = "Tiền Giang";
        matching.Address = "21 Đường Vườn Xanh, Mỹ Tho";
        AddInventory(db, TenantStatus.Active, "Other Stay", 1);
        await db.SaveChangesAsync();

        var result = await new PublicPropertiesController(db).Search(new(null, null, null, null, WardId: "ward:my-tho"));
        var page = Assert.IsType<PublicPropertyPage>(Assert.IsType<OkObjectResult>(result.Result).Value);
        var property = Assert.Single(page.Content);
        Assert.Equal("Mỹ Tho Stay", property.Name);
    }

    [Fact]
    public async Task Search_keyword_matches_property_address_without_diacritics()
    {
        await using var db = CreateContext();
        var (tenant, _) = AddInventory(db, TenantStatus.Active, "Mỹ Tho Stay", 1);
        tenant.City = "Tiền Giang";
        tenant.Address = "21 Đường Vườn Xanh, Mỹ Tho";
        await db.SaveChangesAsync();

        var result = await new PublicPropertiesController(db).Search(new("my tho", null, null, null));
        var page = Assert.IsType<PublicPropertyPage>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal("Mỹ Tho Stay", Assert.Single(page.Content).Name);
    }

    [Fact]
    public async Task Search_total_matches_authoritative_public_quote()
    {
        await using var db = CreateContext();
        var (tenant, roomType) = AddInventory(db, TenantStatus.Active, "Parity Hotel", 2, 1_000_000);
        tenant.TaxRatePercent = 8;
        tenant.ServiceFeeRatePercent = 5;
        db.Promotions.Add(new Promotion
        {
            TenantId = tenant.Id, Code = "PARITY10", Title = "Giảm 10%", DiscountPercent = 10,
            StartDateUtc = DateTime.UtcNow.AddDays(-1), EndDateUtc = DateTime.UtcNow.AddDays(10), IsActive = true
        });
        await db.SaveChangesAsync();
        var checkIn = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(2));
        var checkOut = checkIn.AddDays(2);

        var searchResult = await new PublicPropertiesController(db).Search(new(null, tenant.Id, checkIn, checkOut));
        var search = Assert.Single(Assert.IsType<PublicPropertyPage>(Assert.IsType<OkObjectResult>(searchResult.Result).Value).Content);
        var quoteResult = await new PublicPricingController(db).Quote(new(tenant.Id, roomType.Id, checkIn, checkOut, 1, 1, 0, null));
        var quote = Assert.IsType<PublicQuoteDto>(Assert.IsType<OkObjectResult>(quoteResult.Result).Value);

        Assert.Equal(quote.FinalTotal, search.Pricing.TotalAmount);
        Assert.Equal(quote.TotalDiscount, search.Quote.TotalDiscount);
    }

    private static ApplicationDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        return new ApplicationDbContext(options, new CurrentTenantService());
    }

    private static (Tenant Tenant, RoomType RoomType) AddInventory(ApplicationDbContext db, TenantStatus status,
        string name, int roomCount, decimal price = 1_000_000, string propertyType = "HOTEL", int starRating = 0)
    {
        var tenant = new Tenant
        {
            Name = name, Code = Guid.NewGuid().ToString("N"), Slug = Guid.NewGuid().ToString("N"),
            Address = "1 Hotel Street", City = "Da Nang", Status = status, PropertyType = propertyType, StarRating = starRating
        };
        var type = new RoomType
        {
            TenantId = tenant.Id, Tenant = tenant, Name = "Deluxe", Code = "DLX",
            BasePricePerNight = price, CapacityAdults = 2, CapacityChildren = 1, IsActive = true
        };
        for (var index = 0; index < roomCount; index++)
            type.Rooms.Add(new Room { TenantId = tenant.Id, RoomTypeId = type.Id, RoomNumber = $"10{index}", IsActive = true, Status = RoomStatus.Clean });
        db.RoomTypes.Add(type);
        return (tenant, type);
    }

    private static PropertyReview Review(Guid tenantId, int score, bool published) => new()
    {
        TenantId = tenantId, ReservationId = Guid.NewGuid(), UserId = Guid.NewGuid(), Score = score,
        CleanlinessScore = score, ServiceScore = score, LocationScore = score, ValueScore = score,
        Comment = "Verified review content", IsPublished = published
    };
}
