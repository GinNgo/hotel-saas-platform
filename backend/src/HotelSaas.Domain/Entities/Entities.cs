using HotelSaas.Domain.Common;
using HotelSaas.Domain.Enums;

namespace HotelSaas.Domain.Entities;

public class Tenant : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty; // vd: KS-SAIGON-01
    public string Slug { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Address { get; set; } = string.Empty;
    public string City { get; set; } = string.Empty;
    public string? PhoneNumber { get; set; }
    public string? Email { get; set; }
    public string? LogoUrl { get; set; }
    public string PropertyType { get; set; } = "HOTEL";
    public int StarRating { get; set; }
    public string CheckInTime { get; set; } = "14:00";
    public string CheckOutTime { get; set; } = "12:00";
    public string? CancellationPolicy { get; set; }
    public string? ChildrenPolicy { get; set; }
    public string? PetPolicy { get; set; }
    public string? HouseRules { get; set; }
    public decimal TaxRatePercent { get; set; }
    public decimal ServiceFeeRatePercent { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }

    public SubscriptionTier SubscriptionTier { get; set; } = SubscriptionTier.Basic;
    public TenantStatus Status { get; set; } = TenantStatus.Active;
    public Guid? ActiveSubscriptionPlanId { get; set; }
    public SubscriptionPlan? ActiveSubscriptionPlan { get; set; }
    public DateTime? SubscriptionEffectiveFromUtc { get; set; }
    public DateTime? SubscriptionEffectiveUntilUtc { get; set; }

    // Cổng VNPay riêng (nếu gói Enterprise)
    public string? CustomVnPayTmnCode { get; set; }
    public string? CustomVnPayHashSecret { get; set; }

    public ICollection<TenantStaff> StaffMembers { get; set; } = new List<TenantStaff>();
    public ICollection<RoomType> RoomTypes { get; set; } = new List<RoomType>();
    public ICollection<Room> Rooms { get; set; } = new List<Room>();
    public ICollection<Reservation> Reservations { get; set; } = new List<Reservation>();
    public ICollection<PropertyAmenity> Amenities { get; set; } = new List<PropertyAmenity>();
}

public class User : BaseEntity
{
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string? PhoneNumber { get; set; }
    public string? AvatarUrl { get; set; }
    public DateTime? EmailVerifiedAtUtc { get; set; }
    public string? PendingEmail { get; set; }
    public GlobalUserRole GlobalRole { get; set; } = GlobalUserRole.Customer;
    public bool IsActive { get; set; } = true;

    // Nếu thuộc 1 cơ sở cụ thể
    public Guid? TenantId { get; set; }
    public Tenant? Tenant { get; set; }

    public ICollection<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();
    public ICollection<TenantStaff> TenantStaffProfiles { get; set; } = new List<TenantStaff>();
    public ICollection<FavoriteProperty> FavoriteProperties { get; set; } = new List<FavoriteProperty>();
    public ICollection<AccountActionToken> AccountActionTokens { get; set; } = new List<AccountActionToken>();
    public ICollection<PropertyClaim> PropertyClaims { get; set; } = new List<PropertyClaim>();
    public ICollection<PropertyReview> PropertyReviews { get; set; } = new List<PropertyReview>();
}

public class AccessRole : BaseEntity
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsSystemRole { get; set; }
    public Guid? TenantId { get; set; }
    public Tenant? Tenant { get; set; }
    public ICollection<RolePermission> Permissions { get; set; } = new List<RolePermission>();
}

public class PermissionFunction : BaseEntity
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string ModuleCode { get; set; } = string.Empty;
    public int SupportedActionMask { get; set; } = 127;
    public bool IsActive { get; set; } = true;
    public ICollection<RolePermission> RolePermissions { get; set; } = new List<RolePermission>();
}

public class RolePermission : BaseEntity
{
    public Guid RoleId { get; set; }
    public AccessRole? Role { get; set; }
    public Guid FunctionId { get; set; }
    public PermissionFunction? Function { get; set; }
    public int ActionMask { get; set; }
}

