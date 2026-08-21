using System.Security.Claims;
using System.Text.Json;
using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/platform")]
[Authorize]
public sealed class PlatformBillingController(IApplicationDbContext context) : ControllerBase
{
    [HttpGet("subscription-plans")]
    [Authorize(Policy = "platform_billing.read")]
    public async Task<ActionResult<IReadOnlyList<object>>> Catalog()
    {
        var plans = await context.SubscriptionPlans.AsNoTracking().Include(item => item.Features)
            .Where(item => item.IsActive && !item.IsDeleted).OrderBy(item => item.Price).ToListAsync();
        return Ok(plans.Select(PlatformPlan).ToList());
    }

    [HttpPost("subscription-orders")]
    [Authorize(Policy = "platform_billing.create")]
    public Task<ActionResult<object>> Purchase([FromBody] PurchaseOrderRequest request) => CreateOrder(request.TargetHotelId, request.PlanId, "PURCHASE");

    [HttpPost("subscriptions/{tenantId:guid}/renewal-orders")]
    [Authorize(Policy = "platform_billing.create")]
    public async Task<ActionResult<object>> Renew(Guid tenantId)
    {
        var tenant = await AuthorizedTenant(tenantId); if (tenant is null) return Forbid();
        if (!tenant.ActiveSubscriptionPlanId.HasValue) return Conflict(new { message = "Cơ sở chưa có gói nền tảng để gia hạn." });
        return await CreateOrder(tenantId, tenant.ActiveSubscriptionPlanId.Value, "RENEW");
    }

    [HttpPost("subscriptions/{tenantId:guid}/upgrade-orders")]
    [Authorize(Policy = "platform_billing.create")]
    public Task<ActionResult<object>> Upgrade(Guid tenantId, [FromBody] ChangePlanRequest request) => CreateOrder(tenantId, request.TargetPlanId, "UPGRADE");

    [HttpPost("subscriptions/{tenantId:guid}/downgrade-orders")]
    [Authorize(Policy = "platform_billing.create")]
    public ActionResult Downgrade(Guid tenantId) => Conflict(new { message = "Chính sách hạ gói và hoàn tiền chênh lệch chưa được cấu hình." });

    [HttpGet("subscriptions/{tenantId:guid}/entitlement")]
    [Authorize(Policy = "platform_billing.read")]
    public async Task<ActionResult<object>> Entitlement(Guid tenantId)
    {
        var tenant = await AuthorizedTenant(tenantId); if (tenant is null) return Forbid();
        if (tenant.ActiveSubscriptionPlanId.HasValue)
        {
            var plan = await context.SubscriptionPlans.AsNoTracking().Include(item => item.Features).FirstOrDefaultAsync(item => item.Id == tenant.ActiveSubscriptionPlanId && !item.IsDeleted);
            if (plan is not null) return Ok(new { TargetHotelId = tenant.Id, Source = "PLATFORM", PlatformAuthoritative = true, PlanId = (Guid?)plan.Id, plan.Code, PlanName = plan.NameVi, Status = tenant.Status == TenantStatus.Active ? "ACTIVE" : "INACTIVE", EffectiveFrom = tenant.SubscriptionEffectiveFromUtc, EffectiveUntil = tenant.SubscriptionEffectiveUntilUtc, Lifetime = plan.IsLifetime, Limits = plan.Features.ToDictionary(item => item.Code, item => item.Limit), SourceReference = plan.Id.ToString(), MigrationBlocker = (string?)null });
        }
        return Ok(new { TargetHotelId = tenant.Id, Source = "LEGACY_PROJECTION", PlatformAuthoritative = false, PlanId = (Guid?)null, PlanCode = tenant.SubscriptionTier.ToString().ToUpperInvariant(), PlanName = tenant.SubscriptionTier.ToString(), Status = tenant.Status == TenantStatus.Active ? "ACTIVE" : "INACTIVE", EffectiveFrom = (DateTime?)tenant.CreatedAtUtc, EffectiveUntil = (DateTime?)null, Lifetime = tenant.SubscriptionTier == SubscriptionTier.Enterprise, Limits = SubscriptionsController.Limits(tenant.SubscriptionTier), SourceReference = (string?)null, MigrationBlocker = "LEGACY_SUBSCRIPTION_NOT_MIGRATED" });
    }

