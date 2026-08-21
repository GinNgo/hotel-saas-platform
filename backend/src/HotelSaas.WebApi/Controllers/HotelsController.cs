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
[Route("api/v1/hotels")]
[Authorize]
public sealed partial class HotelsController(IApplicationDbContext context) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "hotel.read")]
    public async Task<ActionResult<IReadOnlyList<object>>> List()
    {
        var query = context.Tenants.IgnoreQueryFilters().AsNoTracking().Include(item => item.Amenities).Where(item => !item.IsDeleted);
        if (!User.IsInRole("SuperAdmin"))
        {
            if (!Guid.TryParse(User.FindFirstValue("tenant_id"), out var tenantId)) return Forbid();
            query = query.Where(item => item.Id == tenantId);
        }
        var tenants = await query.OrderBy(item => item.Name).ToListAsync();
        return Ok(tenants.Select(ToResponse).ToList());
    }

    [HttpPost]
    [Authorize(Policy = "hotel.create")]
    public async Task<ActionResult<object>> Create([FromBody] SaveHotelRequest request)
    {
        var validation = Validate(request);
        if (validation is not null) return BadRequest(new { message = validation });
        var baseCode = NormalizeCode(request.NameVi ?? request.Name!);
        var code = baseCode;
        var suffix = 2;
        while (await context.Tenants.IgnoreQueryFilters().AnyAsync(item => item.Code == code)) code = $"{baseCode}-{suffix++}";
        var tenant = new Tenant
        {
            Name = (request.NameVi ?? request.Name!).Trim(), Code = code, Slug = $"{Slugify(request.NameVi ?? request.Name!)}-{Guid.NewGuid():N}"[..Math.Min(50, Slugify(request.NameVi ?? request.Name!).Length + 33)],
            Address = request.AddressLine!.Trim(), City = request.City!.Trim(), Description = Clean(request.DescriptionVi ?? request.Description),
            PhoneNumber = Clean(request.Phone), Email = Clean(request.Email)?.ToLowerInvariant(), LogoUrl = Clean(request.MainImage),
            PropertyType = NormalizePropertyType(request.PropertyType), StarRating = request.StarRating ?? 0,
            CheckInTime = NormalizeTime(request.CheckInTime, "14:00"), CheckOutTime = NormalizeTime(request.CheckOutTime, "12:00"),
            CancellationPolicy = Clean(request.CancellationPolicy), ChildrenPolicy = Clean(request.ChildrenPolicy),
            PetPolicy = Clean(request.PetPolicy), HouseRules = Clean(request.HouseRules),
            TaxRatePercent = request.TaxRatePercent ?? 0, ServiceFeeRatePercent = request.ServiceFeeRatePercent ?? 0,
            Latitude = request.Latitude, Longitude = request.Longitude,
            Status = TenantStatus.PendingApproval, SubscriptionTier = SubscriptionTier.Basic
        };
        foreach (var codeValue in NormalizeAmenities(request.AmenityCodes))
            tenant.Amenities.Add(new PropertyAmenity { TenantId = tenant.Id, Code = codeValue });
        context.Tenants.Add(tenant);
        await context.SaveChangesAsync();
        return CreatedAtAction(nameof(List), new { id = tenant.Id }, ToResponse(tenant));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "hotel.update")]
    public async Task<ActionResult<object>> Update(Guid id, [FromBody] SaveHotelRequest request)
    {
        var tenant = await Find(id);
        if (tenant is null) return NotFound(new { message = "Không tìm thấy cơ sở lưu trú." });
        var validation = Validate(request);
        if (validation is not null) return BadRequest(new { message = validation });
        tenant.Name = (request.NameVi ?? request.Name!).Trim(); tenant.Address = request.AddressLine!.Trim(); tenant.City = request.City!.Trim();
        tenant.Description = Clean(request.DescriptionVi ?? request.Description); tenant.PhoneNumber = Clean(request.Phone);
        tenant.Email = Clean(request.Email)?.ToLowerInvariant(); tenant.LogoUrl = Clean(request.MainImage);
        tenant.PropertyType = NormalizePropertyType(request.PropertyType); tenant.StarRating = request.StarRating ?? 0;
        tenant.CheckInTime = NormalizeTime(request.CheckInTime, "14:00"); tenant.CheckOutTime = NormalizeTime(request.CheckOutTime, "12:00");
        tenant.CancellationPolicy = Clean(request.CancellationPolicy); tenant.ChildrenPolicy = Clean(request.ChildrenPolicy);
        tenant.PetPolicy = Clean(request.PetPolicy); tenant.HouseRules = Clean(request.HouseRules);
        tenant.TaxRatePercent = request.TaxRatePercent ?? 0; tenant.ServiceFeeRatePercent = request.ServiceFeeRatePercent ?? 0;
        tenant.Latitude = request.Latitude; tenant.Longitude = request.Longitude;
        var requestedAmenities = NormalizeAmenities(request.AmenityCodes);
        foreach (var amenity in tenant.Amenities.Where(item => !requestedAmenities.Contains(item.Code)).ToList())
            context.PropertyAmenities.Remove(amenity);
        foreach (var codeValue in requestedAmenities.Where(codeValue => tenant.Amenities.All(item => !item.Code.Equals(codeValue, StringComparison.OrdinalIgnoreCase))))
            tenant.Amenities.Add(new PropertyAmenity { TenantId = tenant.Id, Code = codeValue });
        await context.SaveChangesAsync();
        return Ok(ToResponse(tenant));
    }

    [HttpPut("{id:guid}/pricing-settings")]
    [Authorize(Policy = "hotel.update")]
    public async Task<ActionResult<object>> UpdatePricingSettings(Guid id, [FromBody] PropertyPricingSettingsRequest request)
    {
        if (request.TaxRatePercent is < 0 or > 30 || request.ServiceFeeRatePercent is < 0 or > 30)
            return BadRequest(new { message = "Thuế suất và phí dịch vụ phải nằm trong khoảng 0-30%." });
        var tenant = await FindAuthorized(id);
        if (tenant is null) return NotFound(new { message = "Không tìm thấy cơ sở lưu trú." });
        tenant.TaxRatePercent = request.TaxRatePercent;
        tenant.ServiceFeeRatePercent = request.ServiceFeeRatePercent;
        await context.SaveChangesAsync();
        return Ok(ToResponse(tenant));
    }

    [HttpPost("{id:guid}/submit")]
    [Authorize(Policy = "hotel.update")]
    public async Task<ActionResult<object>> Submit(Guid id)
    {
        var tenant = await FindAuthorized(id);
        if (tenant is null) return NotFound(new { message = "Không tìm thấy cơ sở lưu trú." });
        if (tenant.Status == TenantStatus.Active) return Ok(ToResponse(tenant));
        tenant.Status = TenantStatus.PendingApproval;
        await context.SaveChangesAsync();
        return Ok(ToResponse(tenant));
    }

    [HttpPost("{id:guid}/approve")]
    [Authorize(Policy = "hotel.approve")]
    public Task<ActionResult<object>> Approve(Guid id) => ChangeStatus(id, TenantStatus.Active);

    [HttpPost("{id:guid}/reject")]
    [Authorize(Policy = "hotel.approve")]
    public Task<ActionResult<object>> Reject(Guid id) => ChangeStatus(id, TenantStatus.Suspended);

    private async Task<ActionResult<object>> ChangeStatus(Guid id, TenantStatus status)
    {
        var tenant = await Find(id);
        if (tenant is null) return NotFound(new { message = "Không tìm thấy cơ sở lưu trú." });
        if (tenant.Status == status) return Ok(ToResponse(tenant));
        if (tenant.Status != TenantStatus.PendingApproval)
            return Conflict(new { message = "Chỉ cơ sở đang chờ duyệt mới có thể xử lý." });
        if (status == TenantStatus.Active)
        {
            var ownerAssignment = await context.TenantStaffs.IgnoreQueryFilters()
                .Include(item => item.User)
                .FirstOrDefaultAsync(item => item.TenantId == tenant.Id && item.Role == StaffRole.Owner &&
                    !item.IsDeleted && item.User != null && item.User.IsActive && !item.User.IsDeleted);
            if (ownerAssignment?.User != null)
            {
                if (ownerAssignment.User.TenantId.HasValue && ownerAssignment.User.TenantId != tenant.Id)
                    return Conflict(new { code = "PROPERTY_OWNER_ASSIGNED_ELSEWHERE", message = "Chủ sở hữu đã thuộc một cơ sở khác." });
                ownerAssignment.User.TenantId = tenant.Id;
                ownerAssignment.User.GlobalRole = GlobalUserRole.TenantStaff;
                ownerAssignment.IsActive = true;
                foreach (var token in context.RefreshTokens.IgnoreQueryFilters()
                             .Where(item => item.UserId == ownerAssignment.UserId && !item.IsRevoked))
                    token.IsRevoked = true;
            }
        }
        tenant.Status = status;
        await context.SaveChangesAsync();
        return Ok(ToResponse(tenant));
    }

    private Task<Tenant?> Find(Guid id) => context.Tenants.IgnoreQueryFilters().Include(item => item.Amenities).FirstOrDefaultAsync(item => item.Id == id && !item.IsDeleted);
    private async Task<Tenant?> FindAuthorized(Guid id)
    {
        if (User.IsInRole("SuperAdmin")) return await Find(id);
        return Guid.TryParse(User.FindFirstValue("tenant_id"), out var tenantId) && tenantId == id ? await Find(id) : null;
    }
    private static string? Validate(SaveHotelRequest request)
    {
        var name = request.NameVi ?? request.Name;
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > 255) return "Tên cơ sở không hợp lệ.";
        if (string.IsNullOrWhiteSpace(request.AddressLine) || request.AddressLine.Trim().Length > 1000) return "Địa chỉ cơ sở không hợp lệ.";
        if (string.IsNullOrWhiteSpace(request.City) || request.City.Trim().Length > 255) return "Tỉnh/thành phố không hợp lệ.";
        if (request.StarRating is < 0 or > 5) return "Hạng sao phải từ 0 đến 5.";
        if (!AllowedPropertyTypes.Contains(NormalizePropertyType(request.PropertyType))) return "Loại hình cơ sở không hợp lệ.";
        if ((request.AmenityCodes ?? []).Any(value => !AllowedAmenities.Contains(value.Trim()))) return "Danh sách tiện nghi có mã không hợp lệ.";
        if (!ValidTime(request.CheckInTime) || !ValidTime(request.CheckOutTime)) return "Giờ nhận/trả phòng phải có định dạng HH:mm.";
        if (request.TaxRatePercent is < 0 or > 30 || request.ServiceFeeRatePercent is < 0 or > 30)
            return "Thuế suất và phí dịch vụ phải nằm trong khoảng 0-30%.";
        if (new[] { request.CancellationPolicy, request.ChildrenPolicy, request.PetPolicy, request.HouseRules }.Any(value => value?.Trim().Length > 2000))
            return "Mỗi nội dung chính sách không được vượt quá 2.000 ký tự.";
        if (request.Latitude.HasValue != request.Longitude.HasValue) return "Vĩ độ và kinh độ phải được cung cấp cùng nhau.";
        if (request.Latitude is < -90 or > 90 || request.Longitude is < -180 or > 180) return "Tọa độ cơ sở không hợp lệ.";
        return null;
    }
    private static object ToResponse(Tenant item) => new
    {
        item.Id, Name = item.Name, NameVi = item.Name, item.Code, AddressLine = item.Address, item.City,
        item.PropertyType, item.StarRating, ApprovalStatus = item.Status == TenantStatus.Active ? "APPROVED" : item.Status == TenantStatus.PendingApproval ? "PENDING_APPROVAL" : "REJECTED",
        OperationStatus = item.Status == TenantStatus.Active ? "ACTIVE" : "INACTIVE", Status = item.Status == TenantStatus.Active ? "ACTIVE" : item.Status == TenantStatus.PendingApproval ? "PENDING" : "REJECTED",
        item.PhoneNumber, Phone = item.PhoneNumber, item.Email, MainImage = item.LogoUrl, DescriptionVi = item.Description,
        AmenityCodes = item.Amenities.Where(amenity => !amenity.IsDeleted).Select(amenity => amenity.Code).OrderBy(codeValue => codeValue).ToList(),
        item.CheckInTime, item.CheckOutTime, item.CancellationPolicy, item.ChildrenPolicy, item.PetPolicy, item.HouseRules,
        item.TaxRatePercent, item.ServiceFeeRatePercent,
        item.Latitude, item.Longitude,
        SubscriptionTier = item.SubscriptionTier.ToString()
    };
    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static readonly HashSet<string> AllowedPropertyTypes = new(StringComparer.OrdinalIgnoreCase) { "HOTEL", "RESORT", "APARTMENT", "VILLA", "HOMESTAY", "MOTEL", "GUEST_HOUSE", "HOSTEL" };
    private static readonly HashSet<string> AllowedAmenities = new(StringComparer.OrdinalIgnoreCase)
        { "WIFI", "POOL", "PARKING", "BREAKFAST", "AIRPORT_SHUTTLE", "GYM", "SPA", "RESTAURANT", "PET_FRIENDLY", "FAMILY_ROOMS", "BEACH", "EV_CHARGING" };
    private static string NormalizePropertyType(string? value) => string.IsNullOrWhiteSpace(value) ? "HOTEL" : value.Trim().ToUpperInvariant();
    private static HashSet<string> NormalizeAmenities(IReadOnlyList<string>? values) => (values ?? [])
        .Select(value => value.Trim().ToUpperInvariant()).Where(AllowedAmenities.Contains).ToHashSet(StringComparer.OrdinalIgnoreCase);
    private static bool ValidTime(string? value) => string.IsNullOrWhiteSpace(value) || TimeOnly.TryParseExact(value.Trim(), "HH:mm", out _);
    private static string NormalizeTime(string? value, string fallback) => string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();
    private static string NormalizeCode(string value)
    {
        var normalized = NonAlphaNumeric().Replace(value.Trim().ToUpperInvariant(), "-").Trim('-');
        if (string.IsNullOrEmpty(normalized)) normalized = "HOTEL";
        return normalized[..Math.Min(40, normalized.Length)];
    }
    private static string Slugify(string value)
    {
        var normalized = NonAlphaNumeric().Replace(value.Trim().ToLowerInvariant(), "-").Trim('-');
        return string.IsNullOrEmpty(normalized) ? "hotel" : normalized;
    }
    [GeneratedRegex("[^a-zA-Z0-9]+")]
    private static partial Regex NonAlphaNumeric();
}

