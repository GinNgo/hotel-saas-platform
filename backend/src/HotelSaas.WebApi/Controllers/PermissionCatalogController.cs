using System.Security.Claims;
using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Authorize]
public sealed class PermissionCatalogController(IApplicationDbContext context) : ControllerBase
{
    [HttpGet("api/modules")]
    [Authorize(Policy = "system.read")]
    public async Task<ActionResult<IEnumerable<PermissionCatalogModuleDto>>> Modules()
    {
        if (HasTenantContext()) return Forbid();
        var modules = await context.PermissionFunctions.IgnoreQueryFilters().AsNoTracking()
            .Select(item => item.ModuleCode).Distinct().OrderBy(item => item).ToListAsync();
        return Ok(modules.Select(code => new PermissionCatalogModuleDto(code, code, code)));
    }

    [HttpGet("api/functions")]
    [Authorize(Policy = "system.read")]
    public async Task<ActionResult<IEnumerable<PermissionCatalogFunctionDto>>> Functions()
    {
        if (HasTenantContext()) return Forbid();
        return Ok(await context.PermissionFunctions.IgnoreQueryFilters().AsNoTracking()
            .OrderBy(item => item.ModuleCode).ThenBy(item => item.Code)
            .Select(item => new PermissionCatalogFunctionDto(item.Id, item.Code, item.Name, item.ModuleCode,
                item.SupportedActionMask, item.IsActive)).ToListAsync());
    }

    [HttpPost("api/functions")]
    [Authorize(Policy = "system.update")]
    public async Task<ActionResult<PermissionCatalogFunctionDto>> Create([FromBody] PermissionCatalogWriteRequest request)
    {
        if (HasTenantContext()) return Forbid();
        var normalized = Normalize(request);
        if (normalized.Error != null) return BadRequest(new { message = normalized.Error });
        if (await context.PermissionFunctions.IgnoreQueryFilters().AnyAsync(item => item.Code == normalized.Code))
            return Conflict(new { code = "PERMISSION_FUNCTION_EXISTS", message = "Mã chức năng đã tồn tại." });
        var function = new PermissionFunction
        {
            Code = normalized.Code!, Name = normalized.Name!, ModuleCode = normalized.ModuleCode!,
            SupportedActionMask = normalized.ActionMask, IsActive = true
        };
        context.PermissionFunctions.Add(function);
        await context.SaveChangesAsync();
        return Ok(ToDto(function));
    }

    [HttpPut("api/functions/{id:guid}")]
    [Authorize(Policy = "system.update")]
    public async Task<ActionResult<PermissionCatalogFunctionDto>> Update(Guid id, [FromBody] PermissionCatalogWriteRequest request)
    {
        if (HasTenantContext()) return Forbid();
        var function = await context.PermissionFunctions.IgnoreQueryFilters().FirstOrDefaultAsync(item => item.Id == id);
        if (function == null) return NotFound();
        var normalized = Normalize(request);
        if (normalized.Error != null) return BadRequest(new { message = normalized.Error });
        if (await context.PermissionFunctions.IgnoreQueryFilters().AnyAsync(item => item.Id != id && item.Code == normalized.Code))
            return Conflict(new { code = "PERMISSION_FUNCTION_EXISTS", message = "Mã chức năng đã tồn tại." });
        function.Code = normalized.Code!;
        function.Name = normalized.Name!;
        function.ModuleCode = normalized.ModuleCode!;
        function.SupportedActionMask = normalized.ActionMask;
        function.IsActive = request.IsActive;
        await context.SaveChangesAsync();
        return Ok(ToDto(function));
    }

    [HttpDelete("api/functions/{id:guid}")]
    [Authorize(Policy = "system.update")]
    public async Task<IActionResult> Deactivate(Guid id)
    {
        if (HasTenantContext()) return Forbid();
        var function = await context.PermissionFunctions.IgnoreQueryFilters().FirstOrDefaultAsync(item => item.Id == id);
        if (function == null) return NotFound();
        if (function.Code == "SYSTEM")
            return Conflict(new { code = "SYSTEM_PERMISSION_REQUIRED", message = "Không thể vô hiệu hóa quyền SYSTEM gốc." });
        function.IsActive = false;
        await context.SaveChangesAsync();
        return NoContent();
    }

    private bool HasTenantContext() => Guid.TryParse(User.FindFirstValue("tenant_id"), out _);

    private static PermissionCatalogFunctionDto ToDto(PermissionFunction item) =>
        new(item.Id, item.Code, item.Name, item.ModuleCode, item.SupportedActionMask, item.IsActive);

    private static (string? Code, string? Name, string? ModuleCode, int ActionMask, string? Error) Normalize(
        PermissionCatalogWriteRequest request)
    {
        var code = request.Code?.Trim().ToUpperInvariant();
        var name = request.Name?.Trim();
        var moduleCode = request.ModuleCode?.Trim().ToUpperInvariant();
        if (code is not { Length: >= 2 and <= 80 } || name is not { Length: >= 2 and <= 160 } ||
            moduleCode is not { Length: >= 2 and <= 80 })
            return (null, null, null, 0, "Mã, tên hoặc nhóm chức năng không hợp lệ.");
        if (request.SupportedActionMask is < 1 or > 127)
            return (null, null, null, 0, "Action mask phải nằm trong khoảng 1-127.");
        return (code, name, moduleCode, request.SupportedActionMask, null);
    }
}

public sealed record PermissionCatalogModuleDto(string Id, string Code, string Name);
public sealed record PermissionCatalogFunctionDto(Guid Id, string Code, string Name, string ModuleCode,
    int SupportedActionMask, bool IsActive);
public sealed record PermissionCatalogWriteRequest(string Code, string Name, string ModuleCode,
    int SupportedActionMask, bool IsActive = true);
