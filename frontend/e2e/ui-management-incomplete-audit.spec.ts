import { expect, type Page, test } from '@playwright/test';
import { seedSession, syntheticOwnerSession } from './helpers/audit-fixtures';
import { attachJson } from './helpers/ui-audit';

const managementContext = {
  activePropertyId: 7,
  dashboard: { availableRooms: 4, dirtyRooms: 1, maintenanceRooms: 0, occupiedRooms: 2, pendingHousekeeping: 1, reservedRooms: 3 },
  lifetime: false,
  limits: { MAX_PROPERTIES: 2, MAX_ROOMS: 100 },
  planCode: 'PRO',
  properties: [{
    address: '1 Audit Street', approvalStatus: 'APPROVED', code: 'AUDIT-7', id: 7, isDemo: false,
    nameVi: 'Khách sạn Audit', operationStatus: 'ACTIVE', propertyType: 'HOTEL',
  }],
  subscriptionStatus: 'ACTIVE',
  upgradeRequired: false,
  usage: { properties: 1, rooms: 10 },
};

async function installManagementFixtures(page: Page): Promise<void> {
  await seedSession(page, syntheticOwnerSession());
  await page.route('**/api/management/context**', route => route.fulfill({ contentType: 'application/json', json: managementContext }));
}

test.describe('Management incomplete capability audit', () => {
  test.describe.configure({ retries: 0 });
  test.beforeEach(async ({ page }) => installManagementFixtures(page));

  test('properties navigation exposes a property-management surface distinct from dashboard', async ({ page }, testInfo) => {
    await page.goto('/management/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('app-management-dashboard')).toBeVisible();
    const dashboardText = (await page.locator('app-management-dashboard').innerText()).replace(/\s+/g, ' ').trim();

    await page.goto('/management/properties', { waitUntil: 'domcontentloaded' });
    const reusedDashboard = page.locator('app-management-dashboard');
    await expect(reusedDashboard).toBeVisible();
    const propertiesText = (await reusedDashboard.innerText()).replace(/\s+/g, ' ').trim();
    await attachJson(testInfo, 'management-route-comparison', { dashboardText, propertiesText });
    await testInfo.attach('management-properties-screenshot', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    expect(propertiesText, 'Properties route renders the exact dashboard component and offers no distinct property-management flow')
      .not.toBe(dashboardText);
  });
});