public class SupportConversation : BaseEntity
{
    public Guid? TenantId { get; set; }
    public Tenant? Tenant { get; set; }
    public Guid CreatedByUserId { get; set; }
    public User? CreatedByUser { get; set; }
    public Guid? AssignedAgentUserId { get; set; }
    public User? AssignedAgentUser { get; set; }
    public string Channel { get; set; } = "TENANT_ADMIN";
    public string Subject { get; set; } = "Yêu cầu hỗ trợ hệ thống";
    public string Status { get; set; } = "OPEN";
    public int Version { get; set; } = 1;
    public DateTime? AssignedAtUtc { get; set; }
    public Guid? ClosedByUserId { get; set; }
    public DateTime? ClosedAtUtc { get; set; }
    public Guid? ReopenedByUserId { get; set; }
    public DateTime? ReopenedAtUtc { get; set; }
    public Guid? ReservationId { get; set; }
    public Reservation? Reservation { get; set; }
    public DateTime? LastMessageAtUtc { get; set; }
    public ICollection<SupportMessage> Messages { get; set; } = new List<SupportMessage>();
}

public class SupportMessage : BaseEntity
{
    public Guid? TenantId { get; set; }
    public Guid ConversationId { get; set; }
    public SupportConversation? Conversation { get; set; }
    public Guid SenderUserId { get; set; }
    public User? SenderUser { get; set; }
    public string Content { get; set; } = string.Empty;
    public bool IsRead { get; set; }
}

