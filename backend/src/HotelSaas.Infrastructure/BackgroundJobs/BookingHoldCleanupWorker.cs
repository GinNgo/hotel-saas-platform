using HotelSaas.Application.Common.Interfaces;
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
                var now = DateTime.UtcNow;

                var expiredHolds = await db.BookingHolds
                    .IgnoreQueryFilters()
                    .Where(h => !h.IsReleased && !h.IsConvertedToReservation && h.ExpiresAtUtc < now)
                    .ToListAsync(stoppingToken);

                foreach (var hold in expiredHolds)
                {
                    hold.IsReleased = true;
                }

                var unpaidReservations = await db.Reservations
                    .IgnoreQueryFilters()
                    .Where(r => r.Status == ReservationStatus.PendingPayment && r.CreatedAtUtc.AddMinutes(20) < now)
                    .ToListAsync(stoppingToken);

                foreach (var res in unpaidReservations)
                {
                    res.Status = ReservationStatus.Cancelled;
                    res.CancellationReason = "Quá hạn thanh toán 20 phút (Auto-cancelled)";
                }

                if (expiredHolds.Any() || unpaidReservations.Any())
                {
                    await db.SaveChangesAsync(stoppingToken);
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
