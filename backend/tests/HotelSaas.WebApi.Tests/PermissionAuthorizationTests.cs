using System.Security.Claims;
using HotelSaas.WebApi.Authorization;
using Microsoft.AspNetCore.Authorization;
using Xunit;

namespace HotelSaas.WebApi.Tests;

public sealed class PermissionAuthorizationTests
{
    [Theory]
    [InlineData("CHECKIN:64", "CHECKIN", 64, true)]
    [InlineData("CHECKIN:65", "CHECKIN", 64, true)]
    [InlineData("CHECKIN:4", "CHECKIN", 64, false)]
    [InlineData("CHECKOUT:64", "CHECKIN", 64, false)]
    public async Task Handler_requires_matching_function_and_complete_action_mask(
        string permission, string functionCode, int actionMask, bool expectedSuccess)
    {
        var principal = new ClaimsPrincipal(new ClaimsIdentity([new Claim("permission", permission)], "test"));
        var requirement = new PermissionRequirement(functionCode, actionMask);
        var context = new AuthorizationHandlerContext([requirement], principal, null);

        await new PermissionAuthorizationHandler().HandleAsync(context);

        Assert.Equal(expectedSuccess, context.HasSucceeded);
    }

    [Fact]
    public async Task Handler_denies_authenticated_user_without_permission_claim()
    {
        var principal = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, Guid.NewGuid().ToString())], "test"));
        var requirement = new PermissionRequirement("RESERVATION_CANCEL", 64);
        var context = new AuthorizationHandlerContext([requirement], principal, null);

        await new PermissionAuthorizationHandler().HandleAsync(context);

        Assert.False(context.HasSucceeded);
    }
}
