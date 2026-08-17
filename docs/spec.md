# Đặc Tả Yêu Cầu Nghiệp Vụ (System Business Specification)

## 1. Đối Tượng Người Dùng (Actors)

### 1.1. Khách Hàng (Customer / Guest)
- Duyệt danh sách các cơ sở lưu trú (khách sạn, resort, homestay).
- Tìm kiếm phòng theo địa điểm, khoảng ngày (Check-in, Check-out), số lượng người lớn/trẻ em.
- Chọn phòng và tạo phiên giữ chỗ tạm thời (Booking Hold) trong 15 phút.
- Thanh toán trực tuyến qua cổng VNPay Sandbox hoặc chọn thanh toán tại quầy (tùy chính sách cơ sở).
- Tra cứu lịch sử đặt phòng bằng mã đặt phòng hoặc tài khoản cá nhân.

### 1.2. Cơ Sở Lưu Trú (Property / Hotel Tenant)
Cơ sở đăng ký tài khoản và được phân quyền sử dụng hệ thống tùy theo **Gói Dịch Vụ (Feature Tiers)**:

| Phân hệ chức năng | Gói BASIC | Gói PRO | Gói ENTERPRISE |
| :--- | :---: | :---: | :---: |
| **Quản lý Thông tin Cơ sở & Phòng** | ✅ | ✅ | ✅ |
| **Tìm kiếm & Đặt phòng Trực tuyến** | ✅ | ✅ | ✅ |
| **Check-in / Check-out Cơ bản** | ✅ | ✅ | ✅ |
| **Quản lý Hồ sơ Quyết toán (Guest Folio)** | ❌ | ✅ | ✅ |
| **Dịch vụ Gia tăng (Minibar, Giặt ủi, Nhà hàng)** | ❌ | ✅ | ✅ |
| **Phân quyền Nhân viên (Lễ tân, Buồng phòng)** | ❌ | ✅ | ✅ |
| **Bảng điều khiển Buồng phòng Kanban (SignalR)** | ❌ | ✅ | ✅ |
| **Cấu hình Giá Linh hoạt theo Mùa (Seasonal Pricing)**| ❌ | ✅ | ✅ |
| **Cổng Thanh toán VNPay Riêng của Cơ sở** | ❌ | ❌ | ✅ |
| **Báo cáo Chuyên sâu Khách sạn (RevPAR, ADR, Occupancy)**| ❌ | ❌ | ✅ |

### 1.3. Admin Hệ Thống (Platform Super Admin)
- Quản lý danh sách các Cơ sở trên sàn: Xem xét, Duyệt, Kích hoạt, Tạm khóa.
- Quản lý danh mục Gói cước SaaS (`Basic`, `Pro`, `Enterprise`) và thời hạn thuê bao.
- Báo cáo tổng thể toàn sàn: Số lượng cơ sở, lượng booking phát sinh, doanh thu phí nền tảng.

---

## 2. Luồng Nghiệp Vụ Chính (Core Workflows)

### 2.1. Luồng Đặt Phòng Trực Tuyến (Online Booking Flow)
```mermaid
sequenceDiagram
    autonumber
    actor Guest as Khách hàng
    participant API as Web API
    participant DB as CSDL (EF Core)
    participant VNPay as Cổng VNPay

    Guest->>API: Tìm phòng (CheckIn, CheckOut, Khách)
    API->>DB: Query phòng trống (trừ phòng bận & phòng đang hold)
    DB-->>API: Danh sách loại phòng khả dụng
    API-->>Guest: Trả về kết quả tìm kiếm

    Guest->>API: Chọn phòng -> POST /api/reservations/hold
    API->>DB: Tạo BookingHold (hết hạn sau 15 phút)
    API-->>Guest: Trả về HoldToken

    Guest->>API: Nhập thông tin khách -> POST /api/reservations/confirm
    API->>DB: Tạo Reservation (Status: PendingPayment) + Tạo Folio
    API->>VNPay: Sinh URL thanh toán có chữ ký HMAC-SHA512
    API-->>Guest: Trả về Payment URL

    Guest->>VNPay: Quét mã QR / Thẻ ngân hàng thanh toán
    VNPay->>API: Callback / IPN Webhook
    API->>DB: Xác thực chữ ký -> ReservationStatus = Confirmed -> Cập nhật Folio
    API-->>Guest: Hiển thị Đặt phòng thành công
```

### 2.2. Luồng Vận Hành Lễ Tân & Quyết Toán (Front Desk & Folio Flow)
```mermaid
sequenceDiagram
    autonumber
    actor Rec as Lễ tân
    participant API as Web API
    participant DB as CSDL (EF Core)
    participant HK as Buồng phòng

    Rec->>API: Khách đến -> Check-in (gán số phòng cụ thể 101, 102)
    API->>DB: Room.Status = Occupied, Reservation.Status = CheckedIn
    
    Note over Rec,API: Trong quá trình lưu trú
    Rec->>API: Ghi nhận nước uống minibar / giặt ủi
    API->>DB: Thêm FolioItem vào Folio của phòng (TotalCharges tăng)

    Note over Rec,API: Ngày trả phòng
    Rec->>API: Yêu cầu Check-out
    API->>DB: Kiểm tra BalanceDue (Phải thu đủ tiền)
    Rec->>API: Thu tiền còn thiếu -> Folio.IsClosed = true
    API->>DB: Room.Status = Dirty -> Tự động sinh HousekeepingTask
    API->>HK: SignalR Push thông báo phòng cần dọn
```
