using HotelSaas.Domain.Common;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using HotelSaas.Infrastructure.Persistence;
using HotelSaas.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace HotelSaas.WebApi.Tests;

public sealed class GlobalTenantQueryFilterTests
{
    [Fact]
    public void Every_tenant_scoped_entity_has_a_query_filter()
    {
        using var db = Context(new CurrentTenantService());

        var missing = db.Model.GetEntityTypes()
            .Where(entity => typeof(ITenantScopedEntity).IsAssignableFrom(entity.ClrType))
            .Where(entity => !entity.GetDeclaredQueryFilters().Any())
            .Select(entity => entity.ClrType.Name)
            .ToList();

        Assert.Empty(missing);
    }

    [Fact]
    public async Task Reflection_filter_isolates_new_room_date_lock_entity()
    {
        var mine = Guid.NewGuid();
        var other = Guid.NewGuid();
        var tenant = new CurrentTenantService();
        tenant.SetTenant(mine, SubscriptionTier.Pro);
        await using var db = Context(tenant);
        db.RoomDateLocks.AddRange(
            new RoomDateLock { TenantId = mine, RoomId = Guid.NewGuid(), StayDate = new DateOnly(2026, 8, 22) },
            new RoomDateLock { TenantId = other, RoomId = Guid.NewGuid(), StayDate = new DateOnly(2026, 8, 22) });
        await db.SaveChangesAsync();

        var visible = await db.RoomDateLocks.ToListAsync();

        Assert.Single(visible);
        Assert.Equal(mine, visible[0].TenantId);
        Assert.Equal(2, await db.RoomDateLocks.IgnoreQueryFilters().CountAsync());
    }

    private static ApplicationDbContext Context(CurrentTenantService tenant) => new(
        new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options, tenant);
}
