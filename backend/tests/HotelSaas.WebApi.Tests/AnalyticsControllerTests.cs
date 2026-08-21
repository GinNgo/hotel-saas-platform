using System.Text.Json;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using HotelSaas.Infrastructure.Persistence;
using HotelSaas.Infrastructure.Services;
using HotelSaas.WebApi.Controllers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace HotelSaas.WebApi.Tests;

public class AnalyticsControllerTests
{
    [Fact]
    public async Task Dashboard_returns_real_seven_day_room_revenue_and_occupancy()
    {
        var tenant = new Tenant { Name = "Analytics Hotel", Code = "ANALYTICS", Slug = "analytics", Address = "1 Test", City = "Hue", Status = TenantStatus.Active };
        var tenantService = new CurrentTenantService();
        tenantService.SetTenant(tenant.Id, SubscriptionTier.Pro);
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using var db = new ApplicationDbContext(options, tenantService);
        var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(7));
        var reservation = new Reservation
        {
            TenantId = tenant.Id, BookingCode = "ANALYTICS-STAY", GuestFullName = "Guest", GuestEmail = "guest@example.com",
            GuestPhoneNumber = "0901", CheckInDate = today.AddDays(-1), CheckOutDate = today.AddDays(1), Status = ReservationStatus.CheckedIn,
            CreatedAtUtc = DateTime.UtcNow
        };
        reservation.Details.Add(new ReservationDetail
        {
            TenantId = tenant.Id, RoomTypeId = Guid.NewGuid(), NightlyPrice = 500_000, NumberOfNights = 2, SubTotal = 1_000_000
        });
        var vietnamDayStartUtc = DateTime.UtcNow.AddHours(7).Date.AddHours(-7);
        var earlyMorningBooking = new Reservation
        {
            TenantId = tenant.Id, BookingCode = "ANALYTICS-EARLY", GuestFullName = "Early Guest", GuestEmail = "early@example.com",
            GuestPhoneNumber = "0902", CheckInDate = today.AddDays(2), CheckOutDate = today.AddDays(3), Status = ReservationStatus.Cancelled,
            CreatedAtUtc = vietnamDayStartUtc.AddMinutes(30)
        };
        db.AddRange(tenant,
            new Room { TenantId = tenant.Id, RoomNumber = "101", IsActive = true, Status = RoomStatus.Occupied },
            new Room { TenantId = tenant.Id, RoomNumber = "102", IsActive = true, Status = RoomStatus.Clean }, reservation, earlyMorningBooking);
        await db.SaveChangesAsync();

        var result = await new AnalyticsController(db, tenantService).GetDashboard();

        var json = JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal(7, json.GetProperty("Labels").GetArrayLength());
        Assert.Equal(7, json.GetProperty("RevenueData").GetArrayLength());
        Assert.Equal(500_000, json.GetProperty("RevenueData")[6].GetDecimal());
        Assert.Equal(50, json.GetProperty("OccupancyData")[6].GetDecimal());
        Assert.Equal(1, json.GetProperty("TotalBookings").GetInt32());
        Assert.Equal(2, json.GetProperty("BookingsToday").GetInt32());
    }
}
