using System.Security.Claims;
using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/properties")]
[Authorize(Roles = "Customer")]
public class PropertyClaimsController(IApplicationDbContext context) : ControllerBase
{
    [HttpPost("{propertyId:guid}/claim")]
    public async Task<ActionResult<PropertyClaimDto>> Submit(Guid propertyId, [FromBody] SubmitPropertyClaimRequest request)
    {
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Unauthorized();
        var method = request.VerificationMethod.Trim().ToUpperInvariant();
        var data = request.VerificationData.Trim();
        var allowedMethods = new[] { "BUSINESS_LICENSE", "DOMAIN_EMAIL", "PHONE", "OTHER" };
        if (!allowedMethods.Contains(method) || data.Length is < 3 or > 1000 || request.Note is { Length: > 1000 })
            return BadRequest(new { message = "Thông tin xác minh quyền sở hữu không hợp lệ." });
        var tenant = await context.Tenants.IgnoreQueryFilters()
            .FirstOrDefaultAsync(item => item.Id == propertyId && !item.IsDeleted && item.Status == TenantStatus.Active);
        if (tenant == null) return NotFound(new { message = "Chỗ nghỉ không còn hiển thị." });
        var pending = await context.PropertyClaims.IgnoreQueryFilters()
            .FirstOrDefaultAsync(item => item.UserId == userId && item.TenantId == propertyId && item.Status == "PENDING" && !item.IsDeleted);
        if (pending != null)
        {
            if (pending.VerificationMethod == method && pending.VerificationData == data) return Ok(ToDto(pending));
            return Conflict(new { message = "Bạn đã có một yêu cầu xác minh đang chờ xử lý cho chỗ nghỉ này." });
        }
        var claim = new PropertyClaim
        {
            UserId = userId, TenantId = propertyId, VerificationMethod = method, VerificationData = data,
            Note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim(), Status = "PENDING"
        };
        context.PropertyClaims.Add(claim);
        await context.SaveChangesAsync();
        return Ok(ToDto(claim));
    }

    private static PropertyClaimDto ToDto(PropertyClaim claim) => new(claim.Id, claim.TenantId, claim.Status, claim.CreatedAtUtc);
}

public sealed record SubmitPropertyClaimRequest(string VerificationMethod, string VerificationData, string? Note);
public sealed record PropertyClaimDto(Guid Id, Guid PropertyId, string Status, DateTime SubmittedAt);

