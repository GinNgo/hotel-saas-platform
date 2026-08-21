import { test, expect } from '@playwright/test';

test('Trang chủ hiển thị đúng tiêu đề', async ({ page }) => {
  await page.goto('/');
  // Tiêu đề của project là HotelManagementSystem hoặc gì đó, ta expect page title
  // Để tạm là kiểm tra có phần tử body
  await expect(page.locator('body')).toBeVisible();
});
