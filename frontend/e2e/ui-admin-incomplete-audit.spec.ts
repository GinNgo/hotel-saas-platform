import { expect, type Page, test } from '@playwright/test';
import { seedSession, syntheticOwnerSession } from './helpers/audit-fixtures';
import { attachJson, collectRuntimeIssues } from './helpers/ui-audit';

async function installAdminFixtures(page: Page): Promise<void> {
  await seedSession(page, syntheticOwnerSession());
  await page.route('**/api/users/me', route => route.fulfill({
    contentType: 'application/json',
    json: {
      createdAt: '2026-08-01T00:00:00Z', email: 'audit-admin@example.test', fullName: 'UI Audit Admin',
      id: 42, roles: ['PROPERTY_OWNER'], status: 'ACTIVE', username: 'owner',
    },
  }));
  await page.route('**/api/notifications**', route => route.fulfill({ contentType: 'application/json', json: [] }));
  await page.route('**/api/auth/my-menu', route => route.fulfill({
    contentType: 'application/json',
    json: [{
      code: 'REPORTING',
      functions: [{ code: 'REPORT', icon: 'pi pi-chart-bar', id: 1, name: 'Dashboard', url: '/admin/dashboard' }],
      id: 1,
      name: 'Audit',
    }],
  }));
  await page.route('**/api/analytics/dashboard', route => route.fulfill({
    contentType: 'application/json',
    json: {
      labels: ['T1', 'T2'], occupancyData: [50, 60], occupancyRate: 60,
      revenueData: [1_000_000, 2_000_000], totalBookings: 7, bookingsToday: 2, totalRevenue: 3_000_000,
    },
  }));
  await page.route('**/api/v1/hotels**', route => route.fulfill({
    contentType: 'application/json',
    json: route.request().method() === 'POST'
      ? { id: 'hotel-1', name: 'Audit Hotel', nameVi: 'Audit Hotel', addressLine: '1 Audit Street', status: 'PENDING_APPROVAL' }
      : [{ id: 'hotel-1', name: 'Audit Hotel', nameVi: 'Audit Hotel', addressLine: '1 Audit Street', status: 'DRAFT' }],
  }));
  await page.route('**/api/room-types**', route => route.fulfill({ contentType: 'application/json', json: [{ id: 'type-1', hotelId: 'hotel-1', nameVi: 'Deluxe' }] }));
  await page.route('**/api/services**', route => route.fulfill({ contentType: 'application/json', json: [{ id: 'service-1', hotelId: 'hotel-1', nameVi: 'Bữa sáng' }] }));
  await page.route('**/api/rooms**', route => route.fulfill({ contentType: 'application/json', json: [{
    id: 'room-1', hotelId: 'hotel-1', roomTypeId: 'type-1', roomNumber: '101', floor: 1,
    status: 'OUT_OF_SERVICE', housekeepingStatus: 'CLEAN', maintenanceStatus: 'MAINTENANCE', maintenanceReason: 'Kiểm tra điều hòa',
  }] }));
  await page.route('**/ws/**', route => route.abort());
}

test.describe('Admin dashboard incomplete capability audit', () => {
  test.describe.configure({ retries: 0 });
  test.beforeEach(async ({ page }) => installAdminFixtures(page));

  test('profile onboarding CTA performs navigation or a mutation', async ({ page }, testInfo) => {
    const requests: string[] = [];
    page.on('request', request => {
      if (request.method() !== 'GET') requests.push(`${request.method()} ${request.url()}`);
    });
    await page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });
    const cta = page.locator('app-dashboard section').first().locator('button').first();
    await expect(cta).toBeVisible();
    const before = page.url();
    await cta.click();
    await page.waitForTimeout(300);
    const outcome = { after: page.url(), before, mutationRequests: requests };
    await attachJson(testInfo, 'profile-onboarding-cta-outcome', outcome);
    expect(outcome.after !== outcome.before || outcome.mutationRequests.length > 0,
      'Visible onboarding CTA has no navigation or mutation').toBe(true);
  });

  test('approval CTA can become actionable from loaded dashboard state', async ({ page }, testInfo) => {
    await page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });
    const approval = page.locator('app-dashboard section').first().locator('button').nth(3);
    await expect(approval).toBeVisible();
    await expect(approval).toBeEnabled();
    const state = { disabled: await approval.isDisabled(), text: (await approval.textContent())?.trim() };
    await attachJson(testInfo, 'approval-cta-state', state);
    await testInfo.attach('approval-cta-screenshot', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    expect(state.disabled, 'Approval CTA remains disabled because onboarding state is hardcoded and not loaded').toBe(false);
  });

  test('dashboard stat cards reflect non-zero analytics response', async ({ page }, testInfo) => {
    await page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });
    const cards = page.locator('app-dashboard app-stat-card');
    await expect(cards).toHaveCount(4);
    const text = (await cards.allTextContents()).map(value => value.replace(/\s+/g, ' ').trim());
    await attachJson(testInfo, 'dashboard-stat-cards', text);
    expect(text.some(value => /[1-9]/.test(value)), 'All dashboard stat cards stay at zero despite non-zero analytics').toBe(true);
  });

  test('work-order table loads from an API rather than a timer-only empty state', async ({ page }, testInfo) => {
    const workOrderRequests: string[] = [];
    page.on('request', request => {
      if (/\/api\/rooms(?:\?|$)|work.?orders?|maintenance/i.test(request.url())) workOrderRequests.push(request.url());
    });
    await page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('app-dashboard app-data-table')).toBeVisible();
    await page.waitForTimeout(800);
    await attachJson(testInfo, 'work-order-requests', workOrderRequests);
    expect(workOrderRequests, 'Work-order table never requests real data').not.toEqual([]);
  });

  test('Excel export produces a download', async ({ page }) => {
    await page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });
    const exportButton = page.locator('app-dashboard app-data-table button:has(.pi-file-excel)');
    await expect(exportButton).toBeVisible();
    const download = page.waitForEvent('download', { timeout: 2_000 });
    await exportButton.click();
    await download;
  });

  test('PDF export produces a download without runtime errors', async ({ page }, testInfo) => {
    const issues = collectRuntimeIssues(page);
    await page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });
    const exportButton = page.locator('app-dashboard app-data-table button:has(.pi-file-pdf)');
    await expect(exportButton).toBeVisible();
    const download = page.waitForEvent('download', { timeout: 2_000 });
    await exportButton.click();
    await attachJson(testInfo, 'pdf-export-runtime-issues', issues);
    await download;
  });
});
