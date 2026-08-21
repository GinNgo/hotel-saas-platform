# BÁO CÁO ĐỒ ÁN TỐT NGHIỆP

## Nền tảng SaaS quản lý và đặt phòng khách sạn đa tenant

**Sinh viên:** [HỌ VÀ TÊN SINH VIÊN]
**Mã sinh viên:** [MÃ SINH VIÊN]
**Lớp:** [LỚP]
**Giảng viên hướng dẫn:** [HỌ VÀ TÊN GIẢNG VIÊN]
**Trường/Khoa:** [TÊN TRƯỜNG - KHOA]
**Năm học:** 2025-2026

## Tóm tắt

Đồ án xây dựng một nền tảng SaaS kết hợp cổng đặt phòng trực tuyến, hệ thống quản trị vận hành khách sạn và cổng quản trị nền tảng. Hệ thống giải quyết đồng thời ba bài toán: trải nghiệm tìm kiếm và đặt phòng cho khách hàng; nghiệp vụ phòng, lễ tân, folio, buồng phòng cho từng cơ sở; và quản trị tenant, gói thuê bao, doanh thu toàn sàn cho SuperAdmin.

Giải pháp sử dụng Angular 22 ở frontend và ASP.NET Core .NET 10 Web API theo Clean Architecture ở backend. Entity Framework Core triển khai global query filter cho dữ liệu tenant; JWT, role và permission bảo vệ portal và endpoint; SQL Server lưu dữ liệu nghiệp vụ; SignalR truyền sự kiện trạng thái phòng. Luồng thanh toán VNPay sử dụng HMAC-SHA512, tách redirect callback khỏi IPN authoritative và áp dụng idempotency.

Kết quả nghiệm thu gần nhất gồm 276 kiểm thử backend đạt, production build frontend đạt và 9/9 Playwright chạy trên WebApi cùng database SQL Server cô lập. Journey tích hợp giữ nguyên một reservation identity từ tìm kiếm, giữ chỗ, booking, VNPay IPN, check-in, check-out, hóa đơn finalized đến trạng thái phòng Dirty.

**Từ khóa:** hotel SaaS, multi-tenant, RBAC, Angular, ASP.NET Core, booking, VNPay, PMS, SignalR.

# 1. Giới thiệu đề tài

## 1.1. Bối cảnh

Các hệ thống đặt phòng công cộng như Agoda, Traveloka và iVIVU tập trung tối ưu chuyển đổi tìm kiếm - đặt phòng, trong khi cơ sở lưu trú cần thêm công cụ vận hành nội bộ như quản lý tồn phòng, check-in, folio, check-out và housekeeping. Nếu hai nhóm chức năng tách rời, dữ liệu giá, tồn kho, thanh toán và trạng thái phòng dễ sai lệch. Đồ án lựa chọn mô hình nền tảng thống nhất, trong đó backend là nguồn dữ liệu authoritative cho quyền, giá, tồn kho và trạng thái nghiệp vụ.

## 1.2. Mục tiêu

- Xây dựng cổng khách hàng có tìm kiếm, chi tiết khách sạn, giữ chỗ, booking và thanh toán.
- Xây dựng management portal theo property assignment cho chủ cơ sở và nhân viên.
- Xây dựng platform admin portal quản lý tenant, thuê bao, RBAC và thống kê toàn sàn.
- Bảo đảm cách ly dữ liệu tenant, kiểm soát quyền ở backend và điều hướng portal ổn định.
- Chống overbooking bằng khóa phòng theo ngày và transaction.
- Kiểm thử xuyên suốt trên môi trường tích hợp thật, không chỉ dùng fixture frontend.

## 1.3. Phạm vi

Phạm vi hiện tại bao gồm customer portal, hotel PMS, platform administration, RBAC, media ảnh phòng local, pricing/promotion, payment/refund, operational task và AI approval queue. Tích hợp cổng thanh toán được nghiệm thu ở chế độ VNPay sandbox. Local media storage phù hợp môi trường đồ án và được thiết kế để có thể thay bằng object storage trong tương lai.

# 2. Phân tích yêu cầu

## 2.1. Tác nhân hệ thống

