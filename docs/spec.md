# Đặc Tả Yêu Cầu Nghiệp Vụ & Benchmark Giao Diện (System Specification)

## 1. Phân Tích & Đối Đấu UX/UI Với Traveloka, Agoda, iVIVU

| Phân hệ màn hình | Traveloka 🔵 | Agoda 🟢🔴 | iVIVU 🟠 | **Chuẩn Thiết Kế Cho Dự Án** |
| :--- | :--- | :--- | :--- | :--- |
| **1. Search Hero Bar** | Tab chọn dịch vụ, popup lịch chọn ngày kép 2 tháng. | Thanh tìm kiếm nổi bật, Counter chọn khách/phòng `+`/`-`. | Banner trải nghiệm ấn tượng, gợi ý điểm đến hot. | **Search Widget Nổi**: Chọn Thành phố $	o$ Lịch chọn ngày đôi $	o$ Counter Khách & Phòng. |
| **2. Search Result List** | Lưới thẻ khách sạn rộng, gắn badge bữa sáng/hồ bơi. | Nút lọc nhanh, Badge "Hủy miễn phí", Thúc đẩy CRO "Chỉ còn 2 phòng!". | Thẻ bài viết trải nghiệm & Vị trí gần trung tâm. | **Sidebar Lọc Đa Chiều** (Giá slider, Sao ⭐, Tiện ích) + **Card Khách Sạn** (Slider ảnh, Đánh giá `9.2/10`, Tag ưu đãi). |
| **3. Detail & Room Types** | Bảng so sánh các loại phòng theo gói ăn sáng. | Bảng tùy chọn chính sách hủy & loại giường. | Trình bày trải nghiệm lưu trú cao cấp. | **Room Matrix Table**: Thẻ loại phòng với diện tích $m^2$, loại giường, tiện ích & Nút **"Đặt ngay"**. |
| **4. Booking Checkout** | Form nhập thông tin 1 trang, tóm tắt chi phí bên phải. | Đồng hồ đếm ngược 15:00 giữ phòng, nhiều cổng thanh toán. | Hỗ trợ thanh toán trực tuyến nhanh chóng. | **One-Step Checkout**: Form thông tin + Countdown 15:00 + Cổng thanh toán VNPay QR Code. |
| **5. Hotel PMS Extranet** | TERA Extranet quản lý giá & lịch phòng. | YCS Extranet đóng/mở bán linh hoạt. | Bàn giao ca và quản lý đơn đặt phòng. | **Sơ Đồ Ma Trận Phòng (Room Grid)**: Cập nhật màu trạng thái phòng real-time, Check-in/Folio/Check-out 1 chạm. |

---

## 2. Đặc Tả Chi Tiết 3 Phân Hệ Người Dùng

### 2.1. Cổng Khách Hàng (Customer Booking Portal)
- **Màn hình 1: Trang Chủ (Home & Hero Search)**
  - Banner hình ảnh du lịch sang trọng.
  - Search Widget: Ô nhập địa điểm (Auto-suggest Hà Nội, Đà Nẵng, HCM, Nha Trang...), Chọn khoảng ngày CheckIn - CheckOut (Pop-up Calendar 2 tháng), Số người lớn, trẻ em và số phòng.
- **Màn hình 2: Danh Sách Tìm Kiếm (Property Search List)**
  - Cột trái: Bộ lọc (Khoảng giá slider `0 - 10.000.000 VND`, Hạng sao 1-5⭐, Tiện ích Bể bơi/Wifi/Ăn sáng/Bãi đỗ xe).
  - Cột phải: Danh sách khách sạn với điểm đánh giá, khoảng cách tới trung tâm, giá phòng thấp nhất/đêm.
- **Màn hình 3: Chi Tiết Khách Sạn & Chọn Loại Phòng (Property Detail)**
  - Gallery bộ sưu tập ảnh phòng thực tế.
  - Danh sách các loại phòng (Standard, Deluxe, Suite, Villa) với nút **"Khóa giữ phòng 15p"**.
- **Màn hình 4: Đặt Phòng & Thanh Toán VNPay (Checkout & Payment)**
  - Đếm ngược 15:00. Form thông tin khách lưu trú.
  - Tóm tắt chi tiết giá: Tiền phòng x số đêm + Thuế VAT (10%) - Giảm giá Voucher = Tổng thanh toán.
  - Quét mã QR VNPay Sandbox $	o$ Nhận Email/Vé điện tử xác nhận đơn.

### 2.2. Cổng Quản Trị Cơ Sở (Hotel PMS Portal)
- **Màn hình 1: Tổng Quan Operational Dashboard**
  - Tỷ lệ lấp đầy phòng hôm nay (**Occupancy Rate %**).
  - Số khách sắp Check-in/Check-out trong ngày.
  - Doanh thu tháng và chỉ số **RevPAR**, **ADR**.
- **Màn hình 2: Sơ Đồ Ma Trận Phòng (Room Status Grid)**
  - Danh sách tất cả phòng vật lý (101, 102, 201...) phân chia theo tầng.
  - Mã màu trực quan: Xanh (Clean), Vàng (Dirty), Đỏ (Occupied), Xám (OutOfService).
- **Màn hình 3: Lễ Tân Check-in & Quản Lý Folio**
  - Check-in gán phòng vật lý cho khách.
  - Thêm chi phí Minibar/Giặt ủi vào Folio.
  - Check-out quyết toán số dư còn thiếu $	o$ Tự động chuyển phòng sang `Dirty` và gửi thông báo SignalR cho Buồng phòng.
- **Màn hình 4: Quản Lý Buồng Phòng (Housekeeping Kanban)**
  - Danh sách công việc dọn phòng phân theo mức độ ưu tiên.

### 2.3. Cổng Quản Trị Sàn SaaS (SuperAdmin Portal)
- **Màn hình 1: Danh Sách Cơ Sở & Phê Duyệt**
  - Xem danh sách cơ sở đăng ký mới, duyệt/khóa tài khoản.
- **Màn hình 2: Quản Lý Gói Cước SaaS (Subscription Governance)**
  - Chuyển đổi gói cước cho cơ sở: `Basic`, `Pro`, `Enterprise`.
- **Màn hình 3: Thống Kê Toàn Nền Tảng**
  - Tổng số lượng booking, tổng doanh thu giao dịch toàn sàn (GMV).
