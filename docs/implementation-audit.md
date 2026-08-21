# Đối chiếu hoàn thành kế hoạch triển khai

Ngày audit: 21/08/2026. Tài liệu này đối chiếu từng yêu cầu trong kế hoạch gốc với bằng chứng hiện tại của repository. Những contract đã tiến hóa được ghi rõ thay vì coi tên endpoint cũ là implementation bắt buộc.

## Phase 0 - Khởi tạo nền tảng

| Yêu cầu | Trạng thái | Bằng chứng |
|---|---|---|
| Solution Domain/Application/Infrastructure/WebApi | Đạt | `backend/HotelSaas.slnx`, bốn project trong `backend/src` |
| EF Core và SQL Server | Đạt | `ApplicationDbContext`, migration chain và `appsettings.json` |
| CI build + test | Đạt | `.github/workflows/quality-gates.yml`: backend, frontend unit/build, Playwright smoke/visual |
| Swagger/OpenAPI | Đạt | `Program.cs` cấu hình Swagger và Swagger UI |

## Phase 1 - Domain và multi-tenant

| Yêu cầu | Trạng thái | Bằng chứng |
|---|---|---|
| Entity cốt lõi | Đạt | `HotelSaas.Domain/Entities/Entities.cs` chứa Tenant, User, RoomType, Room, Reservation, Folio, FolioItem, Payment và các aggregate mở rộng |
| `ITenantScopedEntity` | Đạt | `Domain/Common/BaseEntity.cs`; các entity nghiệp vụ tenant triển khai interface |
| Query filter tự động | Đạt | `ApplicationDbContext.ApplyTenantFilter` duyệt model theo interface |
| Migration và seed | Đạt | 51 migration chính; `WebApi/Data/DbInitializer.cs` |
| Test isolation | Đạt | `GlobalTenantQueryFilterTests`, metadata test và relational RoomDateLock isolation |

## Phase 2 - Auth và phân quyền

| Yêu cầu | Trạng thái | Bằng chứng |
|---|---|---|
| Đăng ký customer và login | Đạt | `AuthController`: `register-customer`, `login`, refresh/session contract |
| JWT user/role/tenant context | Đạt | `Program.cs`, auth services và `CurrentTenantService` |
| Role/permission authorization | Đạt và mở rộng | Canonical roles, function/action permission policies, portal resolver và backend authorization metadata |
| SuperAdmin cross-tenant có chủ đích | Đạt | Controller dùng `IgnoreQueryFilters` sau authorization; test portal/tenant boundary trong backend suite |

## Phase 3 - Booking và chống overbooking

| Yêu cầu | Trạng thái | Bằng chứng |
|---|---|---|
| Search loại trừ inventory đã khóa | Đạt | Public property/room inventory controller và reservation availability query |
| Unique lock theo phòng/ngày | Đạt | `RoomDateLock`; unique index `(RoomId, StayDate)` trong DbContext/migration |
| Hold trong transaction | Đạt | `ReservationsController` tạo hold và lock; idempotency và price snapshot |
| Confirm tạo reservation/folio | Đạt với contract mới | Public flow dùng `POST /api/reservations/book` và chuyển lock từ hold sang reservation; legacy confirm được thay bằng booking contract rõ hơn |
| Cleanup hold hết hạn | Đạt | `BookingHoldCleanupWorker` giải phóng lock và phát event sau khi lưu thành công |
| Concurrency | Đạt | `RoomDateLockConcurrencyTests` và `backend/tests/load/booking-hold-concurrency.k6.js` |

## Phase 4 - VNPay

| Yêu cầu | Trạng thái | Bằng chứng |
|---|---|---|
| Sinh URL và ký HMAC-SHA512 | Đạt với contract mới | `POST /api/payments/sessions`, `VnPayService.CreatePaymentUrl` |
| Callback | Đạt theo thiết kế an toàn hơn | Redirect callback chỉ hiển thị; không mutation authoritative |
| IPN riêng | Đạt | `GET /api/payments/vnpay-ipn`, kiểm tra signature/amount/merchant/idempotency |
| Sandbox test | Đạt | `PaymentsControllerTests` và Playwright journey ký IPN thật trên database SQL Server cô lập |

