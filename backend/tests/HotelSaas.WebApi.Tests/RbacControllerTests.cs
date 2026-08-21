using System.Security.Claims;
using System.Text.Json;
using HotelSaas.Domain.Entities;
using HotelSaas.Infrastructure.Persistence;
using HotelSaas.Infrastructure.Services;
using HotelSaas.WebApi.Controllers;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace HotelSaas.WebApi.Tests;

public sealed class RbacControllerTests
{
    [Fact]
    public async Task Role_list_excludes_custom_roles_from_other_tenants()
    {
        var tenant = new Tenant { Name = "Mine", Code = "MINE", Slug = "mine" };
        var other = new Tenant { Name = "Other", Code = "OTHER", Slug = "other" };
        await using var db = Context(tenant, other);
        db.AccessRoles.AddRange(
            new AccessRole { Code = "OWNER", Name = "Owner", IsSystemRole = true },
            new AccessRole { Code = "MINE_ROLE", Name = "Mine", TenantId = tenant.Id },
            new AccessRole { Code = "OTHER_ROLE", Name = "Other", TenantId = other.Id });
        await db.SaveChangesAsync();

        var result = await WithUser(new RolesController(db), tenant.Id).List();
        var rows = Assert.IsType<OkObjectResult>(result.Result).Value as IEnumerable<RoleDto>;
        Assert.NotNull(rows);
        Assert.DoesNotContain(rows!, role => role.Code == "OTHER_ROLE");
        Assert.Contains(rows!, role => role.Code == "MINE_ROLE");
    }

