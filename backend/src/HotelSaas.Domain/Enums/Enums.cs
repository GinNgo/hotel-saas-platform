namespace HotelSaas.Domain.Enums;

public enum SubscriptionTier
{
    Basic = 1,       // Quản lý phòng & đặt phòng cơ bản
    Pro = 2,         // Thêm Folio, Minibar/Dịch vụ, Phân quyền nhân viên, Realtime buồng phòng
    Enterprise = 3   // Thêm Cổng VNPay riêng, Báo cáo RevPAR/ADR nâng cao, Đa chi nhánh
}

public enum TenantStatus
{
    PendingApproval = 1,
    Active = 2,
    Suspended = 3
}

public enum GlobalUserRole
{
    SuperAdmin = 1,
    Customer = 2,
    TenantStaff = 3
}

public enum StaffRole
{
    Owner = 1,
    Manager = 2,
    Receptionist = 3,
    Housekeeper = 4
}

public enum RoomStatus
{
    Clean = 1,
    Dirty = 2,
    Cleaning = 3,
    Occupied = 4,
    OutOfService = 5
}

public enum ReservationStatus
{
    PendingPayment = 1,
    Confirmed = 2,
    CheckedIn = 3,
    CheckedOut = 4,
    Cancelled = 5,
    NoShow = 6
}

public enum PaymentStatus
{
    Pending = 1,
    Completed = 2,
    Failed = 3,
    Refunded = 4,
    Expired = 5
}

public enum PaymentMethod
{
    VNPay = 1,
    Cash = 2,
    BankTransfer = 3,
    CreditCard = 4
}

public enum FolioItemType
{
    RoomCharge = 1,
    Minibar = 2,
    Laundry = 3,
    Restaurant = 4,
    Surcharge = 5,
    Discount = 6,
    DepositPayment = 7,
    Tax = 8,
    ServiceCharge = 9
}

public enum HousekeepingPriority
{
    Low = 1,
    Normal = 2,
    High = 3,
    Urgent = 4
}

public enum HousekeepingTaskStatus
{
    Pending = 1,
    InProgress = 2,
    Completed = 3,
    Claimed = 4
}
