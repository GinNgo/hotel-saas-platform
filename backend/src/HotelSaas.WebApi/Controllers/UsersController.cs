using System.Security.Claims;
using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class UsersController(IApplicationDbContext context, IPasswordHasher passwordHasher) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "user.read")]
    public async Task<ActionResult<IEnumerable<StaffUserDto>>> ListStaff()
    {
        var tenantId = TenantId();
        var staff = await context.TenantStaffs.IgnoreQueryFilters().AsNoTracking()
            .Where(item => item.IsActive && (!tenantId.HasValue || item.TenantId == tenantId))
            .Include(item => item.User)
            .Include(item => item.Tenant)
            .Include(item => item.AccessRole)
            .OrderBy(item => item.User!.FullName)
            .Select(item => new StaffUserDto(item.UserId, item.User!.Username, item.User.Email, item.User.FullName,
                item.AccessRoleId, item.AccessRole != null ? item.AccessRole.Code : item.Role.ToString().ToUpperInvariant(),
                item.IsActive, item.TenantId, item.Tenant!.Name))
            .ToListAsync();
        return Ok(staff);
    }

    [HttpPut("{userId:guid}/role")]
    [Authorize(Policy = "user.update")]
    public async Task<ActionResult<StaffUserDto>> AssignRole(Guid userId, [FromBody] AssignRoleRequest request)
    {
        var tenantId = TenantId();
        if (!tenantId.HasValue) return Forbid();
        var staff = await context.TenantStaffs.IgnoreQueryFilters().Include(item => item.User).Include(item => item.Tenant)
            .FirstOrDefaultAsync(item => item.UserId == userId && item.TenantId == tenantId && item.IsActive);
        if (staff == null) return NotFound();
        var role = await context.AccessRoles.IgnoreQueryFilters().FirstOrDefaultAsync(item => item.Id == request.RoleId && (item.TenantId == null || item.TenantId == tenantId));
        if (role == null) return BadRequest(new { message = "Role không tồn tại trong cơ sở này." });
        staff.AccessRoleId = role.Id;
        if (Enum.TryParse<StaffRole>(role.Code, true, out var legacyRole)) staff.Role = legacyRole;
        await context.SaveChangesAsync();
        return Ok(new StaffUserDto(staff.UserId, staff.User!.Username, staff.User.Email, staff.User.FullName,
            staff.AccessRoleId, role.Code, staff.IsActive, staff.TenantId, staff.Tenant!.Name));
    }

    [HttpGet("me")]
    public async Task<ActionResult<CurrentUserDto>> Me()
    {
        var user = await CurrentUserQuery();
        return user is null ? Unauthorized() : Ok(ToDto(user));
    }

    [HttpPut("me")]
    public async Task<ActionResult<CurrentUserDto>> UpdateMe([FromBody] UpdateProfileRequest request)
    {
        var user = await CurrentUserQuery();
        if (user is null) return Unauthorized();
        var fullName = request.FullName.Trim();
        var email = request.Email.Trim().ToLowerInvariant();
        var phone = request.Phone?.Trim();
        if (fullName.Length is < 2 or > 120 || email.Length is < 5 or > 200 || !email.Contains('@'))
            return BadRequest(new { message = "Thông tin hồ sơ không hợp lệ." });
        if (!string.Equals(email, user.Email, StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { message = "Vui lòng sử dụng luồng xác minh để thay đổi email." });
        if (await context.Users.IgnoreQueryFilters().AnyAsync(item => item.Id != user.Id && item.Email == email))
            return Conflict(new { message = "Email đã được tài khoản khác sử dụng." });
        if (phone is { Length: > 30 } || request.AvatarUrl is { Length: > 2000 })
            return BadRequest(new { message = "Số điện thoại hoặc đường dẫn ảnh không hợp lệ." });

        user.FullName = fullName;
        user.Email = email;
        user.PhoneNumber = string.IsNullOrWhiteSpace(phone) ? null : phone;
        user.AvatarUrl = string.IsNullOrWhiteSpace(request.AvatarUrl) ? null : request.AvatarUrl.Trim();
        user.UpdatedAtUtc = DateTime.UtcNow;
        await context.SaveChangesAsync();
        return Ok(ToDto(user));
    }

    [HttpPut("me/password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
    {
        var user = await CurrentUserQuery();
        if (user is null) return Unauthorized();
        if (!passwordHasher.VerifyPassword(request.CurrentPassword, user.PasswordHash))
            return BadRequest(new { message = "Mật khẩu hiện tại không chính xác." });
        if (request.NewPassword.Length < 8 || request.NewPassword.Length > 128 ||
            string.Equals(request.CurrentPassword, request.NewPassword, StringComparison.Ordinal))
            return BadRequest(new { message = "Mật khẩu mới phải khác mật khẩu cũ và có ít nhất 8 ký tự." });
        user.PasswordHash = passwordHasher.HashPassword(request.NewPassword);
        user.UpdatedAtUtc = DateTime.UtcNow;
        foreach (var token in context.RefreshTokens.Where(item => item.UserId == user.Id && !item.IsRevoked)) token.IsRevoked = true;
        await context.SaveChangesAsync();
        return NoContent();
    }

    private async Task<HotelSaas.Domain.Entities.User?> CurrentUserQuery()
    {
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return null;
        return await context.Users.IgnoreQueryFilters().Include(item => item.TenantStaffProfiles).ThenInclude(item => item.Tenant)
            .FirstOrDefaultAsync(item => item.Id == userId && item.IsActive && !item.IsDeleted);
    }

    private static CurrentUserDto ToDto(HotelSaas.Domain.Entities.User user)
    {
        var roles = new List<string> { user.GlobalRole.ToString() };
        roles.AddRange(user.TenantStaffProfiles.Where(item => item.IsActive).Select(item => item.Role.ToString()));
        var properties = user.TenantStaffProfiles.Where(item => item.IsActive && item.Tenant != null)
            .Select(item => new AssignedPropertyDto(item.TenantId, item.Tenant!.Name)).Distinct().ToList();
        var registration = user.TenantStaffProfiles.Where(item => item.Role == StaffRole.Owner && item.Tenant != null && !item.IsDeleted)
            .OrderByDescending(item => item.CreatedAtUtc).FirstOrDefault();
        var partnerRegistrationStatus = registration?.Tenant?.Status switch
        {
            TenantStatus.Active => "APPROVED",
            TenantStatus.PendingApproval => "PENDING",
            TenantStatus.Suspended => "REJECTED",
            _ => "NONE"
        };
        return new(user.Id, user.Username, user.Email, user.EmailVerifiedAtUtc.HasValue, user.EmailVerifiedAtUtc,
            user.PendingEmail, user.FullName, user.PhoneNumber, user.AvatarUrl,
            user.IsActive ? "ACTIVE" : "INACTIVE", roles.Distinct().ToList(), properties, partnerRegistrationStatus);
    }

    private Guid? TenantId() => Guid.TryParse(User.FindFirstValue("tenant_id"), out var id) ? id : null;
}

public sealed record UpdateProfileRequest(string FullName, string Email, string? Phone, string? AvatarUrl);
public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);
public sealed record AssignedPropertyDto(Guid Id, string Name);
public sealed record CurrentUserDto(Guid Id, string Username, string Email, bool EmailVerified, DateTime? EmailVerifiedAt,
    string? PendingEmail, string FullName, string? Phone, string? AvatarUrl, string Status, List<string> Roles,
    List<AssignedPropertyDto> AssignedProperties, string PartnerRegistrationStatus);
public sealed record StaffUserDto(Guid Id, string Username, string Email, string FullName, Guid? RoleId, string Role, bool IsActive, Guid TenantId, string TenantName);
public sealed record AssignRoleRequest(Guid RoleId);