public class AppNotification : BaseEntity
{
    public Guid UserId { get; set; }
    public User? User { get; set; }
    public string Type { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string? ResourceType { get; set; }
    public Guid? ResourceId { get; set; }
    public bool IsRead { get; set; }
    public DateTime? ReadAtUtc { get; set; }
}

public class OperationalAuditEvent : BaseEntity
{
    public Guid? TenantId { get; set; }
    public string Scope { get; set; } = "SYSTEM";
    public string Domain { get; set; } = "SYSTEM";
    public string EventType { get; set; } = string.Empty;
    public string AggregateType { get; set; } = string.Empty;
    public string AggregateId { get; set; } = string.Empty;
    public string ActorType { get; set; } = "USER";
    public Guid? ActorId { get; set; }
    public string Reason { get; set; } = string.Empty;
    public string? BeforeState { get; set; }
    public string? AfterState { get; set; }
    public string CorrelationId { get; set; } = string.Empty;
    public int StatusCode { get; set; }
}

public class FavoriteProperty : BaseEntity
{
    public Guid UserId { get; set; }
    public User? User { get; set; }
    public Guid TenantId { get; set; }
    public Tenant? Tenant { get; set; }
}

public class AccountActionToken : BaseEntity
{
    public Guid UserId { get; set; }
    public User? User { get; set; }
    public string Purpose { get; set; } = string.Empty;
    public string TokenHash { get; set; } = string.Empty;
    public string? PendingEmail { get; set; }
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime? UsedAtUtc { get; set; }
}

public class PropertyClaim : BaseEntity
{
    public Guid UserId { get; set; }
    public User? User { get; set; }
    public Guid TenantId { get; set; }
    public Tenant? Tenant { get; set; }
    public string VerificationMethod { get; set; } = string.Empty;
    public string VerificationData { get; set; } = string.Empty;
    public string? Note { get; set; }
    public string Status { get; set; } = "PENDING";
    public DateTime? ReviewedAtUtc { get; set; }
    public Guid? ReviewedByUserId { get; set; }
    public string? RejectionReason { get; set; }
}

public class SubscriptionPlan : BaseEntity
{
    public string Code { get; set; } = string.Empty;
    public string NameVi { get; set; } = string.Empty;
    public string NameEn { get; set; } = string.Empty;
    public string BillingType { get; set; } = "MONTHLY";
    public decimal Price { get; set; }
    public bool IsLifetime { get; set; }
    public bool IsActive { get; set; } = true;
    public ICollection<SubscriptionPlanFeature> Features { get; set; } = new List<SubscriptionPlanFeature>();
}

public class SubscriptionPlanFeature : BaseEntity
{
    public Guid SubscriptionPlanId { get; set; }
    public SubscriptionPlan? SubscriptionPlan { get; set; }
    public string Code { get; set; } = string.Empty;
    public int Limit { get; set; }
}

public class PlatformSubscriptionOrder : BaseEntity
{
    public string PublicId { get; set; } = string.Empty;
    public string OrderCode { get; set; } = string.Empty;
    public Guid OwnerUserId { get; set; }
    public Guid TenantId { get; set; }
    public Guid SubscriptionPlanId { get; set; }
    public SubscriptionPlan? SubscriptionPlan { get; set; }
    public string Operation { get; set; } = "PURCHASE";
    public string PlanVersion { get; set; } = string.Empty;
    public string PlanCode { get; set; } = string.Empty;
    public string PlanName { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public string Currency { get; set; } = "VND";
    public string BillingPeriod { get; set; } = "MONTHLY";
    public int DurationValue { get; set; } = 1;
    public string DurationUnit { get; set; } = "MONTH";
    public string FeatureSnapshotJson { get; set; } = "{}";
    public string Status { get; set; } = "CREATED";
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime? AppliedAtUtc { get; set; }
    public string IdempotencyKey { get; set; } = string.Empty;
    public ICollection<PlatformPaymentAttempt> Attempts { get; set; } = new List<PlatformPaymentAttempt>();
}

public class PlatformPaymentAttempt : BaseEntity
{
    public Guid PlatformSubscriptionOrderId { get; set; }
    public PlatformSubscriptionOrder? PlatformSubscriptionOrder { get; set; }
    public string PublicId { get; set; } = string.Empty;
    public string Status { get; set; } = "PENDING";
    public string Provider { get; set; } = "SIMULATOR";
    public string Method { get; set; } = "SIMULATOR";
    public string Environment { get; set; } = "SIMULATOR";
    public decimal ExpectedAmount { get; set; }
    public string Currency { get; set; } = "VND";
    public string ProviderOrderReference { get; set; } = string.Empty;
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
    public string IdempotencyKey { get; set; } = string.Empty;
}

public class PlatformSubscriptionHistory : BaseEntity
{
    public Guid TenantId { get; set; }
    public string OrderPublicId { get; set; } = string.Empty;
    public string ActionType { get; set; } = string.Empty;
    public string? PreviousStateJson { get; set; }
    public string? NewStateJson { get; set; }
    public string ActorType { get; set; } = "USER";
    public Guid? ActorId { get; set; }
    public string? Reason { get; set; }
}

public class PropertyReview : BaseEntity
{
    public Guid TenantId { get; set; }
    public Tenant? Tenant { get; set; }
    public Guid ReservationId { get; set; }
    public Reservation? Reservation { get; set; }
    public Guid UserId { get; set; }
    public User? User { get; set; }
    public int Score { get; set; }
    public int CleanlinessScore { get; set; }
    public int ServiceScore { get; set; }
    public int LocationScore { get; set; }
    public int ValueScore { get; set; }
    public string? Title { get; set; }
    public string Comment { get; set; } = string.Empty;
    public bool IsPublished { get; set; } = true;
}

public class PropertyAmenity : BaseEntity, ITenantScopedEntity
{
    public Guid TenantId { get; set; }
    public Tenant? Tenant { get; set; }
    public string Code { get; set; } = string.Empty;
}

public class RefreshToken : BaseEntity
{
    public Guid UserId { get; set; }
    public User? User { get; set; }
    public string Token { get; set; } = string.Empty;
    public DateTime ExpiresAtUtc { get; set; }
    public bool IsRevoked { get; set; } = false;
}

public class TenantStaff : BaseEntity, ITenantScopedEntity
{
    public Guid TenantId { get; set; }
    public Tenant? Tenant { get; set; }

    public Guid UserId { get; set; }
    public User? User { get; set; }

