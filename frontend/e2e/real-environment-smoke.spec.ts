import { expect, Page, test } from '@playwright/test';

interface Credentials {
  username: string;
  password: string;
}

const e2eApiUrl = process.env.LUXESTAY_E2E_API_URL;

function credentials(prefix: 'CUSTOMER' | 'ADMIN' | 'OWNER'): Credentials | null {
  const username = process.env[`LUXESTAY_E2E_${prefix}_USERNAME`];
  const password = process.env[`LUXESTAY_E2E_${prefix}_PASSWORD`];
  return username && password ? { username, password } : null;
}

async function expectStablePage(page: Page): Promise<void> {
  await expect(page.locator('app-root')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Cannot GET');
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(hasOverflow).toBe(false);
}

function collectRuntimeIssues(page: Page): string[] {
  const issues: string[] = [];
  page.on('pageerror', error => issues.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') issues.push(`console: ${message.text()}`);
  });
  return issues;
}

async function expectRouteComponent(page: Page, selector: string, issues: string[]): Promise<void> {
  try {
    await page.locator(selector).waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    throw new Error(`Route component ${selector} did not mount. ${issues.join(' | ') || 'No browser runtime error was reported.'}`);
  }
}

async function routeToE2eBackend(page: Page): Promise<void> {
  if (!e2eApiUrl) return;
  const targetPrefix = e2eApiUrl.replace(/\/$/, '');
  await page.route('**/api/**', route => {
    const original = route.request().url();
    return original.startsWith('http://localhost:8080/api')
      ? route.continue({ url: original.replace('http://localhost:8080/api', targetPrefix) })
      : route.continue();
  });
}

async function loginCustomer(page: Page, account: Credentials): Promise<void> {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#username').fill(account.username);
  await page.locator('#password').fill(account.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 15_000 });
}

async function loginStaff(page: Page, account: Credentials): Promise<void> {
  await page.goto('/admin/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#username').fill(account.username);
  await page.locator('p-password input, #password input').first().fill(account.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/admin\/login(?:\?|$)/, { timeout: 15_000 });
}

test.describe('Real environment smoke', () => {
  test.describe.configure({ mode: 'serial', timeout: 60_000 });

  test.beforeEach(async ({ page }) => routeToE2eBackend(page));

  test('public routes expose real recovery states without mocks', async ({ page }) => {
    const runtimeIssues = collectRuntimeIssues(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'LuxeStay', exact: true })).toBeVisible();
    await expectStablePage(page);

    await page.goto('/search', { waitUntil: 'domcontentloaded' });
    await expectRouteComponent(page, 'app-property-search-page main.search-page', runtimeIssues);
    await expectStablePage(page);

    await page.goto('/hotel/999999', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Không thể mở chỗ nghỉ', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Tìm chỗ nghỉ khác' })).toBeVisible();

    await page.goto('/route-khong-ton-tai', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/$/);
    await expectStablePage(page);
  });

  test('customer read-only account routes load with a real session', async ({ page }) => {
    const account = credentials('CUSTOMER');
    test.skip(!account, 'Set LUXESTAY_E2E_CUSTOMER_USERNAME/PASSWORD to run the real customer smoke.');
    await loginCustomer(page, account!);

    for (const route of ['/profile', '/booking-history', '/my-invoices', '/settings']) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page).not.toHaveURL(/\/(?:login|403)(?:\?|$)/);
      await expectStablePage(page);
    }
  });

  test('system admin routes load with backend authorization', async ({ page }) => {
    const account = credentials('ADMIN');
    test.skip(!account, 'Set LUXESTAY_E2E_ADMIN_USERNAME/PASSWORD to run the real admin smoke.');
    await loginStaff(page, account!);

    for (const route of ['/admin/dashboard', '/admin/users', '/admin/room-types', '/admin/reservations', '/admin/invoices']) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page).not.toHaveURL(/\/admin\/(?:login|404)(?:\?|$)/);
      await expect(page).not.toHaveURL(/\/403(?:\?|$)/);
      await expectStablePage(page);
    }
  });

  test('owner management routes preserve assigned-property scope', async ({ page }) => {
    const account = credentials('OWNER');
    test.skip(!account, 'Set LUXESTAY_E2E_OWNER_USERNAME/PASSWORD to run the real owner smoke.');
    await loginStaff(page, account!);

    for (const route of ['/management/dashboard', '/management/properties', '/management/room-types', '/management/rooms', '/management/billing']) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page).not.toHaveURL(/\/(?:admin\/login|403)(?:\?|$)/);
      await expectStablePage(page);
    }
  });
});