    [HttpGet("subscriptions/{tenantId:guid}/history")]
    [Authorize(Policy = "platform_billing.read")]
    public async Task<ActionResult<IReadOnlyList<object>>> History(Guid tenantId)
    {
        if (await AuthorizedTenant(tenantId) is null) return Forbid();
        return Ok(await context.PlatformSubscriptionHistories.AsNoTracking().Where(item => item.TenantId == tenantId && !item.IsDeleted).OrderByDescending(item => item.CreatedAtUtc)
            .Select(item => new { item.Id, item.OrderPublicId, ContractPublicId = (string?)null, TransactionPublicId = (string?)null, item.ActionType, item.PreviousStateJson, item.NewStateJson, item.ActorType, item.ActorId, item.Reason, OccurredAt = item.CreatedAtUtc }).ToListAsync());
    }

    [HttpGet("subscription-orders/{publicId}")]
    [Authorize(Policy = "platform_billing.read")]
    public async Task<ActionResult<object>> GetOrder(string publicId)
    {
        var order = await context.PlatformSubscriptionOrders.AsNoTracking().Include(item => item.Attempts).FirstOrDefaultAsync(item => item.PublicId == publicId && !item.IsDeleted);
        if (order is null) return NotFound(new { message = "Không tìm thấy đơn đăng ký gói." });
        if (!CanAccess(order.TenantId, order.OwnerUserId)) return Forbid();
        Expire(order);
        return Ok(OrderDetails(order));
    }

    [HttpPost("subscription-orders/{publicId}/payment-attempts")]
    [Authorize(Policy = "platform_billing.execute")]
    public async Task<ActionResult<object>> CreateAttempt(string publicId, [FromBody] CreatePlatformAttemptRequest request)
    {
        var order = await context.PlatformSubscriptionOrders.Include(item => item.Attempts).FirstOrDefaultAsync(item => item.PublicId == publicId && !item.IsDeleted);
        if (order is null) return NotFound(new { message = "Không tìm thấy đơn đăng ký gói." });
        if (!CanAccess(order.TenantId, order.OwnerUserId)) return Forbid();
        Expire(order); if (order.Status is "EXPIRED" or "CANCELLED" or "APPLIED") return Conflict(new { message = "Đơn không còn nhận thanh toán." });
        var provider = request.Provider?.Trim().ToUpperInvariant() ?? string.Empty;
        if (provider is not ("SIMULATOR" or "MOMO" or "VNPAY" or "ZALOPAY") || request.Method?.Trim().ToUpperInvariant() != provider)
            return BadRequest(new { message = "Provider hoặc phương thức thanh toán không hợp lệ." });
        var configurations = await context.PlatformPaymentConfigurations.AsNoTracking()
            .Where(item => item.Provider == provider && !item.IsDeleted)
            .OrderByDescending(item => item.Environment == "PRODUCTION")
            .ThenByDescending(item => item.Environment == "SANDBOX")
            .ToListAsync();
        var configuration = configurations.FirstOrDefault(item => PaymentBlockers(item).Count == 0) ?? configurations.FirstOrDefault();
        configuration ??= provider == "SIMULATOR"
            ? new PlatformPaymentConfiguration { Provider = "SIMULATOR", Environment = "SIMULATOR", Enabled = true }
            : null;
        if (configuration is null)
            return Conflict(new { code = "PAYMENT_CONFIGURATION_MISSING", message = "Provider thanh toán chưa được cấu hình." });
        var blockers = PaymentBlockers(configuration);
        if (blockers.Count > 0)
            return Conflict(new { code = "PAYMENT_NOT_READY", message = "Cấu hình thanh toán chưa sẵn sàng.", blockers });
        var key = IdempotencyKey(); if (key is null) return BadRequest(new { message = "Thiếu Idempotency-Key." });
        var existing = order.Attempts.FirstOrDefault(item => item.IdempotencyKey == key);
        if (existing is not null) return Ok(AttemptResponse(existing, true));
        var attempt = new PlatformPaymentAttempt { PlatformSubscriptionOrderId = order.Id, PlatformSubscriptionOrder = order, PublicId = $"pat_{Guid.NewGuid():N}", Provider = provider, Method = provider, Environment = configuration.Environment, ExpectedAmount = order.Price, Currency = order.Currency, ProviderOrderReference = $"{provider}-{DateTime.UtcNow:yyyyMMddHHmmss}-{Guid.NewGuid():N}"[..Math.Min(39, provider.Length + 1 + 14 + 1 + 32)], ExpiresAtUtc = Min(order.ExpiresAtUtc, DateTime.UtcNow.AddMinutes(15)), IdempotencyKey = key, Status = "PENDING" };
        order.Status = "PENDING_PAYMENT"; context.PlatformPaymentAttempts.Add(attempt); await context.SaveChangesAsync();
        return Ok(AttemptResponse(attempt, false));
    }

