# Kế Hoạch Kỹ Thuật Tổng Thể (Technical Implementation Plan)

## 1. Công Nghệ & Kiến Trúc

- **Backend**: ASP.NET Core Web API trên nền **.NET 10** (C# 13).
- **ORM & Data Access**: Entity Framework Core 10 với Microsoft SQL Server / PostgreSQL.
- **Multi-Tenancy**: Shared Database, Tenant Discriminator Column (`TenantId`) kết hợp EF Core Global Query Filter.
- **Authentication & Authorization**: JWT Access Token (ngắn hạn) + Refresh Token Rotation (7 ngày), Role-Based & Policy-Based Authorization.
- **Real-Time Communication**: ASP.NET Core SignalR cho module Buồng phòng & Bàn giao ca lễ tân.
- **Background Jobs**: .NET `BackgroundService` chạy định kỳ dọn dẹp các BookingHold quá hạn 15 phút.
- **Payment Gateway**: VNPay Sandbox API (chuẩn mã hóa SHA512, chữ ký số).

---

## 2. Thiết Kế Cơ Sở Dữ Liệu (Database Schema)

```
[Tenants] (Cơ sở lưu trú)
  ├── Id (PK)
  ├── Name, Code, Slug, Address, Phone, Email
  ├── SubscriptionTier (Basic, Pro, Enterprise)
  ├── IsActive, Status
  └── CustomVnPayTmnCode, CustomVnPaySecret

[TenantSubscriptions] (Lịch sử gói cước)
  ├── Id (PK), TenantId (FK)
  ├── Tier, StartDate, EndDate, AmountPaid, IsActive

[Users] (Người dùng)
  ├── Id (PK), TenantId (FK, null nếu là SuperAdmin hoặc Customer)
  ├── Username, Email, PasswordHash, FullName, PhoneNumber
  ├── GlobalRole (SuperAdmin, Customer)
  └── IsActive

[TenantStaff] (Nhân viên cơ sở)
  ├── Id (PK), TenantId (FK), UserId (FK)
  ├── StaffRole (Owner, Manager, Receptionist, Housekeeper)
  └── IsActive

[RoomTypes] (Loại phòng)
  ├── Id (PK), TenantId (FK)
  ├── Name, Code, BasePricePerNight, CapacityAdults, CapacityChildren, AreaSquareMeters
  └── Description, IsActive

[Rooms] (Phòng thực tế)
  ├── Id (PK), TenantId (FK), RoomTypeId (FK)
  ├── RoomNumber, Floor, Status (Clean, Dirty, Cleaning, Occupied, OutOfService)
  └── RowVersion (Concurrency Token)

[BookingHolds] (Khóa giữ phòng 15 phút)
  ├── Id (PK), TenantId (FK), RoomTypeId (FK)
  ├── CheckInDate, CheckOutDate, Quantity, HoldToken, ExpiresAtUtc, IsReleased

[Reservations] (Đơn đặt phòng)
  ├── Id (PK), TenantId (FK), CustomerUserId (FK, nullable)
  ├── BookingCode, GuestFullName, GuestEmail, GuestPhone
  ├── CheckInDate, CheckOutDate, ActualCheckInUtc, ActualCheckOutUtc
  ├── Status (PendingPayment, Confirmed, CheckedIn, CheckedOut, Cancelled)
  └── TotalAmount, DepositAmount

[ReservationDetails] (Chi tiết phòng trong đơn)
  ├── Id (PK), ReservationId (FK), RoomTypeId (FK), RoomId (FK, nullable)
  └── NightlyPrice, NumberOfNights, SubTotal

[Folios] & [FolioItems] (Hồ sơ tài chính & Chi phí phát sinh)
  ├── Folio: Id (PK), ReservationId (FK), TotalCharges, TotalCredits, BalanceDue, IsClosed
  └── FolioItem: Id (PK), FolioId (FK), ItemType, Description, UnitPrice, Quantity, Amount

[Payments] & [PaymentTransactions] (Thanh toán & VNPay)
  ├── Payment: Id (PK), ReservationId (FK), Amount, Method, Status
  └── PaymentTransaction: Id (PK), PaymentId (FK), Provider, TransactionNo, ResponseCode

[HousekeepingTasks] (Công việc buồng phòng)
  ├── Id (PK), TenantId (FK), RoomId (FK), AssignedStaffId (FK, nullable)
  └── Status, Priority, Notes, StartedAtUtc, CompletedAtUtc
```

---

## 3. Cấu Trúc Mã Nguồn Dự Kiến

```
hotel-saas-platform/
├── backend/
│   ├── HotelSaas.sln
│   ├── src/
│   │   ├── HotelSaas.Domain/               # Entities, Enums, Multi-tenant Base, Exceptions
│   │   ├── HotelSaas.Application/          # DTOs, Use Cases, Interfaces, Validators, Result<T>
│   │   ├── HotelSaas.Infrastructure/       # EF Core Context, Tenant Resolution, VNPay, SignalR
│   │   └── HotelSaas.WebApi/               # REST API Controllers, Middlewares, Swagger, DI
│   └── tests/
├── frontend/                               # Angular 20+ Client (Customer Portal & Tenant Admin)
└── docs/                                   # Toàn bộ Spec-Driven Documents
```
