# SỔ TAY CÀI ĐẶT VÀ VẬN HÀNH

## Hotel SaaS Platform

**Phiên bản tài liệu:** 1.0
**Ngày cập nhật:** 21/08/2026
**Đối tượng:** quản trị hệ thống, SuperAdmin, chủ cơ sở, quản lý, lễ tân và buồng phòng

# 1. Mục đích và nguyên tắc

Tài liệu này hướng dẫn cài đặt local, đăng nhập đúng portal, cấu hình quyền, quản lý phòng, thực hiện lưu trú, xử lý thanh toán và chạy quality gate. Backend là nguồn quyền, giá và trạng thái authoritative. Không sửa trực tiếp database để thay thế thao tác nghiệp vụ trừ khi đang thực hiện quy trình migration/khôi phục được phê duyệt.

## 1.1. Bản đồ portal

| Portal | Route | Tài khoản |
|---|---|---|
| Customer | `/` | Customer |
| Management | `/management` | Property Owner, Hotel Admin/Manager, Receptionist, Housekeeping có property assignment |
| Platform Admin | `/admin` | Admin, SuperAdmin |

Không dùng username để suy luận quyền. Khi đăng nhập, hệ thống chọn portal theo role canonical và chỉ dùng `returnUrl` nếu route thuộc portal được cấp quyền.

# 2. Yêu cầu môi trường

- .NET SDK 10.
- Node.js và npm tương thích `frontend/package.json`.
- SQL Server local hoặc instance có quyền tạo/cập nhật database.
- Trình duyệt Chromium cho Playwright.
- Port backend/frontend không bị ứng dụng khác chiếm.

## 2.1. Cấu hình nhạy cảm

Không commit secret production. Dùng environment variable, user secrets hoặc secret manager cho connection string, JWT secret, VNPay hash secret và OAuth client secret. Giá trị demo chỉ được dùng trong local/E2E database cô lập.

# 3. Cài đặt local

## 3.1. Backend

```powershell
cd backend
dotnet restore HotelSaas.slnx
dotnet ef database update `
  --project src/HotelSaas.Infrastructure `
  --startup-project src/HotelSaas.WebApi
dotnet run --project src/HotelSaas.WebApi
```

Nếu migration báo schema cũ không khớp `__EFMigrationsHistory`, không drop database có dữ liệu cần giữ. Đối chiếu `docs/local-database-migration.md`, sao lưu và reconcile migration history trước khi chạy lại.

## 3.2. Frontend

```powershell
cd frontend
npm ci
npm start
```

Frontend dùng proxy config để gọi WebApi. Kiểm tra URL backend và CORS nếu request trả status `0` hoặc lỗi network.

# 4. Tài khoản seed local

| Mục đích | Username | Password | Portal |
|---|---|---|---|
| SuperAdmin demo | `superadmin` | `SuperAdmin@123` | `/admin` |
| Customer demo | `customer` | `Customer@123` | `/` |
| Owner hotel A | `manager_hotel_a` | `Owner@123` | `/management` |

Tài khoản seed chỉ dùng development/E2E. Đổi hoặc tắt tài khoản demo trước khi triển khai môi trường chia sẻ.

# 5. Vận hành RBAC và property scope

## 5.1. Cấp quyền

1. Mở platform admin hoặc màn hình quản trị role được cấp quyền.
2. Chọn role; kiểm tra nhãn system/protected, editable, inactive và assigned user count.
3. Cấp action chỉ khi function hỗ trợ action đó.
4. Kiểm tra cảnh báo nếu thay đổi làm mất quyền route chính.
5. Lưu và yêu cầu người dùng refresh token/reload auth context.
6. Xác minh menu biến mất hoặc xuất hiện đúng portal.

## 5.2. Đổi active property

Chỉ chọn property nằm trong `assignedProperties`. Việc đổi property phải giữ nguyên management portal và route nếu route còn hợp lệ. Nếu assignment bị thu hồi, chuyển về property picker hoặc 403; không điều hướng sang admin.

