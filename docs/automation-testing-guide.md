# Hotel SaaS - Automation Testing Guide

## Mục tiêu
Thiết lập quality gates tự động cho backend .NET 10 và frontend Angular, bao phủ unit, integration, contract, accessibility, smoke E2E, hồi quy nghiệp vụ và coverage.

## Kiến trúc kiểm thử
| Tầng | Công cụ | Phạm vi | Khi chạy |
|---|---|---|---|
| Unit | Vitest, xUnit | Hàm, service, policy | Commit/PR |
| Integration | xUnit + EF InMemory | API, tenant isolation, RBAC | PR |
| Contract | Vitest HTTP | DTO, URL, action mask | PR |
| E2E smoke | Playwright Chromium | Search, booking, navigation | PR |
| E2E integration | Playwright | Payment, refund, admin | Nightly/release |

## Lệnh chuẩn
- `npm ci`
- `npm run test:unit:ci`
- `npm run e2e:smoke`
- `npm run test:all`
- `dotnet test backend/HotelSaas.slnx --configuration Release --collect:"XPlat Code Coverage"`

## CI quality gates
`.github/workflows/quality-gates.yml` chạy backend, frontend-unit và frontend-e2e song song. Mỗi job có timeout, cache dependency và upload artifact khi thất bại. PR phải pass build, unit test và smoke test.

## Quy ước hiện đại
- AAA (Arrange-Act-Assert), một hành vi chính cho mỗi test.
- Test độc lập, tenant-scoped, không phụ thuộc thứ tự.
- Playwright ưu tiên locator theo role/label/test id.
- Bao phủ happy path, validation, authorization, tenant isolation, idempotency và retry.
- Giữ trace on-first-retry, screenshot on-failure; không commit artifact/secret.

## Ma trận release
| Gate | Dev | PR | Nightly | Release |
|---|---:|---:|---:|---:|
| Backend unit/integration | Có | Có | Có | Có |
| Frontend unit | Có | Có | Có | Có |
| Production build | Tuỳ chọn | Có | Có | Có |
| Playwright smoke | Tuỳ chọn | Có | Có | Có |
| Playwright integration | Không | Không | Có | Có |
| Accessibility/performance | Không | Tuỳ chọn | Có | Có |

## Xử lý lỗi
1. Đọc TRX/coverage hoặc Playwright trace trước khi rerun.
2. Phân loại lỗi: sản phẩm, seed data, môi trường hoặc flaky.
3. Flaky test phải tái hiện ít nhất ba lần và ghi issue; không tăng retry để che lỗi.
4. Cập nhật test cùng pull request khi thay đổi contract/workflow.

## Lộ trình mở rộng
- Testcontainers PostgreSQL/Redis cho persistence thật.
- Xuất JUnit/LCOV và đặt coverage threshold theo module.
- Thêm OWASP API smoke, dependency audit và Lighthouse budget vào nightly.
- Playwright sharding cho release khi suite tăng quy mô.

## Checklist
- [ ] `dotnet test` pass.
- [ ] `npm run test:unit:ci` pass.
- [ ] `npm run e2e:smoke` pass.
- [ ] Production build pass.
- [ ] Không có `.only` hoặc selector không ổn định.
- [ ] CI lưu artifact khi thất bại.
