using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Application.Common.Models;
using HotelSaas.Application.DTOs.Tenants;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TenantsController : ControllerBase
{
    private readonly IApplicationDbContext _context;
    private readonly IPasswordHasher _passwordHasher;

    public TenantsController(IApplicationDbContext context, IPasswordHasher passwordHasher)
    {
        _context = context;
        _passwordHasher = passwordHasher;
    }

    [HttpGet]
    public async Task<ActionResult<Result<List<TenantDto>>>> GetActiveTenants()
    {
        var tenants = await _context.Tenants
            .Where(t => t.Status == TenantStatus.Active && !t.IsDeleted)
            .Select(t => new TenantDto(
                t.Id, t.Name, t.Code, t.Slug, t.Address, t.City, t.PhoneNumber, t.Email, t.SubscriptionTier, t.Status
            ))
            .ToListAsync();

        return Ok(Result<List<TenantDto>>.Success(tenants));
    }

    [HttpPost("register-property")]
    public async Task<ActionResult<Result<TenantDto>>> RegisterProperty([FromBody] CreateTenantRequestDto request)
    {
        var existingCode = await _context.Tenants.AnyAsync(t => t.Code == request.Code);
        if (existingCode) return BadRequest(Result<TenantDto>.Failure("Mã cơ sở đã tồn tại trên sàn."));
        var existingOwner = await _context.Users.AnyAsync(u => u.Username == request.OwnerUsername || u.Email == request.OwnerEmail);
        if (existingOwner) return BadRequest(Result<TenantDto>.Failure("Tài khoản hoặc email chủ cơ sở đã tồn tại."));

        var tenant = new Tenant
        {
            Name = request.Name,
            Code = request.Code,
            Slug = request.Name.ToLower().Replace(" ", "-"),
            Address = request.Address,
            City = request.City,
            PhoneNumber = request.PhoneNumber,
            Email = request.Email,
            SubscriptionTier = request.Tier,
            Status = TenantStatus.PendingApproval
        };

        var ownerUser = new User
        {
            Username = request.OwnerUsername.Trim(),
            Email = request.OwnerEmail.Trim().ToLower(),
            FullName = request.OwnerFullName,
            PasswordHash = _passwordHasher.HashPassword(request.OwnerPassword),
            GlobalRole = GlobalUserRole.TenantStaff,
            TenantId = tenant.Id,
            IsActive = true
        };

        var staffProfile = new TenantStaff
        {
            TenantId = tenant.Id,
            UserId = ownerUser.Id,
            Role = StaffRole.Owner,
            IsActive = true
        };

        _context.Tenants.Add(tenant);
        _context.Users.Add(ownerUser);
        _context.TenantStaffs.Add(staffProfile);

        await _context.SaveChangesAsync();

        var dto = new TenantDto(tenant.Id, tenant.Name, tenant.Code, tenant.Slug, tenant.Address, tenant.City, tenant.PhoneNumber, tenant.Email, tenant.SubscriptionTier, tenant.Status);
        return Ok(Result<TenantDto>.Success(dto, "Đăng ký cơ sở thành công và đang chờ quản trị sàn phê duyệt."));
    }

    [Authorize(Policy = "platform_billing.update")]
    [HttpPut("{tenantId:guid}/subscription-tier")]
    public async Task<ActionResult<Result>> UpdateSubscriptionTier(Guid tenantId, [FromBody] UpdateSubscriptionTierDto request)
    {
        var tenant = await _context.Tenants.FindAsync(tenantId);
        if (tenant == null) return NotFound(Result.Failure("Không tìm thấy cơ sở."));

        tenant.SubscriptionTier = request.NewTier;
        await _context.SaveChangesAsync();

        return Ok(Result.Success($"Đã cập nhật gói dịch vụ của {tenant.Name} thành {request.NewTier}."));
    }
}