## 5.3. Chẩn đoán redirect sai

- Kiểm tra response login có `roles`, `permissions`, `assignedProperties`, `defaultPortal`, `defaultRoute`, `activePropertyId`.
- Xóa session/token cũ và đăng nhập lại sau khi quyền thay đổi.
- Kiểm tra `returnUrl` có thuộc đúng portal không.
- Kiểm tra role canonical và property assignment ở backend; không sửa menu frontend để che lỗi quyền.

# 6. Quản lý loại phòng, phòng và ảnh

## 6.1. Room type

1. Chọn đúng active property.
2. Tạo code duy nhất trong property, tên, sức chứa, giường, diện tích, giá và chính sách.
3. Kiểm tra `maxGuests >= maxAdults`, giá/sức chứa không âm.
4. Upload ảnh bằng dropzone; chờ tất cả upload hoàn tất.
5. Chọn ảnh chính, sắp xếp thứ tự và nhập alt text mô tả nội dung ảnh.
6. Lưu và kiểm tra lại ở hotel detail public.

`INACTIVE` là tạm ngừng bán; `DELETED` là xóa mềm và ẩn khỏi nghiệp vụ. Không deactivate/delete khi còn booking tương lai hoặc phòng đang occupied; UI phải hiển thị lý do backend trả về.

## 6.2. Physical room

Tạo số phòng, tầng, room type và trạng thái housekeeping/maintenance. Bulk create phải preview và phát hiện trùng trước submit. Không xóa phòng có reservation hoặc folio; dùng soft delete/restore. Đưa phòng vào maintenance phải nhập lý do, dùng version hiện tại và không áp dụng cho phòng đang có khách.

## 6.3. Lỗi upload ảnh

- Kiểm tra MIME thật, extension và giới hạn dung lượng/số ảnh.
- Không đổi tên/path thủ công trong media root.
- Retry từng ảnh; form phải giữ dữ liệu nếu upload lỗi.
- Nếu URL ảnh trả 404, kiểm tra media root, static-file mapping và quyền đọc của process backend.

# 7. Vận hành booking và lưu trú

## 7.1. Booking công cộng

1. Customer tìm property theo ngày và số khách.
2. Chọn room type còn tồn và tạo hold.
3. Hoàn tất thông tin khách trước khi countdown hết hạn.
4. Tạo booking và payment session bằng idempotency key.
5. Chỉ coi thanh toán thành công sau IPN hợp lệ; redirect callback không phải bằng chứng mutation.

## 7.2. Check-in

- Reservation phải đủ điều kiện và thuộc active property.
- Chỉ chọn phòng vật lý Clean/Available đúng room type.
- Nhập thông tin định danh cần thiết.
- Nếu version/status conflict, reload reservation và không bấm lặp liên tục.

## 7.3. Folio và check-out

- Chọn dịch vụ từ catalog authoritative, nhập số lượng nguyên và dùng idempotency.
- Gói Basic có thể bị chặn service/surcharge theo feature tier.
- Trước check-out, kiểm tra payment và balance.
- Check-out đóng folio, finalized invoice và chuyển phòng Dirty.
- Invoice finalized là snapshot; không sửa giá lịch sử bằng cách cập nhật promotion/rate hiện tại.

# 8. Housekeeping, maintenance và realtime

Housekeeping chỉ xem task thuộc property assignment. Claim/reassign/complete/cancel dùng version check và ghi audit. Sau checkout, phòng Dirty phải xuất hiện trong queue. Nếu realtime gián đoạn, UI dùng polling có backoff; tránh mở nhiều tab tạo request trùng.

Khi SignalR lỗi, kiểm tra `/hubs/room-status`, authentication, reverse proxy WebSocket và tenant group. Không phát event toàn cục chứa dữ liệu tenant.

# 9. Payment, refund và promotion

## 9.1. VNPay

