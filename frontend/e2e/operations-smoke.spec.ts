import { expect, type Page, test } from '@playwright/test';
import { seedSession, syntheticAdminSession, syntheticOwnerSession } from './helpers/audit-fixtures';

const context = {
  activePropertyId: 7,
  activePropertyOperational: true,
  dashboard: {},
  lifetime: false,
  limits: { MAX_ROOMS: 100, MAX_ROOM_TYPES: 20 },
  planCode: 'PRO',
  properties: [{
    address: '1 Audit Street', approvalStatus: 'APPROVED', code: 'AUDIT-7', id: 7,
    isDemo: false, nameVi: 'Khách sạn Audit', operationStatus: 'ACTIVE', propertyType: 'HOTEL',
  }],
  subscriptionStatus: 'ACTIVE',
  upgradeRequired: false,
  usage: { properties: 1, roomTypes: 1, rooms: 3 },
};

async function installOwnerContext(page: Page): Promise<void> {
  await seedSession(page, syntheticOwnerSession());
  await page.route('**/api/management/context**', route => route.fulfill({ json: context }));
}

test.describe('Operational management smoke', () => {
  test.beforeEach(async ({ page }) => installOwnerContext(page));

  test('renders the room board by floor and exposes maintenance actions', async ({ page }) => {
    await page.route('**/api/management/rooms**', route => route.fulfill({ json: [
      { id: 1, floor: 1, roomNumber: '101', roomTypeNameVi: 'Deluxe', status: 'AVAILABLE', maintenanceStatus: 'NONE' },
      { id: 2, floor: 1, roomNumber: '102', roomTypeNameVi: 'Deluxe', status: 'OCCUPIED', maintenanceStatus: 'NONE' },
      { id: 3, floor: 2, roomNumber: '201', roomTypeNameVi: 'Suite', status: 'AVAILABLE', maintenanceStatus: 'MAINTENANCE' },
    ] }));
    await page.route('**/api/management/room-types**', route => route.fulfill({ json: [
      { id: 10, code: 'DLX', nameVi: 'Deluxe', status: 'ACTIVE' },
    ] }));

    await page.goto('/management/rooms');

    await expect(page.getByRole('heading', { name: 'Sơ đồ phòng theo tầng' })).toBeVisible();
    await expect(page.locator('.room-tile')).toHaveCount(3);
    await expect(page.locator('.room-tile[data-status="OCCUPIED"]')).toContainText('102');
    await expect(page.getByRole('button', { name: 'Bảo trì' }).first()).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Hoàn tất' })).toBeVisible();
  });

  test('keeps room-board controls readable and touch friendly on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/api/management/rooms**', route => route.fulfill({ json: [
      { id: 1, floor: 1, roomNumber: '101', roomTypeNameVi: 'Deluxe', status: 'AVAILABLE', maintenanceStatus: 'NONE' },
      { id: 2, floor: 1, roomNumber: '102', roomTypeNameVi: 'Deluxe', status: 'RESERVED', maintenanceStatus: 'NONE' },
    ] }));
    await page.route('**/api/management/room-types**', route => route.fulfill({ json: [] }));

    await page.goto('/management/rooms');
    await expect(page.locator('.room-tile')).toHaveCount(2);

    const controlSizes = await page.locator('.view-toggle button, .room-tile button').evaluateAll(elements =>
      elements.map(element => {
        const box = element.getBoundingClientRect();
        return { height: box.height, width: box.width };
      }),
    );
    expect(controlSizes.length).toBeGreaterThan(0);
    expect(controlSizes.every(size => size.height >= 44 && size.width >= 44)).toBe(true);

    const labels = await page.locator('.room-tile > strong, .room-tile > small, .status-legend span').evaluateAll(elements =>
      elements.map(element => Number.parseFloat(getComputedStyle(element).fontSize)),
    );
    expect(labels.every(size => size >= 12)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('mobile management navigation restores focus and hides denied empty groups', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/management/dashboard');

    const toggle = page.getByRole('button', { name: /Mở hoặc thu gọn điều hướng/ });
    await toggle.click();
    const navigation = page.locator('#management-navigation');
    await expect(navigation).toHaveAttribute('aria-hidden', 'false');
    await expect(navigation.locator('a').first()).toBeFocused();
    await expect(navigation.getByRole('heading', { name: 'Báo cáo' })).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(navigation).toHaveAttribute('aria-hidden', 'true');
    await expect(toggle).toBeFocused();
  });

  test('checks in a booking, filters it and opens its authoritative folio', async ({ page }) => {
    let status = 'CONFIRMED';
    const reservation = () => ({
      id: 42, userId: 8, username: 'guest', userFullName: 'Nguyễn Minh Anh',
      checkInDate: '2026-08-18', checkOutDate: '2026-08-19', guests: 2,
      totalAmount: 1_200_000, paymentMethod: 'BANK_TRANSFER', status, details: [{ roomId: null, roomTypeId: 10 }],
    });
    await page.route('**/api/reservations**', route => route.fulfill({ json: [reservation()] }));
    await page.route('**/api/rooms/available**', route => route.fulfill({ json: [
      { id: 1, roomNumber: '101', floor: 1, roomTypeId: 10, roomTypeNameVi: 'Deluxe', status: 'AVAILABLE' },
      { id: 2, roomNumber: '102', floor: 1, roomTypeId: 20, roomTypeNameVi: 'Suite', status: 'AVAILABLE' },
    ] }));
    await page.route('**/api/frontdesk/check-in', route => {
      status = 'CHECKED_IN';
      return route.fulfill({ json: { succeeded: true, message: 'ok' } });
    });
    await page.route('**/api/management/reservations/42/checkout-preview', route => route.fulfill({ json: {
      reservationId: 42, hotelId: 7, settlementState: 'SETTLED', checkoutAllowed: true,
      blockingError: null, sourceVersion: 1, calculatedAt: '2026-08-18T08:00:00Z',
      folio: {
        roomCharges: 1_200_000, serviceCharges: 0, surchargeCharges: 0, taxCharges: 0,
        feeCharges: 0, discounts: 0, grossCharges: 1_200_000, depositRequired: 0,
        successfulPayments: 1_200_000, successfulRefunds: 0, otherCredits: 0,
        netSettled: 1_200_000, balance: 0, lines: [], sourceVersion: 1,
        calculatedAt: '2026-08-18T08:00:00Z',
      },
    } }));
    await page.route('**/api/services**', route => route.fulfill({ json: [] }));

    await page.goto('/management/front-desk');
    await page.getByPlaceholder('Tìm theo mã hoặc tên khách').fill('Minh Anh');
    await expect(page.locator('[data-booking-id="42"]')).toBeVisible();
    await page.getByRole('button', { name: 'Nhận phòng' }).click();
    await expect(page.getByText('Gán phòng và nhận khách', { exact: true })).toBeVisible();
    await page.getByText('Phòng 101').click();
    await page.getByRole('button', { name: 'Xác nhận nhận phòng' }).click();
    await expect(page.locator('[data-booking-id="42"]')).toContainText('Đang lưu trú');
    await page.getByRole('button', { name: 'Mở folio thanh toán' }).click();
    await expect(page.getByRole('heading', { name: 'Dịch vụ & quyết toán lưu trú' })).toBeVisible();
    await expect(page.getByText('Folio trực tiếp · RES-42')).toBeVisible();
  });

  test('front desk becomes readable booking cards without page overflow on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/api/reservations**', route => route.fulfill({ json: [{
      id: 52, userId: 9, username: 'mobile-guest', userFullName: 'Trần Thu Hà',
      checkInDate: '2026-08-20', checkOutDate: '2026-08-22', guests: 2,
      totalAmount: 1_800_000, paymentMethod: 'PAY_AT_HOTEL', status: 'CONFIRMED', details: [{ roomId: 2 }],
    }] }));

    await page.goto('/management/front-desk');

    const bookingCard = page.locator('[data-booking-id="52"]');
    await expect(bookingCard).toBeVisible();
    await expect(bookingCard.locator('[data-label="Khách hàng"]')).toContainText('Trần Thu Hà');
    const headerBox = await page.locator('.p-datatable-thead').boundingBox();
    expect(headerBox?.width).toBeLessThanOrEqual(1);
    expect(headerBox?.height).toBeLessThanOrEqual(1);
    const actionSizes = await bookingCard.locator('.action-button').evaluateAll(elements =>
      elements.map(element => element.getBoundingClientRect().height),
    );
    expect(actionSizes.length).toBeGreaterThan(0);
    expect(actionSizes.every(height => height >= 44)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('moves a housekeeping task from claimed to completed', async ({ page }) => {
    let task = {
      id: 41, hotelId: 7, roomId: 1, roomNumber: '101', reservationId: 42,
      status: 'CLAIMED', assignedToUserId: 42, assignedToUsername: 'ui-audit-owner',
      assignedToName: 'UI Audit Owner', assignedAt: '2026-08-18T08:00:00Z', startedAt: null,
      completedAt: null, note: null, version: 1, staleAssignment: false,
      roomStatus: 'DIRTY', roomHousekeepingStatus: 'DIRTY', roomMaintenanceStatus: 'NONE', roomReleased: false,
    };
    await page.route('**/api/housekeeping/assignees**', route => route.fulfill({ json: [
      { userId: 42, username: 'ui-audit-owner', fullName: 'UI Audit Owner' },
    ] }));
    await page.route('**/api/housekeeping/tasks**', route => {
      const requestedStatus = new URL(route.request().url()).searchParams.get('status');
      return route.fulfill({ json: !requestedStatus || requestedStatus === task.status ? [task] : [] });
    });
    await page.route('**/api/housekeeping/tasks/41/start', route => {
      task = { ...task, status: 'IN_PROGRESS', startedAt: '2026-08-18T08:10:00Z', version: 2 };
      return route.fulfill({ json: task });
    });
    await page.route('**/api/housekeeping/tasks/41/complete', route => {
      task = { ...task, status: 'COMPLETED', completedAt: '2026-08-18T08:30:00Z', version: 3, roomStatus: 'AVAILABLE', roomHousekeepingStatus: 'CLEAN', roomReleased: true };
      return route.fulfill({ json: task });
    });
    await page.route('**/api/management/rooms**', route => route.fulfill({ json: [
      { id: 1, hotelId: 7, roomTypeId: 10, roomTypeNameVi: 'Deluxe', roomNumber: '101', floor: 1, status: 'DIRTY', housekeepingStatus: 'DIRTY', maintenanceStatus: 'NONE' },
    ] }));
    await page.goto('/management/housekeeping');
    await expect(page.getByText('Phòng 101')).toBeVisible();
    await page.getByRole('button', { name: 'Bắt đầu dọn' }).click();
    await expect(page.locator('.task-card .status[data-status="IN_PROGRESS"]')).toHaveText('Đang dọn');
    await page.getByRole('button', { name: 'Hoàn tất và kiểm tra mở bán' }).click();
    await expect(page.locator('.completion-notice')).toContainText('đã sạch và sẵn sàng mở bán');
  });

  test('redirects a signed-in owner without room permission to 403', async ({ page }) => {
    const denied = { ...syntheticOwnerSession(), permissions: [] };
    await seedSession(page, denied);
    await page.goto('/management/rooms');
    await expect(page).toHaveURL(/\/403$/);
    await expect(page.locator('app-forbidden')).toBeVisible();
  });

  test('permission matrix protects unsaved edits and scrolls inside mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedSession(page, syntheticAdminSession());
    await page.route('**/api/roles', route => route.fulfill({ json: [
      { id: 1, code: 'FRONT_DESK', name: 'Lễ tân', description: '', version: 1 },
      { id: 2, code: 'HOUSEKEEPER', name: 'Buồng phòng', description: '', version: 1 },
    ] }));
    await page.route('**/api/role-permissions/tree/*', route => route.fulfill({ json: [{
      id: 10, code: 'OPERATIONS', name: 'Vận hành', functions: [
        { id: 101, moduleId: 10, code: 'RESERVATION', name: 'Đặt phòng', url: '/management/front-desk', actionMask: 1, supportedActionMask: 127, active: true },
        { id: 102, moduleId: 10, code: 'ROOM', name: 'Phòng', url: '/management/rooms', actionMask: 1, supportedActionMask: 7, active: true },
      ],
    }] }));
    await page.route('**/api/users/me', route => route.fulfill({ json: { id: 1, username: 'ui-audit-admin', fullName: 'UI Audit Admin', roles: ['SUPER_ADMIN'] } }));
    await page.route('**/api/notifications**', route => route.fulfill({ json: { content: [], totalElements: 0 } }));
    await page.route('**/api/auth/my-menu', route => route.fulfill({ json: [] }));

    await page.goto('/admin/role-permissions');
    await expect(page.getByRole('heading', { name: 'Phân quyền', exact: true })).toBeVisible();
    const tableRegion = page.getByRole('region', { name: 'Ma trận quyền của Lễ tân' });
    await expect(tableRegion).toBeVisible();
    await tableRegion.locator('.p-checkbox:not(.p-disabled)').nth(8).click();
    await expect(page.getByText(/Có \d+ chức năng đã thay đổi/)).toBeVisible();

    await page.getByRole('button', { name: /Buồng phòng/ }).click();
    await expect(page.getByText('Bỏ thay đổi chưa lưu?')).toBeVisible();
    await page.getByRole('button', { name: 'Bỏ thay đổi' }).click();
    await expect(page.getByRole('region', { name: 'Ma trận quyền của Buồng phòng' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('role lifecycle is readable and protects assigned roles on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedSession(page, syntheticAdminSession());
    await page.route('**/api/roles', route => route.fulfill({ json: [
      { id: 1, code: 'FRONT_DESK', name: 'Lễ tân', description: 'Tiếp nhận khách', version: 1, status: 'ACTIVE', userCount: 3, systemRole: false },
      { id: 2, code: 'ACCOUNTANT', name: 'Kế toán', description: 'Đối soát', version: 1, status: 'ACTIVE', userCount: 0, systemRole: false },
    ] }));
    await page.route('**/api/users/me', route => route.fulfill({ json: { id: 1, username: 'ui-audit-admin', fullName: 'UI Audit Admin', roles: ['SUPER_ADMIN'] } }));
    await page.route('**/api/notifications**', route => route.fulfill({ json: { content: [], totalElements: 0 } }));
    await page.route('**/api/auth/my-menu', route => route.fulfill({ json: [] }));

    await page.goto('/admin/roles');
    await expect(page.locator('h5').filter({ hasText: 'Quản lý vai trò' })).toBeVisible();
    const assignedRole = page.locator('.p-datatable-tbody > tr').filter({ hasText: 'FRONT_DESK' });
    await expect(assignedRole).toBeVisible();
    await expect(assignedRole.getByRole('button', { name: 'Ngừng sử dụng vai trò Lễ tân' })).toHaveCount(0);
    const actionHeights = await assignedRole.locator('button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().height));
    expect(actionHeights.every(height => height >= 44)).toBe(true);
    expect((await page.locator('.p-datatable-thead').boundingBox())?.height).toBeLessThanOrEqual(1);

    await assignedRole.getByRole('button', { name: 'Sửa vai trò Lễ tân' }).click();
    await expect(page.getByRole('dialog', { name: 'Cập nhật vai trò' })).toBeVisible();
    await expect(page.locator('#code')).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('staff assignment cards protect the current account on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedSession(page, { ...syntheticAdminSession(), userId: 1 });
    await page.route('**/api/users', route => route.fulfill({ json: [
      { id: 1, username: 'ui-audit-admin', email: 'admin@luxestay.vn', fullName: 'UI Audit Admin', role: 'SUPER_ADMIN', roleId: 1, isActive: true, tenantId: 7, tenantName: 'Khách sạn Audit', staffAssignments: [{ id: 1, hotelId: 7, hotelName: 'Khách sạn Audit', status: 'ACTIVE' }] },
      { id: 2, username: 'front-desk', email: 'desk@luxestay.vn', fullName: 'Nguyễn Lễ Tân', role: 'RECEPTIONIST', roleId: 2, isActive: true, tenantId: 7, tenantName: 'Khách sạn Audit', staffAssignments: [{ id: 2, hotelId: 7, hotelName: 'Khách sạn Audit', status: 'ACTIVE' }] },
    ] }));
    await page.route('**/api/roles', route => route.fulfill({ json: [
      { id: 1, code: 'SUPER_ADMIN', name: 'Super Admin', description: '', systemRole: true, status: 'ACTIVE' },
      { id: 2, code: 'RECEPTIONIST', name: 'Lễ tân', description: '', systemRole: false, status: 'ACTIVE' },
    ] }));
    await page.route('**/api/v1/hotels/accessible', route => route.fulfill({ json: [{ id: 7, name: 'Khách sạn Audit' }] }));
    await page.route('**/api/users/me', route => route.fulfill({ json: { id: 1, username: 'ui-audit-admin', fullName: 'UI Audit Admin', roles: ['SUPER_ADMIN'] } }));
    await page.route('**/api/notifications**', route => route.fulfill({ json: { content: [], totalElements: 0 } }));
    await page.route('**/api/auth/my-menu', route => route.fulfill({ json: [] }));

    await page.goto('/admin/users');
    const selfCard = page.locator('.p-datatable-tbody > tr').filter({ hasText: 'ui-audit-admin' });
    const staffCard = page.locator('.p-datatable-tbody > tr').filter({ hasText: 'front-desk' });
    await expect(selfCard).toBeVisible();
    await expect(staffCard).toBeVisible();
    await expect(selfCard.getByRole('button', { name: /Ngừng quyền truy cập/ })).toHaveCount(0);
    await expect(staffCard.getByRole('button', { name: 'Ngừng quyền truy cập của Nguyễn Lễ Tân' })).toBeVisible();
    const actionHeights = await staffCard.locator('button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().height));
    expect(actionHeights.every(height => height >= 44)).toBe(true);
    expect((await page.locator('.p-datatable-thead').boundingBox())?.height).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('admin property catalog rejects an authenticated user without HOTEL permission', async ({ page }) => {
    await seedSession(page, {
      fullName: 'Limited Platform User',
      permissions: [{ function: 'USER', actionMask: 1 }],
      roles: ['PLATFORM_SUPPORT'],
      token: 'limited-platform-token',
      userId: 88,
      username: 'limited-platform-user',
    });

    await page.goto('/admin/properties');
    await expect(page).toHaveURL(/\/403$/);
    await expect(page.locator('app-forbidden')).toBeVisible();
  });
});