    public StaffRole Role { get; set; } = StaffRole.Receptionist;
    public Guid? AccessRoleId { get; set; }
    public AccessRole? AccessRole { get; set; }
    public bool IsActive { get; set; } = true;
}

public class RoomType : BaseEntity, ITenantScopedEntity
{
    public Guid TenantId { get; set; }
    public Tenant? Tenant { get; set; }

    public string Name { get; set; } = string.Empty;
    public string? NameEn { get; set; }
    public string Code { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? DescriptionEn { get; set; }
    public decimal BasePricePerNight { get; set; }
    public int CapacityAdults { get; set; } = 2;
    public int CapacityChildren { get; set; } = 1;
    public double AreaSquareMeters { get; set; }
    public string? BedType { get; set; }
    public int BedCount { get; set; } = 1;
    public bool IsActive { get; set; } = true;
    public bool IncludesBreakfast { get; set; }
    public bool IsRefundable { get; set; } = true;
    public int FreeCancellationHours { get; set; } = 24;
    public bool SmokingAllowed { get; set; }

    public ICollection<Room> Rooms { get; set; } = new List<Room>();
    public ICollection<RoomImage> Images { get; set; } = new List<RoomImage>();
    public ICollection<RoomTypeAmenity> Amenities { get; set; } = new List<RoomTypeAmenity>();
    public ICollection<RoomRateOverride> RateOverrides { get; set; } = new List<RoomRateOverride>();
}

public class RoomRateOverride : BaseEntity, ITenantScopedEntity
{
    public Guid TenantId { get; set; }
    public Guid RoomTypeId { get; set; }
    public RoomType? RoomType { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public decimal NightlyPrice { get; set; }
    public int Priority { get; set; }
    public bool IsActive { get; set; } = true;
}

public class RoomTypeAmenity : BaseEntity, ITenantScopedEntity
{
    public Guid TenantId { get; set; }
    public Guid RoomTypeId { get; set; }
    public RoomType? RoomType { get; set; }
    public string Code { get; set; } = string.Empty;
}

public class Room : BaseEntity, ITenantScopedEntity
{
    public Guid TenantId { get; set; }
    public Tenant? Tenant { get; set; }

    public Guid RoomTypeId { get; set; }
    public RoomType? RoomType { get; set; }

    public string RoomNumber { get; set; } = string.Empty;
    public int Floor { get; set; } = 1;
    public RoomStatus Status { get; set; } = RoomStatus.Clean;
    public bool IsActive { get; set; } = true;
    public string? Notes { get; set; }
    public string? MaintenanceReason { get; set; }
    public DateTime? MaintenanceStartedAtUtc { get; set; }
    public DateTime? MaintenanceCompletedAtUtc { get; set; }
    public Guid? MaintenanceStartedByUserId { get; set; }
    public Guid? MaintenanceCompletedByUserId { get; set; }

    public byte[]? RowVersion { get; set; }
    public ICollection<ReservationDetail> ReservationDetails { get; set; } = new List<ReservationDetail>();
}

public class RoomImage : BaseEntity, ITenantScopedEntity
{
    public Guid TenantId { get; set; }
    public Guid RoomTypeId { get; set; }
    public RoomType? RoomType { get; set; }
      public string ImageUrl { get; set; } = string.Empty;
      public string? AltText { get; set; }
      public int DisplayOrder { get; set; } = 0;
}

public class BookingHold : BaseEntity, ITenantScopedEntity
{
    public Guid TenantId { get; set; }
    public Tenant? Tenant { get; set; }

    public Guid RoomTypeId { get; set; }
    public RoomType? RoomType { get; set; }

