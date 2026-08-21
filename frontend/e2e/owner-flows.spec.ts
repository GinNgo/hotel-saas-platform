import { test, expect, Page } from '@playwright/test';

// ============================================================
// E2E Test Suite: Owner Flows
// Kiểm thử chức năng cho Hotel Owner
// ============================================================

const OWNER_USER = 'manager1';
const OWNER_PASS = 'manager1';

async function ownerLogin(page: Page) {
  await page.goto('/admin/login');
  await page.locator('#username').fill(OWNER_USER);
  await page.locator('p-password input, #password input').first().fill(OWNER_PASS);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/admin/**', { timeout: 15000 });
}

test.describe('Owner - Dashboard & Properties', () => {
  test('Đăng nhập Owner thành công', async ({ page }) => {
    await ownerLogin(page);
    await expect(page).toHaveURL(/admin/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('Truy cập Dashboard của Owner', async ({ page }) => {
    await ownerLogin(page);
    await page.goto('/admin/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('Truy cập danh sách cơ sở kinh doanh (Properties)', async ({ page }) => {
    await ownerLogin(page);
    await page.goto('/admin/properties');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Owner - Quản lý Booking & Timeline', () => {
  test.beforeEach(async ({ page }) => {
    await ownerLogin(page);
  });

  test('Truy cập quản lý đặt phòng', async ({ page }) => {
    await page.goto('/admin/reservations');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('Truy cập Timeline check-in/out', async ({ page }) => {
    await page.goto('/admin/reservations/timeline');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('Truy cập quản lý phòng', async ({ page }) => {
    await page.goto('/admin/rooms');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });
});
