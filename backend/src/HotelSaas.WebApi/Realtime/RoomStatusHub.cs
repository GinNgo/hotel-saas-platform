using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace HotelSaas.WebApi.Realtime;

[Authorize]
public sealed class RoomStatusHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        var tenantId = Context.User?.FindFirstValue("tenant_id");
        if (Guid.TryParse(tenantId, out var id))
            await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(id));
        await base.OnConnectedAsync();
    }

    public static string GroupName(Guid tenantId) => $"tenant:{tenantId:N}";
}
