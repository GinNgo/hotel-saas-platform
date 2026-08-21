using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
public class AccountActionsController(IApplicationDbContext context, IPasswordHasher passwordHasher) : ControllerBase
{
    [HttpPost("api/auth/forgot-password")]
    [AllowAnonymous]
    public async Task<ActionResult<PasswordRecoveryDispatch>> ForgotPassword([FromBody] ForgotPasswordRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var user = await context.Users.IgnoreQueryFilters().FirstOrDefaultAsync(item => item.Email == email && item.IsActive && !item.IsDeleted);
        if (user != null) await IssueToken(user, "PASSWORD_RESET", TimeSpan.FromMinutes(30));
        return Ok(new PasswordRecoveryDispatch("Nếu tài khoản tồn tại, liên kết đặt lại mật khẩu sẽ được gửi trong ít phút.", false));
    }

    [HttpPost("api/auth/reset-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest request)
    {
        if (request.NewPassword.Length is < 8 or > 128)
            return BadRequest(new { message = "Mật khẩu mới phải có từ 8 đến 128 ký tự." });
        var token = await ValidToken(request.Token, "PASSWORD_RESET");
        if (token?.User == null) return BadRequest(new { message = "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn." });
        token.User.PasswordHash = passwordHasher.HashPassword(request.NewPassword);
        token.User.UpdatedAtUtc = DateTime.UtcNow;
        token.UsedAtUtc = DateTime.UtcNow;
        foreach (var refresh in context.RefreshTokens.Where(item => item.UserId == token.UserId && !item.IsRevoked)) refresh.IsRevoked = true;
        await context.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("api/users/me/email-verification/resend")]
    [Authorize]
    public async Task<ActionResult<EmailVerificationDispatch>> ResendVerification()
    {
        var user = await CurrentUser();
        if (user == null) return Unauthorized();
        if (user.EmailVerifiedAtUtc.HasValue && string.IsNullOrWhiteSpace(user.PendingEmail))
            return Ok(new EmailVerificationDispatch("Email đã được xác minh.", false, true, null));
        await IssueToken(user, string.IsNullOrWhiteSpace(user.PendingEmail) ? "EMAIL_VERIFY" : "EMAIL_CHANGE",
            TimeSpan.FromHours(24), user.PendingEmail);
        return Ok(new EmailVerificationDispatch("Liên kết xác minh đã được tạo nhưng hệ thống email chưa được cấu hình.",
            false, false, user.PendingEmail));
    }

    [HttpPost("api/users/me/email-change")]
    [Authorize]
    public async Task<ActionResult<EmailVerificationDispatch>> RequestEmailChange([FromBody] EmailChangeRequest request)
    {
        var user = await CurrentUser();
        if (user == null) return Unauthorized();
        var email = request.NewEmail.Trim().ToLowerInvariant();
        if (email.Length is < 5 or > 200 || !email.Contains('@')) return BadRequest(new { message = "Email mới không hợp lệ." });
        if (email == user.Email) return Ok(new EmailVerificationDispatch("Email hiện tại đã được sử dụng.", false,
            user.EmailVerifiedAtUtc.HasValue, null));
        if (await context.Users.IgnoreQueryFilters().AnyAsync(item => item.Id != user.Id && (item.Email == email || item.PendingEmail == email)))
            return Conflict(new { message = "Email đã được tài khoản khác sử dụng hoặc đang chờ xác minh." });
        user.PendingEmail = email;
        await IssueToken(user, "EMAIL_CHANGE", TimeSpan.FromHours(24), email);
        return Ok(new EmailVerificationDispatch("Email mới chỉ có hiệu lực sau khi xác minh.", false, false, email));
    }

    [HttpPost("api/auth/email-verification/confirm")]
    [AllowAnonymous]
    public async Task<ActionResult<EmailVerificationResult>> ConfirmEmail([FromBody] ConfirmTokenRequest request)
    {
        var hash = AccountTokenSecurity.Hash(request.Token);
        var token = await context.AccountActionTokens.IgnoreQueryFilters().Include(item => item.User)
            .FirstOrDefaultAsync(item => item.TokenHash == hash && item.UsedAtUtc == null && item.ExpiresAtUtc > DateTime.UtcNow &&
                (item.Purpose == "EMAIL_VERIFY" || item.Purpose == "EMAIL_CHANGE"));
        if (token?.User == null) return BadRequest(new { message = "Liên kết xác minh không hợp lệ hoặc đã hết hạn." });
        var changed = token.Purpose == "EMAIL_CHANGE";
        if (changed)
        {
            var pending = token.PendingEmail?.Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(pending) || token.User.PendingEmail != pending ||
                await context.Users.IgnoreQueryFilters().AnyAsync(item => item.Id != token.UserId && item.Email == pending))
                return Conflict(new { message = "Email mới không còn khả dụng." });
            token.User.Email = pending;
            token.User.PendingEmail = null;
        }
        token.User.EmailVerifiedAtUtc = DateTime.UtcNow;
        token.User.UpdatedAtUtc = DateTime.UtcNow;
        token.UsedAtUtc = DateTime.UtcNow;
        await context.SaveChangesAsync();
        return Ok(new EmailVerificationResult(changed ? "Email mới đã được xác minh." : "Email đã được xác minh.", changed, token.User.Email));
    }

    private async Task<AccountActionToken?> ValidToken(string rawToken, string purpose)
    {
        var hash = AccountTokenSecurity.Hash(rawToken);
        return await context.AccountActionTokens.IgnoreQueryFilters().Include(item => item.User)
            .FirstOrDefaultAsync(item => item.TokenHash == hash && item.Purpose == purpose && item.UsedAtUtc == null &&
                item.ExpiresAtUtc > DateTime.UtcNow && item.User != null && item.User.IsActive && !item.User.IsDeleted);
    }

    private async Task IssueToken(User user, string purpose, TimeSpan lifetime, string? pendingEmail = null)
    {
        foreach (var old in context.AccountActionTokens.Where(item => item.UserId == user.Id && item.Purpose == purpose && item.UsedAtUtc == null))
            old.UsedAtUtc = DateTime.UtcNow;
        var raw = AccountTokenSecurity.Generate();
        context.AccountActionTokens.Add(new AccountActionToken
        {
            UserId = user.Id, Purpose = purpose, TokenHash = AccountTokenSecurity.Hash(raw), PendingEmail = pendingEmail,
            ExpiresAtUtc = DateTime.UtcNow.Add(lifetime)
        });
        await context.SaveChangesAsync();
    }

    private async Task<User?> CurrentUser()
    {
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return null;
        return await context.Users.IgnoreQueryFilters().FirstOrDefaultAsync(item => item.Id == userId && item.IsActive && !item.IsDeleted);
    }
}

internal static class AccountTokenSecurity
{
    public static string Generate() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(48)).Replace('+', '-').Replace('/', '_').TrimEnd('=');
    public static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();
}

public sealed record ForgotPasswordRequest(string Email);
public sealed record ResetPasswordRequest(string Token, string NewPassword);
public sealed record PasswordRecoveryDispatch(string Message, bool EmailSent);
public sealed record EmailChangeRequest(string NewEmail);
public sealed record ConfirmTokenRequest(string Token);
public sealed record EmailVerificationDispatch(string Message, bool EmailSent, bool AlreadyVerified, string? PendingEmail);
public sealed record EmailVerificationResult(string Message, bool EmailChanged, string Email);