    [HttpPost("subscription-orders/{publicId}/cancel")]
    [Authorize(Policy = "platform_billing.update")]
    public async Task<ActionResult<object>> Cancel(string publicId)
    {
        var order = await context.PlatformSubscriptionOrders.Include(item => item.Attempts).FirstOrDefaultAsync(item => item.PublicId == publicId && !item.IsDeleted);
        if (order is null) return NotFound(new { message = "Không tìm thấy đơn đăng ký gói." });
        if (!CanAccess(order.TenantId, order.OwnerUserId)) return Forbid();
        if (order.Status == "CANCELLED") return Ok(OrderDetails(order));
        if (order.Status is "PAID" or "APPLIED") return Conflict(new { message = "Không thể hủy đơn đã thanh toán hoặc kích hoạt." });
        order.Status = "CANCELLED"; foreach (var attempt in order.Attempts.Where(item => item.Status is "CREATED" or "PENDING")) attempt.Status = "CANCELLED";
        await context.SaveChangesAsync(); return Ok(OrderDetails(order));
    }

    [HttpGet("subscription-policies")]
    [Authorize(Policy = "platform_billing.read")]
    public ActionResult<object> Policies() => Ok(new { DowngradeConfigured = false, ProrationConfigured = false, ErrorCode = "POLICY_NOT_CONFIGURED", DowngradeMessage = "Chưa cấu hình chính sách hạ gói.", ProrationMessage = "Chưa cấu hình chính sách tính phần chênh lệch." });

    [HttpGet("payment-configuration")]
    [Authorize(Policy = "payment_readiness.read")]
    public async Task<ActionResult<IReadOnlyList<object>>> PaymentConfigurations()
    {
        var rows = await context.PlatformPaymentConfigurations.AsNoTracking().Where(item => !item.IsDeleted)
            .OrderBy(item => item.Provider).ThenBy(item => item.Environment).ToListAsync();
        return Ok(rows.Count == 0
            ? new[] { PaymentConfigurationResponse(new PlatformPaymentConfiguration()) }
            : rows.Select(PaymentConfigurationResponse).ToList());
    }

    [HttpGet("payment-configuration/{provider}/{environment}")]
    [Authorize(Policy = "payment_readiness.read")]
    public async Task<ActionResult<object>> PaymentConfiguration(string provider, string environment)
    {
        var normalized = NormalizeConfigurationKey(provider, environment);
        if (normalized is null) return BadRequest(new { message = "Provider hoặc môi trường thanh toán không hợp lệ." });
        var row = await context.PlatformPaymentConfigurations.AsNoTracking().FirstOrDefaultAsync(item =>
            item.Provider == normalized.Value.Provider && item.Environment == normalized.Value.Environment && !item.IsDeleted);
        return row is null ? NotFound(new { message = "Chưa cấu hình merchant cho provider và môi trường này." }) : Ok(PaymentConfigurationResponse(row));
    }

