using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Application.Common.Models;
using HotelSaas.Application.DTOs.Auth;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private const string RefreshCookie = "hotel_refresh_token";
    private readonly IApplicationDbContext _context;
    private readonly IPasswordHasher _passwordHasher;
    private readonly IJwtTokenGenerator _jwtTokenGenerator;

    public AuthController(IApplicationDbContext context, IPasswordHasher passwordHasher, IJwtTokenGenerator jwtTokenGenerator)
    {
        _context = context;
        _passwordHasher = passwordHasher;
        _jwtTokenGenerator = jwtTokenGenerator;
    }

    [HttpPost("register-customer")]
    public async Task<ActionResult<Result<AuthResponseDto>>> RegisterCustomer([FromBody] RegisterCustomerRequestDto request)
    {
        var exists = await _context.Users.AnyAsync(u => u.Username == request.Username || u.Email == request.Email);
        if (exists) return BadRequest(Result<AuthResponseDto>.Failure("Tài khoản hoặc email đã tồn tại."));

        var user = new User
        {
            Username = request.Username.Trim(),
            Email = request.Email.Trim().ToLower(),
            FullName = request.FullName,
            PhoneNumber = request.PhoneNumber,
            PasswordHash = _passwordHasher.HashPassword(request.Password),
            GlobalRole = GlobalUserRole.Customer,
            IsActive = true
        };

        _context.Users.Add(user);
        var rt = _jwtTokenGenerator.GenerateRefreshToken(user.Id);
        _context.RefreshTokens.Add(rt);
        await _context.SaveChangesAsync();

        var token = _jwtTokenGenerator.GenerateAccessToken(user);
        var resp = new AuthResponseDto(user.Id, user.Username, user.Email, user.FullName, user.GlobalRole, null, null, token, rt.Token);
        return Ok(Result<AuthResponseDto>.Success(resp, "Đăng ký tài khoản khách hàng thành công."));
    }

    [HttpPost("register")]
    public async Task<ActionResult<RegistrationResponse>> Register([FromBody] WebRegisterRequest request)
    {
        var username = request.Username.Trim().ToLowerInvariant();
        var email = request.Email.Trim().ToLowerInvariant();
        var fullName = request.FullName.Trim();
        if (username.Length is < 3 or > 100 || email.Length is < 5 or > 200 || !email.Contains('@') ||
            fullName.Length is < 2 or > 120 || request.Password.Length is < 8 or > 128)
            return BadRequest(new { message = "Thông tin đăng ký không hợp lệ." });
        if (await _context.Users.IgnoreQueryFilters().AnyAsync(user => user.Username == username || user.Email == email))
            return Conflict(new { message = "Tài khoản hoặc email đã tồn tại." });

        _context.Users.Add(new User
        {
            Username = username, Email = email, FullName = fullName,
            PhoneNumber = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim(),
            PasswordHash = _passwordHasher.HashPassword(request.Password), GlobalRole = GlobalUserRole.Customer, IsActive = true
        });
        await _context.SaveChangesAsync();
        return Ok(new RegistrationResponse("Đăng ký tài khoản thành công.", false, false));
    }

    [HttpPost("login")]
    public async Task<ActionResult<WebAuthResponse>> Login([FromBody] WebLoginRequest request)
    {
        var identity = (request.UsernameOrEmail ?? request.Username ?? string.Empty).Trim().ToLowerInvariant();
        var user = await _context.Users.IgnoreQueryFilters()
            .Include(u => u.TenantStaffProfiles).ThenInclude(staff => staff.AccessRole)
            .FirstOrDefaultAsync(u => u.Username == identity || u.Email == identity);

        if (user == null || !user.IsActive || user.IsDeleted || !_passwordHasher.VerifyPassword(request.Password, user.PasswordHash))
        {
            return Unauthorized(new { code = "INVALID_CREDENTIALS", message = "Tài khoản hoặc mật khẩu không chính xác." });
        }
        if (!await TenantAvailable(user))
            return Unauthorized(new { code = "ACCOUNT_DISABLED", message = "Cơ sở đang chờ duyệt hoặc đã bị tạm ngưng." });

        var staffProfile = user.TenantStaffProfiles.FirstOrDefault(s => s.IsActive);
        var token = _jwtTokenGenerator.GenerateAccessToken(user, user.TenantId, staffProfile?.Role, staffProfile?.AccessRole?.Code,
            await PermissionClaims(user, staffProfile));
        var rt = _jwtTokenGenerator.GenerateRefreshToken(user.Id);
        _context.RefreshTokens.Add(rt);
        await _context.SaveChangesAsync();
        WriteRefreshCookie(rt.Token, rt.ExpiresAtUtc);

        return Ok(await ToWebResponse(user, staffProfile, token));
    }

    [HttpPost("refresh")]
    public async Task<ActionResult<WebAuthResponse>> Refresh()
    {
        if (!Request.Cookies.TryGetValue(RefreshCookie, out var token) || string.IsNullOrWhiteSpace(token))
            return Unauthorized(new { code = "REFRESH_TOKEN_MISSING", message = "Phiên đăng nhập không còn hiệu lực." });
        var current = await _context.RefreshTokens.IgnoreQueryFilters().Include(item => item.User)
            .ThenInclude(user => user!.TenantStaffProfiles).ThenInclude(staff => staff.AccessRole).FirstOrDefaultAsync(item => item.Token == token);
        if (current?.User == null || current.IsRevoked || current.ExpiresAtUtc <= DateTime.UtcNow ||
            !current.User.IsActive || current.User.IsDeleted)
        {
            ClearRefreshCookie();
            return Unauthorized(new { code = "REFRESH_TOKEN_INVALID", message = "Phiên đăng nhập không còn hiệu lực." });
        }
        if (!await TenantAvailable(current.User))
        {
            current.IsRevoked = true;
            await _context.SaveChangesAsync();
            ClearRefreshCookie();
            return Unauthorized(new { code = "ACCOUNT_DISABLED", message = "Cơ sở đang chờ duyệt hoặc đã bị tạm ngưng." });
        }

        current.IsRevoked = true;
        var replacement = _jwtTokenGenerator.GenerateRefreshToken(current.UserId);
        _context.RefreshTokens.Add(replacement);
        await _context.SaveChangesAsync();
        WriteRefreshCookie(replacement.Token, replacement.ExpiresAtUtc);
        var staff = current.User.TenantStaffProfiles.FirstOrDefault(item => item.IsActive);
        var accessToken = _jwtTokenGenerator.GenerateAccessToken(current.User, current.User.TenantId, staff?.Role, staff?.AccessRole?.Code,
            await PermissionClaims(current.User, staff));
        return Ok(await ToWebResponse(current.User, staff, accessToken));
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        if (Request.Cookies.TryGetValue(RefreshCookie, out var token) && !string.IsNullOrWhiteSpace(token))
        {
            var refresh = await _context.RefreshTokens.IgnoreQueryFilters().FirstOrDefaultAsync(item => item.Token == token);
            if (refresh != null) refresh.IsRevoked = true;
        }
        if (User.Identity?.IsAuthenticated == true && Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
            foreach (var refresh in _context.RefreshTokens.Where(item => item.UserId == userId && !item.IsRevoked)) refresh.IsRevoked = true;
        await _context.SaveChangesAsync();
        ClearRefreshCookie();
        return NoContent();
    }

    private async Task<WebAuthResponse> ToWebResponse(User user, TenantStaff? staff, string accessToken)
    {
        var roles = new List<string> { user.GlobalRole.ToString().ToUpperInvariant() };
        if (staff != null)
        {
            roles.Add("TENANTSTAFF");
            roles.Add(staff.Role.ToString().ToUpperInvariant());
        }
        if (staff?.AccessRole != null) roles.Add(staff.AccessRole.Code);
        var roleCodes = roles.Select(role => role.Replace("_", string.Empty, StringComparison.Ordinal).ToUpperInvariant()).ToHashSet();
        var permissionRows = await _context.RolePermissions.IgnoreQueryFilters().AsNoTracking()
            .Include(permission => permission.Role)
            .Include(permission => permission.Function)
            .ToListAsync();
        var tenantId = staff?.TenantId ?? user.TenantId;
        var permissions = permissionRows
            .Where(permission => permission.Role != null && (!permission.Role.TenantId.HasValue || permission.Role.TenantId == tenantId) && permission.Function?.IsActive == true && roleCodes.Contains(permission.Role.Code.Replace("_", string.Empty).ToUpperInvariant()))
            .Select(permission => (object)new { function = permission.Function!.Code, actionMask = permission.ActionMask })
            .ToList();
        var assignedProperties = await _context.TenantStaffs.IgnoreQueryFilters().AsNoTracking()
            .Where(item => item.UserId == user.Id && item.IsActive && item.Tenant != null && !item.Tenant.IsDeleted)
            .Select(item => (object)new { id = item.TenantId, active = item.Tenant!.Status == TenantStatus.Active })
            .ToListAsync();
        var canonical = roles.Select(role => role.Replace("_", string.Empty, StringComparison.Ordinal).ToUpperInvariant()).ToHashSet();
        var defaultPortal = canonical.Any(role => role is "ADMIN" or "SUPERADMIN") ? "admin" : canonical.Any(role => role is "PROPERTYOWNER" or "TENANTSTAFF" or "HOTELADMIN" or "HOTELMANAGER" or "RECEPTIONIST" or "HOUSEKEEPING") || assignedProperties.Count > 0 ? "management" : "client";
        var defaultRoute = defaultPortal == "admin" ? "/admin/dashboard" : defaultPortal == "management" ? "/management/dashboard" : "/";
        return new(accessToken, user.Id, user.Username, user.FullName, user.AvatarUrl, roles.Distinct().ToList(),
            permissions.Count > 0 ? permissions : PermissionCatalog.ForRoles(roles), assignedProperties, defaultPortal, defaultRoute, staff?.TenantId ?? user.TenantId);
    }

    private async Task<IReadOnlyCollection<string>> PermissionClaims(User user, TenantStaff? staff)
    {
        var roleCodes = new List<string> { user.GlobalRole.ToString() };
        if (staff != null)
        {
            roleCodes.Add(staff.Role.ToString());
            if (staff.AccessRole != null) roleCodes.Add(staff.AccessRole.Code);
        }
        var normalized = roleCodes.Select(role => role.Replace("_", string.Empty, StringComparison.Ordinal).ToUpperInvariant()).ToHashSet();
        var tenantId = staff?.TenantId ?? user.TenantId;
        var rows = await _context.RolePermissions.IgnoreQueryFilters().AsNoTracking()
            .Include(item => item.Role).Include(item => item.Function)
            .Where(item => item.Role != null && (!item.Role.TenantId.HasValue || item.Role.TenantId == tenantId) &&
                item.Function != null && item.Function.IsActive && normalized.Contains(item.Role.Code.Replace("_", string.Empty, StringComparison.Ordinal).ToUpperInvariant()))
            .ToListAsync();
        if (rows.Count > 0)
            return rows.GroupBy(item => item.Function!.Code, StringComparer.OrdinalIgnoreCase)
                .Select(group => $"{group.Key}:{group.Aggregate(0, (mask, item) => mask | item.ActionMask)}").ToArray();
        var fallback = normalized.Any(role => role is "OWNER" or "MANAGER" or "SUPERADMIN" or "ADMIN") ? 127 :
            normalized.Contains("RECEPTIONIST") ? 71 : normalized.Contains("HOUSEKEEPER") ? 69 : 1;
        return PermissionCatalog.AllCodes.Select(code => $"{code}:{fallback}").ToArray();
    }

    private static class PermissionCatalog
    {
        private const int View = 1, Create = 2, Update = 4, Delete = 8, Export = 16, Approve = 32, Execute = 64;
        internal static readonly string[] AllCodes =
        [
            "SYSTEM", "HOTEL", "HOTEL_SERVICE", "BOOKING", "FINANCE", "RESERVATION_PAYMENT", "AI", "USER",
            "ROLE", "ROLE_PERMISSION", "ROOM", "ROOM_TYPE", "RESERVATION", "RESERVATION_ASSIGNMENT",
            "RESERVATION_CANCEL", "RESERVATION_NO_SHOW", "CHECKIN", "CHECKOUT", "HOUSEKEEPING", "OPERATIONAL_TASK",
            "INVOICE", "REPORT", "AI_CHAT", "CUSTOMER", "PROPERTY_CLAIM", "PROPERTY_PAYMENT_CONFIG",
            "PROPERTY_REFUND", "PLATFORM_REFUND", "PLATFORM_BILLING", "PLATFORM_REVENUE", "PAYMENT_READINESS", "AUDIT_LOG"
        ];

        public static List<object> ForRoles(IEnumerable<string> roles)
        {
            var normalized = roles.Select(role => role.Replace("_", string.Empty, StringComparison.Ordinal).ToUpperInvariant()).ToHashSet();
            if (normalized.Contains("SUPERADMIN") || normalized.Contains("ADMIN"))
            return AllCodes.Select(function => (object)new { function, actionMask = View | Create | Update | Delete | Export | Approve | Execute }).ToList();

            var mask = normalized.Any(role => role is "OWNER" or "MANAGER")
                ? View | Create | Update | Delete | Export | Approve | Execute
                : normalized.Contains("RECEPTIONIST")
                    ? View | Create | Update | Execute
                    : normalized.Contains("HOUSEKEEPER") ? View | Update | Execute : View;
            return AllCodes.Select(function => (object)new { function, actionMask = mask }).ToList();
        }
    }

    private async Task<bool> TenantAvailable(User user)
    {
        if (!user.TenantId.HasValue && user.GlobalRole != GlobalUserRole.TenantStaff) return true;
        var tenantId = user.TenantId ?? user.TenantStaffProfiles.FirstOrDefault(item => item.IsActive)?.TenantId;
        return tenantId.HasValue && await _context.Tenants.IgnoreQueryFilters()
            .AnyAsync(item => item.Id == tenantId && !item.IsDeleted && item.Status == TenantStatus.Active);
    }

    private void WriteRefreshCookie(string token, DateTime expires) => Response.Cookies.Append(RefreshCookie, token,
        new CookieOptions { HttpOnly = true, Secure = Request.IsHttps, SameSite = SameSiteMode.Lax, Expires = expires, Path = "/api/auth" });
    private void ClearRefreshCookie() => Response.Cookies.Delete(RefreshCookie,
        new CookieOptions { HttpOnly = true, Secure = Request.IsHttps, SameSite = SameSiteMode.Lax, Path = "/api/auth" });
}

public sealed record WebLoginRequest(string? Username, string? UsernameOrEmail, string Password);
public sealed record WebRegisterRequest(string Username, string Email, string Password, string FullName, string? Phone);
public sealed record RegistrationResponse(string Message, bool WelcomeEmailSent, bool VerificationEmailSent);
public sealed record WebAuthResponse(string AccessToken, Guid UserId, string Username, string FullName, string? AvatarUrl,
    List<string> Roles, List<object> Permissions, List<object>? AssignedProperties = null, string? DefaultPortal = null,
    string? DefaultRoute = null, Guid? ActivePropertyId = null);
