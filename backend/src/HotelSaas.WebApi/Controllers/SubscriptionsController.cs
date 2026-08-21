using System.Security.Claims;
using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/subscriptions")]
public sealed class SubscriptionsController(IApplicationDbContext context) : ControllerBase
{
    [HttpGet("plans")]
    [AllowAnonymous]
    public async Task<ActionResult<IReadOnlyList<object>>> Plans() => Ok(await ReadPlans(activeOnly: true));

    [HttpGet("me")]
    [Authorize(Policy = "platform_billing.read")]
    public async Task<ActionResult<IReadOnlyList<object>>> Mine()
    {
        var tenant = await CurrentTenant();
        if (tenant is null) return Forbid();
        var plan = await FindTierPlan(tenant.SubscriptionTier);
        return Ok(new[] { new { Id = tenant.Id, Plan = plan, StartAt = tenant.CreatedAtUtc, EndAt = (DateTime?)null, IsLifetime = tenant.SubscriptionTier == SubscriptionTier.Enterprise, Status = tenant.Status == TenantStatus.Active ? "ACTIVE" : "INACTIVE" } });
    }

    [HttpGet("me/features")]
    [Authorize(Policy = "platform_billing.read")]
    public async Task<ActionResult<IReadOnlyDictionary<string, int>>> Features()
    {
        var tenant = await CurrentTenant();
        if (tenant is null) return Forbid();
        return Ok(Limits(tenant.SubscriptionTier));
    }

    [HttpGet("me/usage")]
    [Authorize(Policy = "platform_billing.read")]
    public async Task<ActionResult<object>> Usage()
    {
        var tenant = await CurrentTenant();
        if (tenant is null) return Forbid();
        var limits = Limits(tenant.SubscriptionTier);
        var usage = new Dictionary<string, int>
        {
            ["MAX_PROPERTIES"] = 1,
            ["MAX_ROOMS"] = await context.Rooms.IgnoreQueryFilters().CountAsync(item => item.TenantId == tenant.Id && !item.IsDeleted),
            ["MAX_ROOM_TYPES"] = await context.RoomTypes.IgnoreQueryFilters().CountAsync(item => item.TenantId == tenant.Id && !item.IsDeleted),
            ["MAX_STAFF"] = await context.TenantStaffs.IgnoreQueryFilters().CountAsync(item => item.TenantId == tenant.Id && item.IsActive && !item.IsDeleted)
        };
        var featureRows = limits.Select(item => new { Code = item.Key, NameVi = FeatureName(item.Key), NameEn = item.Key, Limit = item.Value, Usage = usage.GetValueOrDefault(item.Key), Allowed = item.Value == -1 || usage.GetValueOrDefault(item.Key) < item.Value });
        return Ok(new { PlanCode = tenant.SubscriptionTier.ToString().ToUpperInvariant(), SubscriptionStatus = tenant.Status == TenantStatus.Active ? "ACTIVE" : "INACTIVE", StartAt = tenant.CreatedAtUtc, EndAt = (DateTime?)null, Lifetime = tenant.SubscriptionTier == SubscriptionTier.Enterprise, Limits = limits, Usage = usage, Features = featureRows });
    }

