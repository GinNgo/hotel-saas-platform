using System.Globalization;
using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace HotelSaas.Infrastructure.Services;

public class PasswordHasher : IPasswordHasher
{
    public string HashPassword(string password) => BCrypt.Net.BCrypt.HashPassword(password, 11);
    public bool VerifyPassword(string password, string passwordHash)
    {
        try { return BCrypt.Net.BCrypt.Verify(password, passwordHash); }
        catch { return false; }
    }
}

public class JwtTokenGenerator : IJwtTokenGenerator
{
    private readonly IConfiguration _configuration;

    public JwtTokenGenerator(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public string GenerateAccessToken(User user, Guid? tenantId = null, StaffRole? staffRole = null)
    {
        var secretKey = _configuration["JwtSettings:Secret"] ?? "SuperSecretKeyForHotelSaasPlatform2026!@#$%LongEnough";
        var issuer = _configuration["JwtSettings:Issuer"] ?? "HotelSaasApi";
        var audience = _configuration["JwtSettings:Audience"] ?? "HotelSaasClient";

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secretKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.Username),
            new(ClaimTypes.Email, user.Email),
            new("GlobalRole", user.GlobalRole.ToString()),
            new("FullName", user.FullName)
        };

        if (tenantId.HasValue)
        {
            claims.Add(new Claim("tenant_id", tenantId.Value.ToString()));
        }
        if (staffRole.HasValue)
        {
            claims.Add(new Claim(ClaimTypes.Role, staffRole.Value.ToString()));
        }
        else
        {
            claims.Add(new Claim(ClaimTypes.Role, user.GlobalRole.ToString()));
        }

        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(180),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public RefreshToken GenerateRefreshToken(Guid userId)
    {
        var bytes = new byte[64];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(bytes);

        return new RefreshToken
        {
            UserId = userId,
            Token = Convert.ToBase64String(bytes),
            ExpiresAtUtc = DateTime.UtcNow.AddDays(7),
            IsRevoked = false
        };
    }
}

public class VnPayService : IVnPayService
{
    private readonly IConfiguration _configuration;

    public VnPayService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public string CreatePaymentUrl(Guid reservationId, string bookingCode, decimal amount, string orderInfo, string ipAddress, string? customTmnCode = null, string? customHashSecret = null)
    {
        var vnp_TmnCode = !string.IsNullOrEmpty(customTmnCode) ? customTmnCode : (_configuration["VnPay:TmnCode"] ?? "DEMOSAAS");
        var vnp_HashSecret = !string.IsNullOrEmpty(customHashSecret) ? customHashSecret : (_configuration["VnPay:HashSecret"] ?? "SECRETKEYVNPAYSAASHOTEL2026");
        var vnp_Url = _configuration["VnPay:PaymentUrl"] ?? "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
        var vnp_ReturnUrl = _configuration["VnPay:ReturnUrl"] ?? "http://localhost:5000/api/payments/vnpay-callback";

        var vnp_Data = new SortedList<string, string>(new VnPayCompare())
        {
            { "vnp_Version", "2.1.0" },
            { "vnp_Command", "pay" },
            { "vnp_TmnCode", vnp_TmnCode },
            { "vnp_Amount", ((long)(amount * 100)).ToString() },
            { "vnp_CreateDate", DateTime.UtcNow.AddHours(7).ToString("yyyyMMddHHmmss") },
            { "vnp_CurrCode", "VND" },
            { "vnp_IpAddr", string.IsNullOrWhiteSpace(ipAddress) ? "127.0.0.1" : ipAddress },
            { "vnp_Locale", "vn" },
            { "vnp_OrderInfo", string.IsNullOrWhiteSpace(orderInfo) ? $"Thanh toan {bookingCode}" : orderInfo },
            { "vnp_OrderType", "other" },
            { "vnp_ReturnUrl", vnp_ReturnUrl },
            { "vnp_TxnRef", $"{bookingCode}_{DateTime.UtcNow.Ticks}" },
            { "vnp_ExpireDate", DateTime.UtcNow.AddHours(7).AddMinutes(15).ToString("yyyyMMddHHmmss") }
        };

        var queryString = new StringBuilder();
        var rawData = new StringBuilder();

        foreach (var (key, value) in vnp_Data)
        {
            if (!string.IsNullOrEmpty(value))
            {
                queryString.Append(WebUtility.UrlEncode(key) + "=" + WebUtility.UrlEncode(value) + "&");
                rawData.Append(WebUtility.UrlEncode(key) + "=" + WebUtility.UrlEncode(value) + "&");
            }
        }
        if (queryString.Length > 0) queryString.Remove(queryString.Length - 1, 1);
        if (rawData.Length > 0) rawData.Remove(rawData.Length - 1, 1);

        var signValue = HmacSha512(vnp_HashSecret, rawData.ToString());
        return $"{vnp_Url}?{queryString}&vnp_SecureHash={signValue}";
    }

    public (bool IsSuccess, string TransactionNo, string ResponseCode) ProcessIpn(IDictionary<string, string> queryParams, string? customHashSecret = null)
    {
        var vnp_HashSecret = !string.IsNullOrEmpty(customHashSecret) ? customHashSecret : (_configuration["VnPay:HashSecret"] ?? "SECRETKEYVNPAYSAASHOTEL2026");
        var vnp_SecureHash = queryParams.TryGetValue("vnp_SecureHash", out var sec) ? sec : string.Empty;

        var sorted = new SortedList<string, string>(new VnPayCompare());
        foreach (var (k, v) in queryParams)
        {
            if (!string.IsNullOrEmpty(k) && k.StartsWith("vnp_") && k != "vnp_SecureHash" && k != "vnp_SecureHashType")
            {
                sorted.Add(k, v);
            }
        }

        var rawData = new StringBuilder();
        foreach (var (key, value) in sorted)
        {
            if (!string.IsNullOrEmpty(value))
            {
                rawData.Append(WebUtility.UrlEncode(key) + "=" + WebUtility.UrlEncode(value) + "&");
            }
        }
        if (rawData.Length > 0) rawData.Remove(rawData.Length - 1, 1);

        var checkSignature = HmacSha512(vnp_HashSecret, rawData.ToString());
        var isValid = checkSignature.Equals(vnp_SecureHash, StringComparison.InvariantCultureIgnoreCase);
        var responseCode = queryParams.TryGetValue("vnp_ResponseCode", out var rc) ? rc : "99";
        var transactionNo = queryParams.TryGetValue("vnp_TransactionNo", out var tn) ? tn : string.Empty;

        return (isValid && responseCode == "00", transactionNo, responseCode);
    }

    private static string HmacSha512(string key, string inputData)
    {
        var hash = new StringBuilder();
        using var hmac = new HMACSHA512(Encoding.UTF8.GetBytes(key));
        var hashValue = hmac.ComputeHash(Encoding.UTF8.GetBytes(inputData));
        foreach (var b in hashValue) hash.Append(b.ToString("x2"));
        return hash.ToString();
    }
}

public class VnPayCompare : IComparer<string>
{
    public int Compare(string? x, string? y)
    {
        if (x == y) return 0;
        if (x == null) return -1;
        if (y == null) return 1;
        return CompareInfo.GetCompareInfo("en-US").Compare(x, y, CompareOptions.Ordinal);
    }
}
