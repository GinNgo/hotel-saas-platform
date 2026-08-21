import { expect, test } from '@playwright/test';
import { seedSession, syntheticOwnerSession } from './helpers/audit-fixtures';

test.describe('Room rate management', () => {
  test('creates a date-range rate override from the room type workspace', async ({ page }) => {
    await seedSession(page, syntheticOwnerSession());
    let savedBody: Record<string, unknown> | undefined;

    await page.route('**/api/management/context**', route => route.fulfill({ json: {
      properties: [{ id: 'property-1', nameVi: 'Ocean Pearl' }], activePropertyId: 'property-1',
      planCode: 'PRO', subscriptionStatus: 'ACTIVE', lifetime: false, limits: {}, usage: {}, upgradeRequired: false,
    } }));
    await page.route('**/api/management/room-types**', route => route.fulfill({ json: [{ id: 'room-type-1', code: 'DLX', nameVi: 'Deluxe', maxGuests: 2, basePrice: 900000, status: 'ACTIVE' }] }));
    await page.route('**/api/room-rate-overrides?roomTypeId=room-type-1', route => route.fulfill({ json: [] }));
    await page.route('**/api/room-rate-overrides', async route => {
      if (route.request().method() === 'POST') {
        savedBody = route.request().postDataJSON();
        await route.fulfill({ status: 201, json: { id: 'rate-1', tenantId: 'tenant-1', ...savedBody } });
        return;
      }
      await route.continue();
    });

    await page.goto('/management/room-types');
    await expect(page.getByRole('heading', { name: 'Giá theo giai đoạn' })).toBeVisible();
    await page.getByRole('button', { name: /Thêm mức giá/ }).click();
    await page.locator('input[name="startDate"]').fill('2026-09-01');
    await page.locator('input[name="endDate"]').fill('2026-09-03');
    await page.locator('input[name="nightlyPrice"]').fill('1450000');
    await page.locator('input[name="priority"]').fill('10');
    await page.getByRole('button', { name: 'Tạo mức giá' }).click();

    await expect.poll(() => savedBody).toMatchObject({ roomTypeId: 'room-type-1', startDate: '2026-09-01', endDate: '2026-09-03', nightlyPrice: 1450000, priority: 10, isActive: true });
  });
});