| Tác nhân | Portal mặc định | Trách nhiệm chính |
|---|---|---|
| Customer | `/` | Tìm phòng, đặt phòng, thanh toán, xem booking và hóa đơn của chính mình |
| Property Owner | `/management` | Quản lý cơ sở được sở hữu, nhân sự, phòng, giá và vận hành |
| Hotel Admin/Manager | `/management` | Điều hành nghiệp vụ theo property assignment và permission |
| Receptionist | `/management` | Check-in, folio, thanh toán tại quầy và check-out |
| Housekeeping | `/management` | Nhận và cập nhật công việc buồng phòng |
| Admin/SuperAdmin | `/admin` | Quản trị tenant, thuê bao, RBAC và báo cáo nền tảng |

## 2.2. Yêu cầu chức năng cốt lõi

### Customer portal

- Tìm kiếm theo địa điểm, ngày, số khách và số phòng; giữ state bằng query parameters.
- Xem gallery, tiện ích, chính sách, room type và quote authoritative.
- Giữ tồn phòng 15 phút, xác nhận booking và tạo payment session idempotent.
- Xem lịch sử booking, hóa đơn, refund và hồ sơ cá nhân trong đúng customer scope.

### Management portal

- Chọn active property trong danh sách được assignment mà không đổi sai portal.
- CRUD room type và room; hỗ trợ soft delete/restore, filter, sort và pagination.
- Upload, sắp xếp, chọn ảnh chính, sửa alt text và xóa mềm ảnh loại phòng.
- Check-in chỉ với phòng sạch; quản lý folio; check-out tạo invoice bất biến và phòng Dirty.
- Quản lý housekeeping, maintenance, promotion, refund và operational task.

### Platform admin portal

- Duyệt/từ chối cơ sở, kích hoạt/vô hiệu hóa và thay đổi subscription tier.
- Quản lý role, function, action theo permission catalog canonical.
- Xem platform overview, GMV, booking, doanh thu SaaS và operational audit.
- Xử lý platform-scoped AI task tách biệt khỏi tenant queue.

## 2.3. Yêu cầu phi chức năng

- Cách ly tenant bắt buộc ở tầng persistence và authorization.
- Mutation nhạy cảm có permission, ownership, confirmation, version hoặc idempotency phù hợp.
- API trả lỗi có mã và lý do đủ để giao diện hướng dẫn người dùng.
- UI responsive, hỗ trợ keyboard, trạng thái loading/empty/error/retry và touch target phù hợp.
- Build, unit/integration test và browser smoke phải đạt trước khi release.

# 3. Kiến trúc và thiết kế

## 3.1. Kiến trúc tổng thể

Hệ thống dùng mô hình client-server. Angular phân tách ba shell route. WebApi xác thực JWT và áp dụng authorization trước khi gọi service nghiệp vụ. Infrastructure chứa EF Core DbContext, payment service, worker và SignalR hub. SQL Server lưu dữ liệu; local media root lưu file ảnh, database chỉ giữ metadata và URL.

```text
Angular 22
  -> Customer / Management / Admin shells
  -> HTTP + SignalR
ASP.NET Core .NET 10 WebApi
  -> Authentication / Authorization / Controllers
  -> Application contracts
  -> Infrastructure services + EF Core
SQL Server + Local Media Storage
```

## 3.2. Clean Architecture

| Tầng | Vai trò |
|---|---|
| Domain | Entity, enum, invariant và mô hình nghiệp vụ |
| Application | DTO, interface, result contract và abstraction |
| Infrastructure | DbContext, migration, payment, worker, SignalR và persistence implementation |
| WebApi | Controller, auth, middleware, seed và composition root |

Tại thời điểm nghiệm thu, backend có 45 controller và 51 migration chính. Việc phân tầng giúp controller không sở hữu persistence detail và cho phép kiểm thử service/policy độc lập.

## 3.3. Multi-tenant và RBAC

Entity nghiệp vụ tenant triển khai `ITenantScopedEntity`. `ApplicationDbContext` gắn global query filter dựa trên tenant context; các thao tác platform cần truy cập toàn cục phải dùng luồng có chủ đích và authorization tương ứng.

Portal access resolver chuẩn hóa role canonical và trả `roles`, `permissions`, `assignedProperties`, `defaultPortal`, `defaultRoute` và `activePropertyId`. Thứ tự portal ưu tiên là platform admin, property owner, hotel staff rồi customer. `returnUrl` chỉ hợp lệ khi thuộc portal mà tài khoản được phép truy cập.

