using System.Text.Json;
using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/management/properties/{propertyId:guid}/payment-configuration")]
[Authorize]
public class PropertyPaymentConfigurationsController : ControllerBase
{
    private static readonly HashSet<string> Environments = ["SIMULATOR", "SANDBOX", "PRODUCTION"];
    private static readonly HashSet<string> DepositPolicies = ["NONE", "FIXED", "PERCENTAGE"];
    private static readonly HashSet<string> Methods = ["MANUAL_TRANSFER", "QR_TRANSFER", "VNPAY", "MOMO", "ZALOPAY", "CASH", "CARD_TERMINAL", "OTHER"];
    private static readonly HashSet<string> BankMethods = ["MANUAL_TRANSFER", "QR_TRANSFER"];
    private static readonly HashSet<string> MerchantMethods = ["VNPAY", "MOMO", "ZALOPAY"];
    private readonly IApplicationDbContext _context;
    private readonly ICurrentTenantService _tenantService;

    public PropertyPaymentConfigurationsController(IApplicationDbContext context, ICurrentTenantService tenantService)
    {
        _context = context;
        _tenantService = tenantService;
    }

    [HttpGet]
    [Authorize(Policy = "payment_config.read")]
    public async Task<ActionResult<PropertyPaymentConfigurationDto>> Get(Guid propertyId)
    {
        if (!InScope(propertyId)) return NotFound(new { message = "Không tìm thấy cơ sở." });
        var configuration = await Find(propertyId) ?? Default(propertyId);
        return Ok(ToDto(configuration));
    }

    [HttpPut]
    [Authorize(Policy = "payment_config.update")]
    public async Task<ActionResult<PropertyPaymentConfigurationDto>> Update(Guid propertyId, [FromBody] PropertyPaymentConfigurationRequest request)
    {
        if (!InScope(propertyId)) return NotFound(new { message = "Không tìm thấy cơ sở." });
        var existing = await Find(propertyId);
        var validation = Validate(request, existing);
        if (validation.Blockers.Count > 0) return BadRequest(new { message = "Cấu hình thanh toán chưa hợp lệ.", fieldErrors = validation.Blockers.ToDictionary(item => item, item => item) });
        var configuration = existing ?? Default(propertyId);
        Apply(configuration, request);
        if (existing == null) _context.PropertyPaymentConfigurations.Add(configuration);
        await _context.SaveChangesAsync();
        return Ok(ToDto(configuration));
    }

    [HttpPost("validate")]
    [Authorize(Policy = "payment_config.execute")]
    public async Task<ActionResult<PropertyPaymentReadinessDto>> ValidateRequest(Guid propertyId, [FromBody] PropertyPaymentConfigurationRequest? request)
    {
        if (!InScope(propertyId)) return NotFound(new { message = "Không tìm thấy cơ sở." });
        var existing = await Find(propertyId);
        var effective = request ?? RequestFrom(existing ?? Default(propertyId));
        return Ok(Validate(effective, existing));
    }

