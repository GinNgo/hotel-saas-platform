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
  - [x] 4.2 Móc API `POST /api/reservations/hold` và `POST /api/reservations/confirm`; khóa tồn kho bằng `RoomDateLock` unique theo phòng/ngày.
  - [x] 4.3 Kết nối nút thanh toán VNPay QR Code sang Cổng Sandbox và xử lý trang Callback kết quả.
  - [x] 4.4 Tách IPN server-to-server authoritative khỏi redirect callback; callback không thay đổi dữ liệu.

- [ ] **Giai Đoạn 5: Portal Quản Trị Khách Sạn & Lễ Tân (PMS Extranet)**
  - Ghi nhận audit (2026-08-21): backend đã có các controller/test cho check-in, folio, check-out, housekeeping và realtime; cần bổ sung nghiệm thu UI trên môi trường backend thật và đối chiếu feature-gating Basic/Pro.
  - [x] 5.1 Dựng Room Grid realtime theo tầng với xanh (Clean), vàng (Dirty), đỏ (Occupied), kèm icon/nhãn accessible, view danh sách và filter server-side.
  - [x] 5.2 Móc API Lễ tân Check-in: workspace chọn đúng số phòng sạch theo hạng, gọi nghiệp vụ authoritative và xử lý xung đột trạng thái.
  - [x] 5.3 Móc API ghi nhận Minibar/Giặt ủi đúng loại folio, giá catalog authoritative, số lượng nguyên, idempotency và check-out quyết toán tạo hóa đơn/việc dọn phòng.
  - [x] 5.4 Chặn service/surcharge folio authoritative ở backend cho gói Basic và hiển thị cảnh báo nâng cấp gói PRO ngay trong workspace quyết toán.

- [ ] **Giai Đoạn 6: Portal Quản Trị Sàn SaaS (SuperAdmin Portal)**
  - Ghi nhận audit (2026-08-21): đã có API/controller/test cho tenant, subscription và platform analytics; checklist UI chưa có bằng chứng E2E đủ cho duyệt/kích hoạt và nâng/hạ gói.
  - [ ] 6.1 Dựng màn hình danh sách cơ sở, nút duyệt/kích hoạt tài khoản.
  - [ ] 6.2 Dựng form Nâng/Hạ gói dịch vụ SaaS (`Basic`, `Pro`, `Enterprise`).
  - [ ] 6.3 Móc API `GET /api/analytics/platform-overview` hiển thị biểu đồ doanh thu toàn sàn.

- [ ] **Giai Đoạn 7: Kiểm Thử E2E & Nghiệm Thu Đồ Án**
  - [ ] 7.1 Kiểm thử E2E luồng người dùng từ Tìm phòng -> Giữ chỗ 15p -> VNPay -> Lễ tân Check-in -> Folio -> Check-out.
    - [x] Gate smoke chạy hành trình tạo booking + payment idempotency và check-in -> folio -> thanh toán nhiều lần -> check-out -> hóa đơn bất biến.
    - [x] Integration test SQLite chạy cùng một reservation qua hold -> booking -> VNPay IPN -> check-in -> service folio -> checkout -> housekeeping.
    - [ ] Ghép search/hold/VNPay và PMS thành một journey liên tục dùng chung reservation identity trên môi trường tích hợp.
    - Phần còn thiếu: browser E2E chạy trên backend tích hợp thật; các gate Playwright hiện vẫn dùng fixture riêng.
  - [x] 7.3 Thêm relational concurrency test và k6 load scenario cho luồng hold chống overbooking.
  - [x] 7.4 Thêm Playwright visual regression gate desktop/mobile với reduced-motion và baseline Liquid Glass.
  - [ ] 7.2 Hoàn thiện báo cáo Đồ án Tốt nghiệp và xuất tài liệu hướng dẫn vận hành.
