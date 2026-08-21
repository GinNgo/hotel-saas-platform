using System.Security.Claims;
using System.Text.RegularExpressions;
using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/partner")]
[Authorize]
public sealed partial class PartnerRegistrationController(IApplicationDbContext context) : ControllerBase
{
    [HttpGet("registration-status")]
    public async Task<ActionResult<PartnerRegistrationStatusDto>> Status()
    {
        if (!UserId(out var userId)) return Unauthorized();
        var registration = await context.TenantStaffs.IgnoreQueryFilters().AsNoTracking()
            .Where(item => item.UserId == userId && item.Role == StaffRole.Owner && !item.IsDeleted &&
                item.Tenant != null && !item.Tenant.IsDeleted)
            .OrderByDescending(item => item.CreatedAtUtc)
            .Select(item => new { item.TenantId, item.Tenant!.Name, item.Tenant.Status })
            .FirstOrDefaultAsync();
        if (registration == null) return Ok(new PartnerRegistrationStatusDto("NONE", null, null));
        var status = registration.Status switch
        {
            TenantStatus.Active => "APPROVED",
            TenantStatus.Suspended => "REJECTED",
            _ => "PENDING"
        };
        return Ok(new PartnerRegistrationStatusDto(status, registration.TenantId, registration.Name));
    }

    [HttpPost("register")]
    public async Task<ActionResult<PartnerRegistrationStatusDto>> Register([FromBody] PartnerRegistrationRequest request)
    {
        if (!UserId(out var userId)) return Unauthorized();
        var user = await context.Users.IgnoreQueryFilters().FirstOrDefaultAsync(item => item.Id == userId && item.IsActive && !item.IsDeleted);
        if (user == null) return Unauthorized();
        if (user.TenantId.HasValue)
            return Conflict(new { code = "PARTNER_ALREADY_ASSIGNED", message = "Tài khoản đã thuộc một cơ sở lưu trú." });
        if (await context.TenantStaffs.IgnoreQueryFilters().AnyAsync(item => item.UserId == userId && item.Role == StaffRole.Owner &&
                !item.IsDeleted && item.Tenant != null && !item.Tenant.IsDeleted && item.Tenant.Status != TenantStatus.Suspended))
            return Conflict(new { code = "PARTNER_REGISTRATION_EXISTS", message = "Bạn đã có hồ sơ đối tác đang được xử lý." });

        var name = request.PropertyName?.Trim() ?? string.Empty;
        var address = request.PropertyAddress?.Trim() ?? string.Empty;
        var city = request.ProvinceName?.Trim() ?? string.Empty;
        var phone = request.Phone?.Trim() ?? string.Empty;
        if (name.Length is < 2 or > 255 || address.Length is < 5 or > 1000 || city.Length is < 2 or > 255 ||
            phone.Length is < 8 or > 30)
            return BadRequest(new { code = "PARTNER_REGISTRATION_INVALID", message = "Thông tin cơ sở chưa đầy đủ hoặc không hợp lệ." });

        var baseCode = NormalizeCode(name);
        var code = baseCode;
        for (var suffix = 2; await context.Tenants.IgnoreQueryFilters().AnyAsync(item => item.Code == code); suffix++)
            code = $"{baseCode[..Math.Min(baseCode.Length, 34)]}-{suffix}";
        var tenant = new Tenant
        {
            Name = name, Code = code, Slug = $"{Slugify(name)}-{Guid.NewGuid():N}"[..Math.Min(60, Slugify(name).Length + 33)],
            Address = string.IsNullOrWhiteSpace(request.WardName) ? address : $"{address}, {request.WardName.Trim()}",
            City = city, PhoneNumber = phone, Email = user.Email, PropertyType = "HOTEL",
            Status = TenantStatus.PendingApproval, SubscriptionTier = SubscriptionTier.Basic
        };
        context.Tenants.Add(tenant);
        context.TenantStaffs.Add(new TenantStaff
        {
            TenantId = tenant.Id, UserId = userId, Role = StaffRole.Owner, IsActive = false
        });
        await context.SaveChangesAsync();
        return Ok(new PartnerRegistrationStatusDto("PENDING", tenant.Id, tenant.Name));
    }

    private bool UserId(out Guid userId) => Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out userId);
    private static string NormalizeCode(string value)
    {
        var code = NonAlphaNumeric().Replace(value.ToUpperInvariant(), "-").Trim('-');
        return string.IsNullOrWhiteSpace(code) ? "PROPERTY" : code[..Math.Min(40, code.Length)];
    }
    private static string Slugify(string value)
    {
        var slug = NonAlphaNumeric().Replace(value.ToLowerInvariant(), "-").Trim('-');
        return string.IsNullOrWhiteSpace(slug) ? "property" : slug;
    }

    [GeneratedRegex("[^a-zA-Z0-9]+")]
    private static partial Regex NonAlphaNumeric();
}

public sealed record PartnerRegistrationRequest(string? PropertyName, string? PropertyAddress, string? ProvinceName,
    string? WardName, string? Phone);
public sealed record PartnerRegistrationStatusDto(string Status, Guid? PropertyId, string? PropertyName);
