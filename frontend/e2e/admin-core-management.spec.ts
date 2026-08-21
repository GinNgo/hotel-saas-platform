import { expect, test, Page } from '@playwright/test';
import { seedSession, syntheticAdminSession } from './helpers/audit-fixtures';

async function loginAdmin(page: Page) {
  await seedSession(page, syntheticAdminSession());
  await page.goto('/admin/dashboard');
  await expect(page).toHaveURL(/\/admin\/dashboard/);
}

async function installAdminApiFixtures(page: Page) {
  await page.route('**/api/auth/my-menu', route => route.fulfill({ json: [{
    id: 'ADMIN', code: 'ADMIN', name: 'Quản trị', functions: [
      ...['dashboard', 'roles', 'role-permissions', 'room-types', 'rooms'].map((path, index) => ({
        id: index + 1, code: path.toUpperCase(), name: path, url: `/admin/${path}`, icon: 'pi pi-circle',
      })),
    ],
  }] }));
  await page.route('**/api/roles**', route => route.fulfill({ json: [
    { id: 1, code: 'PROPERTY_OWNER', name: 'Chủ cơ sở', description: '', systemRole: true },
  ] }));
  await page.route('**/api/role-permissions/tree/**', route => route.fulfill({ json: [
    { id: 'HOTEL', code: 'HOTEL', name: 'Khách sạn', functions: [
      { id: 11, code: 'HOTEL', name: 'Cơ sở', moduleCode: 'HOTEL', actionMask: 1, supportedActionMask: 127, isActive: true },
    ] },
  ] }));
  await page.route('**/api/room-types**', route => route.fulfill({ json: [
    { id: 11, code: 'DLX', name: 'Deluxe', nameVi: 'Deluxe', status: 'ACTIVE' },
  ] }));
  await page.route('**/api/room-types/paged**', route => route.fulfill({ json: {
    items: [{ id: 11, hotelId: 501, code: 'DLX', nameVi: 'Deluxe', status: 'ACTIVE' }],
    page: 1, pageSize: 15, totalItems: 1, totalPages: 1,
  } }));
  await page.route('**/api/rooms**', route => route.fulfill({ json: [
    { id: 21, roomNumber: '101', roomTypeName: 'Deluxe', status: 'AVAILABLE', floor: 1 },
  ] }));
  await page.route('**/api/rooms/paged**', route => route.fulfill({ json: {
    items: [{
      id: 21, hotelId: 501, roomTypeId: 11, roomTypeNameVi: 'Deluxe', roomNumber: '101', floor: 1,
      status: 'AVAILABLE', housekeepingStatus: 'CLEAN', maintenanceStatus: 'NONE',
    }],
    page: 1, pageSize: 15, totalItems: 1, totalPages: 1,
  } }));
  await page.route('**/api/v1/hotels**', route => route.fulfill({ json: [
    { id: 501, code: 'LS-501', name: 'LuxeStay Central', nameVi: 'LuxeStay Central' },
  ] }));
}

test.describe.serial('Admin core management', () => {
  test.setTimeout(60000);
  test.beforeEach(async ({ page }) => { await installAdminApiFixtures(page); await loginAdmin(page); });

  test('roles and permission matrix load from APIs', async ({ page }) => {
    await page.goto('/admin/roles');
    await expect(page.getByRole('heading', { name: /Quản lý vai trò/ })).toBeVisible();
    await expect(page.getByPlaceholder('Tìm theo mã hoặc tên vai trò')).toBeVisible();
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await page.screenshot({ path: '../docs/screenshots/admin-roles-after.png', fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Thêm vai trò' }).click();
    await expect(page.getByRole('dialog')).toContainText('Thêm vai trò');
    await page.getByRole('button', { name: 'Hủy' }).click();

    await page.goto('/admin/role-permissions');
    await expect(page.getByText('Ma trận quyền:')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Xem/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lưu phân quyền' })).toBeVisible();
  });

  test('room type and physical room pages replace placeholders', async ({ page }) => {
    await page.goto('/admin/room-types');
    await expect(page.getByRole('heading', { name: 'Quản lý loại phòng' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('room-type-management works!');
    await expect(page.getByPlaceholder('Tìm mã hoặc tên loại phòng')).toBeVisible();
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Thêm mới' }).click();
    await expect(page.getByRole('dialog')).toContainText('Thêm loại phòng');
    await page.getByRole('button', { name: 'Hủy' }).click();

    await page.goto('/admin/rooms');
    await expect(page.getByRole('heading', { name: 'Quản lý phòng' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('room-management works!');
    await expect(page.getByPlaceholder('Tìm số phòng')).toBeVisible();
    await expect(page.getByRole('article', { name: 'Phòng 101, Phòng trống' })).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: '../docs/screenshots/admin-rooms-after.png', fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Thêm hàng loạt' }).click();
    await expect(page.getByRole('dialog')).toContainText('Thêm phòng hàng loạt');
  });

  test('sidebar has no duplicate canonical routes', async ({ page }) => {
    await page.goto('/admin/dashboard');
    for (const route of ['/admin/roles', '/admin/role-permissions', '/admin/room-types', '/admin/rooms']) {
      await expect(page.locator(`#admin-navigation a[href="${route}"]`)).toHaveCount(1);
    }
  });
});
