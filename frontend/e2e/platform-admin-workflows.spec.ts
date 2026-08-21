import { expect, test } from '@playwright/test';
import { seedSession, syntheticAdminSession } from './helpers/audit-fixtures';

test.describe('Platform admin property lifecycle', () => {
  test('approves a pending property and upgrades its SaaS tier', async ({ page }) => {
    const propertyId = '11111111-1111-1111-1111-111111111111';
    let status = 'PENDING';
    let approvalStatus = 'PENDING_APPROVAL';
    let subscriptionTier = 'Basic';

    await seedSession(page, syntheticAdminSession());
    await page.route('**/api/public/locations/provinces', route => route.fulfill({ json: [] }));
    await page.route('**/api/v1/hotels', route => route.fulfill({ json: [{
      id: propertyId,
      name: 'LuxeStay Platform Audit',
      nameVi: 'LuxeStay Platform Audit',
      addressLine: '01 Đường Biển',
      city: 'Đà Nẵng',
      propertyType: 'HOTEL',
      status,
      approvalStatus,
      operationStatus: status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
      subscriptionTier,
    }] }));
    await page.route(`**/api/v1/hotels/${propertyId}/approve`, route => {
      status = 'ACTIVE';
      approvalStatus = 'APPROVED';
      return route.fulfill({ json: { id: propertyId, status, approvalStatus, subscriptionTier } });
    });
    await page.route(`**/api/tenants/${propertyId}/subscription-tier`, async route => {
      const body = route.request().postDataJSON() as { newTier: string };
      subscriptionTier = body.newTier;
      return route.fulfill({ json: { succeeded: true, message: `Đã chuyển sang ${subscriptionTier}.` } });
    });
    await page.route('**/api/analytics/platform-overview', route => route.fulfill({ json: {
      succeeded: true,
      data: { totalTenants: 12, activeTenants: 9, totalBookings: 240, grossMerchandiseValue: 850_000_000 },
    } }));
    await page.route('**/api/admin/reports/platform-revenue**', route => route.fulfill({ json: {
      context: 'PLATFORM_BILLING', basis: 'NET', filters: {},
      totals: { grossRevenue: 3_000_000, refunds: 0, credits: 0, netRevenue: 3_000_000, cashCollected: 3_000_000, invoicedRevenue: 3_000_000, unpaidBalance: 0, heldDeposits: 0, successfulTransactionCount: 3, failedTransactionCount: 0, unreconciledTransactionCount: 0 },
      breakdowns: [{ dimension: 'PLAN', code: 'PRO', label: 'Pro', transactionCount: 3, grossRevenue: 3_000_000, refunds: 0, credits: 0, netRevenue: 3_000_000, recurringEligible: true }],
      rows: [], reconciliationIssues: [], totalRowCount: 0, sourceWatermark: 'PLATFORM:E2E', generatedAt: new Date().toISOString(),
    } }));

    await page.goto('/admin/properties');
    const row = page.locator('tbody tr').filter({ hasText: 'LuxeStay Platform Audit' });
    await expect(row).toContainText('Chờ duyệt');
    await expect(row).toContainText('Basic');

    await row.getByRole('button', { name: 'Duyệt cơ sở' }).click();
    await expect(row).toContainText('Hoạt động');

    await row.getByRole('button', { name: 'Cấu hình gói SaaS' }).click();
    await expect(page.getByText('Cấu hình gói SaaS', { exact: true })).toBeVisible();
    await page.locator('#subscription-tier').click();
    await page.getByRole('option', { name: 'Pro', exact: true }).click();
    await page.getByRole('button', { name: 'Áp dụng gói' }).click();

    await expect(row).toContainText('Pro');
    expect(subscriptionTier).toBe('Pro');

    await page.goto('/admin/platform-revenue');
    await expect(page.getByText('GMV toàn sàn', { exact: true })).toBeVisible();
    await expect(page.getByText(/850\.000\.000/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Doanh thu theo gói' })).toBeVisible();
  });
});
