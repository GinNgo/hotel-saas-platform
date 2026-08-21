using HotelSaas.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace HotelSaas.Infrastructure.BackgroundJobs;

public sealed class NotificationRetentionWorker(IServiceProvider serviceProvider, ILogger<NotificationRetentionWorker> logger) : BackgroundService
{
    internal static readonly TimeSpan Retention = TimeSpan.FromDays(90);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = serviceProvider.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<IApplicationDbContext>();
                var cutoff = DateTime.UtcNow - Retention;
                var rows = await db.AppNotifications.Where(item => item.CreatedAtUtc < cutoff).ToListAsync(stoppingToken);
                if (rows.Count > 0)
                {
                    foreach (var item in rows) item.IsDeleted = true;
                    await db.SaveChangesAsync(stoppingToken);
                    logger.LogInformation("Archived {Count} platform notifications outside retention.", rows.Count);
                }
            }
            catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
            {
                logger.LogError(ex, "Error while applying platform notification retention.");
            }
            await Task.Delay(TimeSpan.FromHours(6), stoppingToken);
        }
    }
}