[ApiController]
[Route("api/admin/property-claims")]
[Authorize]
public class AdminPropertyClaimsController(IApplicationDbContext context) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "property_claim.read")]
    public async Task<ActionResult<object>> List([FromQuery] string? status, [FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 20)
    {
        pageNumber = Math.Max(1, pageNumber);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var normalizedStatus = string.IsNullOrWhiteSpace(status) ? null : status.Trim().ToUpperInvariant();
        if (normalizedStatus is not null && normalizedStatus is not ("PENDING" or "APPROVED" or "REJECTED"))
            return BadRequest(new { message = "Trạng thái yêu cầu không hợp lệ." });

        var query = context.PropertyClaims.IgnoreQueryFilters().AsNoTracking().Where(item => !item.IsDeleted);
        if (normalizedStatus is not null) query = query.Where(item => item.Status == normalizedStatus);
        var totalElements = await query.CountAsync();
        var rows = await query.OrderByDescending(item => item.CreatedAtUtc)
            .Skip((pageNumber - 1) * pageSize).Take(pageSize)
            .Select(item => new
            {
                item.Id,
                Property = new { item.TenantId, item.Tenant!.Code, item.Tenant.Name, ApprovalStatus = item.Tenant.Status.ToString(), OperationStatus = item.Tenant.Status.ToString() },
                RequesterUser = new { item.UserId, item.User!.Username, item.User.Email, item.User.FullName },
                item.VerificationMethod, item.VerificationData, item.Note, item.Status,
                ReviewedBy = item.ReviewedByUserId == null ? null : context.Users.IgnoreQueryFilters()
                    .Where(user => user.Id == item.ReviewedByUserId)
                    .Select(user => new { Id = user.Id, user.Username, user.Email, user.FullName }).FirstOrDefault(),
                ReviewedAt = item.ReviewedAtUtc, item.RejectionReason, CreatedAt = item.CreatedAtUtc
            }).ToListAsync();
        return Ok(new { content = rows, pageNumber, pageSize, totalElements, totalPages = (int)Math.Ceiling(totalElements / (double)pageSize) });
    }

    [HttpPost("{claimId:guid}/approve")]
    [Authorize(Policy = "property_claim.approve")]
    public async Task<ActionResult> Approve(Guid claimId)
    {
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var reviewerId)) return Unauthorized();
        var claim = await context.PropertyClaims.IgnoreQueryFilters().FirstOrDefaultAsync(item => item.Id == claimId && !item.IsDeleted);
        if (claim == null) return NotFound(new { message = "Không tìm thấy yêu cầu sở hữu." });
        if (claim.Status == "APPROVED") return Ok(new { claim.Id, claim.Status });
        if (claim.Status != "PENDING") return Conflict(new { message = "Yêu cầu đã được xử lý theo một kết quả khác." });

        var user = await context.Users.IgnoreQueryFilters().FirstOrDefaultAsync(item => item.Id == claim.UserId && !item.IsDeleted && item.IsActive);
        if (user == null) return Conflict(new { message = "Tài khoản yêu cầu không còn hoạt động." });
        if (user.TenantId.HasValue && user.TenantId != claim.TenantId)
            return Conflict(new { message = "Tài khoản đang thuộc một cơ sở lưu trú khác." });
        var hasOtherOwner = await context.TenantStaffs.IgnoreQueryFilters().AnyAsync(item => item.TenantId == claim.TenantId && item.UserId != claim.UserId && item.Role == StaffRole.Owner && item.IsActive && !item.IsDeleted);
        if (hasOtherOwner) return Conflict(new { message = "Cơ sở lưu trú đã có chủ sở hữu đang hoạt động." });

        var staff = await context.TenantStaffs.IgnoreQueryFilters().FirstOrDefaultAsync(item => item.TenantId == claim.TenantId && item.UserId == claim.UserId && !item.IsDeleted);
        if (staff == null)
            context.TenantStaffs.Add(new TenantStaff { TenantId = claim.TenantId, UserId = claim.UserId, Role = StaffRole.Owner, IsActive = true });
        else
        {
            staff.Role = StaffRole.Owner;
            staff.IsActive = true;
        }
        user.GlobalRole = GlobalUserRole.TenantStaff;
        user.TenantId = claim.TenantId;
        foreach (var token in context.RefreshTokens.IgnoreQueryFilters().Where(item => item.UserId == claim.UserId && !item.IsRevoked)) token.IsRevoked = true;
        claim.Status = "APPROVED";
        claim.ReviewedByUserId = reviewerId;
        claim.ReviewedAtUtc = DateTime.UtcNow;
        claim.RejectionReason = null;
        await context.SaveChangesAsync();
        return Ok(new { claim.Id, claim.Status });
    }

    [HttpPost("{claimId:guid}/reject")]
    [Authorize(Policy = "property_claim.approve")]
    public async Task<ActionResult> Reject(Guid claimId, [FromBody] RejectPropertyClaimRequest request)
    {
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var reviewerId)) return Unauthorized();
        var reason = request.Reason?.Trim() ?? string.Empty;
        if (reason.Length is < 3 or > 1000) return BadRequest(new { message = "Lý do từ chối phải có từ 3 đến 1000 ký tự." });
        var claim = await context.PropertyClaims.IgnoreQueryFilters().FirstOrDefaultAsync(item => item.Id == claimId && !item.IsDeleted);
        if (claim == null) return NotFound(new { message = "Không tìm thấy yêu cầu sở hữu." });
        if (claim.Status == "REJECTED") return Ok(new { claim.Id, claim.Status });
        if (claim.Status != "PENDING") return Conflict(new { message = "Yêu cầu đã được xử lý theo một kết quả khác." });
        claim.Status = "REJECTED";
        claim.RejectionReason = reason;
        claim.ReviewedByUserId = reviewerId;
        claim.ReviewedAtUtc = DateTime.UtcNow;
        await context.SaveChangesAsync();
        return Ok(new { claim.Id, claim.Status });
    }
}

public sealed record RejectPropertyClaimRequest(string? Reason);