Permission được mô hình hóa theo `module -> function -> action`. Frontend dùng catalog authoritative để dựng menu và chặn sớm thao tác; backend vẫn là lớp quyết định cuối cùng. Việc đổi quyền làm invalid session/permission context để menu được cập nhật.

## 3.4. Thiết kế dữ liệu nghiệp vụ

Các aggregate chính gồm Tenant, User, TenantStaff, Role, PermissionFunction, RoomType, Room, BookingHold, Reservation, ReservationRoom, RoomDateLock, Folio, FolioItem, Payment, Invoice, Promotion, Refund, HousekeepingTask, OperationalTask và OperationalAuditEvent.

`RoomDateLock(RoomId, StayDate)` có unique constraint. Khi hold, hệ thống chọn phòng vật lý đủ điều kiện và ghi lock trong transaction. Confirm chuyển ownership lock sang reservation. Expiry/cancel/check-out giải phóng lock theo rule nghiệp vụ. Cơ chế này biến xung đột tồn kho thành constraint có thể kiểm chứng thay vì chỉ kiểm tra trước ở application memory.

Room và room type dùng soft delete để giữ lịch sử. Invoice dùng snapshot bất biến sau khi finalized. Giá trong search, detail và checkout lấy từ quote backend, tách base rate, override theo ngày, promotion và final quote.

## 3.5. Thanh toán và tính toàn vẹn callback

VNPay URL được ký HMAC-SHA512. Redirect callback chỉ phục vụ hiển thị, không mutation dữ liệu. IPN server-to-server xác minh chữ ký, merchant, amount và trạng thái trước khi cập nhật Payment/Reservation. Payment session và callback có idempotency để retry không tạo kết quả kép.

## 3.6. AI approval queue

AI không trực tiếp check-in, đổi giá, refund hoặc cấp quyền. Tool execution kiểm tra catalog, permission, tenant scope, confirmation và idempotency, sau đó tạo `OperationalTask` loại `AI_TOOL` kèm payload đã sanitize và audit event. Staff mở màn hình nghiệp vụ authoritative để duyệt và thực hiện; customer không thể xem queue.

# 4. Triển khai chức năng

## 4.1. Luồng đặt phòng

1. Customer tìm property và inventory theo khoảng ngày.
2. Backend trả room type còn khả dụng và quote.
3. Customer tạo hold với idempotency key; backend ghi RoomDateLock.
4. Customer gửi thông tin booking bằng hold token.
5. Hệ thống tạo payment session VNPay.
6. IPN hợp lệ cập nhật payment và reservation.
7. Reservation sẵn sàng cho front desk check-in.

## 4.2. Luồng lưu trú

1. Receptionist chọn reservation đủ điều kiện và phòng vật lý Clean.
2. Check-in gán phòng và chuyển trạng thái Occupied.
3. Dịch vụ phát sinh được ghi vào folio theo catalog và feature tier.
4. Check-out kiểm tra số dư, đóng folio và finalized invoice.
5. Phòng chuyển Dirty; housekeeping task và sự kiện realtime được phát theo tenant group.

## 4.3. Quản lý phòng và ảnh

Room type lưu code, tên, mô tả, sức chứa, giường, diện tích, giá, chính sách và tiện ích. Room vật lý lưu số phòng, tầng, room type, trạng thái phòng, housekeeping và maintenance. Danh sách dùng filter/sort/pagination server-side và đồng bộ query parameters.

Media endpoint nhận multipart, kiểm tra MIME/extension/kích thước/tên file, sinh tên GUID/hash và lưu metadata gồm URL, thumbnail URL, alt text, display order, primary flag. Frontend cung cấp dropzone, preview, progress, reorder, primary image và inline alt-text editor.

## 4.4. Realtime và tính thân thiện

SignalR hub phát sự kiện theo group `tenant:{tenantId}`. Sau mutation, UI cập nhật row tại chỗ và đồng bộ nền; fallback polling có pause khi tab ẩn, backoff và chống request trùng. Dialog, toast, loading state và permission denial giúp người dùng hiểu kết quả và bước tiếp theo.

# 5. Kiểm thử và nghiệm thu

## 5.1. Chiến lược kiểm thử

