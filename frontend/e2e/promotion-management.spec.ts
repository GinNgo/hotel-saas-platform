import { expect, test } from '@playwright/test';
import { seedSession, syntheticOwnerSession } from './helpers/audit-fixtures';

test('creates a campaign from the management portal with the public pricing contract shape', async ({ page }) => {
  const owner = syntheticOwnerSession();
  await seedSession(page, { ...owner, permissions: owner.permissions.map(item => item.function === 'HOTEL' ? { ...item, actionMask: 7 } : item) });
  let payload: Record<string, unknown> | undefined;
  await page.route('**/api/management/context**', route => route.fulfill({ json: { properties: [{ id: 'property-1', nameVi: 'Ocean Pearl', operational: true }], activePropertyId: 'property-1', activePropertyOperational: true, planCode: 'PRO', subscriptionStatus: 'ACTIVE', lifetime: false, limits: {}, usage: {}, upgradeRequired: false } }));
  await page.route('**/api/promotions', async route => {
    if (route.request().method() === 'POST') { payload = route.request().postDataJSON(); await route.fulfill({ status: 201, json: { id: 'promo-1', tenantId: 'tenant-1', ...payload } }); return; }
    await route.fulfill({ json: [] });
  });
  await page.goto('/management/promotions');
  await expect(page.getByLabel('Ưu đãi & chiến dịch').getByRole('heading', { name: 'Ưu đãi & chiến dịch' })).toBeVisible();
  await page.getByRole('button', { name: /Tạo ưu đãi/ }).click();
  await page.locator('input[name="code"]').fill('FLASH10');
  await page.locator('input[name="title"]').fill('Flash cuối tuần');
  await page.locator('input[name="discount"]').fill('10');
  await page.getByRole('button', { name: 'Tạo chiến dịch' }).click();
  await expect.poll(() => payload).toMatchObject({ code: 'FLASH10', title: 'Flash cuối tuần', discountPercent: 10, isActive: true });
});
