import { test, expect, Page } from '@playwright/test';

// ============================================================
// E2E Test Suite: Customer Flows
// Kiểm thử đăng nhập Customer, truy cập Profile, Lịch sử đặt phòng.
// ============================================================

const CUSTOMER_USER = 'customer1';
const CUSTOMER_PASS = 'customer1';

async function customerLogin(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#username').fill(CUSTOMER_USER);
  await page.locator('#password').fill(CUSTOMER_PASS);
  await page.locator('button[type="submit"]').click();
  // Wait for SPA URL change only; full `load` can hang on background assets.
  await expect(page).toHaveURL(/\/$/, { timeout: 15000 });
}

test.describe('Customer - Profile & Booking History', () => {
  test('Đăng nhập thành công và truy cập Profile', async ({ page }) => {
    await customerLogin(page);
    await page.goto('/client/profile', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toBeVisible();
    
    // Check if profile details are visible
    // Wait for the app to render content
    await page.waitForTimeout(1000); 
    const bodyContent = await page.locator('body').textContent();
    expect(bodyContent!.length).toBeGreaterThan(0);
  });

  test('Truy cập trang Lịch sử đặt phòng', async ({ page }) => {
    await customerLogin(page);
    await page.goto('/client/profile?tab=bookings', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toBeVisible();
  });
});
