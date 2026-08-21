import { createHmac } from 'node:crypto';
import { expect, Page, test } from '@playwright/test';

const adminUsername = process.env.LUXESTAY_E2E_ADMIN_USERNAME;
const adminPassword = process.env.LUXESTAY_E2E_ADMIN_PASSWORD;
const e2eApiUrl = (process.env.LUXESTAY_E2E_API_URL || 'http://localhost:8080/api').replace(/\/$/, '');
const platformMerchant = process.env.LUXESTAY_E2E_PLATFORM_MERCHANT_ID;
const platformSigningSecret = process.env.LUXESTAY_E2E_PLATFORM_SIGNING_SECRET;
const journeyReady = Boolean(adminUsername && adminPassword && platformMerchant && platformSigningSecret);

async function routeToE2eBackend(page: Page): Promise<void> {
  const configured = process.env.LUXESTAY_E2E_API_URL;
  if (!configured) return;
  const targetPrefix = configured.replace(/\/$/, '');
  await page.route('http://localhost:8080/api/**', route => {
    const original = route.request().url();
    return route.continue({ url: original.replace('http://localhost:8080/api', targetPrefix) });
  });
}

async function login(page: Page, username: string, password: string): Promise<string> {
  await page.goto('/admin/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#username').fill(username);
  await page.locator('p-password input, #password input').first().fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/admin\/login(?:\?|$)/, { timeout: 15_000 });
  return (await page.evaluate(() => localStorage.getItem('token'))) || '';
}

function canonical(payload: Record<string, unknown>): string {
  return Object.keys(payload)
    .filter(key => key !== 'signature')
    .sort()
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(String(payload[key]))}`)
    .join('&');
}

function sign(payload: Record<string, unknown>): string {
  return createHmac('sha256', platformSigningSecret!).update(canonical(payload)).digest('hex');
}

test.describe('Platform subscription purchase and activation', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });
  test.skip(!journeyReady, 'Set admin credentials and simulator signing variables before running platform purchase E2E evidence.');

  test('registers an owner, approves a property, purchases a plan and activates once', async ({ page, browser }) => {
    await routeToE2eBackend(page);
    const unique = `platform-e2e-${Date.now()}`;
    const ownerEmail = `${unique}@example.test`;
    const ownerPassword = 'PlatformE2e!2026';
    const propertyName = `Platform E2E Hotel ${unique}`;

    page.on('dialog', dialog => dialog.accept());
    await page.goto('/partner/register', { waitUntil: 'domcontentloaded' });
    await page.locator('#fullName').fill('Platform E2E Owner');
    await page.locator('#email').fill(ownerEmail);
    await page.locator('#phone').fill('0900000000');
    await page.locator('#password').fill(ownerPassword);
    await page.locator('#propertyName').fill(propertyName);
    await page.locator('#propertyAddress').fill('1 Platform Street, Ho Chi Minh City');
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/login(?:\?|$)/, { timeout: 15_000 });

    const ownerToken = await login(page, ownerEmail, ownerPassword);
    const ownerHeaders = { Authorization: `Bearer ${ownerToken}` };
    const ownerPropertiesResponse = await page.request.get(`${e2eApiUrl}/v1/hotels/my-hotels`, { headers: ownerHeaders });
    expect(ownerPropertiesResponse.ok()).toBe(true);
    const ownerProperties = await ownerPropertiesResponse.json() as Array<{ id: number; name: string; approvalStatus?: string }>;
    const property = ownerProperties.find(item => item.name === propertyName);
    expect(property, 'Registration must create a pending property for the new owner').toBeTruthy();
    expect(property?.approvalStatus).toBe('PENDING_APPROVAL');

    const adminPage = await browser.newPage();
    await routeToE2eBackend(adminPage);
    const adminToken = await login(adminPage, adminUsername!, adminPassword!);
    const approveResponse = await adminPage.request.post(`${e2eApiUrl}/v1/hotels/${property!.id}/approve`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(approveResponse.ok()).toBe(true);
    await adminPage.close();

    // Legacy subscription records are not Platform Billing orders; keep this journey focused on the new bounded context.
    await page.route('**/api/subscriptions/me', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/api/subscriptions/me/usage', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ planCode: 'NO_PLAN', subscriptionStatus: 'NONE', lifetime: false, limits: {}, usage: {}, features: [] }),
    }));
    await page.goto(`/management/billing?propertyId=${property!.id}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.billing-container')).toBeVisible();
    await expect(page.locator('.pricing-card').first()).toBeVisible({ timeout: 20_000 });

    const purchaseResponse = page.waitForResponse(response =>
      response.url().includes('/api/platform/subscription-orders')
      && response.request().method() === 'POST',
    );
    await page.locator('.pricing-card').first().getByRole('button', { name: /Create purchase order/ }).click();
    const order = await (await purchaseResponse).json() as { publicId: string };
    expect(order.publicId).toBeTruthy();
    await expect(page.locator('.order-snapshot')).toContainText(order.publicId);

    const attemptResponse = page.waitForResponse(response =>
      response.url().includes(`/api/platform/subscription-orders/${order.publicId}/payment-attempts`)
      && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Create payment attempt' }).click();
    const attempt = await (await attemptResponse).json() as {
      providerOrderReference: string;
      expectedAmount: number;
      provider: string;
    };
    expect(attempt.provider).toBe('SIMULATOR');

    const callbackPayload: Record<string, unknown> = {
      merchantId: platformMerchant,
      eventId: `EVENT-${unique}`,
      transactionId: `TX-${unique}`,
      reference: attempt.providerOrderReference,
      amount: attempt.expectedAmount,
      currency: 'VND',
      occurredAt: new Date().toISOString(),
      status: 'SUCCEEDED',
    };
    callbackPayload.signature = sign(callbackPayload);
    const callbackResponse = await page.request.post(`${e2eApiUrl}/payment-providers/platform/SIMULATOR/callback`, {
      headers: { 'X-Payment-Signature': String(callbackPayload.signature) },
      data: callbackPayload,
    });
    expect(callbackResponse.ok()).toBe(true);
    expect((await callbackResponse.json()).accepted).toBe(true);

    await page.getByRole('button', { name: 'Refresh server status' }).click();
    await expect(page.locator('.server-effect')).toContainText('server evidence', { timeout: 20_000 });
    const orderDetails = await (await page.request.get(`${e2eApiUrl}/platform/subscription-orders/${order.publicId}`, { headers: ownerHeaders })).json() as { status: string };
    expect(orderDetails.status).toBe('APPLIED');
  });
});
