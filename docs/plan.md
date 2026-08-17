# Kế Hoạch Kỹ Thuật & Cấu Trúc Giao Diện (Technical & Design Plan)

## 1. Thiết Kế Hệ Thống Giao Diện (Design System Spec)

- **Style**: Liquid Glass / Modern Flat Clean (Giao diện phẳng, tinh tế, đổ bóng dịu, bo góc `12px - 16px`).
- **Bảng Màu (Color Tokens)**:
  - `--primary`: `#0284C7` (Sky Blue - Traveloka Brand Style)
  - `--primary-hover`: `#0369A1`
  - `--accent-orange`: `#F59E0B` (Amber Orange - Agoda Action CTA)
  - `--bg-main`: `#F8FAFC` (Slate 50)
  - `--card-bg`: `#FFFFFF`
  - `--text-main`: `#0F172A` (Slate 900)
  - `--text-muted`: `#64748B` (Slate 500)
  - `--status-clean`: `#10B981` (Emerald Green)
  - `--status-dirty`: `#F59E0B` (Amber Yellow)
  - `--status-occupied`: `#EF4444` (Rose Red)

- **Typography System**:
  - Heading: `Plus Jakarta Sans`, font-weight 600/700
  - Body: `Inter` / `System Sans-Serif`, font-size 15px - 16px, line-height 1.5

---

## 2. Kiến Trúc Backend .NET 10 Web API

```
hotel-saas-platform/backend/
├── HotelSaas.sln
├── src/
│   ├── HotelSaas.Domain/               # BaseEntity, ITenantScopedEntity, Enums, Entities
│   ├── HotelSaas.Application/          # Interfaces, Result<T>, DTOs
│   ├── HotelSaas.Infrastructure/       # ApplicationDbContext (Global Query Filter), VNPay, SignalR, Worker
│   └── HotelSaas.WebApi/               # Controllers, Middlewares, DbInitializer, Swagger
```

---

## 3. Bản Đồ API Endpoints (API Mapping)

| Endpoint | Method | Vai trò | Mô tả nghiệp vụ |
| :--- | :---: | :--- | :--- |
| `/api/auth/register-customer` | `POST` | Guest | Đăng ký tài khoản khách hàng |
| `/api/auth/login` | `POST` | All | Đăng nhập hệ thống (trả JWT + TenantId + StaffRole) |
| `/api/tenants` | `GET` | Public | Danh sách các cơ sở lưu trú hoạt động |
| `/api/tenants/register-property` | `POST` | Tenant Owner| Đăng ký cơ sở lưu trú mới trên sàn |
| `/api/tenants/{id}/subscription-tier` | `PUT` | SuperAdmin | Nâng/Hạ gói dịch vụ SaaS (`Basic`, `Pro`, `Enterprise`) |
| `/api/rooms/search` | `GET` | Guest | Tìm kiếm phòng trống theo khoảng ngày không overlap |
| `/api/reservations/hold` | `POST` | Guest | Khóa giữ chỗ 15 phút (chống overbooking) |
| `/api/reservations/confirm` | `POST` | Guest | Xác nhận thông tin và tạo đơn đặt phòng kèm Folio |
| `/api/payments/vnpay-url/{id}` | `POST` | Guest | Sinh URL thanh toán VNPay Sandbox chữ ký SHA512 |
| `/api/payments/vnpay-callback` | `GET` | Public | Xử lý VNPay Callback & IPN xác nhận đơn |
| `/api/frontdesk/check-in` | `POST` | Receptionist| Check-in gán phòng vật lý (chỉ phòng `Clean`) |
| `/api/frontdesk/folio/add-item` | `POST` | Receptionist| Ghi nhận chi phí dịch vụ vào Folio (Khóa nếu gói Basic) |
| `/api/frontdesk/check-out` | `POST` | Receptionist| Quyết toán số dư, đóng Folio, đổi phòng sang `Dirty` |
| `/api/analytics/tenant-dashboard` | `GET` | Manager | Báo cáo tỷ lệ lấp đầy, doanh thu, RevPAR, ADR |
| `/api/analytics/platform-overview` | `GET` | SuperAdmin | Báo cáo tổng thể toàn sàn SaaS |