[ApiController]
[Route("api/admin/property-approvals")]
[Authorize(Policy = "hotel.approve")]
public sealed class PropertyApprovalsController(IApplicationDbContext context) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<object>>> List() => Ok(await context.Tenants.IgnoreQueryFilters().AsNoTracking()
        .Where(item => !item.IsDeleted && item.Status == TenantStatus.PendingApproval)
        .OrderBy(item => item.CreatedAtUtc).Select(item => new
        {
            item.Id, NameVi = item.Name, item.Code, Address = item.Address, item.PropertyType, item.StarRating, ApprovalStatus = "PENDING_APPROVAL", OperationStatus = "INACTIVE",
            OwnerName = context.TenantStaffs.IgnoreQueryFilters().Where(staff => staff.TenantId == item.Id && staff.Role == StaffRole.Owner && !staff.IsDeleted).Select(staff => staff.User!.FullName).FirstOrDefault(),
            OwnerEmail = context.TenantStaffs.IgnoreQueryFilters().Where(staff => staff.TenantId == item.Id && staff.Role == StaffRole.Owner && !staff.IsDeleted).Select(staff => staff.User!.Email).FirstOrDefault()
        }).ToListAsync());
}

public sealed record SaveHotelRequest(string? Name, string? NameVi, string? AddressLine, string? City, string? Description, string? DescriptionVi, string? Phone, string? Email, string? MainImage, string? PropertyType = null, int? StarRating = null, IReadOnlyList<string>? AmenityCodes = null, string? CheckInTime = null, string? CheckOutTime = null, string? CancellationPolicy = null, string? ChildrenPolicy = null, string? PetPolicy = null, string? HouseRules = null, double? Latitude = null, double? Longitude = null, decimal? TaxRatePercent = null, decimal? ServiceFeeRatePercent = null);
public sealed record PropertyPricingSettingsRequest(decimal TaxRatePercent, decimal ServiceFeeRatePercent);