    private async Task<Tenant?> CurrentTenant() => Guid.TryParse(User.FindFirstValue("tenant_id"), out var id)
        ? await context.Tenants.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(item => item.Id == id && !item.IsDeleted) : null;
    private async Task<object> FindTierPlan(SubscriptionTier tier)
    {
        var code = tier.ToString().ToUpperInvariant();
        var plan = await context.SubscriptionPlans.AsNoTracking().Include(item => item.Features).FirstOrDefaultAsync(item => item.Code == code && !item.IsDeleted);
        return plan is null ? DefaultPlan(tier) : PlanResponse(plan);
    }
    private async Task<IReadOnlyList<object>> ReadPlans(bool activeOnly)
    {
        var query = context.SubscriptionPlans.AsNoTracking().Include(item => item.Features).Where(item => !item.IsDeleted);
        if (activeOnly) query = query.Where(item => item.IsActive);
        var plans = await query.OrderBy(item => item.Price).ToListAsync();
        return plans.Count > 0 ? plans.Select(PlanResponse).ToList() : Enum.GetValues<SubscriptionTier>().Select(DefaultPlan).ToList();
    }
    internal static object PlanResponse(SubscriptionPlan plan) => new { plan.Id, plan.Code, plan.NameVi, plan.NameEn, plan.BillingType, plan.Price, plan.IsLifetime, Status = plan.IsActive ? "ACTIVE" : "INACTIVE", Features = plan.Features.OrderBy(item => item.Code).Select(item => new { item.Code, NameVi = FeatureName(item.Code), NameEn = item.Code, ValueType = "LIMIT", item.Limit }) };
    internal static object DefaultPlan(SubscriptionTier tier)
    {
        var limits = Limits(tier);
        return new { Id = Guid.Empty, Code = tier.ToString().ToUpperInvariant(), NameVi = tier == SubscriptionTier.Basic ? "Cơ bản" : tier == SubscriptionTier.Pro ? "Chuyên nghiệp" : "Doanh nghiệp", NameEn = tier.ToString(), BillingType = "MONTHLY", Price = tier == SubscriptionTier.Basic ? 0m : tier == SubscriptionTier.Pro ? 990000m : 2990000m, IsLifetime = false, Status = "ACTIVE", Features = limits.Select(item => new { item.Key, Code = item.Key, NameVi = FeatureName(item.Key), NameEn = item.Key, ValueType = "LIMIT", item.Value, Limit = item.Value }) };
    }
    internal static Dictionary<string, int> Limits(SubscriptionTier tier) => tier switch
    {
        SubscriptionTier.Basic => new() { ["MAX_PROPERTIES"] = 1, ["MAX_ROOMS"] = 30, ["MAX_ROOM_TYPES"] = 5, ["MAX_STAFF"] = 5, ["MAX_IMAGES"] = 30 },
        SubscriptionTier.Pro => new() { ["MAX_PROPERTIES"] = 1, ["MAX_ROOMS"] = 150, ["MAX_ROOM_TYPES"] = 20, ["MAX_STAFF"] = 30, ["MAX_IMAGES"] = 300, ["PROMOTION_CAMPAIGNS"] = 20 },
        _ => new() { ["MAX_PROPERTIES"] = -1, ["MAX_ROOMS"] = -1, ["MAX_ROOM_TYPES"] = -1, ["MAX_STAFF"] = -1, ["MAX_IMAGES"] = -1, ["PROMOTION_CAMPAIGNS"] = -1, ["SPONSORED_PLACEMENTS"] = -1 }
    };
    private static string FeatureName(string code) => code switch { "MAX_PROPERTIES" => "Số cơ sở", "MAX_ROOMS" => "Số phòng", "MAX_ROOM_TYPES" => "Loại phòng", "MAX_STAFF" => "Nhân viên", "MAX_IMAGES" => "Hình ảnh", "PROMOTION_CAMPAIGNS" => "Chiến dịch khuyến mãi", "SPONSORED_PLACEMENTS" => "Vị trí tài trợ", _ => code };
}

