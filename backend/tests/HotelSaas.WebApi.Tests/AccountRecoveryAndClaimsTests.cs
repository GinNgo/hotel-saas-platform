using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
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

public class AccountRecoveryAndClaimsTests
{
    [Fact]
    public async Task Forgot_password_is_enumeration_safe_and_invalidates_previous_token()
    {
        var user = Customer("recovery@example.com");
        await using var db = CreateContext();
        db.Users.Add(user);
        await db.SaveChangesAsync();
        var controller = Controller(db);

        var known = await controller.ForgotPassword(new(user.Email));
        var unknown = await controller.ForgotPassword(new("missing@example.com"));
        await controller.ForgotPassword(new(user.Email));

        Assert.Equal(Assert.IsType<PasswordRecoveryDispatch>(Assert.IsType<OkObjectResult>(known.Result).Value).Message,
            Assert.IsType<PasswordRecoveryDispatch>(Assert.IsType<OkObjectResult>(unknown.Result).Value).Message);
        var tokens = db.AccountActionTokens.Where(item => item.UserId == user.Id).OrderBy(item => item.CreatedAtUtc).ToList();
        Assert.Equal(2, tokens.Count);
        Assert.NotNull(tokens[0].UsedAtUtc);
        Assert.Null(tokens[1].UsedAtUtc);
    }

    [Fact]
    public async Task Password_reset_is_single_use_and_revokes_sessions()
    {
        var user = Customer("reset@example.com");
        const string raw = "raw-reset-token";
        var token = Token(user, "PASSWORD_RESET", raw);
        var refresh = new RefreshToken { UserId = user.Id, Token = "session", ExpiresAtUtc = DateTime.UtcNow.AddDays(1) };
        await using var db = CreateContext();
        db.AddRange(user, token, refresh);
        await db.SaveChangesAsync();
        var controller = Controller(db);

        var first = await controller.ResetPassword(new(raw, "NewPassword123!"));
        var replay = await controller.ResetPassword(new(raw, "AnotherPassword123!"));

        Assert.IsType<NoContentResult>(first);
        Assert.IsType<BadRequestObjectResult>(replay);
        Assert.NotNull(token.UsedAtUtc);
        Assert.True(refresh.IsRevoked);
        Assert.True(new PasswordHasher().VerifyPassword("NewPassword123!", user.PasswordHash));
    }

    [Fact]
    public async Task Email_change_only_applies_after_valid_confirmation()
    {
        var user = Customer("old@example.com");
        user.PendingEmail = "new@example.com";
        const string raw = "email-change-token";
        var token = Token(user, "EMAIL_CHANGE", raw, "new@example.com");
        await using var db = CreateContext();
        db.AddRange(user, token);
        await db.SaveChangesAsync();
        var controller = Controller(db);

        var result = await controller.ConfirmEmail(new(raw));

        var confirmation = Assert.IsType<EmailVerificationResult>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.True(confirmation.EmailChanged);
        Assert.Equal("new@example.com", user.Email);
        Assert.Null(user.PendingEmail);
        Assert.NotNull(user.EmailVerifiedAtUtc);
    }

    [Fact]
    public async Task Property_claim_is_customer_scoped_and_idempotent_for_same_evidence()
    {
        var customer = Customer("claim@example.com");
        var property = new Tenant
        {
            Name = "Claim Hotel", Code = "CLAIM", Slug = "claim", Address = "1 Claim Street", City = "Da Nang",
            Status = TenantStatus.Active
        };
        await using var db = CreateContext();
        db.AddRange(customer, property);
        await db.SaveChangesAsync();
        var controller = WithCustomer(new PropertyClaimsController(db), customer);
        var request = new SubmitPropertyClaimRequest("BUSINESS_LICENSE", "LICENSE-001", "Owner evidence");

        var first = await controller.Submit(property.Id, request);
        var replay = await controller.Submit(property.Id, request);
        var conflicting = await controller.Submit(property.Id, request with { VerificationData = "LICENSE-002" });

        var firstDto = Assert.IsType<PropertyClaimDto>(Assert.IsType<OkObjectResult>(first.Result).Value);
        var replayDto = Assert.IsType<PropertyClaimDto>(Assert.IsType<OkObjectResult>(replay.Result).Value);
        Assert.Equal(firstDto.Id, replayDto.Id);
        Assert.IsType<ConflictObjectResult>(conflicting.Result);
        Assert.Single(db.PropertyClaims.IgnoreQueryFilters());
    }

    private static AccountActionsController Controller(ApplicationDbContext db) =>
        new(db, new PasswordHasher()) { ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() } };

    private static T WithCustomer<T>(T controller, User user) where T : ControllerBase
    {
        controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() };
        controller.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity([
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()), new Claim(ClaimTypes.Role, "Customer")
        ], "test"));
        return controller;
    }

    private static AccountActionToken Token(User user, string purpose, string raw, string? pendingEmail = null) => new()
    {
        UserId = user.Id, User = user, Purpose = purpose, TokenHash = Hash(raw), PendingEmail = pendingEmail,
        ExpiresAtUtc = DateTime.UtcNow.AddHours(1)
    };

    private static string Hash(string raw) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw))).ToLowerInvariant();

    private static User Customer(string email) => new()
    {
        Username = email, Email = email, FullName = "Recovery Customer",
        PasswordHash = new PasswordHasher().HashPassword("OldPassword123!"), GlobalRole = GlobalUserRole.Customer, IsActive = true
    };

    private static ApplicationDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        return new ApplicationDbContext(options, new CurrentTenantService());
    }
}
