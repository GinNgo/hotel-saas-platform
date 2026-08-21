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

public class PartnerRegistrationControllerTests
{
    [Fact]
    public async Task Customer_registration_creates_one_pending_property_without_granting_staff_access()
    {
        await using var db = Context();
        var user = await AddCustomer(db);
        var controller = Controller(db, user.Id);

        var response = await controller.Register(new("Luxe Riverside", "12 Bach Dang", "Da Nang", null, "0901234567"));

        var payload = Assert.IsType<PartnerRegistrationStatusDto>(Assert.IsType<OkObjectResult>(response.Result).Value);
        Assert.Equal("PENDING", payload.Status);
        var tenant = Assert.Single(db.Tenants.IgnoreQueryFilters());
        Assert.Equal(TenantStatus.PendingApproval, tenant.Status);
        var owner = Assert.Single(db.TenantStaffs.IgnoreQueryFilters());
        Assert.False(owner.IsActive);
        Assert.Null(user.TenantId);

        var duplicate = await controller.Register(new("Second Hotel", "34 Tran Phu", "Da Nang", null, "0901234567"));
        Assert.IsType<ConflictObjectResult>(duplicate.Result);
    }

    [Fact]
    public async Task Approval_activates_the_pending_owner_and_revokes_existing_sessions()
    {
        await using var db = Context();
        var user = await AddCustomer(db);
        var registration = Controller(db, user.Id);
        var created = await registration.Register(new("Luxe Riverside", "12 Bach Dang", "Da Nang", null, "0901234567"));
        var propertyId = Assert.IsType<PartnerRegistrationStatusDto>(Assert.IsType<OkObjectResult>(created.Result).Value).PropertyId!.Value;
        db.RefreshTokens.Add(new RefreshToken { UserId = user.Id, Token = "active-session", ExpiresAtUtc = DateTime.UtcNow.AddDays(1) });
        await db.SaveChangesAsync();
        var hotels = new HotelsController(db)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };

        Assert.IsType<OkObjectResult>((await hotels.Approve(propertyId)).Result);

        Assert.Equal(propertyId, user.TenantId);
        Assert.Equal(GlobalUserRole.TenantStaff, user.GlobalRole);
        Assert.True(db.TenantStaffs.IgnoreQueryFilters().Single().IsActive);
        Assert.True(db.RefreshTokens.IgnoreQueryFilters().Single().IsRevoked);
        var status = await registration.Status();
        Assert.Equal("APPROVED", Assert.IsType<PartnerRegistrationStatusDto>(
            Assert.IsType<OkObjectResult>(status.Result).Value).Status);
    }

    private static ApplicationDbContext Context()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        return new ApplicationDbContext(options, new CurrentTenantService());
    }

    private static async Task<User> AddCustomer(ApplicationDbContext db)
    {
        var user = new User
        {
            Username = $"customer-{Guid.NewGuid():N}", Email = $"customer-{Guid.NewGuid():N}@example.test",
            FullName = "Customer Owner", PasswordHash = "hash", GlobalRole = GlobalUserRole.Customer, IsActive = true
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    private static PartnerRegistrationController Controller(ApplicationDbContext db, Guid userId)
    {
        var controller = new PartnerRegistrationController(db)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
        controller.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, userId.ToString()), new Claim(ClaimTypes.Role, "Customer")], "test"));
        return controller;
    }
}