    [HttpPut("payment-configuration")]
    [Authorize(Policy = "payment_readiness.update")]
    public async Task<ActionResult<object>> ConfigurePayment([FromBody] SavePlatformPaymentConfigurationRequest request)
    {
        var normalized = NormalizeConfigurationKey(request.Provider, request.Environment);
        if (normalized is null || request.CallbackUrl?.Trim().Length > 1000 || request.BankName?.Trim().Length > 200 || request.BankAccountMasked?.Trim().Length > 100)
            return BadRequest(new { message = "Cấu hình merchant không hợp lệ." });
        var callback = Clean(request.CallbackUrl);
        if (callback != null && (!Uri.TryCreate(callback, UriKind.Absolute, out var callbackUri) || callbackUri.Scheme is not ("https" or "http")))
            return BadRequest(new { message = "Callback URL phải là địa chỉ HTTP(S) tuyệt đối." });
        var row = await context.PlatformPaymentConfigurations.FirstOrDefaultAsync(item =>
            item.Provider == normalized.Value.Provider && item.Environment == normalized.Value.Environment && !item.IsDeleted);
        if (row is null)
        {
            row = new PlatformPaymentConfiguration { Provider = normalized.Value.Provider, Environment = normalized.Value.Environment };
            context.PlatformPaymentConfigurations.Add(row);
        }
        row.Enabled = request.Enabled;
        row.BankName = Clean(request.BankName);
        row.BankAccountMasked = Clean(request.BankAccountMasked);
        row.CallbackUrl = callback;
        var secretReference = Clean(request.SecretReference);
        if (secretReference != null) row.SecretReference = secretReference;
        if (row.Environment == "PRODUCTION")
        {
            row.ProductionApproved = false;
            row.ProductionApprovedByUserId = null;
            row.ProductionApprovedAtUtc = null;
        }
        row.UpdatedAtUtc = DateTime.UtcNow;
        await context.SaveChangesAsync();
        return Ok(PaymentConfigurationResponse(row));
    }

    [HttpPost("payment-configuration/validate")]
    [Authorize(Policy = "payment_readiness.execute")]
    public async Task<ActionResult<object>> ValidatePaymentConfiguration([FromQuery] string provider)
    {
        var normalizedProvider = provider?.Trim().ToUpperInvariant();
        if (normalizedProvider is not ("SIMULATOR" or "MOMO" or "VNPAY" or "ZALOPAY"))
            return BadRequest(new { message = "Provider thanh toán không được hỗ trợ." });
        var row = await context.PlatformPaymentConfigurations.AsNoTracking().Where(item =>
                item.Provider == normalizedProvider && !item.IsDeleted)
            .OrderByDescending(item => item.Environment == "PRODUCTION").ThenByDescending(item => item.UpdatedAtUtc)
            .FirstOrDefaultAsync();
        row ??= new PlatformPaymentConfiguration { Provider = normalizedProvider, Environment = "SIMULATOR" };
        var blockers = PaymentBlockers(row);
        return Ok(new { Ready = blockers.Count == 0, Mode = row.Environment, row.Provider, MaskedMerchant = Mask(row.SecretReference), Blockers = blockers });
    }

