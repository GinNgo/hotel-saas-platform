# Hiến Chương Dự Án (Project Constitution)
**Tên dự án**: Multi-Tenant Hotel Management & Online Booking Platform (Traveloka & Agoda Benchmark Standard)
**Phiên bản**: 2.0.0-COMPLETE
**Mục tiêu**: Đồ Án Tốt Nghiệp Đại Học CNTT - Thiết kế chuẩn UX/UI quốc tế & Kiến trúc .NET 10 Multi-Tenant Clean Architecture.

---

## 1. Nguyên Tắc Thiết Kế Trải Nghiệm Người Dùng (UX/UI Principles)

1. **Hiệu Năng Nhanh & Tối Ưu Tải Trang (Lightning-Fast Performance)**:
   - Thời gian phản hồi trang dưới **300ms**, hỗ trợ Skeleton Loading khi đang chờ dữ liệu API.
   - Không bị giật/nháy giao diện (Cumulative Layout Shift CLS < 0.1).

2. **Giao Diện Trực Quan Học Hỏi Từ Traveloka, Agoda, iVIVU**:
   - **Hero Search Widget**: Nổi bật, dễ chọn điểm đến, popup lịch 2 tháng kép, bộ đếm số khách/phòng dạng `+`/`-`.
   - **Thẻ Khách Sạn (Hotel Card)**: Hiển thị nổi bật Điểm đánh giá (vd: `9.4/10 Tuyệt vời`), Tiện ích miễn phí (Bữa sáng, Hồ bơi), Huy hiệu ưu đãi ("Khuyến mãi chớp nhoáng"), và Giá minh bạch (đã gồm thuế/phí).
   - **Luồng Đặt Phòng 1 Trang (One-Step Checkout)**: Form thông tin khách cố định bên trái, cột Tóm tắt đơn hàng (Sticky Order Summary) bên phải kèm đồng hồ đếm ngược 15:00 giữ chỗ.

3. **Giao Diện Quản Trị Khách Sạn Chuyên Nghiệp (PMS Dashboard)**:
   - Ma trận phòng trực quan (**Room Status Grid**) phân biệt bằng mã màu rõ ràng:
     - 🟢 **Xanh lá**: Clean (Đã dọn sạch, sẵn sàng đón khách).
     - 🟡 **Vàng cam**: Dirty (Cần dọn dẹp sau check-out).
     - 🔴 **Đỏ**: Occupied (Đang có khách ở).
     - 🔘 **Xám**: OutOfService (Đang bảo trì).
   - Thao tác Lễ tân 1-Click: Check-in gán phòng, Thêm món Minibar vào Folio, Check-out quyết toán.

---

## 2. Nguyên Tắc Kiến Trúc & Kỹ Thuật (Technical Principles)

1. **.NET 10 Clean Architecture**:
   - Tách biệt 4 tầng: `Domain` $	o$ `Application` $	o$ `Infrastructure` $	o$ `WebApi`.
   - Sử dụng **Result Pattern (`Result<T>`)** cho toàn bộ API Response.

2. **Multi-Tenant Data Isolation (Chống Rò Rỉ Dữ Liệu)**:
   - Áp dụng **EF Core Global Query Filters** (`HasQueryFilter(e => e.TenantId == CurrentTenantId)`).

3. **Phân Tầng Tính Năng Theo Gói SaaS (Feature Tiers)**:
   - Gói **Basic**: Quản lý phòng & nhận đặt phòng cơ bản.
   - Gói **Pro**: Mở khóa Hồ sơ Folio, Minibar/dịch vụ phát sinh, Buồng phòng Kanban SignalR.
   - Gói **Enterprise**: Cổng VNPay riêng, Báo cáo RevPAR/ADR/Occupancy Rate chuyên sâu.
