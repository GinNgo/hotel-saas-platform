import { expect, type Page, test } from '@playwright/test';
import {
  credentials,
  missingCredentialRoles,
  routeApiToEnvironment,
  type AuditCredentials,
} from './helpers/audit-fixtures';
import { attachJson, expectStableApp } from './helpers/ui-audit';

async function loginCustomer(page: Page, account: AuditCredentials): Promise<void> {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#username').fill(account.username);
  await page.locator('#password').fill(account.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 15_000 });
}

async function loginStaff(page: Page, account: AuditCredentials): Promise<void> {
  await page.goto('/admin/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#username').fill(account.username);
  await page.locator('p-password input, #password input').first().fill(account.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/admin\/login(?:\?|$)/, { timeout: 15_000 });
}

test.describe('Real UI flow audit', () => {
  test.describe.configure({ mode: 'serial', retries: 0, timeout: 60_000 });
  test.beforeEach(async ({ page }) => routeApiToEnvironment(page));

  test('required credential matrix is available for real-integration evidence', async ({}, testInfo) => {
    const missing = missingCredentialRoles();
    await attachJson(testInfo, 'missing-credential-roles', missing);
    expect(missing, 'Missing roles are BLOCKED and cannot be counted as real-flow PASS').toEqual([]);
  });

  test('customer can revisit profile, bookings, invoices and settings', async ({ page }) => {
    const account = credentials('CUSTOMER');
    test.skip(!account, 'BLOCKED: missing customer E2E credentials');
    await loginCustomer(page, account!);
    for (const route of ['/profile', '/booking-history', '/my-invoices', '/settings']) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page).not.toHaveURL(/\/(?:login|403)(?:\?|$)/);
      await expectStableApp(page);
    }
  });

  test('admin can reach core authorized routes', async ({ page }) => {
    const account = credentials('ADMIN');
    test.skip(!account, 'BLOCKED: missing admin E2E credentials');
    await loginStaff(page, account!);
    for (const route of ['/admin/dashboard', '/admin/users', '/admin/reservations', '/admin/invoices']) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page).not.toHaveURL(/\/(?:admin\/login|403)(?:\?|$)/);
      await expectStableApp(page);
    }
  });

  test('owner can switch through management read surfaces', async ({ page }) => {
    const account = credentials('OWNER');
    test.skip(!account, 'BLOCKED: missing owner E2E credentials');
    await loginStaff(page, account!);
    for (const route of ['/management/dashboard', '/management/properties', '/management/room-types', '/management/rooms', '/management/billing']) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page).not.toHaveURL(/\/(?:admin\/login|403)(?:\?|$)/);
      await expectStableApp(page);
    }
  });
});