    [HttpPost("payment-configuration/{provider}/{environment}/approve")]
    [Authorize(Policy = "payment_readiness.approve")]
    public async Task<ActionResult<object>> ApprovePaymentConfiguration(string provider, string environment)
    {
        var normalized = NormalizeConfigurationKey(provider, environment);
        if (normalized is null || normalized.Value.Environment != "PRODUCTION")
            return BadRequest(new { message = "Chỉ cấu hình production mới cần phê duyệt." });
        var row = await context.PlatformPaymentConfigurations.FirstOrDefaultAsync(item =>
            item.Provider == normalized.Value.Provider && item.Environment == normalized.Value.Environment && !item.IsDeleted);
        if (row is null) return NotFound(new { message = "Không tìm thấy cấu hình production." });
        if (!row.Enabled || string.IsNullOrWhiteSpace(row.SecretReference) || string.IsNullOrWhiteSpace(row.CallbackUrl))
            return Conflict(new { code = "PRODUCTION_CONFIGURATION_INCOMPLETE", message = "Production cần được bật, có secret reference và callback URL trước khi duyệt." });
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var approverId)) return Forbid();
        row.ProductionApproved = true;
        row.ProductionApprovedByUserId = approverId;
        row.ProductionApprovedAtUtc = DateTime.UtcNow;
        row.UpdatedAtUtc = DateTime.UtcNow;
        await context.SaveChangesAsync();
        return Ok(PaymentConfigurationResponse(row));
    }

    private async Task<ActionResult<object>> CreateOrder(Guid tenantId, Guid planId, string operation)
    {
        var tenant = await AuthorizedTenant(tenantId); if (tenant is null) return Forbid();
        var plan = await context.SubscriptionPlans.AsNoTracking().Include(item => item.Features).FirstOrDefaultAsync(item => item.Id == planId && item.IsActive && !item.IsDeleted);
        if (plan is null) return NotFound(new { message = "Gói dịch vụ không tồn tại hoặc đã ngừng bán." });
        var key = IdempotencyKey(); if (key is null) return BadRequest(new { message = "Thiếu Idempotency-Key." });
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Unauthorized();
        var existing = await context.PlatformSubscriptionOrders.AsNoTracking().FirstOrDefaultAsync(item => item.OwnerUserId == userId && item.IdempotencyKey == key);
        if (existing is not null)
        {
            if (existing.TenantId != tenantId || existing.SubscriptionPlanId != planId || existing.Operation != operation) return Conflict(new { message = "Idempotency-Key đã được dùng cho yêu cầu khác." });
            return Ok(OrderResponse(existing, true));
        }
        var order = new PlatformSubscriptionOrder { PublicId = $"sub_{Guid.NewGuid():N}", OrderCode = $"SUB-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid():N}"[..25].ToUpperInvariant(), OwnerUserId = userId, TenantId = tenantId, SubscriptionPlanId = plan.Id, Operation = operation, PlanVersion = $"PLAN-{plan.Id}-V1", PlanCode = plan.Code, PlanName = plan.NameVi, Price = plan.Price, BillingPeriod = plan.BillingType, DurationValue = 1, DurationUnit = plan.IsLifetime ? "LIFETIME" : plan.BillingType == "YEARLY" ? "YEAR" : "MONTH", FeatureSnapshotJson = JsonSerializer.Serialize(plan.Features.ToDictionary(item => item.Code, item => item.Limit)), ExpiresAtUtc = DateTime.UtcNow.AddMinutes(30), IdempotencyKey = key };
        context.PlatformSubscriptionOrders.Add(order); await context.SaveChangesAsync(); return Ok(OrderResponse(order, false));
    }

    private async Task<Tenant?> AuthorizedTenant(Guid id)
    {
        if (!User.IsInRole("SuperAdmin") && (!Guid.TryParse(User.FindFirstValue("tenant_id"), out var claimTenant) || claimTenant != id)) return null;
        return await context.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(item => item.Id == id && !item.IsDeleted);
    }
    private bool CanAccess(Guid tenantId, Guid ownerId) => User.IsInRole("SuperAdmin") || (Guid.TryParse(User.FindFirstValue("tenant_id"), out var claimTenant) && claimTenant == tenantId && Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId) && userId == ownerId);
    private string? IdempotencyKey() { var value = Request.Headers["Idempotency-Key"].FirstOrDefault()?.Trim(); return value is { Length: >= 8 and <= 200 } ? value : null; }
    private static void Expire(PlatformSubscriptionOrder order) { if (order.ExpiresAtUtc <= DateTime.UtcNow && order.Status is "CREATED" or "PENDING_PAYMENT") order.Status = "EXPIRED"; }
    private static DateTime Min(DateTime left, DateTime right) => left < right ? left : right;
    private static (string Provider, string Environment)? NormalizeConfigurationKey(string? provider, string? environment)
    {
        var normalizedProvider = provider?.Trim().ToUpperInvariant();
        var normalizedEnvironment = environment?.Trim().ToUpperInvariant();
        return normalizedProvider is ("SIMULATOR" or "MOMO" or "VNPAY" or "ZALOPAY") && normalizedEnvironment is ("SIMULATOR" or "SANDBOX" or "PRODUCTION")
            ? (normalizedProvider, normalizedEnvironment) : null;
    }
    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static string? Mask(string? value) => string.IsNullOrWhiteSpace(value) ? null : $"****{value.Trim()[Math.Max(0, value.Trim().Length - 4)..]}";
    private static List<string> PaymentBlockers(PlatformPaymentConfiguration item)
    {
        var blockers = new List<string>();
        if (!item.Enabled) blockers.Add("CONFIGURATION_DISABLED");
        if (item.Environment != "SIMULATOR" && string.IsNullOrWhiteSpace(item.SecretReference)) blockers.Add("SECRET_REFERENCE_MISSING");
        if (item.Environment == "PRODUCTION" && !item.ProductionApproved) blockers.Add("PRODUCTION_NOT_APPROVED");
        return blockers;
    }
    private static object PaymentConfigurationResponse(PlatformPaymentConfiguration item)
    {
        var blockers = PaymentBlockers(item);
        return new { item.Id, item.Provider, item.Environment, item.Enabled, MerchantReferenceMasked = Mask(item.SecretReference), SecretConfigured = !string.IsNullOrWhiteSpace(item.SecretReference), item.BankName, item.BankAccountMasked, item.CallbackUrl, item.ProductionApproved, item.ProductionApprovedByUserId, item.ProductionApprovedAtUtc, Ready = blockers.Count == 0, Blockers = blockers };
    }
    private static object PlatformPlan(SubscriptionPlan plan) => new { plan.Id, plan.Code, plan.NameVi, plan.NameEn, plan.BillingType, plan.Price, Currency = "VND", plan.IsLifetime, Status = plan.IsActive ? "ACTIVE" : "INACTIVE", Features = plan.Features.Select(item => new { item.Code, NameVi = item.Code, NameEn = item.Code, ValueType = "LIMIT", item.Limit }) };
    private static object OrderResponse(PlatformSubscriptionOrder item, bool replayed) => new { item.Id, item.PublicId, item.OrderCode, item.OwnerUserId, TargetHotelId = item.TenantId, Operation = item.Operation, PlanId = item.SubscriptionPlanId, item.PlanVersion, item.PlanCode, item.PlanName, item.Price, item.Currency, item.BillingPeriod, item.DurationValue, item.DurationUnit, item.FeatureSnapshotJson, item.Status, ExpiresAt = item.ExpiresAtUtc, item.AppliedAtUtc, Replayed = replayed };
    private static object OrderDetails(PlatformSubscriptionOrder item) => new { item.Id, item.PublicId, item.OrderCode, item.OwnerUserId, TargetHotelId = item.TenantId, Operation = item.Operation, PlanId = item.SubscriptionPlanId, item.PlanVersion, item.PlanCode, item.PlanName, item.Price, item.Currency, item.BillingPeriod, item.DurationValue, item.DurationUnit, item.FeatureSnapshotJson, item.Status, ExpiresAt = item.ExpiresAtUtc, AppliedAt = item.AppliedAtUtc, Replayed = false, Attempts = item.Attempts.OrderBy(attempt => attempt.CreatedAtUtc).Select(attempt => AttemptResponse(attempt, false)) };
    internal static object AttemptResponse(PlatformPaymentAttempt item, bool replayed) => new { item.PublicId, OrderPublicId = item.PlatformSubscriptionOrder?.PublicId, item.Status, item.Provider, item.Method, item.Environment, item.ExpectedAmount, item.Currency, item.ProviderOrderReference, ExpiresAt = item.ExpiresAtUtc, CompletedAt = item.CompletedAtUtc, MerchantReferenceMasked = Mask(item.Provider), Replayed = replayed, RedirectUrl = (string?)null };
}

