using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace HotelSaas.Infrastructure.BackgroundJobs;

public class BookingHoldCleanupWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<BookingHoldCleanupWorker> _logger;

    public BookingHoldCleanupWorker(IServiceProvider serviceProvider, ILogger<BookingHoldCleanupWorker> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("BookingHoldCleanupWorker Multi-Tenant started.");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<IApplicationDbContext>();
                var realtime = scope.ServiceProvider.GetService<IReservationRealtimePublisher>();
                var now = DateTime.UtcNow;

                var expiredHolds = await db.BookingHolds
                    .IgnoreQueryFilters()
                    .Where(h => !h.IsReleased && !h.IsConvertedToReservation && h.ExpiresAtUtc < now)
                    .ToListAsync(stoppingToken);

                foreach (var hold in expiredHolds)
                {
                    hold.IsReleased = true;
                }
                var expiredHoldIds = expiredHolds.Select(hold => hold.Id).ToList();
                if (expiredHoldIds.Count > 0)
                {
                    var locks = await db.RoomDateLocks.IgnoreQueryFilters()
                        .Where(item => item.BookingHoldId.HasValue && expiredHoldIds.Contains(item.BookingHoldId.Value))
                        .ToListAsync(stoppingToken);
                    db.RoomDateLocks.RemoveRange(locks);
                }

                var unpaidReservations = await db.Reservations
                    .IgnoreQueryFilters()
                    .Include(r => r.Payments)
                    .Where(r => r.Status == ReservationStatus.PendingPayment &&
                        r.CreatedAtUtc.AddMinutes(15) <= now)
                    .ToListAsync(stoppingToken);

                var expiredReservationIds = new List<Guid>();
                foreach (var res in unpaidReservations)
                    if (ReservationPaymentLifecycle.ExpireIfOverdue(res, now)) expiredReservationIds.Add(res.Id);
                if (expiredReservationIds.Count > 0)
                {
                    var reservationLocks = await db.RoomDateLocks.IgnoreQueryFilters()
                        .Where(item => item.ReservationId.HasValue && expiredReservationIds.Contains(item.ReservationId.Value))
                        .ToListAsync(stoppingToken);
                    db.RoomDateLocks.RemoveRange(reservationLocks);
                }

                if (expiredHolds.Any() || unpaidReservations.Any())
                {
                    await db.SaveChangesAsync(stoppingToken);
                    if (realtime != null)
                        foreach (var reservation in unpaidReservations.Where(item => expiredReservationIds.Contains(item.Id)))
                            await realtime.PublishExpiredAsync(reservation.TenantId, reservation.Id, reservation.BookingCode, stoppingToken);
                    _logger.LogInformation("Released {HoldCount} holds and cancelled {ResCount} unpaid bookings.", expiredHolds.Count, unpaidReservations.Count);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in BookingHoldCleanupWorker.");
            }

            await Task.Delay(TimeSpan.FromSeconds(60), stoppingToken);
        }
    }
}
