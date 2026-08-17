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

    public SubscriptionTier SubscriptionTier { get; set; } = SubscriptionTier.Basic;
    public TenantStatus Status { get; set; } = TenantStatus.Active;

    // Cổng VNPay riêng (nếu gói Enterprise)
    public string? CustomVnPayTmnCode { get; set; }
    public string? CustomVnPayHashSecret { get; set; }

    public ICollection<TenantStaff> StaffMembers { get; set; } = new List<TenantStaff>();
    public ICollection<RoomType> RoomTypes { get; set; } = new List<RoomType>();
    public ICollection<Room> Rooms { get; set; } = new List<Room>();
    public ICollection<Reservation> Reservations { get; set; } = new List<Reservation>();
}

public class User : BaseEntity
{
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string? PhoneNumber { get; set; }
    public GlobalUserRole GlobalRole { get; set; } = GlobalUserRole.Customer;
    public bool IsActive { get; set; } = true;

    // Nếu thuộc 1 cơ sở cụ thể
    public Guid? TenantId { get; set; }
    public Tenant? Tenant { get; set; }

    public ICollection<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();
    public ICollection<TenantStaff> TenantStaffProfiles { get; set; } = new List<TenantStaff>();
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
    public bool IsActive { get; set; } = true;
}

public class RoomType : BaseEntity, ITenantScopedEntity
{
    public Guid TenantId { get; set; }
    public Tenant? Tenant { get; set; }

    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? Description { get; set; }
    public decimal BasePricePerNight { get; set; }
    public int CapacityAdults { get; set; } = 2;
    public int CapacityChildren { get; set; } = 1;
    public double AreaSquareMeters { get; set; }
    public string? BedType { get; set; }
    public bool IsActive { get; set; } = true;

    public ICollection<Room> Rooms { get; set; } = new List<Room>();
    public ICollection<RoomImage> Images { get; set; } = new List<RoomImage>();
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

    public byte[]? RowVersion { get; set; }
    public ICollection<ReservationDetail> ReservationDetails { get; set; } = new List<ReservationDetail>();
}

public class RoomImage : BaseEntity, ITenantScopedEntity
{
    public Guid TenantId { get; set; }
    public Guid RoomTypeId { get; set; }
    public RoomType? RoomType { get; set; }
    public string ImageUrl { get; set; } = string.Empty;
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
    public DateTime ExpiresAtUtc { get; set; } = DateTime.UtcNow.AddMinutes(15);
    public bool IsReleased { get; set; } = false;
    public bool IsConvertedToReservation { get; set; } = false;
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
    public string? SpecialRequests { get; set; }
    public string? CancellationReason { get; set; }

    public ICollection<ReservationDetail> Details { get; set; } = new List<ReservationDetail>();
    public Folio? Folio { get; set; }
    public ICollection<Payment> Payments { get; set; } = new List<Payment>();
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

public class Payment : BaseEntity, ITenantScopedEntity
{
    public Guid TenantId { get; set; }
    public Guid ReservationId { get; set; }
    public Reservation? Reservation { get; set; }

    public decimal Amount { get; set; }
    public PaymentMethod Method { get; set; } = PaymentMethod.VNPay;
    public PaymentStatus Status { get; set; } = PaymentStatus.Pending;
    public string? TransactionReference { get; set; }
    public DateTime? PaidAtUtc { get; set; }

    public ICollection<PaymentTransaction> Transactions { get; set; } = new List<PaymentTransaction>();
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

public class HousekeepingTask : BaseEntity, ITenantScopedEntity
{
    public Guid TenantId { get; set; }
    public Guid RoomId { get; set; }
    public Room? Room { get; set; }

    public Guid? AssignedToStaffId { get; set; }
    public TenantStaff? AssignedToStaff { get; set; }

    public HousekeepingTaskStatus Status { get; set; } = HousekeepingTaskStatus.Pending;
    public HousekeepingPriority Priority { get; set; } = HousekeepingPriority.Normal;
    public string? TaskType { get; set; } = "CheckoutCleaning";
    public string? Notes { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
}

public class Promotion : BaseEntity, ITenantScopedEntity
{
    public Guid TenantId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public decimal DiscountPercent { get; set; }
    public decimal? MaxDiscountAmount { get; set; }
    public decimal? MinBookingAmount { get; set; }
    public DateTime StartDateUtc { get; set; }
    public DateTime EndDateUtc { get; set; }
    public bool IsActive { get; set; } = true;
}
