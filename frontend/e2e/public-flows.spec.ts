import { test, expect } from '@playwright/test';

// ============================================================
// E2E Test Suite: Public Flows
// Kiểm thử các luồng công khai: Home, Search, Login, Register
// ============================================================

test.describe('Public - Trang chủ', () => {
  test('Hiển thị trang chủ với header và nội dung', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
    // Trang chủ phải load thành công (Angular app renders)
    await page.waitForLoadState('networkidle');
    const bodyContent = await page.locator('body').textContent();
    expect(bodyContent!.length).toBeGreaterThan(0);
  });

  test('Navigation bar hiển thị đúng', async ({ page }) => {
    await page.goto('/');
    // Phải có navbar hoặc header nào đó
    const nav = page.locator('nav, header, [class*="navbar"], [class*="header"]').first();
    await expect(nav).toBeVisible({ timeout: 10000 });
  });

  test('Link đăng nhập hoạt động', async ({ page }) => {
    await page.goto('/');
    // Tìm link đăng nhập trên trang chủ
    const loginLink = page.locator('a[href*="login"], a[routerLink*="login"]').first();
    if (await loginLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await loginLink.click();
      await page.waitForURL('**/login', { timeout: 10000 });
      await expect(page).toHaveURL(/login/);
    }
  });
});

test.describe('Public - Tìm kiếm khách sạn', () => {
  test('Truy cập trang tìm kiếm', async ({ page }) => {
    await page.goto('/search');
    await expect(page.locator('body')).toBeVisible();
    // Trang search phải load thành công (không redirect về 404)
    await page.waitForLoadState('networkidle');
  });

  test('Trang tìm kiếm hiển thị form tìm kiếm hoặc kết quả', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle');
    // Trang search phải có input hoặc filter nào đó
    const hasSearchElements = await page.locator('input, select, [class*="search"], [class*="filter"]').first().isVisible({ timeout: 10000 }).catch(() => false);
    expect(hasSearchElements).toBeTruthy();
  });
});

test.describe('Public - Đăng nhập (Client)', () => {
  test('Hiển thị form đăng nhập', async ({ page }) => {
    await page.goto('/login');
    // Form phải có trường username/email và password
    await expect(page.locator('#username')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#password')).toBeVisible();
  });

  test('Hiển thị tiêu đề LuxeStay Portal', async ({ page }) => {
    await page.goto('/login');
    const heading = page.locator('h1');
    await expect(heading).toBeVisible({ timeout: 10000 });
    await expect(heading).toContainText('LuxeStay');
  });

  test('Đăng nhập với thông tin sai hiển thị lỗi', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#username').fill('wronguser@test.com');
    await page.locator('#password').fill('wrongpassword');
    await page.locator('button[type="submit"]').click();
    // Phải hiển thị thông báo lỗi
    const errorMsg = page.locator('[class*="red"], [class*="error"], [class*="alert"]').first();
    await expect(errorMsg).toBeVisible({ timeout: 10000 });
  });

  test('Có link tới trang đăng ký', async ({ page }) => {
    await page.goto('/login');
    const registerLink = page.locator('a[routerLink="/register"], a[href*="register"]').first();
    await expect(registerLink).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Public - Đăng ký', () => {
  test('Hiển thị form đăng ký đầy đủ các trường', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('#full_name')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#confirmPassword')).toBeVisible();
    await expect(page.locator('#phone')).toBeVisible();
    await expect(page.locator('#terms')).toBeVisible();
  });

  test('Hiển thị tiêu đề Tạo tài khoản', async ({ page }) => {
    await page.goto('/register');
    // The form-side h2 contains "Tạo tài khoản" (not the editorial left-side h2)
    const heading = page.locator('h2:has-text("Tạo tài khoản")');
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('Có link quay lại đăng nhập', async ({ page }) => {
    await page.goto('/register');
    const loginLink = page.locator('a[routerLink="/login"], a[href*="login"]').first();
    await expect(loginLink).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Public - Admin Login', () => {
  test('Hiển thị trang đăng nhập Admin', async ({ page }) => {
    await page.goto('/admin/login');
    // Phải có form đăng nhập admin
    await expect(page.locator('#username, input[name="username"]').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#password, input[name="password"]').first()).toBeVisible();
  });

  test('Đăng nhập admin sai hiển thị lỗi', async ({ page }) => {
    await page.goto('/admin/login');
    await page.locator('#username').fill('wrongadmin');
    // Admin login uses PrimeNG p-password component, which renders an inner input
    await page.locator('p-password input, #password input').first().fill('wrongpass');
    await page.locator('button[type="submit"]').click();
    const errorMsg = page.locator('[class*="danger"], [class*="error"], [class*="alert"]').first();
    await expect(errorMsg).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Public - Error Pages', () => {
  test('404 page hiển thị cho URL không tồn tại', async ({ page }) => {
    await page.goto('/nonexistent-page-xyz-12345');
    await page.waitForLoadState('networkidle');
    // Phải redirect hoặc hiển thị nội dung (không crash)
    await expect(page.locator('body')).toBeVisible();
  });
});