## Phase 5 - Front Desk, PMS và realtime

| Yêu cầu | Trạng thái | Bằng chứng |
|---|---|---|
| Check-in phòng Clean | Đạt | `FrontDeskController`, backend validation tests và integrated browser journey |
| Folio và Basic feature gate | Đạt | `FrontDeskController`, `ManagementCheckoutControllerTests.Basic_tier_cannot_add_advanced_folio_charges` |
| Check-out, đóng folio, phòng Dirty | Đạt | FrontDesk/management checkout tests và Playwright journey xác minh invoice + Dirty |
| SignalR tenant group | Đạt | `RoomStatusHub`, `RoomStatusRealtimeMiddleware`, frontend realtime service và tests |
| Room status UI | Đạt | Management room grid/list, server-side filters, realtime state và owner real-session smoke |

## Phase 6 - SuperAdmin SaaS

| Yêu cầu | Trạng thái | Bằng chứng |
|---|---|---|
| Public tenant/property list | Đạt | `TenantsController.GetActiveTenants` và public property APIs |
| Register property | Đạt | `POST /api/tenants/register-property` tạo tenant, owner và assignment pending |
| Upgrade/downgrade tier | Đạt | `PUT /api/tenants/{id}/subscription-tier`, policy `platform_billing.update` |
| Dùng chung feature gate | Đạt | Subscription tier được kiểm tra trong folio/service policy |
| Nghiệm thu lifecycle thật | Đạt | Playwright tạo property pending, approve active, Basic -> Pro và đọc lại từ SQL Server |

## Phase 7 - Báo cáo và thống kê

| Yêu cầu | Trạng thái | Bằng chứng |
|---|---|---|
| Tenant dashboard ADR/RevPAR/occupancy | Đạt | `GET /api/analytics/tenant-dashboard`, `AnalyticsControllerTests` và management dashboard |
| Platform overview tổng hợp | Đạt | `GET /api/analytics/platform-overview`, không trả chi tiết tài chính từng tenant |
| Frontend charts | Đạt | Management dashboard và platform revenue/overview components dùng Chart.js |

## Phase 8 - Kiểm thử, hoàn thiện và báo cáo

| Yêu cầu | Trạng thái | Bằng chứng |
|---|---|---|
| Integration full flow | Đạt | `IntegratedGuestStayLifecycleTests` và Playwright journey search -> hold -> booking -> VNPay -> check-in -> check-out |
| Load test hold | Đạt | k6 concurrency scenario và relational concurrency test |
| UI/UX design system | Đạt theo acceptance hiện tại | Liquid Glass tokens, responsive client/management/admin UI và Playwright visual regression desktop/mobile |
| Báo cáo đồ án | Đạt | `docs/graduation-project-report.md/.docx` |
| Hướng dẫn vận hành | Đạt | `docs/operations-guide.md/.docx` |

## Acceptance evidence cuối

- Backend: 276/276 test đạt ngày 21/08/2026.
- Frontend production build đạt ngày 21/08/2026.
- Authenticated/integrated Playwright: 10/10 đạt trên .NET WebApi và SQL Server database cô lập.
- `docs/tasks.md` không còn checkbox chưa hoàn thành.
- DOCX report/guide: accessibility không có finding; heading/section/table geometry audit đạt.

## Technical debt không chặn nghiệm thu

- Một số Angular CSS bundle vượt warning budget và dependency CommonJS còn optimization warning.
- Google One Tap cần hoàn tất chuyển sang FedCM.
- Local media storage cần shared/object storage khi scale nhiều instance.
- DOCX chưa raster QA trên máy hiện tại vì LibreOffice không được cài; structural/accessibility audit đã đạt.