    [Fact]
    public async Task System_role_cannot_receive_permission_updates()
    {
        var tenant = new Tenant { Name = "Mine", Code = "MINE", Slug = "mine" };
        await using var db = Context(tenant);
        var role = new AccessRole { Code = "OWNER", Name = "Owner", IsSystemRole = true };
        db.AccessRoles.Add(role);
        await db.SaveChangesAsync();
        var controller = WithUser(new RolePermissionsController(db), tenant.Id);

        var result = await controller.Update(role.Id, new UpdateRolePermissionsRequest(0, []));

        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task Staff_role_assignment_rejects_role_from_another_tenant()
    {
        var tenant = new Tenant { Name = "Mine", Code = "MINE", Slug = "mine" };
        var other = new Tenant { Name = "Other", Code = "OTHER", Slug = "other" };
        await using var db = Context(tenant, other);
        var user = new User { Username = "staff", Email = "staff@example.com", FullName = "Staff", PasswordHash = "hash" };
        var staff = new TenantStaff { TenantId = tenant.Id, UserId = user.Id, User = user, Tenant = tenant, IsActive = true };
        var foreignRole = new AccessRole { TenantId = other.Id, Code = "FOREIGN", Name = "Foreign" };
        db.AddRange(user, staff, foreignRole);
        await db.SaveChangesAsync();
        var controller = WithUser(new UsersController(db, new PasswordHasher()), tenant.Id);

        var result = await controller.AssignRole(user.Id, new AssignRoleRequest(foreignRole.Id));

        Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Null(staff.AccessRoleId);
    }

    [Fact]
    public async Task Staff_role_assignment_updates_access_and_legacy_role_fields()
    {
        var tenant = new Tenant { Name = "Mine", Code = "MINE", Slug = "mine" };
        await using var db = Context(tenant);
        var user = new User { Username = "staff", Email = "staff@example.com", FullName = "Staff", PasswordHash = "hash" };
        var staff = new TenantStaff { TenantId = tenant.Id, UserId = user.Id, User = user, Tenant = tenant, IsActive = true, Role = HotelSaas.Domain.Enums.StaffRole.Housekeeper };
        var role = new AccessRole { TenantId = tenant.Id, Code = "RECEPTIONIST", Name = "Receptionist" };
        db.AddRange(user, staff, role);
        await db.SaveChangesAsync();
        var controller = WithUser(new UsersController(db, new PasswordHasher()), tenant.Id);

        var result = await controller.AssignRole(user.Id, new AssignRoleRequest(role.Id));

        Assert.IsType<OkObjectResult>(result.Result);
        Assert.Equal(role.Id, staff.AccessRoleId);
        Assert.Equal(HotelSaas.Domain.Enums.StaffRole.Receptionist, staff.Role);
    }

    [Fact]
    public async Task Staff_list_returns_guid_role_and_tenant_context()
    {
        var tenant = new Tenant { Name = "Mine", Code = "MINE", Slug = "mine" };
        await using var db = Context(tenant);
        var user = new User { Username = "staff", Email = "staff@example.com", FullName = "Staff", PasswordHash = "hash" };
        var role = new AccessRole { TenantId = tenant.Id, Code = "RECEPTIONIST", Name = "Receptionist" };
        db.AddRange(user, new TenantStaff { TenantId = tenant.Id, UserId = user.Id, User = user, Tenant = tenant, AccessRoleId = role.Id, AccessRole = role, IsActive = true });
        await db.SaveChangesAsync();
        var controller = WithUser(new UsersController(db, new PasswordHasher()), tenant.Id);

        var result = await controller.ListStaff();

        var payload = Assert.IsType<OkObjectResult>(result.Result).Value;
        var row = Assert.Single(Assert.IsAssignableFrom<IEnumerable<StaffUserDto>>(payload));
        Assert.Equal(role.Id, row.RoleId);
        Assert.Equal(tenant.Id, row.TenantId);
    }

    [Fact]
    public async Task Permission_update_masks_actions_not_supported_by_function()
    {
        var tenant = new Tenant { Name = "Mine", Code = "MINE", Slug = "mine" };
        await using var db = Context(tenant);
        var role = new AccessRole { TenantId = tenant.Id, Code = "CUSTOM", Name = "Custom" };
        var function = new PermissionFunction { Code = "ROOM", Name = "Rooms", ModuleCode = "ROOM", SupportedActionMask = 1 };
        db.AddRange(role, function);
        await db.SaveChangesAsync();
        var controller = WithUser(new RolePermissionsController(db), tenant.Id);

        await controller.Update(role.Id, new UpdateRolePermissionsRequest(0, [new PermissionUpdate(function.Id, 127)]));

        Assert.Equal(1, (await db.RolePermissions.IgnoreQueryFilters().SingleAsync()).ActionMask);
    }

    [Fact]
    public async Task Permission_update_merges_duplicate_function_rows()
    {
        var tenant = new Tenant { Name = "Mine", Code = "MINE", Slug = "mine" };
        await using var db = Context(tenant);
        var role = new AccessRole { TenantId = tenant.Id, Code = "CUSTOM", Name = "Custom" };
        var function = new PermissionFunction { Code = "ROOM", Name = "Rooms", ModuleCode = "ROOM", SupportedActionMask = 7 };
        db.AddRange(role, function);
        await db.SaveChangesAsync();

        await WithUser(new RolePermissionsController(db), tenant.Id).Update(role.Id,
            new UpdateRolePermissionsRequest(0, [new PermissionUpdate(function.Id, 1), new PermissionUpdate(function.Id, 4)]));

        var permission = await db.RolePermissions.IgnoreQueryFilters().SingleAsync();
        Assert.Equal(5, permission.ActionMask);
    }

    [Fact]
    public async Task Role_delete_rejects_role_assigned_to_active_staff()
    {
        var tenant = new Tenant { Name = "Mine", Code = "MINE", Slug = "mine" };
        await using var db = Context(tenant);
        var role = new AccessRole { TenantId = tenant.Id, Code = "CUSTOM", Name = "Custom" };
        var user = new User { Username = "staff", Email = "staff@example.com", FullName = "Staff", PasswordHash = "hash" };
        db.AddRange(role, user, new TenantStaff { TenantId = tenant.Id, UserId = user.Id, User = user, AccessRoleId = role.Id, AccessRole = role, IsActive = true });
        await db.SaveChangesAsync();

        var result = await WithUser(new RolesController(db), tenant.Id).Delete(role.Id);

        var conflict = Assert.IsType<ConflictObjectResult>(result);
        Assert.Equal("ROLE_IN_USE", JsonSerializer.SerializeToElement(conflict.Value).GetProperty("code").GetString());
        Assert.False(role.IsDeleted);
    }

    private static T WithUser<T>(T controller, Guid tenantId) where T : ControllerBase
    {
        var identity = new ClaimsIdentity([new Claim(ClaimTypes.Role, "Owner"), new Claim("tenant_id", tenantId.ToString())], "test");
        controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(identity) } };
        return controller;
    }

    private static ApplicationDbContext Context(params Tenant[] tenants)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        var db = new ApplicationDbContext(options, new CurrentTenantService());
        db.Tenants.AddRange(tenants);
        db.SaveChanges();
        return db;
    }
}
