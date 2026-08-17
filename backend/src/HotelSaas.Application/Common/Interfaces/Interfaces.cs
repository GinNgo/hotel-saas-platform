using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.Application.Common.Interfaces;

public interface ICurrentTenantService
{
    Guid? TenantId { get; }
    SubscriptionTier? Tier { get; }
    void SetTenant(Guid tenantId, SubscriptionTier tier);
}

public interface IApplicationDbContext
{
    DbSet<Tenant> Tenants { get; }
    DbSet<User> Users { get; }
    DbSet<RefreshToken> RefreshTokens { get; }
    DbSet<TenantStaff> TenantStaffs { get; }
    DbSet<RoomType> RoomTypes { get; }
    DbSet<Room> Rooms { get; }
    DbSet<RoomImage> RoomImages { get; }
    DbSet<BookingHold> BookingHolds { get; }
    DbSet<Reservation> Reservations { get; }
    DbSet<ReservationDetail> ReservationDetails { get; }
    DbSet<Folio> Folios { get; }
    DbSet<FolioItem> FolioItems { get; }
    DbSet<Payment> Payments { get; }
    DbSet<PaymentTransaction> PaymentTransactions { get; }
    DbSet<HousekeepingTask> HousekeepingTasks { get; }
    DbSet<Promotion> Promotions { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}

public interface IPasswordHasher
{
    string HashPassword(string password);
    bool VerifyPassword(string password, string passwordHash);
}

public interface IJwtTokenGenerator
{
    string GenerateAccessToken(User user, Guid? tenantId = null, StaffRole? staffRole = null);
    RefreshToken GenerateRefreshToken(Guid userId);
}

public interface IVnPayService
{
    string CreatePaymentUrl(Guid reservationId, string bookingCode, decimal amount, string orderInfo, string ipAddress, string? customTmnCode = null, string? customHashSecret = null);
    (bool IsSuccess, string TransactionNo, string ResponseCode) ProcessIpn(IDictionary<string, string> queryParams, string? customHashSecret = null);
}
