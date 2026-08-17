using HotelSaas.Domain.Enums;

namespace HotelSaas.Application.DTOs.Tenants;

public record CreateTenantRequestDto(
    string Name,
    string Code,
    string Address,
    string City,
    string? PhoneNumber,
    string? Email,
    SubscriptionTier Tier,
    string OwnerUsername,
    string OwnerEmail,
    string OwnerPassword,
    string OwnerFullName
);

public record TenantDto(
    Guid Id,
    string Name,
    string Code,
    string Slug,
    string Address,
    string City,
    string? PhoneNumber,
    string? Email,
    SubscriptionTier SubscriptionTier,
    TenantStatus Status
);

public record UpdateSubscriptionTierDto(
    SubscriptionTier NewTier
);