    private PropertyPaymentReadinessDto Validate(PropertyPaymentConfigurationRequest request, PropertyPaymentConfiguration? existing)
    {
        var environment = request.Environment?.Trim().ToUpperInvariant() ?? string.Empty;
        var policy = request.DepositPolicyType?.Trim().ToUpperInvariant() ?? string.Empty;
        var blockers = new List<string>();
        if (!Environments.Contains(environment)) blockers.Add("environment_invalid");
        if (!DepositPolicies.Contains(policy)) blockers.Add("deposit_policy_invalid");
        if (request.PaymentExpiryMinutes is < 1 or > 10080) blockers.Add("payment_expiry_invalid");
        if (string.IsNullOrWhiteSpace(request.TransferTemplate) || !request.TransferTemplate.Contains("{paymentCode}")) blockers.Add("payment_code_placeholder_required");
        if (string.IsNullOrWhiteSpace(request.InstructionsVi) || string.IsNullOrWhiteSpace(request.InstructionsEn)) blockers.Add("bilingual_instructions_required");
        if (policy == "FIXED" && (!request.DepositValue.HasValue || request.DepositValue <= 0 || request.DepositValue != decimal.Truncate(request.DepositValue.Value))) blockers.Add("fixed_deposit_invalid");
        if (policy == "PERCENTAGE" && (!request.DepositValue.HasValue || request.DepositValue is < 1 or > 100 || request.DepositValue != decimal.Truncate(request.DepositValue.Value))) blockers.Add("percentage_deposit_invalid");
        var methods = (request.Methods ?? []).Where(item => Methods.Contains(item.Method?.Trim().ToUpperInvariant() ?? string.Empty))
            .GroupBy(item => item.Method!.Trim().ToUpperInvariant()).Select(group => group.Last()).ToList();
        var enabled = methods.Where(item => item.Enabled).ToList();
        if (enabled.Count == 0) blockers.Add("enabled_method_required");
        var accountNumber = Secret(request.AccountNumber, existing?.AccountNumber);
        if (enabled.Any(item => BankMethods.Contains(item.Method!.ToUpperInvariant())) &&
            (string.IsNullOrWhiteSpace(request.BankName) || string.IsNullOrWhiteSpace(request.BankCode) ||
             string.IsNullOrWhiteSpace(request.AccountName) || string.IsNullOrWhiteSpace(accountNumber))) blockers.Add("bank_receiver_incomplete");
        var methodReadiness = methods.Select(item =>
        {
            var code = item.Method!.Trim().ToUpperInvariant();
            var itemBlockers = new List<string>();
            if (item.Enabled && environment != "SIMULATOR" && MerchantMethods.Contains(code) && string.IsNullOrWhiteSpace(Secret(item.MerchantReference, ExistingMerchant(existing, code))))
                itemBlockers.Add("merchant_reference_required");
            if (item.Enabled && environment == "PRODUCTION") itemBlockers.Add("production_not_approved");
            return new PropertyPaymentMethodReadinessDto(code, item.Provider?.Trim(), item.Enabled && itemBlockers.Count == 0, itemBlockers);
        }).ToList();
        blockers.AddRange(methodReadiness.SelectMany(item => item.Blockers.Select(blocker => $"{item.Method.ToLowerInvariant()}.{blocker}")));
        return new(blockers.Count == 0 && request.Enabled, environment, blockers.Distinct().ToList(), methodReadiness);
    }

    private void Apply(PropertyPaymentConfiguration entity, PropertyPaymentConfigurationRequest request)
    {
        entity.Enabled = request.Enabled; entity.Environment = request.Environment!.Trim().ToUpperInvariant();
        entity.BankName = Trim(request.BankName); entity.BankCode = Trim(request.BankCode); entity.AccountName = Trim(request.AccountName);
        entity.AccountNumber = Secret(request.AccountNumber, entity.AccountNumber); entity.DepositPolicyType = request.DepositPolicyType!.Trim().ToUpperInvariant();
        entity.DepositValue = entity.DepositPolicyType == "NONE" ? null : request.DepositValue; entity.PaymentExpiryMinutes = request.PaymentExpiryMinutes;
        entity.TransferTemplate = request.TransferTemplate!.Trim(); entity.QrProvider = Trim(request.QrProvider);
        entity.InstructionsVi = Trim(request.InstructionsVi); entity.InstructionsEn = Trim(request.InstructionsEn);
        var existing = ReadMethods(entity);
        entity.MethodsJson = JsonSerializer.Serialize((request.Methods ?? []).Select(item => new StoredPaymentMethod(
            item.Method!.Trim().ToUpperInvariant(), item.Enabled, Trim(item.Provider),
            Secret(item.MerchantReference, existing.FirstOrDefault(value => value.Method == item.Method.Trim().ToUpperInvariant())?.MerchantReference))).ToList());
        entity.Version++;
    }

