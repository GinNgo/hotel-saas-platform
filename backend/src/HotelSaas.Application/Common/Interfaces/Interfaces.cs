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
    DbSet<AccessRole> AccessRoles { get; }
    DbSet<PermissionFunction> PermissionFunctions { get; }
    DbSet<RolePermission> RolePermissions { get; }
    DbSet<SupportConversation> SupportConversations { get; }
    DbSet<SupportMessage> SupportMessages { get; }
    DbSet<AppNotification> AppNotifications { get; }
    DbSet<OperationalAuditEvent> OperationalAuditEvents { get; }
    DbSet<FavoriteProperty> FavoriteProperties { get; }
    DbSet<AccountActionToken> AccountActionTokens { get; }
    DbSet<PropertyClaim> PropertyClaims { get; }
    DbSet<SubscriptionPlan> SubscriptionPlans { get; }
    DbSet<SubscriptionPlanFeature> SubscriptionPlanFeatures { get; }
    DbSet<PlatformSubscriptionOrder> PlatformSubscriptionOrders { get; }
    DbSet<PlatformPaymentAttempt> PlatformPaymentAttempts { get; }
    DbSet<PlatformSubscriptionHistory> PlatformSubscriptionHistories { get; }
    DbSet<PropertyReview> PropertyReviews { get; }
    DbSet<PropertyAmenity> PropertyAmenities { get; }
    DbSet<RoomTypeAmenity> RoomTypeAmenities { get; }
    DbSet<RefreshToken> RefreshTokens { get; }
    DbSet<TenantStaff> TenantStaffs { get; }
    DbSet<RoomType> RoomTypes { get; }
    DbSet<RoomRateOverride> RoomRateOverrides { get; }
    DbSet<Room> Rooms { get; }
    DbSet<RoomImage> RoomImages { get; }
    DbSet<BookingHold> BookingHolds { get; }
    DbSet<Reservation> Reservations { get; }
    DbSet<ReservationDetail> ReservationDetails { get; }
    DbSet<Folio> Folios { get; }
    DbSet<FolioItem> FolioItems { get; }
    DbSet<HotelService> HotelServices { get; }
    DbSet<Payment> Payments { get; }
    DbSet<PaymentTransaction> PaymentTransactions { get; }
    DbSet<PropertyRefund> PropertyRefunds { get; }
    DbSet<PropertyPaymentAttempt> PropertyPaymentAttempts { get; }
    DbSet<PropertyPaymentConfiguration> PropertyPaymentConfigurations { get; }
    DbSet<PlatformPaymentConfiguration> PlatformPaymentConfigurations { get; }
    DbSet<OperationalTask> OperationalTasks { get; }
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
    string GenerateAccessToken(User user, Guid? tenantId = null, StaffRole? staffRole = null, string? accessRoleCode = null, IEnumerable<string>? permissions = null);
    RefreshToken GenerateRefreshToken(Guid userId);
}

public interface IVnPayService
{
    string CreatePaymentUrl(Guid reservationId, string bookingCode, decimal amount, string orderInfo, string ipAddress, string? customTmnCode = null, string? customHashSecret = null, string? transactionReference = null);
    (bool IsValidSignature, bool IsSuccess, string TransactionNo, string ResponseCode) ProcessIpn(IDictionary<string, string> queryParams, string? customHashSecret = null);
}

public interface IEmailDeliveryService
{
    bool IsConfigured { get; }
    Task<EmailDeliveryResult> SendAsync(string recipient, string subject, string htmlBody, CancellationToken cancellationToken = default);
}

public sealed record EmailDeliveryResult(bool Sent, string Status, string? Error = null);