    public DateTime CheckInDate { get; set; }
    public DateTime CheckOutDate { get; set; }
    public int Quantity { get; set; } = 1;
    public string HoldToken { get; set; } = Guid.NewGuid().ToString("N");
    public string? ClientRequestKey { get; set; }
    public string? CouponCode { get; set; }
    public decimal BaseSubtotal { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal FeeAmount { get; set; }
    public decimal FinalTotal { get; set; }
    public Guid? PromotionId { get; set; }
    public string? PromotionCode { get; set; }
    public string? PromotionTitle { get; set; }
    public DateTime? PriceSnapshotUtc { get; set; }
    public string? NightlyRateBreakdownJson { get; set; }
    public DateTime ExpiresAtUtc { get; set; } = DateTime.UtcNow.AddMinutes(15);
    public bool IsReleased { get; set; } = false;
    public bool IsConvertedToReservation { get; set; } = false;
    public ICollection<RoomDateLock> RoomDateLocks { get; set; } = new List<RoomDateLock>();
}

public class RoomDateLock : BaseEntity, ITenantScopedEntity
{
    public Guid TenantId { get; set; }
    public Guid RoomId { get; set; }
    public Room? Room { get; set; }
    public DateOnly StayDate { get; set; }
    public Guid? BookingHoldId { get; set; }
    public BookingHold? BookingHold { get; set; }
    public Guid? ReservationId { get; set; }
    public Reservation? Reservation { get; set; }
    public DateTime? ExpiresAtUtc { get; set; }
}

public class Reservation : BaseEntity, ITenantScopedEntity
{
    public Guid TenantId { get; set; }
    public Tenant? Tenant { get; set; }

    public string BookingCode { get; set; } = string.Empty;
    public Guid? CustomerUserId { get; set; }
    public User? CustomerUser { get; set; }

    public string GuestFullName { get; set; } = string.Empty;
    public string GuestEmail { get; set; } = string.Empty;
    public string GuestPhoneNumber { get; set; } = string.Empty;
    public string? GuestIdentityCard { get; set; }

    public DateOnly CheckInDate { get; set; }
    public DateOnly CheckOutDate { get; set; }
    public DateTime? ActualCheckInUtc { get; set; }
    public DateTime? ActualCheckOutUtc { get; set; }

    public ReservationStatus Status { get; set; } = ReservationStatus.PendingPayment;
    public decimal TotalAmount { get; set; }
    public decimal DepositAmount { get; set; }
    public int AdultCount { get; set; } = 1;
    public int ChildCount { get; set; }
    public PaymentMethod PaymentMethodSnapshot { get; set; } = PaymentMethod.Cash;
    public string? SpecialRequests { get; set; }
    public string? ClientRequestKey { get; set; }
    public string? ClientRequestFingerprint { get; set; }
    public string? GuestAccessKey { get; set; }
    public string? CancellationReasonCode { get; set; }
    public string? CancellationReason { get; set; }
    public DateTime? CancelledAtUtc { get; set; }
    public bool IsRefundableSnapshot { get; set; } = true;
    public int FreeCancellationHoursSnapshot { get; set; } = 24;
    public DateTime? CancellationDeadlineUtc { get; set; }
    public string ConfirmationEmailStatus { get; set; } = "NOT_CONFIGURED";
    public DateTime? ConfirmationEmailLastAttemptUtc { get; set; }
    public DateTime? ConfirmationEmailSentAtUtc { get; set; }
    public string? ConfirmationEmailFailureReason { get; set; }

    public ICollection<ReservationDetail> Details { get; set; } = new List<ReservationDetail>();
    public Folio? Folio { get; set; }
    public ICollection<Payment> Payments { get; set; } = new List<Payment>();
    public ICollection<RoomDateLock> RoomDateLocks { get; set; } = new List<RoomDateLock>();
}

public class ReservationDetail : BaseEntity, ITenantScopedEntity
{
    public Guid TenantId { get; set; }
    public Guid ReservationId { get; set; }
    public Reservation? Reservation { get; set; }

    public Guid RoomTypeId { get; set; }
    public RoomType? RoomType { get; set; }

    public Guid? RoomId { get; set; }
    public Room? Room { get; set; }

    public decimal NightlyPrice { get; set; }
    public int NumberOfNights { get; set; }
    public decimal SubTotal { get; set; }
}

public class Folio : BaseEntity, ITenantScopedEntity
{
    public Guid TenantId { get; set; }
    public Guid ReservationId { get; set; }
    public Reservation? Reservation { get; set; }