    private PropertyPaymentConfigurationDto ToDto(PropertyPaymentConfiguration entity)
    {
        var methods = ReadMethods(entity).Select(item => new PropertyPaymentMethodDto(item.Method, item.Enabled, item.Provider, Mask(item.MerchantReference))).ToList();
        var request = RequestFrom(entity);
        return new(entity.Id, entity.TenantId, entity.Enabled, entity.Environment, entity.BankName, entity.BankCode,
            entity.AccountName, Mask(entity.AccountNumber), entity.DepositPolicyType, entity.DepositValue,
            entity.PaymentExpiryMinutes, entity.TransferTemplate, entity.QrProvider, entity.InstructionsVi,
            entity.InstructionsEn, entity.Version, methods, Validate(request, entity));
    }

    private async Task<PropertyPaymentConfiguration?> Find(Guid propertyId) => await _context.PropertyPaymentConfigurations.FirstOrDefaultAsync(item => item.TenantId == propertyId && !item.IsDeleted);
    private bool InScope(Guid propertyId) => _tenantService.TenantId == propertyId;
    private static PropertyPaymentConfiguration Default(Guid tenantId) => new() { TenantId = tenantId, MethodsJson = JsonSerializer.Serialize(new[] { new StoredPaymentMethod("CASH", true, "CASH", null) }) };
    internal static List<StoredPaymentMethod> ReadMethods(PropertyPaymentConfiguration entity) { try { return JsonSerializer.Deserialize<List<StoredPaymentMethod>>(entity.MethodsJson) ?? []; } catch { return []; } }
    private static PropertyPaymentConfigurationRequest RequestFrom(PropertyPaymentConfiguration entity) => new(entity.Enabled, entity.Environment,
        ReadMethods(entity).Select(item => new PropertyPaymentMethodRequest(item.Method, item.Enabled, item.Provider, item.MerchantReference)).ToList(),
        entity.BankName, entity.BankCode, entity.AccountName, null, entity.DepositPolicyType, entity.DepositValue,
        entity.PaymentExpiryMinutes, entity.TransferTemplate, entity.QrProvider, entity.InstructionsVi, entity.InstructionsEn);
    private static string? ExistingMerchant(PropertyPaymentConfiguration? entity, string method) => entity == null ? null : ReadMethods(entity).FirstOrDefault(item => item.Method == method)?.MerchantReference;
    private static string? Secret(string? incoming, string? existing) => string.IsNullOrWhiteSpace(incoming) || incoming.Contains('*') ? existing : incoming.Trim();
    private static string? Trim(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static string? Mask(string? value) => string.IsNullOrWhiteSpace(value) ? null : $"****{value[^Math.Min(4, value.Length)..]}";
}

public record StoredPaymentMethod(string Method, bool Enabled, string? Provider, string? MerchantReference);
public record PropertyPaymentMethodRequest(string? Method, bool Enabled, string? Provider, string? MerchantReference);
public record PropertyPaymentConfigurationRequest(bool Enabled, string? Environment, IReadOnlyList<PropertyPaymentMethodRequest>? Methods,
    string? BankName, string? BankCode, string? AccountName, string? AccountNumber, string? DepositPolicyType,
    decimal? DepositValue, int PaymentExpiryMinutes, string? TransferTemplate, string? QrProvider,
    string? InstructionsVi, string? InstructionsEn);
public record PropertyPaymentMethodDto(string Method, bool Enabled, string? Provider, string? MerchantReferenceMasked);
public record PropertyPaymentMethodReadinessDto(string Method, string? Provider, bool Ready, List<string> Blockers);
public record PropertyPaymentReadinessDto(bool Ready, string Environment, List<string> Blockers, List<PropertyPaymentMethodReadinessDto> Methods);
public record PropertyPaymentConfigurationDto(Guid Id, Guid PropertyId, bool Enabled, string Environment, string? BankName,
    string? BankCode, string? AccountName, string? AccountNumberMasked, string DepositPolicyType, decimal? DepositValue,
    int PaymentExpiryMinutes, string TransferTemplate, string? QrProvider, string? InstructionsVi, string? InstructionsEn,
    int Version, List<PropertyPaymentMethodDto> Methods, PropertyPaymentReadinessDto Readiness);
