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

public class HotelsControllerTests
{
    [Fact]
    public async Task Tenant_staff_list_is_scoped_to_authoritative_tenant_claim()
    {
        var mine = Hotel("Mine", TenantStatus.Active);
        var other = Hotel("Other", TenantStatus.Active);
        await using var db = CreateContext(mine, other);
        var controller = WithUser(new HotelsController(db), "TenantStaff", mine.Id);

        var result = await controller.List();

        var rows = Assert.IsAssignableFrom<IEnumerable<object>>(Assert.IsType<OkObjectResult>(result.Result).Value).ToList();
        Assert.Single(rows);
        Assert.Equal(mine.Id, JsonSerializer.SerializeToElement(rows[0]).GetProperty("Id").GetGuid());
    }

    [Fact]
    public async Task Approval_is_idempotent_but_cannot_reverse_a_terminal_decision()
    {
        var pending = Hotel("Pending", TenantStatus.PendingApproval);
        await using var db = CreateContext(pending);
        var controller = WithUser(new HotelsController(db), "SuperAdmin");

        Assert.IsType<OkObjectResult>((await controller.Approve(pending.Id)).Result);
        Assert.IsType<OkObjectResult>((await controller.Approve(pending.Id)).Result);
        Assert.IsType<ConflictObjectResult>((await controller.Reject(pending.Id)).Result);
        Assert.Equal(TenantStatus.Active, pending.Status);
    }

    [Fact]
    public async Task Property_approval_queue_returns_owner_summary_without_credentials()
    {
        var pending = Hotel("Pending", TenantStatus.PendingApproval);
        var owner = new User { Username = "owner", Email = "owner@example.com", FullName = "Safe Owner", PasswordHash = "secret", GlobalRole = GlobalUserRole.TenantStaff, TenantId = pending.Id };
        var staff = new TenantStaff { TenantId = pending.Id, UserId = owner.Id, User = owner, Role = StaffRole.Owner, IsActive = true };
        await using var db = CreateContext(pending);
        db.AddRange(owner, staff);
        await db.SaveChangesAsync();

        var result = await new PropertyApprovalsController(db).List();

        var rows = Assert.IsAssignableFrom<IEnumerable<object>>(Assert.IsType<OkObjectResult>(result.Result).Value).ToList();
        var json = JsonSerializer.Serialize(rows.Single());
        Assert.Contains("Safe Owner", json);
        Assert.DoesNotContain("secret", json);
        Assert.DoesNotContain("PasswordHash", json);
    }

    [Fact]
    public async Task Admin_creation_persists_property_type_and_star_rating()
    {
        await using var db = CreateContext();
        var controller = WithUser(new HotelsController(db), "SuperAdmin");

        var result = await controller.Create(new SaveHotelRequest("Beach Resort", "Beach Resort", "1 Beach", "Da Nang", null, null, null, null, null, "RESORT", 5));

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        var json = JsonSerializer.SerializeToElement(created.Value);
        Assert.Equal("RESORT", json.GetProperty("PropertyType").GetString());
        Assert.Equal(5, json.GetProperty("StarRating").GetInt32());
        Assert.Equal("RESORT", db.Tenants.Single().PropertyType);
    }

    [Fact]
    public async Task Admin_creation_persists_normalized_amenities_and_stay_policies()
    {
        await using var db = CreateContext();
        var controller = WithUser(new HotelsController(db), "SuperAdmin");
        var request = new SaveHotelRequest("Policy Hotel", "Policy Hotel", "2 River", "Hue", null, null, null, null, null,
            AmenityCodes: ["wifi", "POOL"], CheckInTime: "15:00", CheckOutTime: "11:00",
            CancellationPolicy: "Miễn phí trước 7 ngày.", ChildrenPolicy: "Trẻ em được chào đón.",
            PetPolicy: "Không nhận thú cưng.", HouseRules: "Không hút thuốc.");

        var result = await controller.Create(request);

        Assert.IsType<CreatedAtActionResult>(result.Result);
        var tenant = await db.Tenants.Include(item => item.Amenities).SingleAsync();
        Assert.Equal("15:00", tenant.CheckInTime);
        Assert.Equal("11:00", tenant.CheckOutTime);
        Assert.Equal("Miễn phí trước 7 ngày.", tenant.CancellationPolicy);
        Assert.Equal(["POOL", "WIFI"], tenant.Amenities.Select(item => item.Code).OrderBy(item => item).ToArray());
    }

    [Fact]
    public async Task Admin_creation_rejects_invalid_stay_time()
    {
        await using var db = CreateContext();
        var controller = WithUser(new HotelsController(db), "SuperAdmin");

        var result = await controller.Create(new SaveHotelRequest("Bad Time", "Bad Time", "3 Lake", "Hue", null, null, null, null, null,
            CheckInTime: "25:90"));

        Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Empty(db.Tenants);
    }

    [Fact]
    public async Task Admin_creation_validates_and_persists_coordinates()
    {
        await using var db = CreateContext();
        var controller = WithUser(new HotelsController(db), "SuperAdmin");
        var result = await controller.Create(new SaveHotelRequest("Mapped Hotel", "Mapped Hotel", "4 Coast", "Da Nang", null, null, null, null, null,
            Latitude: 16.0611, Longitude: 108.2277));

        Assert.IsType<CreatedAtActionResult>(result.Result);
        Assert.Equal(16.0611, db.Tenants.Single().Latitude);
        Assert.Equal(108.2277, db.Tenants.Single().Longitude);

        var invalid = await controller.Create(new SaveHotelRequest("Invalid Map", "Invalid Map", "5 Coast", "Da Nang", null, null, null, null, null,
            Latitude: 91, Longitude: 108));
        Assert.IsType<BadRequestObjectResult>(invalid.Result);
    }

    [Fact]
    public async Task Manager_updates_pricing_settings_only_for_claimed_tenant()
    {
        var mine = Hotel("Mine", TenantStatus.Active);
        var other = Hotel("Other", TenantStatus.Active);
        await using var db = CreateContext(mine, other);
        var controller = WithUser(new HotelsController(db), "Manager", mine.Id);

        var updated = await controller.UpdatePricingSettings(mine.Id, new(8, 5));
        var outsideTenant = await controller.UpdatePricingSettings(other.Id, new(10, 3));
        var invalid = await controller.UpdatePricingSettings(mine.Id, new(31, 0));

        Assert.IsType<OkObjectResult>(updated.Result);
        Assert.IsType<NotFoundObjectResult>(outsideTenant.Result);
        Assert.IsType<BadRequestObjectResult>(invalid.Result);
        Assert.Equal(8, mine.TaxRatePercent);
        Assert.Equal(5, mine.ServiceFeeRatePercent);
        Assert.Equal(0, other.TaxRatePercent);
    }

    private static T WithUser<T>(T controller, string role, Guid? tenantId = null) where T : ControllerBase
    {
        var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, Guid.NewGuid().ToString()), new(ClaimTypes.Role, role) };
        if (tenantId.HasValue) claims.Add(new Claim("tenant_id", tenantId.Value.ToString()));
        controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(claims, "test")) } };
        return controller;
    }

    private static Tenant Hotel(string name, TenantStatus status) => new() { Name = name, Code = name.ToUpperInvariant(), Slug = name.ToLowerInvariant(), Address = "1 Test", City = "Da Nang", Status = status };
    private static ApplicationDbContext CreateContext(params Tenant[] tenants)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        var db = new ApplicationDbContext(options, new CurrentTenantService());
        db.Tenants.AddRange(tenants);
        db.SaveChanges();
        return db;
    }
}
