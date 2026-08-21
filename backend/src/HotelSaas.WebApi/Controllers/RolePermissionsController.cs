using System.Security.Claims;
using HotelSaas.Application.Common.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/role-permissions")]
[Authorize]
public sealed class RolePermissionsController(IApplicationDbContext context) : ControllerBase
{
    [HttpGet("tree/{roleId:guid}")]
    [Authorize(Policy = "role_permission.read")]
    public async Task<ActionResult<IEnumerable<PermissionModuleDto>>> Tree(Guid roleId)
    {
        var role = await context.AccessRoles.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(item => item.Id == roleId);
        if (role == null || role.TenantId.HasValue && role.TenantId != TenantId()) return NotFound();
        var permissions = await context.PermissionFunctions.AsNoTracking()
            .Where(function => function.IsActive)
            .GroupJoin(context.RolePermissions.AsNoTracking().Where(permission => permission.RoleId == roleId), function => function.Id, permission => permission.FunctionId,
                (function, matches) => new PermissionFunctionDto(function.Id, function.Code, function.Name, function.ModuleCode, function.SupportedActionMask, matches.Select(item => item.ActionMask).FirstOrDefault()))
            .ToListAsync();
        Response.Headers["ETag"] = $"\"{RoleVersion(role)}\"";
        return Ok(permissions.GroupBy(item => item.ModuleCode).Select(group => new PermissionModuleDto(group.Key, group.Key, group.ToList())));
    }

    [HttpPost("{roleId:guid}")]
    [Authorize(Policy = "role_permission.update")]
    public async Task<IActionResult> Update(Guid roleId, [FromBody] UpdateRolePermissionsRequest request)
    {
        var role = await context.AccessRoles.IgnoreQueryFilters().FirstOrDefaultAsync(item => item.Id == roleId);
        if (role == null || role.IsSystemRole || role.TenantId.HasValue && role.TenantId != TenantId()) return NotFound();
        if (request.ExpectedVersion > 0 && request.ExpectedVersion != RoleVersion(role))
            return Conflict(new { code = "ROLE_PERMISSIONS_VERSION_CONFLICT", message = "Ma trận quyền đã thay đổi. Hãy tải lại trước khi lưu." });
        var allowed = await context.PermissionFunctions.IgnoreQueryFilters().Where(item => item.IsActive)
            .ToDictionaryAsync(item => item.Id, item => item.SupportedActionMask & 127);
        var existing = await context.RolePermissions.IgnoreQueryFilters().Where(item => item.RoleId == roleId).ToListAsync();
        context.RolePermissions.RemoveRange(existing);
        context.RolePermissions.AddRange(request.Permissions
            .Where(item => allowed.ContainsKey(item.FunctionId))
            .GroupBy(item => item.FunctionId)
            .Select(group => new Domain.Entities.RolePermission
            {
                RoleId = roleId,
                FunctionId = group.Key,
                ActionMask = group.Aggregate(0, (mask, item) => mask | item.ActionMask) & allowed[group.Key]
            }));
        await context.SaveChangesAsync();
        Response.Headers["ETag"] = $"\"{RoleVersion(role)}\"";
        return Ok(new { updated = request.Permissions.Count, version = RoleVersion(role) });
    }

    private static int RoleVersion(Domain.Entities.AccessRole role)
    {
        var ticks = (role.UpdatedAtUtc ?? DateTime.UnixEpoch).ToUniversalTime().Ticks;
        return unchecked((int)(ticks ^ (ticks >> 32)));
    }

    private Guid? TenantId() => Guid.TryParse(User.FindFirstValue("tenant_id"), out var id) ? id : null;
}

public sealed record PermissionFunctionDto(Guid Id, string Code, string Name, string ModuleCode, int SupportedActionMask, int ActionMask);
public sealed record PermissionModuleDto(string Id, string Name, List<PermissionFunctionDto> Functions);
public sealed record UpdateRolePermissionsRequest(int ExpectedVersion, List<PermissionUpdate> Permissions);
public sealed record PermissionUpdate(Guid FunctionId, int ActionMask);