- Sandbox và production phải có merchant/hash secret riêng.
- IPN phải verify chữ ký, merchant, amount và transaction reference.
- Retry IPN phải trả kết quả idempotent.
- Không log full secret, payment token hoặc dữ liệu nhạy cảm.

## 9.2. Refund

Lọc theo status/provider/date/amount/property/customer. Chuyển trạng thái theo state machine; mọi mutation có idempotency và timeline/audit. Staff không thao tác refund ngoài property hoặc permission.

## 9.3. Promotion và giá

Promotion đi qua draft, scheduled, active, paused, expired. Thay đổi giá/promotion phải invalidate cache nhưng không thay đổi hold đã khóa hoặc invoice cũ. Khi giá hiển thị lệch, so sánh quote backend thay vì tự tính ở frontend.

# 10. AI approval inbox

AI chỉ tạo `OperationalTask` loại `AI_TOOL`; không tự thực hiện check-in, pricing, refund hoặc RBAC. Inbox management chỉ hiển thị task thuộc assigned property; platform task nằm ở admin portal; customer không có quyền xem.

Khi xử lý task:

1. Kiểm tra tool name, nguồn AI, payload đã sanitize, permission và reason.
2. Claim task bằng version mới nhất.
3. Chọn “Mở nghiệp vụ authoritative”.
4. Thực hiện/không thực hiện nghiệp vụ tại màn hình đích.
5. Complete hoặc cancel task và xác minh audit event.

# 11. Sao lưu, migration và media

- Sao lưu database trước migration release.
- Chạy migration theo thứ tự và lưu log triển khai.
- Sao lưu media root đồng bộ với database metadata.
- Không dùng `EnsureDeleted`, drop database hoặc xóa media root trên shared/staging/production.
- Khi restore, kiểm tra tính nhất quán giữa image metadata và file vật lý.

# 12. Quality gate trước release

```powershell
cd backend
dotnet test HotelSaas.slnx --no-restore

cd ..\frontend
npm run test:unit:ci
npm run build
& .\scripts\run-authenticated-ui-audit.ps1

cd ..
git diff --check
```

## 12.1. Checklist release

- Backend full test đạt.
- Frontend unit test và production build đạt.
- Browser smoke/authenticated journey đạt.
- Migration đã review và backup đã xác nhận.
- Không có secret/demo credential trong cấu hình production.
- Portal boundary, active property và permission denial đã smoke.
- Booking/VNPay/check-in/check-out/invoice đã smoke.
- Monitoring/logging và rollback owner đã được phân công.

# 13. Xử lý sự cố nhanh

| Hiện tượng | Kiểm tra đầu tiên | Hành động an toàn |
|---|---|---|
| Login nhảy sai portal | Auth response, role canonical, returnUrl | Xóa token cũ, sửa assignment/role ở backend |
| Không thấy menu | Permission context/cache | Refresh token; kiểm tra function/action |
| Không tạo được booking | Inventory, hold expiry, RoomDateLock | Tìm lại inventory; không xóa lock trực tiếp |
| Payment pending lâu | IPN log, signature, amount/merchant | Retry provider callback idempotent |
| Check-in bị conflict | Reservation/room status và version | Reload; chọn phòng Clean khác nếu hợp lệ |
| Phòng không thành Dirty | Checkout/folio/audit | Kiểm tra checkout transaction và event |
| Ảnh 404 | Media root/static mapping/metadata | Khôi phục file hoặc sửa cấu hình; không đổi URL lịch sử tùy tiện |
| Task AI không hiển thị | taskType, property scope, permission | Kiểm tra assignment và platform/tenant boundary |

# 14. Bàn giao

Người nhận bàn giao cần có connection/config inventory, quyền truy cập secret manager, quy trình backup/restore, danh sách portal owner, release checklist và kênh xử lý sự cố. Tài khoản demo phải bị vô hiệu hóa hoặc đổi mật khẩu trước khi đưa lên môi trường có người dùng thật.
