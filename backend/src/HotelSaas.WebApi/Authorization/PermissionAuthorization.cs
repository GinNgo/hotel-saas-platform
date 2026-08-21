using Microsoft.AspNetCore.Authorization;

namespace HotelSaas.WebApi.Authorization;

public sealed record PermissionRequirement(string FunctionCode, int ActionMask) : IAuthorizationRequirement;

public sealed class PermissionAuthorizationHandler : AuthorizationHandler<PermissionRequirement>
{
    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, PermissionRequirement requirement)
    {
        var granted = context.User.FindAll("permission").Any(claim =>
        {
            var parts = claim.Value.Split(':', 2, StringSplitOptions.TrimEntries);
            return parts.Length == 2 && parts[0].Equals(requirement.FunctionCode, StringComparison.OrdinalIgnoreCase) &&
                int.TryParse(parts[1], out var mask) && (mask & requirement.ActionMask) == requirement.ActionMask;
        });
        if (granted) context.Succeed(requirement);
        return Task.CompletedTask;
    }
}