public record SavePlatformPaymentConfigurationRequest(string Provider, string Environment, bool Enabled,
    string? SecretReference, string? BankName, string? BankAccountMasked, string? CallbackUrl);

[ApiController]
[Route("api/financial-simulator/platform-orders")]
[Authorize(Policy = "platform_billing.execute")]
public sealed class PlatformFinancialSimulatorController(IApplicationDbContext context) : ControllerBase
{
    [HttpPost("{orderPublicId}/attempts/{attemptPublicId}/confirm")]
    public async Task<ActionResult> Confirm(string orderPublicId, string attemptPublicId)
    {
        var order = await context.PlatformSubscriptionOrders.Include(item => item.Attempts).FirstOrDefaultAsync(item => item.PublicId == orderPublicId && !item.IsDeleted);
        if (order is null) return NotFound(new { message = "Không tìm thấy đơn đăng ký gói." });
        if (!User.IsInRole("SuperAdmin") && (!Guid.TryParse(User.FindFirstValue("tenant_id"), out var tenantId) || tenantId != order.TenantId || !Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId) || userId != order.OwnerUserId)) return Forbid();
        var attempt = order.Attempts.FirstOrDefault(item => item.PublicId == attemptPublicId && item.Environment == "SIMULATOR");
        if (attempt is null) return NotFound(new { message = "Không tìm thấy lần thanh toán mô phỏng." });
        if (order.Status == "APPLIED" && attempt.Status == "SUCCESS") return Ok(new { order.PublicId, order.Status });
        if (order.ExpiresAtUtc <= DateTime.UtcNow || attempt.ExpiresAtUtc <= DateTime.UtcNow) return Conflict(new { message = "Đơn hoặc lần thanh toán đã hết hạn." });
        if (order.Status == "CANCELLED" || attempt.Status == "CANCELLED") return Conflict(new { message = "Đơn thanh toán đã bị hủy." });
        var tenant = await context.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(item => item.Id == order.TenantId && !item.IsDeleted);
        var plan = await context.SubscriptionPlans.Include(item => item.Features).FirstOrDefaultAsync(item => item.Id == order.SubscriptionPlanId && !item.IsDeleted);
        if (tenant is null || plan is null) return Conflict(new { message = "Cơ sở hoặc gói dịch vụ không còn hợp lệ." });
        var previous = JsonSerializer.Serialize(new { tenant.ActiveSubscriptionPlanId, tenant.SubscriptionEffectiveFromUtc, tenant.SubscriptionEffectiveUntilUtc });
        var now = DateTime.UtcNow; var baseDate = order.Operation == "RENEW" && tenant.SubscriptionEffectiveUntilUtc > now ? tenant.SubscriptionEffectiveUntilUtc.Value : now;
        tenant.ActiveSubscriptionPlanId = plan.Id; tenant.SubscriptionEffectiveFromUtc ??= now;
        tenant.SubscriptionEffectiveUntilUtc = plan.IsLifetime ? null : plan.BillingType == "YEARLY" ? baseDate.AddYears(1) : baseDate.AddMonths(1);
        tenant.SubscriptionTier = plan.Code.Contains("ENTERPRISE", StringComparison.OrdinalIgnoreCase) ? SubscriptionTier.Enterprise : plan.Code.Contains("PRO", StringComparison.OrdinalIgnoreCase) ? SubscriptionTier.Pro : SubscriptionTier.Basic;
        attempt.Status = "SUCCESS"; attempt.CompletedAtUtc = now; order.Status = "APPLIED"; order.AppliedAtUtc = now;
        context.PlatformSubscriptionHistories.Add(new PlatformSubscriptionHistory { TenantId = tenant.Id, OrderPublicId = order.PublicId, ActionType = order.Operation, PreviousStateJson = previous, NewStateJson = JsonSerializer.Serialize(new { tenant.ActiveSubscriptionPlanId, tenant.SubscriptionEffectiveFromUtc, tenant.SubscriptionEffectiveUntilUtc }), ActorId = order.OwnerUserId });
        try
        {
            await context.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            if (await context.PlatformSubscriptionHistories.AsNoTracking().AnyAsync(item => item.OrderPublicId == order.PublicId))
                return Ok(new { order.PublicId, Status = "APPLIED" });
            throw;
        }
        return Ok(new { order.PublicId, order.Status });
    }
}

public sealed record PurchaseOrderRequest(Guid TargetHotelId, Guid PlanId);
public sealed record ChangePlanRequest(Guid TargetPlanId);
public sealed record CreatePlatformAttemptRequest(string? Provider, string? Method);
