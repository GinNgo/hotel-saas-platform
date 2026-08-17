# Danh Sách Nhiệm Vụ Triển Khai (Actionable Task List)

Dự án được chia thành các Giai đoạn rõ ràng. Mỗi AI Agent hoặc Developer khi tiếp nhận hãy kiểm tra checklist này để thực thi từng bước:

- [ ] **Giai Đoạn 1: Khởi Tạo Bộ Khung Solution .NET 10 Multi-Tenant**
  - [ ] 1.1 Khởi tạo Solution `HotelSaas.sln` với 4 dự án Clean Architecture (`Domain`, `Application`, `Infrastructure`, `WebApi`).
  - [ ] 1.2 Thiết lập các Entity cốt lõi trong `HotelSaas.Domain` với `ITenantScopedEntity` và `BaseEntity`.
  - [ ] 1.3 Cấu hình `ICurrentTenantService` và `ApplicationDbContext` với EF Core Global Query Filters.
  - [ ] 1.4 Tạo Migration ban đầu (`InitialSaaSPlatformSchema`) và Seeder mẫu (SuperAdmin, 2 Khách sạn mẫu với gói Pro & Basic, Danh mục phòng).

- [ ] **Giai Đoạn 2: Phân Hệ Quản Trị Sàn & Quản Lý Cơ Sở (Platform & Tenant Management)**
  - [ ] 2.1 API SuperAdmin: Đăng ký cơ sở mới, duyệt cơ sở, cấu hình gói dịch vụ (`Basic`, `Pro`, `Enterprise`).
  - [ ] 2.2 API Xác thực: Đăng nhập đa vai trò (SuperAdmin, Tenant Owner/Staff, Customer) với JWT Claim `tenant_id` & `role`.
  - [ ] 2.3 Middleware `TenantResolutionMiddleware` tự động nhận diện Tenant qua Subdomain hoặc Header `X-Tenant-Id`.

- [ ] **Giai Đoạn 3: Phân Hệ Quản Lý Phòng & Giữ Phòng (Room & Booking Hold Engine)**
  - [ ] 3.1 API Quản lý loại phòng, giá cơ bản, tiện ích, ảnh của từng cơ sở.
  - [ ] 3.2 Thuật toán tìm kiếm phòng trống theo ngày (Availability Query không overlap).
  - [ ] 3.3 API Khóa giữ chỗ `POST /api/reservations/hold` (15 phút) chống Race Condition / Overbooking.
  - [ ] 3.4 Background Worker `ExpiredBookingHoldCleanupWorker` tự động giải phóng phòng hết hạn.

- [ ] **Giai Đoạn 4: Phân Hệ Đặt Phòng & Cổng Thanh Toán VNPay Sandbox**
  - [ ] 4.1 API Xác nhận đặt phòng `POST /api/reservations/confirm` sinh mã `LXS-YYYYMMDD-XXXXXX`.
  - [ ] 4.2 Module VNPay: Tự động ký HMAC-SHA512, sinh Payment URL (Hỗ trợ cấu hình VNPay chung của sàn hoặc riêng từng cơ sở).
  - [ ] 4.3 Endpoint tiếp nhận VNPay Callback & IPN Webhook xử lý Idempotency, cập nhật `ReservationStatus = Confirmed`.

- [ ] **Giai Đoạn 5: Phân Hệ Vận Hành Lễ Tân & Hồ Sơ Folio (Front Desk & PMS)**
  - [ ] 5.1 API Lễ tân Check-in: Gán số phòng vật lý (101, 102), đổi trạng thái phòng sang `Occupied`.
  - [ ] 5.2 API Ghi nhận dịch vụ phát sinh (Minibar, giặt ủi, ẩm thực) vào `Folio`.
  - [ ] 5.3 API Lễ tân Check-out: Quyết toán Folio, thu tiền còn thiếu, tự động đổi phòng sang `Dirty`.

- [ ] **Giai Đoạn 6: Phân Hệ Buồng Phòng & Real-time SignalR (Housekeeping Module)**
  - [ ] 6.1 Bảng công việc buồng phòng (Housekeeping Task List / Kanban).
  - [ ] 6.2 SignalR `RoomHub`: Cập nhật tức thời trạng thái phòng giữa Lễ tân và Buồng phòng.
  - [ ] 6.3 Kiểm tra phân tầng tính năng: Khóa module nếu cơ sở đang dùng gói Basic.

- [ ] **Giai Đoạn 7: Phân Hệ Báo Cáo Thống Kê Nâng Cao (Analytics Module)**
  - [ ] 7.1 Báo cáo chỉ số khách sạn: Tỷ lệ lấp đầy (Occupancy Rate), ADR, RevPAR, Doanh thu theo tháng.
  - [ ] 7.2 Báo cáo toàn sàn cho SuperAdmin: Tổng cơ sở hoạt động, tổng booking, doanh thu nền tảng.

- [ ] **Giai Đoạn 8: Tích Hợp Giao Diện Angular Client & Kiểm Thử Toàn Diện**
  - [ ] 8.1 Kết nối giao diện Portal Khách hàng (Tìm phòng, đặt phòng, thanh toán VNPay).
  - [ ] 8.2 Kết nối giao diện Quản trị Cơ sở (Lễ tân, Buồng phòng, Folio, Thống kê).
  - [ ] 8.3 Kiểm thử E2E và xuất tài liệu nghiệm thu bảo vệ Đồ án Tốt nghiệp.
