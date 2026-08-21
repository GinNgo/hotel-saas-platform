using HotelSaas.Application.Common.Interfaces;
using Microsoft.AspNetCore.SignalR;

namespace HotelSaas.WebApi.Realtime;

public sealed class ReservationRealtimePublisher(IHubContext<RoomStatusHub> hub) : IReservationRealtimePublisher
{
    public Task PublishExpiredAsync(Guid tenantId, Guid reservationId, string bookingCode,
        CancellationToken cancellationToken = default) =>
        hub.Clients.Group(RoomStatusHub.GroupName(tenantId)).SendAsync("ReservationExpired", new
        {
            TenantId = tenantId,
            ReservationId = reservationId,
            BookingCode = bookingCode,
            ExpiredAtUtc = DateTime.UtcNow
        }, cancellationToken);
}
