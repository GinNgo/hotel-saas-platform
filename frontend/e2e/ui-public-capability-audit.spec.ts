import { expect, test } from '@playwright/test';
import {
  attachJson,
  auditLinks,
  collectRuntimeIssues,
  expectStableApp,
  placeholderLinks,
} from './helpers/ui-audit';

test.describe('Public UI capability audit', () => {
  test.describe.configure({ retries: 0 });

  test('home login navigation reaches the customer login form', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const login = page.locator('a[href="/login"]').first();
    await expect(login).toBeVisible();
    await login.click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('#username')).toBeVisible();
  });

  test('customer login does not publish placeholder legal or support links', async ({ page }, testInfo) => {
    const issues = collectRuntimeIssues(page);
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expectStableApp(page);
    const links = await auditLinks(page.locator('a'));
    const placeholders = placeholderLinks(links);
    await attachJson(testInfo, 'login-placeholder-links', placeholders);
    await attachJson(testInfo, 'login-runtime-issues', issues);
    expect(placeholders, 'Customer login exposes links that do not navigate anywhere').toEqual([]);
  });

  test('registration does not publish placeholder terms, privacy or contact links', async ({ page }, testInfo) => {
    await page.goto('/register', { waitUntil: 'domcontentloaded' });
    await expectStableApp(page);
    const placeholders = placeholderLinks(await auditLinks(page.locator('a')));
    await attachJson(testInfo, 'register-placeholder-links', placeholders);
    expect(placeholders, 'Registration exposes placeholder legal/contact links').toEqual([]);
  });

  test('customer forgot-password surface is actionable', async ({ page }, testInfo) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    const surface = page.getByText(/Khôi phục mật khẩu chưa hỗ trợ/i).first();
    await expect(surface).toBeVisible();
    const metadata = await surface.evaluate(element => ({
      href: element.getAttribute('href'),
      tag: element.tagName.toLowerCase(),
    }));
    await attachJson(testInfo, 'customer-forgot-password-surface', metadata);
    expect(['a', 'button'], 'Forgot-password is rendered as non-actionable text').toContain(metadata.tag);
  });

  test('admin forgot-password surface is actionable', async ({ page }, testInfo) => {
    await page.goto('/admin/login', { waitUntil: 'domcontentloaded' });
    const surface = page.getByText(/Khôi phục mật khẩu chưa hỗ trợ/i).first();
    await expect(surface).toBeVisible();
    const metadata = await surface.evaluate(element => ({
      href: element.getAttribute('href'),
      tag: element.tagName.toLowerCase(),
    }));
    await attachJson(testInfo, 'admin-forgot-password-surface', metadata);
    expect(['a', 'button'], 'Admin forgot-password is rendered as non-actionable text').toContain(metadata.tag);
  });

  test('Coming Soon transport services are visibly disabled', async ({ page }, testInfo) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const disabledTabs = page.locator('app-search-service-tabs button:disabled');
    await expect(disabledTabs).toHaveCount(2);
    const labels = await disabledTabs.allTextContents();
    await attachJson(testInfo, 'coming-soon-tabs', labels.map(label => label.replace(/\s+/g, ' ').trim()));
    await expect(disabledTabs.locator('text=/Sắp ra mắt|Coming soon/i')).toHaveCount(2);
  });
});