    public string FolioNumber { get; set; } = string.Empty;
    public decimal TotalCharges { get; set; } = 0;
    public decimal TotalCredits { get; set; } = 0;
    public decimal BalanceDue => TotalCharges - TotalCredits;
    public bool IsClosed { get; set; } = false;
    public DateTime? ClosedAtUtc { get; set; }

    public ICollection<FolioItem> Items { get; set; } = new List<FolioItem>();
}

public class FolioItem : BaseEntity, ITenantScopedEntity
{
    public Guid TenantId { get; set; }
    public Guid FolioId { get; set; }
    public Folio? Folio { get; set; }

    public FolioItemType ItemType { get; set; } = FolioItemType.RoomCharge;
    public string Description { get; set; } = string.Empty;
    public decimal UnitPrice { get; set; }
    public int Quantity { get; set; } = 1;
    public decimal Amount => UnitPrice * Quantity;
    public DateTime DateIncurredUtc { get; set; } = DateTime.UtcNow;
    public string? CreatedByStaffName { get; set; }
}

public class HotelService : BaseEntity, ITenantScopedEntity
{
    public Guid TenantId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string NameVi { get; set; } = string.Empty;
    public string? NameEn { get; set; }
    public decimal Price { get; set; }
    public string? DescriptionVi { get; set; }
    public string? DescriptionEn { get; set; }
    public bool IsActive { get; set; } = true;
}

public class Payment : BaseEntity, ITenantScopedEntity
{
    public Guid TenantId { get; set; }
    public Guid ReservationId { get; set; }
    public Reservation? Reservation { get; set; }

    public decimal Amount { get; set; }
    public PaymentMethod Method { get; set; } = PaymentMethod.VNPay;
    public PaymentStatus Status { get; set; } = PaymentStatus.Pending;
    public string? ClientRequestKey { get; set; }
    public string? TransactionReference { get; set; }
    public DateTime? PaidAtUtc { get; set; }

    public ICollection<PaymentTransaction> Transactions { get; set; } = new List<PaymentTransaction>();
    public ICollection<PropertyRefund> Refunds { get; set; } = new List<PropertyRefund>();
}

public class PaymentTransaction : BaseEntity, ITenantScopedEntity
{
    public Guid TenantId { get; set; }
    public Guid PaymentId { get; set; }
    public Payment? Payment { get; set; }

