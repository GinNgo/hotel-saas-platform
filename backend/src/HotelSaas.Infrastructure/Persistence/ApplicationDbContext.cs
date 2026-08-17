using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Common;
using HotelSaas.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using System.Reflection;

namespace HotelSaas.Infrastructure.Persistence;

public class ApplicationDbContext : DbContext, IApplicationDbContext
{
    private readonly ICurrentTenantService _currentTenantService;

    public ApplicationDbContext(
        DbContextOptions<ApplicationDbContext> options,
        ICurrentTenantService currentTenantService) : base(options)
    {
        _currentTenantService = currentTenantService;
    }

    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<User> Users => Set<User>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<TenantStaff> TenantStaffs => Set<TenantStaff>();
    public DbSet<RoomType> RoomTypes => Set<RoomType>();
    public DbSet<Room> Rooms => Set<Room>();
    public DbSet<RoomImage> RoomImages => Set<RoomImage>();
    public DbSet<BookingHold> BookingHolds => Set<BookingHold>();
    public DbSet<Reservation> Reservations => Set<Reservation>();
    public DbSet<ReservationDetail> ReservationDetails => Set<ReservationDetail>();
    public DbSet<Folio> Folios => Set<Folio>();
    public DbSet<FolioItem> FolioItems => Set<FolioItem>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<PaymentTransaction> PaymentTransactions => Set<PaymentTransaction>();
    public DbSet<HousekeepingTask> HousekeepingTasks => Set<HousekeepingTask>();
    public DbSet<Promotion> Promotions => Set<Promotion>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(Assembly.GetExecutingAssembly());

        // Áp dụng Global Query Filter tự động lọc theo TenantId
        modelBuilder.Entity<TenantStaff>().HasQueryFilter(e => !_currentTenantService.TenantId.HasValue || e.TenantId == _currentTenantService.TenantId.Value);
        modelBuilder.Entity<RoomType>().HasQueryFilter(e => !_currentTenantService.TenantId.HasValue || e.TenantId == _currentTenantService.TenantId.Value);
        modelBuilder.Entity<Room>().HasQueryFilter(e => !_currentTenantService.TenantId.HasValue || e.TenantId == _currentTenantService.TenantId.Value);
        modelBuilder.Entity<RoomImage>().HasQueryFilter(e => !_currentTenantService.TenantId.HasValue || e.TenantId == _currentTenantService.TenantId.Value);
        modelBuilder.Entity<BookingHold>().HasQueryFilter(e => !_currentTenantService.TenantId.HasValue || e.TenantId == _currentTenantService.TenantId.Value);
        modelBuilder.Entity<Reservation>().HasQueryFilter(e => !_currentTenantService.TenantId.HasValue || e.TenantId == _currentTenantService.TenantId.Value);
        modelBuilder.Entity<ReservationDetail>().HasQueryFilter(e => !_currentTenantService.TenantId.HasValue || e.TenantId == _currentTenantService.TenantId.Value);
        modelBuilder.Entity<Folio>().HasQueryFilter(e => !_currentTenantService.TenantId.HasValue || e.TenantId == _currentTenantService.TenantId.Value);
        modelBuilder.Entity<FolioItem>().HasQueryFilter(e => !_currentTenantService.TenantId.HasValue || e.TenantId == _currentTenantService.TenantId.Value);
        modelBuilder.Entity<Payment>().HasQueryFilter(e => !_currentTenantService.TenantId.HasValue || e.TenantId == _currentTenantService.TenantId.Value);
        modelBuilder.Entity<PaymentTransaction>().HasQueryFilter(e => !_currentTenantService.TenantId.HasValue || e.TenantId == _currentTenantService.TenantId.Value);
        modelBuilder.Entity<HousekeepingTask>().HasQueryFilter(e => !_currentTenantService.TenantId.HasValue || e.TenantId == _currentTenantService.TenantId.Value);
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        foreach (var entry in ChangeTracker.Entries<BaseEntity>())
        {
            if (entry.State == EntityState.Modified)
            {
                entry.Entity.UpdatedAtUtc = DateTime.UtcNow;
            }
        }
        return base.SaveChangesAsync(cancellationToken);
    }
}
