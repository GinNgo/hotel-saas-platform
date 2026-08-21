using System.Security.Claims;
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

public class CustomerIdentityControllerTests
{
    [Fact]
    public async Task Profile_read_and_update_are_scoped_to_authenticated_user()
    {
        var hasher = new PasswordHasher();
        var mine = Customer(hasher, "mine@example.com");
        var other = Customer(hasher, "other@example.com");
        await using var db = CreateContext();
        db.Users.AddRange(mine, other);
        await db.SaveChangesAsync();
        var controller = WithCustomer(new UsersController(db, hasher), mine);

        var read = await controller.Me();
        var update = await controller.UpdateMe(new("Updated Guest", mine.Email, "0901234567", "https://img.example/avatar.webp"));

        Assert.Equal(mine.Id, Assert.IsType<CurrentUserDto>(Assert.IsType<OkObjectResult>(read.Result).Value).Id);
        var updated = Assert.IsType<CurrentUserDto>(Assert.IsType<OkObjectResult>(update.Result).Value);
        Assert.Equal("Updated Guest", updated.FullName);
        Assert.Equal("Other Guest", other.FullName);
    }

    [Fact]
    public async Task Password_change_verifies_current_password_and_revokes_refresh_tokens()
    {
        var hasher = new PasswordHasher();
        var customer = Customer(hasher, "password@example.com");
        await using var db = CreateContext();
        db.Users.Add(customer);
        db.RefreshTokens.Add(new RefreshToken { UserId = customer.Id, Token = "active", ExpiresAtUtc = DateTime.UtcNow.AddDays(1) });
        await db.SaveChangesAsync();
        var controller = WithCustomer(new UsersController(db, hasher), customer);

        var wrong = await controller.ChangePassword(new("wrong-password", "NewPassword123!"));
        var changed = await controller.ChangePassword(new("OldPassword123!", "NewPassword123!"));

        Assert.IsType<BadRequestObjectResult>(wrong);
        Assert.IsType<NoContentResult>(changed);
        Assert.True(hasher.VerifyPassword("NewPassword123!", customer.PasswordHash));
        Assert.True(db.RefreshTokens.Single().IsRevoked);
    }

    [Fact]
    public async Task Profile_update_cannot_bypass_email_verification_flow()
    {
        var hasher = new PasswordHasher();
        var customer = Customer(hasher, "verified-flow@example.com");
        await using var db = CreateContext();
        db.Users.Add(customer);
        await db.SaveChangesAsync();
        var controller = WithCustomer(new UsersController(db, hasher), customer);

        var result = await controller.UpdateMe(new("Customer Test", "bypass@example.com", null, null));

        Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Equal("verified-flow@example.com", customer.Email);
    }

    [Fact]
    public async Task Favorites_are_idempotent_and_isolated_by_customer()
    {
        var hasher = new PasswordHasher();
        var mine = Customer(hasher, "favorite@example.com");
        var other = Customer(hasher, "other-favorite@example.com");
        var tenant = Property();
        await using var db = CreateContext();
        db.AddRange(mine, other, tenant);
        await db.SaveChangesAsync();
        var mineController = WithCustomer(new FavoritesController(db), mine);
        var otherController = WithCustomer(new FavoritesController(db), other);

        await mineController.Add(tenant.Id);
        await mineController.Add(tenant.Id);
        var mineList = await mineController.List();
        var otherList = await otherController.List();

        Assert.Single(Assert.IsType<List<FavoritePropertyDto>>(Assert.IsType<OkObjectResult>(mineList.Result).Value));
        Assert.Empty(Assert.IsType<List<FavoritePropertyDto>>(Assert.IsType<OkObjectResult>(otherList.Result).Value));
        Assert.Single(db.FavoriteProperties.IgnoreQueryFilters());
    }

    [Fact]
    public async Task Removed_favorite_can_be_added_again_without_duplicate_row()
    {
        var hasher = new PasswordHasher();
        var customer = Customer(hasher, "restore@example.com");
        var tenant = Property();
        await using var db = CreateContext();
        db.AddRange(customer, tenant);
        await db.SaveChangesAsync();
        var controller = WithCustomer(new FavoritesController(db), customer);

        await controller.Add(tenant.Id);
        Assert.IsType<NoContentResult>(await controller.Remove(tenant.Id));
        await controller.Add(tenant.Id);

        var favorite = db.FavoriteProperties.IgnoreQueryFilters().Single();
        Assert.False(favorite.IsDeleted);
    }

    private static ApplicationDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        return new ApplicationDbContext(options, new CurrentTenantService());
    }

    private static User Customer(PasswordHasher hasher, string email) => new()
    {
        Username = email, Email = email, FullName = email.StartsWith("other") ? "Other Guest" : "My Guest",
        PasswordHash = hasher.HashPassword("OldPassword123!"), GlobalRole = GlobalUserRole.Customer, IsActive = true
    };

    private static Tenant Property()
    {
        var tenant = new Tenant
        {
            Name = "Favorite Hotel", Code = Guid.NewGuid().ToString("N"), Slug = Guid.NewGuid().ToString("N"),
            Address = "1 Saved Street", City = "Da Nang", Status = TenantStatus.Active
        };
        tenant.RoomTypes.Add(new RoomType
        {
            TenantId = tenant.Id, Name = "Deluxe", Code = "DLX", BasePricePerNight = 900_000, IsActive = true
        });
        return tenant;
    }

    private static T WithCustomer<T>(T controller, User user) where T : ControllerBase
    {
        controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() };
        controller.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity([
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Role, GlobalUserRole.Customer.ToString())
        ], "test"));
        return controller;
    }
}
