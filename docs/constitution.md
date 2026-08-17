# Hiến Chương Dự Án (Project Constitution)
**Tên dự án**: Multi-Tenant Hotel Management & Booking SaaS Platform
**Phiên bản**: 1.0.0-PRO
**Mục tiêu**: Đồ Án Tốt Nghiệp Đại Học Chuyên Ngành Công Nghệ Thông Tin / Kỹ Thuật Phần Mềm

---

## 1. Nguyên Tắc Cốt Lõi (Core Principles)

1. **Kiến Trúc Chuẩn Doanh Nghiệp (Clean Architecture)**:
   - Tách biệt tuyệt đối giữa 4 tầng: `Domain` (Core Business), `Application` (Use Cases & DTOs), `Infrastructure` (EF Core, External Services), `WebApi` (REST Endpoints & Middlewares).
   - Tầng `Domain` độc lập, không phụ thuộc vào bất kỳ thư viện bên ngoài hay cơ sở dữ liệu nào.

2. **Cách Ly Dữ Liệu Đa Khách Sạn Tuyệt Đối (Tenant Data Isolation)**:
   - Mọi thực thể thuộc phạm vi cơ sở phải có trường `TenantId`.
   - Sử dụng **EF Core Global Query Filters** (`HasQueryFilter(e => e.TenantId == CurrentTenantId)`) để tự động lọc dữ liệu, ngăn chặn 100% rò rỉ dữ liệu chéo giữa các khách sạn.

3. **Kiểm Soát Tính Năng Theo Gói Dịch Vụ (Tier-Based Feature Governance)**:
   - Các tính năng được kích hoạt động dựa trên Gói cước cơ sở đã đăng ký (`Basic`, `Pro`, `Enterprise`).
   - Kiểm tra quyền truy cập tính năng ở tầng Application qua Policy/Middleware (`FeatureFlagGuard`), ngăn chặn cơ sở sử dụng tính năng vượt quá gói đăng ký.

4. **Độ Tin Cậy Nghiệp Vụ & Chống Đặt Trùng (Concurrency & Idempotency)**:
   - Luồng đặt phòng bắt buộc sử dụng cơ chế **Khóa Giữ Chỗ (Booking Hold - 15 phút)** kèm Background Service dọn dẹp phòng hết hạn.
   - Các API thanh toán (VNPay IPN/Webhook) bắt buộc xử lý **Idempotency** để không bị cộng tiền/xác nhận trùng lặp.

5. **Quy Chuẩn Viết Code & Tài Liệu Hóa (Documentation & Clean Code)**:
   - Áp dụng **Result Pattern (`Result<T>`)** cho toàn bộ API Response, không trả dữ liệu lộn xộn.
   - Toàn bộ thay đổi nghiệp vụ phải được cập nhật vào thư mục `docs/` để bất kỳ AI Agent hoặc Developer nào tiếp quản dự án đều hiểu và tiếp tục công việc ngay lập tức.
