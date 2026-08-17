using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Enums;

namespace HotelSaas.Infrastructure.Services;

public class CurrentTenantService : ICurrentTenantService
{
    public Guid? TenantId { get; private set; }
    public SubscriptionTier? Tier { get; private set; }

    public void SetTenant(Guid tenantId, SubscriptionTier tier)
    {
        TenantId = tenantId;
        Tier = tier;
    }
}
