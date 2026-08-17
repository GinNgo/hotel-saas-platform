using HotelSaas.Domain.Enums;

namespace HotelSaas.Application.DTOs.Auth;

public record RegisterCustomerRequestDto(
    string Username,
    string Email,
    string Password,
    string FullName,
    string? PhoneNumber
);

public record LoginRequestDto(
    string UsernameOrEmail,
    string Password
);

public record AuthResponseDto(
    Guid UserId,
    string Username,
    string Email,
    string FullName,
    GlobalUserRole GlobalRole,
    Guid? TenantId,
    StaffRole? StaffRole,
    string AccessToken,
    string RefreshToken
);
