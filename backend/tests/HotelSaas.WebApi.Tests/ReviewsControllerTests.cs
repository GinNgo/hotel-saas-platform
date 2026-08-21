using System.Security.Claims;
using System.Text.Json;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using HotelSaas.Infrastructure.Persistence;
using HotelSaas.Infrastructure.Services;
using HotelSaas.WebApi.Controllers;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace HotelSaas.WebApi.Tests;

public class ReviewsControllerTests
{
    [Fact]
    public async Task Only_customer_checked_out_reservation_can_be_reviewed()
    {
        var userId = Guid.NewGuid(); var tenant = Hotel();
        var activeStay = Stay(tenant, userId, ReservationStatus.CheckedIn);
        await using var db = CreateContext(tenant, activeStay);
        var controller = WithCustomer(new ReviewsController(db), userId);

        var result = await controller.Submit(activeStay.Id, Request());

        Assert.IsType<ConflictObjectResult>(result.Result);
        Assert.Empty(db.PropertyReviews);
    }

    [Fact]
    public async Task Verified_review_is_idempotent_for_same_payload_and_unique_per_stay()
    {
        var userId = Guid.NewGuid(); var tenant = Hotel(); var stay = Stay(tenant, userId, ReservationStatus.CheckedOut);
        await using var db = CreateContext(tenant, stay);
        var controller = WithCustomer(new ReviewsController(db), userId);

        var first = await controller.Submit(stay.Id, Request());
        var replay = await controller.Submit(stay.Id, Request());
        var conflict = await controller.Submit(stay.Id, Request() with { Score = 7 });

        Assert.False(JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(first.Result).Value).GetProperty("Replayed").GetBoolean());
        Assert.True(JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(replay.Result).Value).GetProperty("Replayed").GetBoolean());
        Assert.IsType<ConflictObjectResult>(conflict.Result);
        Assert.Single(db.PropertyReviews);
    }

    [Fact]
    public async Task Public_review_summary_uses_only_published_reviews()
    {
        var tenant = Hotel(); var user = new User { Username = "guest", Email = "guest@test.vn", FullName = "Verified Guest", PasswordHash = "hash" };
        var first = Stay(tenant, user.Id, ReservationStatus.CheckedOut); var second = Stay(tenant, user.Id, ReservationStatus.CheckedOut);
        await using var db = CreateContext(tenant, first, second); db.Users.Add(user);
        db.PropertyReviews.AddRange(
            new PropertyReview { TenantId = tenant.Id, ReservationId = first.Id, UserId = user.Id, Score = 8, CleanlinessScore = 8, ServiceScore = 8, LocationScore = 8, ValueScore = 8, Comment = "A verified good stay", IsPublished = true },
            new PropertyReview { TenantId = tenant.Id, ReservationId = second.Id, UserId = user.Id, Score = 2, CleanlinessScore = 2, ServiceScore = 2, LocationScore = 2, ValueScore = 2, Comment = "Hidden moderation item", IsPublished = false });
        await db.SaveChangesAsync();

        var result = await new ReviewsController(db).List(tenant.Id);
        var json = JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(result.Result).Value);

        Assert.Equal(1, json.GetProperty("TotalElements").GetInt32());
        Assert.Equal(8, json.GetProperty("Summary").GetProperty("Score").GetDouble());
    }

    private static SubmitReviewRequest Request() => new(9, 9, 8, 10, 9, "Excellent", "A genuinely comfortable verified stay.");
    private static T WithCustomer<T>(T controller, Guid userId) where T : ControllerBase
    {
        controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, userId.ToString()), new Claim(ClaimTypes.Role, "Customer")], "test")) } };
        return controller;
    }
    private static Tenant Hotel() => new() { Name = "Review Hotel", Code = $"R-{Guid.NewGuid():N}", Slug = $"r-{Guid.NewGuid():N}", Address = "1 Test", City = "Da Nang", Status = TenantStatus.Active };
    private static Reservation Stay(Tenant tenant, Guid userId, ReservationStatus status) => new() { TenantId = tenant.Id, CustomerUserId = userId, BookingCode = $"B-{Guid.NewGuid():N}", GuestFullName = "Guest", GuestEmail = "guest@test.vn", GuestPhoneNumber = "0900", CheckInDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-3)), CheckOutDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1)), Status = status };
    private static ApplicationDbContext CreateContext(Tenant tenant, params Reservation[] reservations)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        var db = new ApplicationDbContext(options, new CurrentTenantService()); db.Tenants.Add(tenant); db.Reservations.AddRange(reservations); db.SaveChanges(); return db;
    }
}