[ApiController]
[Route("api/admin/subscription-plans")]
[Authorize]
public sealed class AdminSubscriptionPlansController(IApplicationDbContext context) : ControllerBase
{
    private static readonly HashSet<string> AllowedFeatures = new(StringComparer.OrdinalIgnoreCase) { "MAX_IMAGES", "MAX_PROPERTIES", "MAX_ROOMS", "MAX_ROOM_TYPES", "MAX_STAFF", "PROMOTION_CAMPAIGNS", "SPONSORED_PLACEMENTS" };
    [HttpGet]
    [Authorize(Policy = "platform_billing.read")]
    public async Task<ActionResult<IReadOnlyList<object>>> List()
    {
        var plans = await context.SubscriptionPlans.AsNoTracking().Include(item => item.Features).Where(item => !item.IsDeleted).OrderBy(item => item.Price).ToListAsync();
        return Ok(plans.Select(SubscriptionsController.PlanResponse).ToList());
    }
    [HttpPost]
    [Authorize(Policy = "platform_billing.create")]
    public async Task<ActionResult<object>> Create([FromBody] SaveSubscriptionPlanRequest request)
    {
        var error = Validate(request, out var code);
        if (error is not null) return BadRequest(new { message = error });
        if (await context.SubscriptionPlans.AnyAsync(item => item.Code == code)) return Conflict(new { message = "Mã gói đã tồn tại." });
        var plan = new SubscriptionPlan(); Apply(plan, request, code);
        context.SubscriptionPlans.Add(plan); await context.SaveChangesAsync();
        return Ok(SubscriptionsController.PlanResponse(plan));
    }
    [HttpPut("{id:guid}")]
    [Authorize(Policy = "platform_billing.update")]
    public async Task<ActionResult<object>> Update(Guid id, [FromBody] SaveSubscriptionPlanRequest request)
    {
        var plan = await context.SubscriptionPlans.Include(item => item.Features).FirstOrDefaultAsync(item => item.Id == id && !item.IsDeleted);
        if (plan is null) return NotFound(new { message = "Không tìm thấy gói dịch vụ." });
        var error = Validate(request, out var code); if (error is not null) return BadRequest(new { message = error });
        if (await context.SubscriptionPlans.AnyAsync(item => item.Id != id && item.Code == code)) return Conflict(new { message = "Mã gói đã tồn tại." });
        context.SubscriptionPlanFeatures.RemoveRange(plan.Features); plan.Features.Clear(); Apply(plan, request, code);
        await context.SaveChangesAsync(); return Ok(SubscriptionsController.PlanResponse(plan));
    }
    [HttpPut("{id:guid}/status")]
    [Authorize(Policy = "platform_billing.update")]
    public async Task<ActionResult<object>> Status(Guid id, [FromQuery] string value)
    {
        var plan = await context.SubscriptionPlans.Include(item => item.Features).FirstOrDefaultAsync(item => item.Id == id && !item.IsDeleted);
        if (plan is null) return NotFound(new { message = "Không tìm thấy gói dịch vụ." });
        var normalized = value?.Trim().ToUpperInvariant(); if (normalized is not ("ACTIVE" or "INACTIVE")) return BadRequest(new { message = "Trạng thái gói không hợp lệ." });
        plan.IsActive = normalized == "ACTIVE"; await context.SaveChangesAsync(); return Ok(SubscriptionsController.PlanResponse(plan));
    }
    private static string? Validate(SaveSubscriptionPlanRequest request, out string code)
    {
        code = request.Code?.Trim().ToUpperInvariant() ?? string.Empty;
        if (code.Length is < 2 or > 50 || !code.All(ch => char.IsAsciiLetterOrDigit(ch) || ch == '_')) return "Mã gói không hợp lệ.";
        if (string.IsNullOrWhiteSpace(request.NameVi) || request.NameVi.Trim().Length > 255) return "Tên gói không hợp lệ.";
        if (request.Price < 0) return "Giá gói không thể âm.";
        if (request.BillingType?.Trim().ToUpperInvariant() is not ("MONTHLY" or "YEARLY" or "ONCE")) return "Chu kỳ thanh toán không hợp lệ.";
        if (request.Features is null || request.Features.Any(item => !AllowedFeatures.Contains(item.Code) || item.Limit < -1)) return "Quyền lợi gói không hợp lệ.";
        if (request.Features.GroupBy(item => item.Code, StringComparer.OrdinalIgnoreCase).Any(group => group.Count() > 1)) return "Quyền lợi gói bị trùng.";
        return null;
    }
    private static void Apply(SubscriptionPlan plan, SaveSubscriptionPlanRequest request, string code)
    {
        plan.Code = code; plan.NameVi = request.NameVi.Trim(); plan.NameEn = request.NameEn?.Trim() ?? string.Empty;
        plan.BillingType = request.BillingType.Trim().ToUpperInvariant(); plan.Price = request.Price; plan.IsLifetime = request.IsLifetime || plan.BillingType == "ONCE";
        foreach (var feature in request.Features) plan.Features.Add(new SubscriptionPlanFeature { Code = feature.Code.Trim().ToUpperInvariant(), Limit = feature.Limit });
    }
}

public sealed record SaveSubscriptionPlanRequest(string Code, string NameVi, string? NameEn, string BillingType, decimal Price, bool IsLifetime, IReadOnlyList<SaveSubscriptionFeatureRequest> Features);
public sealed record SaveSubscriptionFeatureRequest(string Code, int Limit);
