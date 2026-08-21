import { expect, Page, test } from '@playwright/test';
import { seedSession, syntheticAdminSession } from './helpers/audit-fixtures';

const deterministicCss = `
  *, *::before, *::after {
    animation-delay: 0s !important;
    animation-duration: 0s !important;
    caret-color: transparent !important;
    transition-delay: 0s !important;
    transition-duration: 0s !important;
  }
  html, body, button, input, select, textarea { font-family: "Arial", sans-serif !important; }
`;

async function stabilize(page: Page): Promise<void> {
  await page.addStyleTag({ content: deterministicCss });
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
}

async function installAdminFixtures(page: Page): Promise<void> {
  await page.route('**/api/auth/my-menu', route => route.fulfill({ json: [{
    id: 'ADMIN', code: 'ADMIN', name: 'Quản trị', functions: [{
      id: 1, code: 'ROOM', name: 'Quản lý phòng', url: '/admin/rooms', icon: 'pi pi-building',
    }],
  }] }));
  await page.route('**/api/v1/hotels**', route => route.fulfill({ json: [
    { id: 'property-a', name: 'LuxeStay Riverside', nameVi: 'LuxeStay Riverside' },
  ] }));
  await page.route('**/api/room-types**', route => route.fulfill({ json: [
    { id: 'type-a', hotelId: 'property-a', code: 'DLX', name: 'Deluxe River View', nameVi: 'Deluxe River View', status: 'ACTIVE' },
  ] }));
  await page.route('**/api/rooms/paged**', route => route.fulfill({ json: {
    items: [
      { id: 'room-101', hotelId: 'property-a', roomTypeId: 'type-a', roomNumber: '101', floor: 1, status: 'AVAILABLE', housekeepingStatus: 'CLEAN', maintenanceStatus: 'NONE' },
      { id: 'room-102', hotelId: 'property-a', roomTypeId: 'type-a', roomNumber: '102', floor: 1, status: 'OCCUPIED', housekeepingStatus: 'CLEAN', maintenanceStatus: 'NONE' },
    ],
    page: 1, pageSize: 15, totalItems: 2, totalPages: 1,
  } }));
  await page.route('**/api/users/me', route => route.fulfill({ json: {
    id: 'visual-admin', username: 'visual-admin', fullName: 'Visual Admin', roles: ['SUPER_ADMIN'],
  } }));
  await page.route('**/api/notifications**', route => route.fulfill({ json: {
    content: [], page: 0, size: 10, totalElements: 0, totalPages: 0,
  } }));
  await page.route('**/hubs/room-status/**', route => route.fulfill({ status: 404, body: '' }));
}

test.describe('Liquid Glass visual acceptance', () => {
  test('login remains visually stable on desktop and mobile', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/login');
    await expect(page.locator('#username')).toBeVisible({ timeout: 15_000 });
    await stabilize(page);
    await expect(page).toHaveScreenshot('login-desktop.png', { fullPage: true });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await expect(page.locator('#username')).toBeVisible({ timeout: 15_000 });
    await stabilize(page);
    await expect(page).toHaveScreenshot('login-mobile.png', { fullPage: true });
  });

  test('room management preserves hierarchy and responsive layout', async ({ page }) => {
    await installAdminFixtures(page);
    await seedSession(page, syntheticAdminSession());
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/admin/rooms');
    await expect(page.getByRole('heading', { name: 'Quản lý phòng' })).toBeVisible();
    await expect(page.getByText('101', { exact: true })).toBeVisible();
    await stabilize(page);
    await expect(page).toHaveScreenshot('rooms-desktop.png', { fullPage: true });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Quản lý phòng' })).toBeVisible();
    await stabilize(page);
    await expect(page).toHaveScreenshot('rooms-mobile.png', { fullPage: true });
  });
});
