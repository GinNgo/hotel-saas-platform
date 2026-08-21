import { expect, Page, test } from '@playwright/test';

const apiUrl = process.env.LUXESTAY_E2E_API_URL;

async function seedOwnerSession(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'property-payment-e2e-token');
    localStorage.setItem('user', JSON.stringify({
      id: 71,
      username: 'payment-owner',
      fullName: 'Payment Owner',
      roles: ['PROPERTY_OWNER'],
      permissions: [
        { function: 'PROPERTY_PAYMENT_CONFIG', actionMask: 5 },
      ],
    }));
  });
}

async function routeToE2eBackend(page: Page): Promise<void> {
  if (!apiUrl) return;
  const targetPrefix = apiUrl.replace(/\/$/, '');
  await page.route('**/api/**', route => {
    const original = route.request().url();
    return original.startsWith('http://localhost:8080/api')
      ? route.continue({ url: original.replace('http://localhost:8080/api', targetPrefix) })
      : route.continue();
  });
}

test.describe('Property payment configuration', () => {
  test('shows masked data, simulator readiness, mobile layout, and an isolated-property denial', async ({ page }) => {
    await seedOwnerSession(page);
    await page.setViewportSize({ width: 375, height: 812 });

    await page.route('**/api/management/context**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        properties: [
          { id: 7, code: 'LUXE-7', nameVi: 'LuxeStay Da Nang', propertyType: 'HOTEL', address: 'Da Nang', approvalStatus: 'APPROVED', operationStatus: 'ACTIVE', isDemo: true },
        ],
        activePropertyId: 7,
        planCode: 'STANDARD',
        subscriptionStatus: 'ACTIVE',
        lifetime: false,
        limits: {},
        usage: {},
        upgradeRequired: false,
      }),
    }));

    await page.route('**/api/management/properties/*/payment-configuration**', async route => {
      const url = new URL(route.request().url());
      const propertyId = Number(url.pathname.match(/properties\/(\d+)/)?.[1]);
      if (propertyId !== 7) {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'PROPERTY_ACCESS_DENIED',
            message: 'You do not have access to this property.',
            retryable: false,
          }),
        });
        return;
      }

      if (url.pathname.endsWith('/validate')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ready: true,
            environment: 'SIMULATOR',
            blockers: [],
            methods: [{ method: 'MANUAL_TRANSFER', provider: 'BANK', ready: true, blockers: [] }],
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 17,
          propertyId: 7,
          enabled: true,
          environment: 'SIMULATOR',
          bankName: 'Luxe Bank',
          bankCode: 'LUXE',
          accountName: 'LUXESTAY HOTEL',
          accountNumberMasked: '****6789',
          depositPolicyType: 'PERCENTAGE',
          depositValue: 30,
          paymentExpiryMinutes: 30,
          transferTemplate: 'BOOKING {paymentCode}',
          qrProvider: 'VIETQR',
          instructionsVi: 'Quet ma va thanh toan.',
          instructionsEn: 'Scan the code and pay.',
          version: 2,
          methods: [{ method: 'MANUAL_TRANSFER', enabled: true, provider: 'BANK' }],
          readiness: {
            ready: true,
            environment: 'SIMULATOR',
            blockers: [],
            methods: [{ method: 'MANUAL_TRANSFER', provider: 'BANK', ready: true, blockers: [] }],
          },
        }),
      });
    });

    await page.goto('/management/payment-configuration?propertyId=7', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Cấu hình thanh toán cơ sở lưu trú|Property payment configuration/ })).toBeVisible();
    await expect(page.getByTestId('masked-account')).toHaveText('****6789');
    await expect(page.locator('input[formcontrolname="accountNumber"]')).toHaveValue('');
    const sidebar = page.locator('#management-navigation');
    await expect(sidebar).toHaveAttribute('aria-hidden', 'true');
    await page.locator('.management-icon-button').first().click();
    await expect(sidebar).toHaveAttribute('aria-hidden', 'false');
    await expect(sidebar).not.toHaveAttribute('inert', '');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Kiểm tra sẵn sàng|Validate readiness/ }).click();
    await expect(page.getByText(/Kiểm tra hoàn tất: cấu hình sẵn sàng|Validation complete: the configuration is ready/)).toBeVisible();

    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasOverflow).toBe(false);

    await page.goto('/management/payment-configuration?propertyId=999', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/403(?:\?|$)/);
    await expect(page.getByText('403', { exact: true })).toBeVisible();
    await expect(page.getByTestId('masked-account')).toHaveCount(0);
  });

  test('real backend denies a property outside the owner scope when fixture credentials are available', async ({ page }) => {
    const username = process.env.LUXESTAY_E2E_OWNER_USERNAME;
    const password = process.env.LUXESTAY_E2E_OWNER_PASSWORD;
    const propertyId = process.env.LUXESTAY_E2E_PROPERTY_ID;
    const otherPropertyId = process.env.LUXESTAY_E2E_OTHER_PROPERTY_ID;
    test.skip(
      !username || !password || !propertyId || !otherPropertyId,
      'Set owner credentials plus LUXESTAY_E2E_PROPERTY_ID and LUXESTAY_E2E_OTHER_PROPERTY_ID for real tenant isolation.',
    );

    await routeToE2eBackend(page);
    await page.goto('/admin/login', { waitUntil: 'domcontentloaded' });
    await page.locator('#username').fill(username!);
    await page.locator('p-password input, #password input').first().fill(password!);
    await page.locator('button[type="submit"]').click();
    await expect(page).not.toHaveURL(/\/admin\/login(?:\?|$)/, { timeout: 15_000 });

    await page.goto(`/management/payment-configuration?propertyId=${propertyId}`, { waitUntil: 'domcontentloaded' });
    await expect(page).not.toHaveURL(/\/403(?:\?|$)/);
    await expect(page.locator('app-property-payment-configuration')).toBeVisible();

    await page.goto(`/management/payment-configuration?propertyId=${otherPropertyId}`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/không có quyền|do not have access|không thể tải cấu hình/i).or(page.locator('app-forbidden')),
    ).toBeVisible({ timeout: 15_000 });
  });
});
