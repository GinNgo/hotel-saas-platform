using System.Security.Claims;
using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/roles")]
[Authorize]
public sealed class RolesController(IApplicationDbContext context) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "role.read")]
    public async Task<ActionResult<IEnumerable<RoleDto>>> List()
    {
        var tenantId = TenantId();
        var roles = await context.AccessRoles.IgnoreQueryFilters().AsNoTracking()
            .Where(role => role.TenantId == null || role.TenantId == tenantId)
            .OrderBy(role => role.IsSystemRole ? 0 : 1).ThenBy(role => role.Name)
            .Select(role => new { role.Id, role.Code, role.Name, role.Description, role.IsSystemRole, role.UpdatedAtUtc })
            .ToListAsync();
        var roleIds = roles.Select(role => role.Id).ToArray();
        var assignedRoleIds = await context.TenantStaffs.IgnoreQueryFilters()
            .Where(staff => staff.IsActive && staff.AccessRoleId.HasValue && roleIds.Contains(staff.AccessRoleId.Value) && staff.TenantId == tenantId)
            .Select(staff => staff.AccessRoleId!.Value)
            .ToListAsync();
        var usage = assignedRoleIds.GroupBy(id => id).ToDictionary(group => group.Key, group => group.Count());
        return Ok(roles.Select(role => new RoleDto(role.Id, role.Code, role.Name, role.Description, role.IsSystemRole, role.UpdatedAtUtc, RoleVersion(role.UpdatedAtUtc), usage.GetValueOrDefault(role.Id))));
    }

    [HttpPost]
    [Authorize(Policy = "role.create")]
    public async Task<ActionResult<RoleDto>> Create([FromBody] RoleWriteRequest request)
    {
        var tenantId = TenantId();
        if (!tenantId.HasValue) return Forbid();
        var code = request.Code.Trim().ToUpperInvariant();
        var name = request.Name.Trim();
        if (code.Length is < 2 or > 60 || name.Length is < 2 or > 120) return BadRequest(new { message = "Mã và tên role không hợp lệ." });
        if (await context.AccessRoles.IgnoreQueryFilters().AnyAsync(role => role.TenantId == tenantId && role.Code == code)) return Conflict(new { message = "Mã role đã tồn tại." });
        var role = new AccessRole { TenantId = tenantId, Code = code, Name = name, Description = request.Description?.Trim(), IsSystemRole = false };
        context.AccessRoles.Add(role);
        await context.SaveChangesAsync();
        return Ok(new RoleDto(role.Id, role.Code, role.Name, role.Description, false, role.UpdatedAtUtc, RoleVersion(role.UpdatedAtUtc)));
    }

    [HttpPut("{roleId:guid}")]
    [Authorize(Policy = "role.update")]
    public async Task<ActionResult<RoleDto>> Update(Guid roleId, [FromBody] RoleWriteRequest request)
    {
        var role = await context.AccessRoles.IgnoreQueryFilters().FirstOrDefaultAsync(item => item.Id == roleId);
        if (role == null || role.IsSystemRole || role.TenantId != TenantId()) return NotFound();
        role.Name = request.Name.Trim();
        role.Description = request.Description?.Trim();
        await context.SaveChangesAsync();
        return Ok(new RoleDto(role.Id, role.Code, role.Name, role.Description, false, role.UpdatedAtUtc, RoleVersion(role.UpdatedAtUtc)));
    }

    [HttpDelete("{roleId:guid}")]
    [Authorize(Policy = "role.delete")]
    public async Task<IActionResult> Delete(Guid roleId)
    {
        var role = await context.AccessRoles.IgnoreQueryFilters().FirstOrDefaultAsync(item => item.Id == roleId);
        if (role == null || role.IsSystemRole || role.TenantId != TenantId()) return NotFound();
        if (await context.TenantStaffs.IgnoreQueryFilters().AnyAsync(item => item.AccessRoleId == roleId && item.IsActive && item.TenantId == TenantId()))
            return Conflict(new { code = "ROLE_IN_USE", message = "Không thể xóa vai trò đang được nhân sự sử dụng." });
        role.IsDeleted = true;
        await context.SaveChangesAsync();
        return NoContent();
    }

    private Guid? TenantId() => Guid.TryParse(User.FindFirstValue("tenant_id"), out var id) ? id : null;
    private static int RoleVersion(DateTime? updatedAt)
    {
        var ticks = (updatedAt ?? DateTime.UnixEpoch).ToUniversalTime().Ticks;
        return unchecked((int)(ticks ^ (ticks >> 32)));
    }
}

public sealed record RoleDto(Guid Id, string Code, string Name, string? Description, bool SystemRole, DateTime? UpdatedAt, int Version, int UserCount = 0);
public sealed record RoleWriteRequest(string Code, string Name, string? Description);
