using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Common;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
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
    public DbSet<AccessRole> AccessRoles => Set<AccessRole>();
    public DbSet<PermissionFunction> PermissionFunctions => Set<PermissionFunction>();
    public DbSet<RolePermission> RolePermissions => Set<RolePermission>();
    public DbSet<SupportConversation> SupportConversations => Set<SupportConversation>();
    public DbSet<SupportMessage> SupportMessages => Set<SupportMessage>();
    public DbSet<AppNotification> AppNotifications => Set<AppNotification>();
    public DbSet<OperationalAuditEvent> OperationalAuditEvents => Set<OperationalAuditEvent>();
    public DbSet<FavoriteProperty> FavoriteProperties => Set<FavoriteProperty>();
    public DbSet<AccountActionToken> AccountActionTokens => Set<AccountActionToken>();
    public DbSet<PropertyClaim> PropertyClaims => Set<PropertyClaim>();
    public DbSet<SubscriptionPlan> SubscriptionPlans => Set<SubscriptionPlan>();
    public DbSet<SubscriptionPlanFeature> SubscriptionPlanFeatures => Set<SubscriptionPlanFeature>();
    public DbSet<PlatformSubscriptionOrder> PlatformSubscriptionOrders => Set<PlatformSubscriptionOrder>();
    public DbSet<PlatformPaymentAttempt> PlatformPaymentAttempts => Set<PlatformPaymentAttempt>();
    public DbSet<PlatformSubscriptionHistory> PlatformSubscriptionHistories => Set<PlatformSubscriptionHistory>();
    public DbSet<PropertyReview> PropertyReviews => Set<PropertyReview>();
    public DbSet<PropertyAmenity> PropertyAmenities => Set<PropertyAmenity>();
    public DbSet<RoomTypeAmenity> RoomTypeAmenities => Set<RoomTypeAmenity>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<TenantStaff> TenantStaffs => Set<TenantStaff>();
    public DbSet<RoomType> RoomTypes => Set<RoomType>();
    public DbSet<RoomRateOverride> RoomRateOverrides => Set<RoomRateOverride>();
    public DbSet<Room> Rooms => Set<Room>();
    public DbSet<RoomImage> RoomImages => Set<RoomImage>();
    public DbSet<BookingHold> BookingHolds => Set<BookingHold>();
    public DbSet<RoomDateLock> RoomDateLocks => Set<RoomDateLock>();
    public DbSet<Reservation> Reservations => Set<Reservation>();
    public DbSet<ReservationDetail> ReservationDetails => Set<ReservationDetail>();
    public DbSet<Folio> Folios => Set<Folio>();
    public DbSet<FolioItem> FolioItems => Set<FolioItem>();
    public DbSet<HotelService> HotelServices => Set<HotelService>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<PaymentTransaction> PaymentTransactions => Set<PaymentTransaction>();
    public DbSet<PropertyRefund> PropertyRefunds => Set<PropertyRefund>();
    public DbSet<PropertyPaymentAttempt> PropertyPaymentAttempts => Set<PropertyPaymentAttempt>();
    public DbSet<PropertyPaymentConfiguration> PropertyPaymentConfigurations => Set<PropertyPaymentConfiguration>();
    public DbSet<PlatformPaymentConfiguration> PlatformPaymentConfigurations => Set<PlatformPaymentConfiguration>();
    public DbSet<OperationalTask> OperationalTasks => Set<OperationalTask>();
    public DbSet<HousekeepingTask> HousekeepingTasks => Set<HousekeepingTask>();
    public DbSet<Promotion> Promotions => Set<Promotion>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(Assembly.GetExecutingAssembly());
        modelBuilder.Entity<HotelService>().Property(service => service.Price).HasPrecision(18, 2);
        modelBuilder.Entity<Reservation>().HasIndex(reservation => reservation.ClientRequestKey)
            .IsUnique().HasFilter("[ClientRequestKey] IS NOT NULL");
        modelBuilder.Entity<Reservation>().HasIndex(reservation => reservation.GuestAccessKey)
            .IsUnique().HasFilter("[GuestAccessKey] IS NOT NULL");
        modelBuilder.Entity<Payment>().HasIndex(payment => new { payment.ReservationId, payment.ClientRequestKey })
            .IsUnique().HasFilter("[ClientRequestKey] IS NOT NULL");
        modelBuilder.Entity<PaymentTransaction>().HasIndex(transaction => new { transaction.Provider, transaction.TransactionNo })
            .IsUnique().HasFilter("[IsSuccess] = 1 AND [TransactionNo] IS NOT NULL");
        modelBuilder.Entity<PropertyRefund>().HasIndex(refund => refund.PublicId).IsUnique();
        modelBuilder.Entity<PropertyRefund>().HasIndex(refund => new { refund.PaymentId, refund.IdempotencyKey }).IsUnique();
        modelBuilder.Entity<PropertyRefund>().Property(refund => refund.RequestedAmount).HasPrecision(18, 2);
        modelBuilder.Entity<PropertyRefund>().Property(refund => refund.PublicId).HasMaxLength(50);
        modelBuilder.Entity<PropertyRefund>().Property(refund => refund.IdempotencyKey).HasMaxLength(200);
        modelBuilder.Entity<PropertyRefund>().Property(refund => refund.Reason).HasMaxLength(1000);
        modelBuilder.Entity<PropertyRefund>().Property(refund => refund.Status).HasMaxLength(30);
        modelBuilder.Entity<PropertyPaymentAttempt>().HasIndex(attempt => attempt.PublicId).IsUnique();
        modelBuilder.Entity<PropertyPaymentAttempt>().HasIndex(attempt => new { attempt.ReservationId, attempt.IdempotencyKey }).IsUnique();
        modelBuilder.Entity<PropertyPaymentAttempt>().Property(attempt => attempt.ExpectedAmount).HasPrecision(18, 2);
        modelBuilder.Entity<PropertyPaymentAttempt>().Property(attempt => attempt.PublicId).HasMaxLength(50);
        modelBuilder.Entity<PropertyPaymentAttempt>().Property(attempt => attempt.IdempotencyKey).HasMaxLength(200);
        modelBuilder.Entity<PropertyPaymentConfiguration>().HasIndex(configuration => configuration.TenantId).IsUnique();
        modelBuilder.Entity<PropertyPaymentConfiguration>().Property(configuration => configuration.DepositValue).HasPrecision(18, 2);
        modelBuilder.Entity<PlatformPaymentConfiguration>().HasIndex(configuration => new { configuration.Provider, configuration.Environment }).IsUnique();
        modelBuilder.Entity<PlatformPaymentConfiguration>().Property(configuration => configuration.Provider).HasMaxLength(40);
        modelBuilder.Entity<PlatformPaymentConfiguration>().Property(configuration => configuration.Environment).HasMaxLength(20);
        modelBuilder.Entity<PlatformPaymentConfiguration>().Property(configuration => configuration.SecretReference).HasMaxLength(500);
        modelBuilder.Entity<PlatformPaymentConfiguration>().Property(configuration => configuration.CallbackUrl).HasMaxLength(1000);
        modelBuilder.Entity<OperationalTask>().HasIndex(task => task.PublicId).IsUnique();
        modelBuilder.Entity<OperationalTask>().HasIndex(task => task.IdempotencyKey)
            .IsUnique().HasFilter("[IdempotencyKey] IS NOT NULL");
        modelBuilder.Entity<OperationalTask>().HasIndex(task => new { task.TenantId, task.AggregateType, task.AggregateId }).IsUnique();
        modelBuilder.Entity<OperationalTask>().Property(task => task.ToolName).HasMaxLength(120);
        modelBuilder.Entity<OperationalTask>().Property(task => task.IdempotencyKey).HasMaxLength(100);
        modelBuilder.Entity<HousekeepingTask>().HasIndex(task => new { task.RoomId, task.TaskType })
            .IsUnique().HasFilter("[IsDeleted] = 0 AND [Status] <> 3");
        modelBuilder.Entity<HousekeepingTask>().Property(task => task.CancellationReason).HasMaxLength(500);
        modelBuilder.Entity<BookingHold>().HasIndex(hold => hold.ClientRequestKey)
            .IsUnique().HasFilter("[ClientRequestKey] IS NOT NULL");
        modelBuilder.Entity<BookingHold>().Property(hold => hold.ClientRequestKey).HasMaxLength(200);
        modelBuilder.Entity<BookingHold>().Property(hold => hold.CouponCode).HasMaxLength(50);
        modelBuilder.Entity<BookingHold>().Property(hold => hold.PromotionCode).HasMaxLength(50);
        modelBuilder.Entity<BookingHold>().Property(hold => hold.PromotionTitle).HasMaxLength(255);
        modelBuilder.Entity<BookingHold>().Property(hold => hold.NightlyRateBreakdownJson).HasMaxLength(8000);
        modelBuilder.Entity<BookingHold>().Property(hold => hold.BaseSubtotal).HasPrecision(18, 2);
        modelBuilder.Entity<BookingHold>().Property(hold => hold.DiscountAmount).HasPrecision(18, 2);
        modelBuilder.Entity<BookingHold>().Property(hold => hold.FinalTotal).HasPrecision(18, 2);
        modelBuilder.Entity<RoomDateLock>().HasIndex(item => new { item.RoomId, item.StayDate }).IsUnique();
        modelBuilder.Entity<RoomDateLock>().HasIndex(item => new { item.BookingHoldId, item.StayDate });
        modelBuilder.Entity<RoomDateLock>().HasIndex(item => new { item.ReservationId, item.StayDate });
        modelBuilder.Entity<FavoriteProperty>().HasIndex(favorite => new { favorite.UserId, favorite.TenantId }).IsUnique();
        modelBuilder.Entity<AccessRole>().HasIndex(role => new { role.TenantId, role.Code }).IsUnique();
        modelBuilder.Entity<TenantStaff>().HasIndex(staff => new { staff.TenantId, staff.AccessRoleId });
        modelBuilder.Entity<PermissionFunction>().HasIndex(function => function.Code).IsUnique();
        modelBuilder.Entity<RolePermission>().HasIndex(permission => new { permission.RoleId, permission.FunctionId }).IsUnique();
        modelBuilder.Entity<SupportConversation>().HasIndex(item => new { item.TenantId, item.Status, item.LastMessageAtUtc });
        modelBuilder.Entity<SupportConversation>().Property(item => item.Channel).HasMaxLength(30);
        modelBuilder.Entity<SupportConversation>().Property(item => item.Subject).HasMaxLength(200);
        modelBuilder.Entity<SupportConversation>().Property(item => item.Status).HasMaxLength(30);
        modelBuilder.Entity<SupportMessage>().HasIndex(item => new { item.ConversationId, item.CreatedAtUtc });
        modelBuilder.Entity<SupportMessage>().Property(item => item.Content).HasMaxLength(2000);
        modelBuilder.Entity<AppNotification>().HasIndex(item => new { item.UserId, item.IsRead, item.CreatedAtUtc });
        modelBuilder.Entity<AppNotification>().HasIndex(item => new { item.UserId, item.Type, item.ResourceId });
        modelBuilder.Entity<AppNotification>().Property(item => item.Type).HasMaxLength(50);
        modelBuilder.Entity<AppNotification>().Property(item => item.Title).HasMaxLength(200);
        modelBuilder.Entity<AppNotification>().Property(item => item.Message).HasMaxLength(1000);
        modelBuilder.Entity<AppNotification>().Property(item => item.ResourceType).HasMaxLength(50);
        modelBuilder.Entity<OperationalAuditEvent>().HasIndex(item => new { item.TenantId, item.CreatedAtUtc });
        modelBuilder.Entity<OperationalAuditEvent>().HasIndex(item => new { item.Domain, item.EventType, item.CreatedAtUtc });
        modelBuilder.Entity<OperationalAuditEvent>().Property(item => item.Scope).HasMaxLength(20);
        modelBuilder.Entity<OperationalAuditEvent>().Property(item => item.Domain).HasMaxLength(50);
        modelBuilder.Entity<OperationalAuditEvent>().Property(item => item.EventType).HasMaxLength(120);
        modelBuilder.Entity<OperationalAuditEvent>().Property(item => item.AggregateType).HasMaxLength(80);
        modelBuilder.Entity<OperationalAuditEvent>().Property(item => item.AggregateId).HasMaxLength(200);
        modelBuilder.Entity<OperationalAuditEvent>().Property(item => item.ActorType).HasMaxLength(30);
        modelBuilder.Entity<OperationalAuditEvent>().Property(item => item.Reason).HasMaxLength(500);
        modelBuilder.Entity<OperationalAuditEvent>().Property(item => item.CorrelationId).HasMaxLength(100);
        modelBuilder.Entity<AccountActionToken>().HasIndex(token => token.TokenHash).IsUnique();
        modelBuilder.Entity<PropertyClaim>().HasIndex(claim => new { claim.UserId, claim.TenantId, claim.Status });
        modelBuilder.Entity<SubscriptionPlan>().HasIndex(plan => plan.Code).IsUnique();
        modelBuilder.Entity<SubscriptionPlan>().Property(plan => plan.Price).HasPrecision(18, 2);
        modelBuilder.Entity<SubscriptionPlanFeature>().HasIndex(feature => new { feature.SubscriptionPlanId, feature.Code }).IsUnique();
        modelBuilder.Entity<PlatformSubscriptionOrder>().Property(order => order.Price).HasPrecision(18, 2);
        modelBuilder.Entity<PlatformPaymentAttempt>().Property(attempt => attempt.ExpectedAmount).HasPrecision(18, 2);
        modelBuilder.Entity<PlatformSubscriptionOrder>().HasIndex(order => order.PublicId).IsUnique();
        modelBuilder.Entity<PlatformSubscriptionOrder>().HasIndex(order => new { order.OwnerUserId, order.IdempotencyKey }).IsUnique();
        modelBuilder.Entity<PlatformPaymentAttempt>().HasIndex(attempt => attempt.PublicId).IsUnique();
        modelBuilder.Entity<PlatformPaymentAttempt>().HasIndex(attempt => new { attempt.PlatformSubscriptionOrderId, attempt.IdempotencyKey }).IsUnique();
        modelBuilder.Entity<PlatformSubscriptionHistory>().HasIndex(history => history.OrderPublicId).IsUnique();
        modelBuilder.Entity<PropertyReview>().HasIndex(review => review.ReservationId).IsUnique();
        modelBuilder.Entity<PropertyReview>().HasIndex(review => new { review.TenantId, review.IsPublished });
        modelBuilder.Entity<PropertyAmenity>().HasIndex(amenity => new { amenity.TenantId, amenity.Code }).IsUnique();
        modelBuilder.Entity<RoomTypeAmenity>().HasIndex(amenity => new { amenity.RoomTypeId, amenity.Code }).IsUnique();
        modelBuilder.Entity<RoomType>().Property(type => type.BedCount).HasDefaultValue(1);
        modelBuilder.Entity<RoomType>().Property(type => type.IsRefundable).HasDefaultValue(true);
        modelBuilder.Entity<RoomType>().Property(type => type.FreeCancellationHours).HasDefaultValue(24);
        modelBuilder.Entity<RoomRateOverride>().HasIndex(rate => new { rate.RoomTypeId, rate.StartDate, rate.EndDate, rate.Priority });
        modelBuilder.Entity<RoomRateOverride>().Property(rate => rate.NightlyPrice).HasPrecision(18, 2);
        modelBuilder.Entity<RoomImage>().Property(image => image.AltText).HasMaxLength(255);
        modelBuilder.Entity<Reservation>().Property(reservation => reservation.IsRefundableSnapshot).HasDefaultValue(true);
        modelBuilder.Entity<Reservation>().Property(reservation => reservation.FreeCancellationHoursSnapshot).HasDefaultValue(24);
        modelBuilder.Entity<Reservation>().Property(reservation => reservation.AdultCount).HasDefaultValue(1);
        modelBuilder.Entity<Reservation>().Property(reservation => reservation.ChildCount).HasDefaultValue(0);
        modelBuilder.Entity<Reservation>().Property(reservation => reservation.PaymentMethodSnapshot).HasDefaultValue(PaymentMethod.Cash);
        modelBuilder.Entity<Tenant>().Property(tenant => tenant.CheckInTime).HasMaxLength(5).HasDefaultValue("14:00");
        modelBuilder.Entity<Tenant>().Property(tenant => tenant.CheckOutTime).HasMaxLength(5).HasDefaultValue("12:00");
        modelBuilder.Entity<Tenant>().Property(tenant => tenant.CancellationPolicy).HasMaxLength(2000);
        modelBuilder.Entity<Tenant>().Property(tenant => tenant.ChildrenPolicy).HasMaxLength(2000);
        modelBuilder.Entity<Tenant>().Property(tenant => tenant.PetPolicy).HasMaxLength(2000);
        modelBuilder.Entity<Tenant>().Property(tenant => tenant.HouseRules).HasMaxLength(2000);

        // Đặt DeleteBehavior.Restrict cho toàn bộ quan hệ để khắc phục lỗi SQL Server Multiple Cascade Paths
        foreach (var relationship in modelBuilder.Model.GetEntityTypes().SelectMany(e => e.GetForeignKeys()))
        {
            relationship.DeleteBehavior = DeleteBehavior.Restrict;
        }

        ApplyTenantQueryFilters(modelBuilder);
        modelBuilder.Entity<AccessRole>().HasQueryFilter(e => !_currentTenantService.TenantId.HasValue || !e.TenantId.HasValue || e.TenantId == _currentTenantService.TenantId.Value);
        modelBuilder.Entity<RolePermission>().HasQueryFilter(e => !_currentTenantService.TenantId.HasValue || e.Role == null || !e.Role.TenantId.HasValue || e.Role.TenantId == _currentTenantService.TenantId.Value);
    }

    private void ApplyTenantQueryFilters(ModelBuilder modelBuilder)
    {
        var method = GetType().GetMethod(nameof(ApplyTenantQueryFilter), BindingFlags.Instance | BindingFlags.NonPublic)!;
        var tenantTypes = modelBuilder.Model.GetEntityTypes()
            .Select(entity => entity.ClrType)
            .Where(type => typeof(ITenantScopedEntity).IsAssignableFrom(type))
            .Distinct();
        foreach (var entityType in tenantTypes)
            method.MakeGenericMethod(entityType).Invoke(this, [modelBuilder]);
    }

    private void ApplyTenantQueryFilter<TEntity>(ModelBuilder modelBuilder)
        where TEntity : class, ITenantScopedEntity =>
        modelBuilder.Entity<TEntity>().HasQueryFilter(entity =>
            !_currentTenantService.TenantId.HasValue || (Guid?)entity.TenantId == _currentTenantService.TenantId);

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
