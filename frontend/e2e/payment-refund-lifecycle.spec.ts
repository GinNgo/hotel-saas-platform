import { expect, Page, test } from '@playwright/test';

interface Credentials {
  username: string;
  password: string;
}

interface ReservationSummary {
  id: number;
  status: string;
  totalAmount: number;
  payment?: {
    status: string;
    reconciliationRequired: boolean;
  };
  refunds?: Array<{ status: string }>;
}

const e2eApiUrl = process.env.LUXESTAY_E2E_API_URL;

function credentials(prefix: 'CUSTOMER' | 'ADMIN'): Credentials | null {
  const username = process.env[`LUXESTAY_E2E_${prefix}_USERNAME`];
  const password = process.env[`LUXESTAY_E2E_${prefix}_PASSWORD`];
  return username && password ? { username, password } : null;
}

async function routeToE2eBackend(page: Page): Promise<void> {
  if (!e2eApiUrl) return;
  const targetPrefix = e2eApiUrl.replace(/\/$/, '');
  await page.route('http://localhost:8080/api/**', route => {
    const original = route.request().url();
    return route.continue({ url: original.replace('http://localhost:8080/api', targetPrefix) });
  });
}

async function loginCustomer(page: Page, account: Credentials): Promise<void> {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#username').fill(account.username);
  await page.locator('#password').fill(account.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 15_000 });
}

async function loginAdmin(page: Page, account: Credentials): Promise<void> {
  await page.goto('/admin/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#username').fill(account.username);
  await page.locator('p-password input, #password input').first().fill(account.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/admin\/login(?:\?|$)/, { timeout: 15_000 });
}

async function expectLifecycleStatuses(
  page: Page,
  refundStatuses = ['REQUESTED', 'PENDING_PROVIDER', 'SUCCEEDED', 'FAILED'],
): Promise<void> {
  for (const status of ['PENDING', 'FAILED', 'EXPIRED', 'RECONCILIATION']) {
    await expect(page.locator(`[data-payment-status="${status}"]`)).not.toHaveCount(0);
  }
  for (const status of refundStatuses) {
    await expect(page.locator(`[data-refund-status="${status}"]`)).not.toHaveCount(0);
  }
}

test.describe('Payment and refund lifecycle UI', () => {
  test.describe.configure({ mode: 'serial', retries: 0, timeout: 60_000 });
  test.skip(
    !e2eApiUrl || !credentials('CUSTOMER') || !credentials('ADMIN'),
    'Set the E2E API and customer/admin credentials before running lifecycle browser evidence.',
  );

  test.beforeEach(async ({ page }) => {
    await routeToE2eBackend(page);
    await page.addInitScript(() => localStorage.setItem('luxestay.locale', 'en'));
  });

  test('customer sees truthful lifecycle states and cancellation creates a refund request', async ({ page }) => {
    const account = credentials('CUSTOMER')!;
    await loginCustomer(page, account);
    await page.goto('/profile?tab=bookings', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'My trips' })).toBeVisible();
    await expectLifecycleStatuses(page);
    await expect(page.getByText('Waiting for gateway', { exact: true })).toBeVisible();
    await expect(page.getByText('Payment failed', { exact: true })).toBeVisible();
    await expect(page.getByText('Session expired', { exact: true })).toBeVisible();
    await expect(page.getByText('Needs reconciliation', { exact: true })).toBeVisible();
    await expect(page.getByText('Provider processing', { exact: true })).toBeVisible();
    await expect(page.getByText('Refunded', { exact: true })).toBeVisible();

    const token = await page.evaluate(() => localStorage.getItem('token'));
    const response = await page.request.get(`${e2eApiUrl}/reservations/my-bookings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBe(true);
    const reservations = (await response.json()) as ReservationSummary[];
    const cancellable = reservations.find(
      item => item.status === 'CONFIRMED' && item.totalAmount === 2_500_000,
    );
    expect(cancellable).toBeTruthy();

    const bookingCard = page.locator(`[data-booking-id="${cancellable!.id}"]`);
    await expect(bookingCard).toHaveCount(1);
    const cancelButton = bookingCard.getByRole('button', { name: 'Cancel booking' });
    await expect(cancelButton).toHaveCount(1);
    page.once('dialog', dialog => dialog.accept());
    await cancelButton.click();

    await expect(bookingCard.locator('[data-refund-status="REQUESTED"]')).toBeVisible();
    await expect(
      page.getByText('Booking cancelled. A refund request was created and is waiting for provider processing.'),
    ).toBeVisible();
    await page.screenshot({ path: '../docs/screenshots/payment-refund-customer.png', fullPage: true });
  });

  test('admin sees the same payment and refund lifecycle contract', async ({ page }) => {
    await loginAdmin(page, credentials('ADMIN')!);
    const token = await page.evaluate(() => localStorage.getItem('token'));
    const apiResponse = await page.request.get(`${e2eApiUrl}/reservations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(apiResponse.ok()).toBe(true);
    const reservations = (await apiResponse.json()) as ReservationSummary[];
    expect(reservations.length).toBeGreaterThan(0);

    const reservationsResponsePromise = page.waitForResponse(response => {
      const requestUrl = new URL(response.url());
      return response.request().method() === 'GET' && requestUrl.pathname === '/api/reservations';
    });
    await page.goto('/admin/reservations', { waitUntil: 'domcontentloaded' });

    const reservationsResponse = await reservationsResponsePromise;
    expect(reservationsResponse.ok()).toBe(true);

    await expect(page.locator('app-reservation-management')).toBeVisible();
    await expectLifecycleStatuses(page, ['REQUESTED', 'PENDING_PROVIDER', 'SUCCEEDED']);
    await page.screenshot({ path: '../docs/screenshots/payment-refund-admin.png', fullPage: true });

    const nextPage = page.getByRole('button', { name: 'Next Page' });
    await expect(nextPage).toBeEnabled();
    await nextPage.click();
    await expect(page.locator('[data-refund-status="FAILED"]')).not.toHaveCount(0);
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasOverflow).toBe(false);
  });
});
