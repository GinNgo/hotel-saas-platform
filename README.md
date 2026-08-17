# Multi-Tenant Hotel Management & Booking SaaS Platform
**Đồ Án Tốt Nghiệp Chuyên Ngành Công Nghệ Thông Tin**

## 📖 Giới Thiệu Dự Án
Hệ thống là nền tảng SaaS Đa Khách Sạn (Multi-Tenant Hotel Platform) kết hợp giữa:
1. **Cổng Đặt Phòng Trực Tuyến Dành Cho Khách Hàng (Customer Booking Portal)**.
2. **Hệ Thống Quản Trị Khách Sạn Chuyên Nghiệp (Hotel PMS & Front Desk)** dành cho từng cơ sở lưu trú.
3. **Trung Tâm Quản Trị Nền Tảng (Super Admin SaaS Platform)** quản lý các cơ sở và gói dịch vụ (`Basic`, `Pro`, `Enterprise`).

---

## 🛠️ Công Nghệ Sử Dụng
- **Backend**: ASP.NET Core .NET 10 Web API (Clean Architecture).
- **Database**: SQL Server / PostgreSQL với Entity Framework Core 10 (Multi-Tenant Query Filters).
- **Realtime**: ASP.NET Core SignalR.
- **Thanh toán**: Cổng thanh toán trực tuyến VNPay Sandbox (HMAC-SHA512).
- **Quy trình Phát triển**: **Spec-Driven Development (SDD)**.

---

## 📚 Tài Liệu Đặc Tả (Spec-Driven Docs)
- [Constitution - Nguyên tắc cốt lõi](docs/constitution.md)
- [Spec - Đặc tả yêu cầu & luồng nghiệp vụ](docs/spec.md)
- [Plan - Kế hoạch kỹ thuật & thiết kế CSDL](docs/plan.md)
- [Tasks - Danh sách nhiệm vụ thực thi](docs/tasks.md)