    public string Provider { get; set; } = "VNPay";
    public string? TransactionNo { get; set; }
    public string? BankCode { get; set; }
    public string? ResponseCode { get; set; }
    public string? RawPayload { get; set; }
    public bool IsSuccess { get; set; }
}

public class PropertyRefund : BaseEntity, ITenantScopedEntity
{
    public Guid TenantId { get; set; }
    public Guid PaymentId { get; set; }
    public Payment? Payment { get; set; }
    public Guid? RequestedByUserId { get; set; }
    public string PublicId { get; set; } = string.Empty;
    public string IdempotencyKey { get; set; } = string.Empty;
    public decimal RequestedAmount { get; set; }
    public string Reason { get; set; } = string.Empty;
    public string Status { get; set; } = "PENDING_APPROVAL";
    public string? Provider { get; set; }
    public string? Environment { get; set; }
    public int AttemptNumber { get; set; }
    public string? ProviderReference { get; set; }
    public DateTime? ApprovedAtUtc { get; set; }
    public Guid? ApprovedByUserId { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
    public string? FailureCode { get; set; }
}

public class PropertyPaymentAttempt : BaseEntity, ITenantScopedEntity
{
    public Guid TenantId { get; set; }
    public Guid ReservationId { get; set; }
    public Reservation? Reservation { get; set; }
    public string PublicId { get; set; } = string.Empty;
    public string IdempotencyKey { get; set; } = string.Empty;
    public string Purpose { get; set; } = "DEPOSIT";
    public string Method { get; set; } = "MANUAL_TRANSFER";
    public string Provider { get; set; } = "SIMULATOR";
    public string Environment { get; set; } = "SIMULATOR";
    public string Status { get; set; } = "PENDING";
    public decimal ExpectedAmount { get; set; }
    public DateTime ExpiresAtUtc { get; set; }
    public string? UniqueTransferContent { get; set; }
    public string? ProviderReference { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
    public Guid? ConfirmedByUserId { get; set; }
    public string? ConfirmationReason { get; set; }
    public string? EvidenceReference { get; set; }
    public string? BankName { get; set; }
    public string? BankCode { get; set; }
    public string? AccountName { get; set; }
    public string? AccountNumberMasked { get; set; }
    public string? QrProvider { get; set; }
    public string? InstructionsVi { get; set; }
    public string? InstructionsEn { get; set; }
}

public class PropertyPaymentConfiguration : BaseEntity, ITenantScopedEntity
{
    public Guid TenantId { get; set; }
    public bool Enabled { get; set; }
    public string Environment { get; set; } = "SIMULATOR";
    public string? BankName { get; set; }
    public string? BankCode { get; set; }
    public string? AccountName { get; set; }
    public string? AccountNumber { get; set; }
    public string DepositPolicyType { get; set; } = "NONE";
    public decimal? DepositValue { get; set; }
    public int PaymentExpiryMinutes { get; set; } = 30;
    public string TransferTemplate { get; set; } = "BOOKING {paymentCode}";
    public string? QrProvider { get; set; }
    public string? InstructionsVi { get; set; }
    public string? InstructionsEn { get; set; }
    public string MethodsJson { get; set; } = "[]";
    public int Version { get; set; }
}

public class PlatformPaymentConfiguration : BaseEntity
{
    public string Provider { get; set; } = "SIMULATOR";
    public string Environment { get; set; } = "SIMULATOR";
    public bool Enabled { get; set; }
    public string? SecretReference { get; set; }
    public string? BankName { get; set; }
    public string? BankAccountMasked { get; set; }
    public string? CallbackUrl { get; set; }
    public bool ProductionApproved { get; set; }
    public Guid? ProductionApprovedByUserId { get; set; }
    public DateTime? ProductionApprovedAtUtc { get; set; }
}

public class HousekeepingTask : BaseEntity, ITenantScopedEntity
{
    public Guid TenantId { get; set; }
    public Guid RoomId { get; set; }
    public Room? Room { get; set; }
    public Guid? ReservationId { get; set; }
    public Reservation? Reservation { get; set; }

    public Guid? AssignedToStaffId { get; set; }
    public TenantStaff? AssignedToStaff { get; set; }

    public HousekeepingTaskStatus Status { get; set; } = HousekeepingTaskStatus.Pending;
    public HousekeepingPriority Priority { get; set; } = HousekeepingPriority.Normal;
    public string? TaskType { get; set; } = "CheckoutCleaning";
    public string? Notes { get; set; }
    public DateTime? AssignedAtUtc { get; set; }
    public DateTime? StartedAtUtc { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
    public DateTime? CancelledAtUtc { get; set; }
    public Guid? CancelledByUserId { get; set; }
    public string? CancellationReason { get; set; }
}

public class OperationalTask : BaseEntity, ITenantScopedEntity
{
    public Guid TenantId { get; set; }
    public string PublicId { get; set; } = string.Empty;
    public string TaskType { get; set; } = string.Empty;
    public string FunctionCode { get; set; } = string.Empty;
    public int RequiredAction { get; set; } = 64;
    public string AggregateType { get; set; } = string.Empty;
    public Guid AggregateId { get; set; }
    public string Status { get; set; } = "OPEN";
    public Guid? AssignedToUserId { get; set; }
    public string? ResultReference { get; set; }
    public int Version { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
    public string? ToolName { get; set; }
    public string? IdempotencyKey { get; set; }
}

public class Promotion : BaseEntity, ITenantScopedEntity
{
    public Guid TenantId { get; set; }
    public string ApplicationType { get; set; } = "AUTOMATIC";
    public string Code { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public decimal DiscountPercent { get; set; }
    public decimal? MaxDiscountAmount { get; set; }
    public decimal? MinBookingAmount { get; set; }
    public DateTime StartDateUtc { get; set; }
    public DateTime EndDateUtc { get; set; }
    public bool IsActive { get; set; } = true;
}
