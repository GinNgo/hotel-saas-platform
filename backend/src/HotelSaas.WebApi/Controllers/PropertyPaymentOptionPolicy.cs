using HotelSaas.Domain.Entities;

namespace HotelSaas.WebApi.Controllers;

internal static class PropertyPaymentOptionPolicy
{
    private static readonly HashSet<string> BankMethods = ["MANUAL_TRANSFER", "QR_TRANSFER"];
    private static readonly HashSet<string> MerchantMethods = ["VNPAY", "MOMO", "ZALOPAY"];

    internal static IReadOnlyList<PublicPaymentOptionDto> Available(PropertyPaymentConfiguration? configuration)
    {
        if (configuration == null || !configuration.Enabled)
            return new List<PublicPaymentOptionDto> { Option("PAY_AT_HOTEL", "CASH") };

        return PropertyPaymentConfigurationsController.ReadMethods(configuration)
            .Where(method => method.Enabled && IsReady(configuration, method))
            .Select(method => Option(method.Method == "CASH" ? "PAY_AT_HOTEL" : method.Method,
                method.Provider ?? method.Method))
            .GroupBy(option => option.Code)
            .Select(group => group.First())
            .ToList();
    }

    internal static string? NormalizeRequestedCode(string? value) => value?.Trim().ToUpperInvariant() switch
    {
        "PAY_AT_HOTEL" or "CASH" => "PAY_AT_HOTEL",
        "BANK_TRANSFER" => "MANUAL_TRANSFER",
        "CREDIT_CARD" => "CARD_TERMINAL",
        "MANUAL_TRANSFER" or "QR_TRANSFER" or "VNPAY" or "MOMO" or "ZALOPAY" or "CARD_TERMINAL" or "OTHER" => value.Trim().ToUpperInvariant(),
        _ => null
    };

    internal static bool IsReady(PropertyPaymentConfiguration configuration, StoredPaymentMethod method)
    {
        if (configuration.Environment == "PRODUCTION") return false;
        if (BankMethods.Contains(method.Method))
            return !string.IsNullOrWhiteSpace(configuration.BankName) &&
                   !string.IsNullOrWhiteSpace(configuration.BankCode) &&
                   !string.IsNullOrWhiteSpace(configuration.AccountName) &&
                   !string.IsNullOrWhiteSpace(configuration.AccountNumber);
        if (MerchantMethods.Contains(method.Method) && configuration.Environment != "SIMULATOR")
            return !string.IsNullOrWhiteSpace(method.MerchantReference);
        return true;
    }

    private static PublicPaymentOptionDto Option(string code, string provider) =>
        new(code, provider, code != "PAY_AT_HOTEL");
}