| Tầng | Công cụ | Phạm vi |
|---|---|---|
| Unit/Policy | xUnit, Vitest | Resolver, validation, permission, formatter và component logic |
| Integration | xUnit + EF relational | Tenant isolation, transaction, idempotency và state machine |
| Browser E2E | Playwright Chromium | Portal boundary, customer journey và PMS flow |
| Load | k6 | Concurrent booking hold và chống overbooking |
| Build | dotnet, Angular CLI | Compile và production bundle |

## 5.2. Kết quả nghiệm thu ngày 21/08/2026

| Gate | Kết quả | Bằng chứng |
|---|---:|---|
| Backend full suite | 276/276 đạt | `dotnet test HotelSaas.slnx --no-restore` |
| Authenticated browser runner | 9/9 đạt | WebApi + SQL Server database cô lập |
| Frontend production build | Đạt | `npm run build` |
| Integrated stay journey | Đạt | Một reservation identity xuyên suốt |
| Diff quality | Đạt | `git diff --check` |

Journey trình duyệt tích hợp kiểm tra public search, room inventory, hold, booking, payment session, VNPay IPN ký HMAC, owner room catalog, check-in, check-out, finalized invoice và phòng Dirty. Các warning Angular style budget/CommonJS và Google FedCM được ghi nhận là technical debt không chặn gate hiện tại.

## 5.3. Kiểm thử an toàn

Test suite bao phủ permission denial, returnUrl/portal boundary, tenant isolation, soft-delete/restore, upload MIME giả, idempotency payment/refund, version conflict, AI payload sanitization và platform-task boundary. Relational concurrency test cùng k6 scenario kiểm tra hai yêu cầu tranh cùng inventory.

# 6. Đánh giá kết quả

## 6.1. Kết quả đạt được

- Một codebase hỗ trợ đồng thời marketplace booking và PMS đa tenant.
- Quyền và portal được chuẩn hóa, không dựa vào username `admin`.
- Tồn kho và thanh toán có cơ chế concurrency/idempotency rõ ràng.
- Room/room type, media, pricing, promotion, refund và AI queue có workflow authoritative.
- Có bằng chứng kiểm thử trên SQL Server thật thay vì chỉ fixture hoặc InMemory.

## 6.2. Hạn chế

- Local media storage chưa phù hợp triển khai nhiều instance nếu không dùng shared volume.
- VNPay mới nghiệm thu ở sandbox; production cần secret vault, callback domain và quy trình phê duyệt.
- CSS bundle budget và một số CommonJS dependency cần tối ưu.
- Google One Tap cần hoàn tất chuyển đổi FedCM.
- Chưa có quan sát production đầy đủ như distributed tracing, centralized logs và alerting SLO.

## 6.3. Hướng phát triển

- Thay media adapter bằng S3/Cloudinary và CDN.
- Bổ sung Redis cho distributed lock/cache và scale-out SignalR.
- Dùng OpenTelemetry, metrics dashboard và alert theo payment/booking failure rate.
- Bổ sung Testcontainers, OWASP API smoke, dependency audit và Lighthouse budget.
- Tích hợp email/SMS provider production, kế toán và channel manager.
- Mở rộng recommendation/agent với eval chống prompt injection và approval workflow nâng cao.

# 7. Kết luận

Đồ án đã hiện thực hóa nền tảng quản lý và đặt phòng khách sạn đa tenant với ba portal rõ ràng. Các quyết định quan trọng - backend authoritative, global tenant filter, canonical RBAC, RoomDateLock, soft delete, immutable invoice, payment IPN và AI approval queue - tạo nền tảng an toàn hơn cho nghiệp vụ thực tế. Kết quả kiểm thử tích hợp chứng minh luồng từ khách tìm phòng đến khách sạn hoàn tất lưu trú hoạt động liên tục trên WebApi và SQL Server.

# Phụ lục A. Lệnh kiểm chứng

```powershell
cd backend
dotnet test HotelSaas.slnx --no-restore

cd ..\frontend
npm run build
& .\scripts\run-authenticated-ui-audit.ps1
```

# Phụ lục B. Tài liệu nguồn

- `README.md`: tổng quan dự án và công nghệ.
- `docs/spec.md`: yêu cầu nghiệp vụ và benchmark UI.
- `docs/plan.md`: kiến trúc kỹ thuật, API và thiết kế dữ liệu.
- `docs/tasks.md`: trạng thái triển khai và nghiệm thu.
- `docs/automation-testing-guide.md`: chiến lược quality gate.
- Source code và test trong `backend/`, `frontend/` tại commit nghiệm thu.
