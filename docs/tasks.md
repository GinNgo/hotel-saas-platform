# Danh Sách Nhiệm Vụ Hoàn Thiện Dự Án (Actionable Tasks)

Dưới đây là danh sách công việc đập đi xây lại từng bước từ Giao diện $	o$ Móc API $	o$ Tối ưu UX/UI:

- [x] **Giai Đoạn 1: Chuẩn Bị Repo Mới & Khởi Tạo Backend .NET 10 Multi-Tenant**
  - [x] 1.1 Tạo repo mới `hotel-saas-platform` và thiết lập tài liệu Spec-Driven Development.
  - [x] 1.2 Dựng Solution `HotelSaas.sln` với 4 dự án Clean Architecture.
  - [x] 1.3 Cấu hình EF Core Global Query Filter tự động lọc theo `TenantId`.
  - [x] 1.4 Sinh Migration `InitialSaaSPlatformSchema` và Seed Data mẫu thành công.

- [ ] **Giai Đoạn 2: Xây Lại Giao Diện Trang Chủ & Widget Tìm Kiếm (Traveloka/iVIVU Style)**
  - [ ] 2.1 Thiết kế Hero Search Widget nổi bật với bộ chọn Điểm đến, Popup Chọn Lịch 2 tháng, Counter chọn Khách/Phòng.
  - [ ] 2.2 Móc API `GET /api/rooms/search` hiển thị danh sách phòng trống thực tế từ .NET 10.
  - [ ] 2.3 Tối ưu UX: Thêm Skeleton Loading khi chờ dữ liệu API, validate ngày trả phòng phải sau ngày nhận phòng.

- [ ] **Giai Đoạn 3: Trang Kết Quả Tìm Kiếm & Chi Tiết Phòng (Agoda Style)**
  - [ ] 3.1 Dựng Sidebar Bộ lọc Đa Chiều (Khoảng giá slider, Hạng sao ⭐, Tiện ích bể bơi/bữa sáng).
  - [ ] 3.2 Dựng Thẻ Khách sạn (Hotel Card) kèm Slider ảnh, Điểm đánh giá (vd: `9.4/10`), Badge "Hủy miễn phí".
  - [ ] 3.3 Dựng Bảng Loại Phòng (Room Comparison Matrix) kèm nút **"Khóa giữ phòng 15p"**.

- [ ] **Giai Đoạn 4: Trang Đặt Phòng & Thanh Toán VNPay Sandbox (Checkout Flow)**
  - [ ] 4.1 Dựng màn hình Checkout 1 trang với đồng hồ đếm ngược 15:00 giữ chỗ.
  - [ ] 4.2 Móc API `POST /api/reservations/hold` và `POST /api/reservations/confirm`.
  - [x] 4.3 Kết nối nút thanh toán VNPay QR Code sang Cổng Sandbox và xử lý trang Callback kết quả.
  - [x] 4.4 Tách IPN server-to-server authoritative khỏi redirect callback; callback không thay đổi dữ liệu.

- [ ] **Giai Đoạn 5: Portal Quản Trị Khách Sạn & Lễ Tân (PMS Extranet)**
  - [ ] 5.1 Dựng Sơ đồ ma trận phòng (Room Grid) với mã màu trạng thái: Xanh (Clean), Vàng (Dirty), Đỏ (Occupied).
  - [ ] 5.2 Móc API Lễ tân Check-in (Gán số phòng vật lý 101, 102).
  - [ ] 5.3 Móc API Ghi nhận chi phí Minibar/Giặt ủi vào Folio và Check-out quyết toán.
  - [ ] 5.4 Kiểm tra phân tầng gói cước: Hiển thị cảnh báo nâng cấp gói nếu cơ sở dùng gói Basic cố vào Folio.

- [ ] **Giai Đoạn 6: Portal Quản Trị Sàn SaaS (SuperAdmin Portal)**
  - [ ] 6.1 Dựng màn hình danh sách cơ sở, nút duyệt/kích hoạt tài khoản.
  - [ ] 6.2 Dựng form Nâng/Hạ gói dịch vụ SaaS (`Basic`, `Pro`, `Enterprise`).
  - [ ] 6.3 Móc API `GET /api/analytics/platform-overview` hiển thị biểu đồ doanh thu toàn sàn.

- [ ] **Giai Đoạn 7: Kiểm Thử E2E & Nghiệm Thu Đồ Án**
  - [ ] 7.1 Kiểm thử E2E luồng người dùng từ Tìm phòng $	o$ Giữ chỗ 15p $	o$ VNPay $	o$ Lễ tân Check-in $	o$ Folio $	o$ Check-out.
  - [ ] 7.2 Hoàn thiện báo cáo Đồ án Tốt nghiệp và xuất tài liệu hướng dẫn vận hành.
