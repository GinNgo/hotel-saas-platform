import { expect, Page, test } from '@playwright/test';

interface SubscriptionUsage {
  planCode: string;
  subscriptionStatus: string;
  lifetime: boolean;
  limits: Record<string, number>;
}

const ownerUsername = process.env.LUXESTAY_E2E_OWNER_USERNAME;
const ownerPassword = process.env.LUXESTAY_E2E_OWNER_PASSWORD;
const e2eApiUrl = process.env.LUXESTAY_E2E_API_URL;

async function routeToE2eBackend(page: Page): Promise<void> {
  if (!e2eApiUrl) return;
  const targetPrefix = e2eApiUrl.replace(/\/$/, '');
  await page.route('http://localhost:8080/api/**', route => {
    const original = route.request().url();
    return route.continue({ url: original.replace('http://localhost:8080/api', targetPrefix) });
  });
}

async function loginOwner(page: Page, username: string): Promise<void> {
  await page.goto('/admin/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#username').fill(username);
  await page.locator('p-password input, #password input').first().fill(ownerPassword!);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/admin\/login(?:\?|$)/, { timeout: 15_000 });
}

async function openBilling(page: Page): Promise<SubscriptionUsage> {
  await page.goto('/management/billing', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.billing-container')).toBeVisible();
  const token = await page.evaluate(() => localStorage.getItem('token'));
  const apiPrefix = (e2eApiUrl || 'http://localhost:8080/api').replace(/\/$/, '');
  const response = await page.request.get(`${apiPrefix}/subscriptions/me/usage`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBe(true);
  return response.json() as Promise<SubscriptionUsage>;
}

test.describe('Subscription entitlement fixtures', () => {
  test.describe.configure({ mode: 'serial', timeout: 60_000 });
  test.skip(!ownerUsername || !ownerPassword, 'Set E2E owner credentials before running entitlement browser evidence.');

  test.beforeEach(async ({ page }) => routeToE2eBackend(page));

  test('active finite subscription exposes effective limits', async ({ page }) => {
    await loginOwner(page, ownerUsername!);
    const usage = await openBilling(page);

    expect(usage.subscriptionStatus).toBe('ACTIVE');
    expect(usage.lifetime).toBe(false);
    expect(usage.limits.MAX_ROOMS).toBe(100);
    await expect(page.locator('.status-badge')).toHaveText('ACTIVE');
  });

  test('expired subscription keeps history visible and active limits empty', async ({ page }) => {
    await loginOwner(page, `${ownerUsername}-expired`);
    const usage = await openBilling(page);

    expect(usage.limits).toEqual({});
    await expect(page.locator('.status-badge')).toHaveText('EXPIRED');
    await expect(page.locator('.plan-name')).toBeVisible();
    await expect(page.locator('a[href^="mailto:support@luxestay.vn"]').first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Mua ngay');
  });

  test('expired subscription rejects a real room mutation without hiding reads', async ({ page }) => {
    await loginOwner(page, `${ownerUsername}-expired`);
    await openBilling(page);
    const token = await page.evaluate(() => localStorage.getItem('token'));
    const apiPrefix = (e2eApiUrl || 'http://localhost:8080/api').replace(/\/$/, '');
    const headers = { Authorization: `Bearer ${token}` };
    const contextResponse = await page.request.get(`${apiPrefix}/management/context`, { headers });
    expect(contextResponse.ok()).toBe(true);
    const context = await contextResponse.json() as { activePropertyId: number };
    const roomTypesResponse = await page.request.get(
      `${apiPrefix}/management/room-types?propertyId=${context.activePropertyId}`,
      { headers }
    );
    expect(roomTypesResponse.ok()).toBe(true);
    const roomTypes = await roomTypesResponse.json() as Array<{ id: number }>;
    expect(roomTypes.length).toBeGreaterThan(0);

    const mutation = await page.request.post(`${apiPrefix}/management/rooms`, {
      headers,
      data: {
        hotelId: context.activePropertyId,
        roomTypeId: roomTypes[0].id,
        roomNumber: `E2E-EXPIRED-${Date.now()}`,
        floor: 1,
        status: 'AVAILABLE',
        maxGuests: 2,
      },
    });

    expect(mutation.status()).toBe(409);
    expect((await mutation.json()).message).toMatch(/nâng cấp|gói dịch vụ/i);
    await expect(page.locator('.plan-name')).toBeVisible();
  });

  test('lifetime subscription exposes unlimited quota', async ({ page }) => {
    await loginOwner(page, `${ownerUsername}-lifetime`);
    const usage = await openBilling(page);

    expect(usage.subscriptionStatus).toBe('ACTIVE');
    expect(usage.lifetime).toBe(true);
    expect(usage.limits.MAX_ROOMS).toBe(-1);
    await expect(page.locator('.plan-meta')).toContainText(/Lifetime|không thời hạn/i);
  });

  test('multiple active subscriptions merge to the highest quota', async ({ page }) => {
    await loginOwner(page, `${ownerUsername}-multi`);
    const usage = await openBilling(page);

    expect(usage.subscriptionStatus).toBe('ACTIVE');
    expect(usage.limits.MAX_PROPERTIES).toBe(10);
    expect(usage.limits.MAX_ROOMS).toBe(1000);
    await expect(page.locator('.usage-grid')).toContainText('1000');
  });
});
