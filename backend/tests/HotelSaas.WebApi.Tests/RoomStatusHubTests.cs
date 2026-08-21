using HotelSaas.WebApi.Realtime;
using Xunit;

namespace HotelSaas.WebApi.Tests;

public sealed class RoomStatusHubTests
{
    [Fact]
    public void Group_name_is_stable_and_tenant_scoped()
    {
        var tenantId = Guid.Parse("54d1375a-f370-4630-850d-f59e15465432");

        var groupName = RoomStatusHub.GroupName(tenantId);

        Assert.Equal("tenant:54d1375af3704630850df59e15465432", groupName);
    }
}
