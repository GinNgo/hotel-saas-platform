using HotelSaas.Domain.Entities;
using System.IdentityModel.Tokens.Jwt;
using HotelSaas.Domain.Enums;
using HotelSaas.Infrastructure.Persistence;
using HotelSaas.Infrastructure.Services;
using HotelSaas.WebApi.Controllers;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace HotelSaas.WebApi.Tests;

public class AuthSessionControllerTests
{
    [Fact]
    public async Task Register_normalizes_identity_and_rejects_duplicate_email()
    {
        await using var db = CreateContext();
        var controller = Controller(db);

        var created = await controller.Register(new(" Guest@Example.com ", " Guest@Example.com ",
            "Password123!", " Guest User ", "0901234567"));
        var duplicate = await controller.Register(new("another", "guest@example.com",
            "Password123!", "Other Guest", null));

        Assert.IsType<RegistrationResponse>(Assert.IsType<OkObjectResult>(created.Result).Value);
        Assert.IsType<ConflictObjectResult>(duplicate.Result);
        Assert.Equal("guest@example.com", db.Users.Single().Email);
    }

    [Fact]
    public async Task Login_accepts_frontend_username_field_and_sets_http_only_cookie()
    {
        await using var db = CreateContext();
        var user = Customer();
        db.Users.Add(user);
        await db.SaveChangesAsync();
        var controller = Controller(db);

        var result = await controller.Login(new(user.Email, null, "Password123!"));

        var response = Assert.IsType<WebAuthResponse>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.NotEmpty(response.AccessToken);
        Assert.Contains("CUSTOMER", response.Roles);
        var cookie = controller.Response.Headers.SetCookie.ToString();
        Assert.Contains("hotel_refresh_token=", cookie);
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Refresh_rotates_token_and_replay_is_rejected()
    {
        await using var db = CreateContext();
        var user = Customer();
        var token = new RefreshToken { UserId = user.Id, User = user, Token = "original-token", ExpiresAtUtc = DateTime.UtcNow.AddDays(1) };
        db.AddRange(user, token);
        await db.SaveChangesAsync();
        var first = Controller(db, "original-token");

        var refreshed = await first.Refresh();
        var replay = await Controller(db, "original-token").Refresh();

        Assert.IsType<WebAuthResponse>(Assert.IsType<OkObjectResult>(refreshed.Result).Value);
        Assert.True(token.IsRevoked);
        Assert.Equal(2, db.RefreshTokens.Count());
        Assert.IsType<UnauthorizedObjectResult>(replay.Result);
    }

    [Fact]
    public async Task Logout_revokes_cookie_token_and_clears_cookie()
    {
        await using var db = CreateContext();
        var user = Customer();
        var token = new RefreshToken { UserId = user.Id, User = user, Token = "logout-token", ExpiresAtUtc = DateTime.UtcNow.AddDays(1) };
        db.AddRange(user, token);
        await db.SaveChangesAsync();
        var controller = Controller(db, "logout-token");

        var result = await controller.Logout();

        Assert.IsType<NoContentResult>(result);
        Assert.True(token.IsRevoked);
        Assert.Contains("hotel_refresh_token=", controller.Response.Headers.SetCookie.ToString());
    }

    [Fact]
    public async Task Suspended_tenant_staff_cannot_login_or_refresh()
    {
        await using var db = CreateContext();
        var tenant = new Tenant
        {
            Name = "Suspended Hotel", Code = "SUSPENDED", Slug = "suspended", Address = "1 Blocked Street",
            City = "Da Nang", Status = TenantStatus.Suspended
        };
        var staff = Customer();
        staff.GlobalRole = GlobalUserRole.TenantStaff;
        staff.TenantId = tenant.Id;
        staff.TenantStaffProfiles.Add(new TenantStaff
        {
            TenantId = tenant.Id, Tenant = tenant, UserId = staff.Id, User = staff, Role = StaffRole.Manager, IsActive = true
        });
        var refresh = new RefreshToken { UserId = staff.Id, User = staff, Token = "staff-refresh", ExpiresAtUtc = DateTime.UtcNow.AddDays(1) };
        db.AddRange(tenant, staff, refresh);
        await db.SaveChangesAsync();

        var login = await Controller(db).Login(new(staff.Email, null, "Password123!"));
        var renewed = await Controller(db, refresh.Token).Refresh();

        Assert.IsType<UnauthorizedObjectResult>(login.Result);
        Assert.IsType<UnauthorizedObjectResult>(renewed.Result);
        Assert.True(refresh.IsRevoked);
    }

    [Fact]
    public async Task Active_staff_auth_response_keeps_tenant_staff_compatibility_role()
    {
        await using var db = CreateContext();
        var tenant = new Tenant { Name = "Active Hotel", Code = "ACTIVE", Slug = "active" };
        var staff = Customer();
        staff.GlobalRole = GlobalUserRole.TenantStaff;
        staff.TenantId = tenant.Id;
        var accessRole = new HotelSaas.Domain.Entities.AccessRole { TenantId = tenant.Id, Code = "CUSTOM_FRONTDESK", Name = "Custom Front Desk" };
        var profile = new TenantStaff { TenantId = tenant.Id, Tenant = tenant, UserId = staff.Id, User = staff, Role = StaffRole.Receptionist, IsActive = true };
        profile.AccessRole = accessRole;
        profile.AccessRoleId = accessRole.Id;
        db.AddRange(tenant, staff, profile, accessRole);
        await db.SaveChangesAsync();

        var result = await Controller(db).Login(new(staff.Email, null, "Password123!"));

        var response = Assert.IsType<WebAuthResponse>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Contains("TENANTSTAFF", response.Roles);
        Assert.Contains("RECEPTIONIST", response.Roles);
        Assert.Contains("CUSTOM_FRONTDESK", response.Roles);
        var tokenRoles = new JwtSecurityTokenHandler().ReadJwtToken(response.AccessToken).Claims
            .Where(claim => claim.Type == System.Security.Claims.ClaimTypes.Role).Select(claim => claim.Value).ToList();
        Assert.Contains("CUSTOM_FRONTDESK", tokenRoles);
    }

    [Fact]
    public async Task Active_staff_token_contains_only_permissions_from_its_tenant_role()
    {
        await using var db = CreateContext();
        var tenant = new Tenant { Name = "Mine", Code = "MINE", Slug = "mine" };
        var other = new Tenant { Name = "Other", Code = "OTHER", Slug = "other" };
        var staff = Customer();
        staff.GlobalRole = GlobalUserRole.TenantStaff;
        staff.TenantId = tenant.Id;
        var mineRole = new AccessRole { TenantId = tenant.Id, Code = "CUSTOM_FRONTDESK", Name = "Mine" };
        var otherRole = new AccessRole { TenantId = other.Id, Code = "CUSTOM_FRONTDESK", Name = "Other" };
        var checkIn = new PermissionFunction { Code = "CHECKIN", Name = "Check-in", ModuleCode = "RESERVATION", SupportedActionMask = 127 };
        var checkOut = new PermissionFunction { Code = "CHECKOUT", Name = "Check-out", ModuleCode = "RESERVATION", SupportedActionMask = 127 };
        var profile = new TenantStaff
        {
            TenantId = tenant.Id, Tenant = tenant, UserId = staff.Id, User = staff, Role = StaffRole.Receptionist,
            IsActive = true, AccessRole = mineRole, AccessRoleId = mineRole.Id
        };
        db.AddRange(tenant, other, staff, profile, mineRole, otherRole, checkIn, checkOut,
            new RolePermission { Role = mineRole, RoleId = mineRole.Id, Function = checkIn, FunctionId = checkIn.Id, ActionMask = 64 },
            new RolePermission { Role = otherRole, RoleId = otherRole.Id, Function = checkOut, FunctionId = checkOut.Id, ActionMask = 64 });
        await db.SaveChangesAsync();

        var result = await Controller(db).Login(new(staff.Email, null, "Password123!"));

        var response = Assert.IsType<WebAuthResponse>(Assert.IsType<OkObjectResult>(result.Result).Value);
        var permissions = new JwtSecurityTokenHandler().ReadJwtToken(response.AccessToken).Claims
            .Where(claim => claim.Type == "permission").Select(claim => claim.Value).ToList();
        Assert.Contains("CHECKIN:64", permissions);
        Assert.DoesNotContain("CHECKOUT:64", permissions);
    }

    [Fact]
    public async Task Active_staff_permission_query_is_translatable_by_a_relational_provider()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlite(connection).Options;
        await using var db = new ApplicationDbContext(options, new CurrentTenantService());
        await db.Database.EnsureCreatedAsync();
        var tenant = new Tenant { Name = "Relational Hotel", Code = "REL", Slug = "relational" };
        var staff = Customer();
        staff.GlobalRole = GlobalUserRole.TenantStaff;
        staff.TenantId = tenant.Id;
        var role = new AccessRole { TenantId = tenant.Id, Code = "MANAGER", Name = "Manager" };
        var function = new PermissionFunction { Code = "CHECKIN", Name = "Check-in", ModuleCode = "RESERVATION", SupportedActionMask = 127 };
        var profile = new TenantStaff
        {
            TenantId = tenant.Id, Tenant = tenant, UserId = staff.Id, User = staff, Role = StaffRole.Manager,
            IsActive = true, AccessRole = role, AccessRoleId = role.Id
        };
        db.AddRange(tenant, staff, profile, role, function,
            new RolePermission { Role = role, RoleId = role.Id, Function = function, FunctionId = function.Id, ActionMask = 64 });
        await db.SaveChangesAsync();

        var result = await Controller(db).Login(new(staff.Email, null, "Password123!"));

        var response = Assert.IsType<WebAuthResponse>(Assert.IsType<OkObjectResult>(result.Result).Value);
        var permissions = new JwtSecurityTokenHandler().ReadJwtToken(response.AccessToken).Claims
            .Where(claim => claim.Type == "permission").Select(claim => claim.Value).ToList();
        Assert.Contains("CHECKIN:64", permissions);
    }

    private static AuthController Controller(ApplicationDbContext db, string? refreshToken = null)
    {
        var controller = new AuthController(db, new PasswordHasher(), new JwtTokenGenerator(new ConfigurationBuilder().Build()))
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
        if (refreshToken != null) controller.Request.Headers.Cookie = $"hotel_refresh_token={refreshToken}";
        return controller;
    }

    private static ApplicationDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        return new ApplicationDbContext(options, new CurrentTenantService());
    }

    private static User Customer()
    {
        var hasher = new PasswordHasher();
        return new User
        {
            Username = "customer@example.com", Email = "customer@example.com", FullName = "Customer",
            PasswordHash = hasher.HashPassword("Password123!"), GlobalRole = GlobalUserRole.Customer, IsActive = true
        };
    }
}
