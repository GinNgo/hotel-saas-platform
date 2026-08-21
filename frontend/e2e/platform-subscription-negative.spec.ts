import { createHmac } from 'node:crypto';
import { expect, Page, APIRequestContext, test } from '@playwright/test';

const adminUsername = process.env.LUXESTAY_E2E_ADMIN_USERNAME;
const adminPassword = process.env.LUXESTAY_E2E_ADMIN_PASSWORD;
const e2eApiUrl = (process.env.LUXESTAY_E2E_API_URL || 'http://localhost:8080/api').replace(/\/$/, '');
const platformMerchant = process.env.LUXESTAY_E2E_PLATFORM_MERCHANT_ID;
const platformSigningSecret = process.env.LUXESTAY_E2E_PLATFORM_SIGNING_SECRET;
const shortExpiryEnabled = process.env.LUXESTAY_E2E_PLATFORM_ORDER_EXPIRY_MINUTES === '1';
const journeyReady = Boolean(adminUsername && adminPassword && platformMerchant && platformSigningSecret);

type PlatformOrder = {
  publicId: string;
  targetHotelId: number;
  planId: number;
  price: number;
  status: string;
  expiresAt: string;
};

type PlatformAttempt = {
  publicId: string;
  providerOrderReference: string;
  expectedAmount: number;
  provider: string;
  status: string;
};

type Fixture = {
  ownerEmail: string;
  ownerPassword: string;
  ownerToken: string;
  propertyId: number;
  planId: number;
  planPrice: number;
};

let fixture: Fixture;

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

function authHeaders(token: string, idempotencyKey?: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
  };
}

function canonical(payload: Record<string, unknown>): string {
  return Object.keys(payload)
    .filter(key => key !== 'signature')
    .sort()
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(String(payload[key]))}`)
    .join('&');
}

function signedCallback(attempt: PlatformAttempt, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    merchantId: platformMerchant,
    eventId: `EVENT-${attempt.publicId}-${Date.now()}`,
    transactionId: `TX-${attempt.publicId}-${Date.now()}`,
    reference: attempt.providerOrderReference,
    amount: attempt.expectedAmount,
    currency: 'VND',
    occurredAt: new Date().toISOString(),
    status: 'SUCCEEDED',
    ...overrides,
  };
  payload.signature = createHmac('sha256', platformSigningSecret!)
    .update(canonical(payload))
    .digest('hex');
  return payload;
}

async function expectCallbackError(
  request: APIRequestContext,
  payload: Record<string, unknown>,
  status: number,
  code: string,
): Promise<void> {
  const response = await request.post(`${e2eApiUrl}/payment-providers/platform/SIMULATOR/callback`, {
    headers: { 'X-Payment-Signature': String(payload.signature) },
    data: payload,
  });
  expect(response.status()).toBe(status);
  const body = await response.json() as { errorCode?: string };
  expect(body.errorCode).toBe(code);
}

async function createOrderAndAttempt(request: APIRequestContext): Promise<{ order: PlatformOrder; attempt: PlatformAttempt }> {
  const orderResponse = await request.post(`${e2eApiUrl}/platform/subscription-orders`, {
    headers: authHeaders(fixture.ownerToken, `negative-order-${Date.now()}-${Math.random()}`),
    data: { targetHotelId: fixture.propertyId, planId: fixture.planId },
  });
  expect(orderResponse.ok()).toBe(true);
  const order = await orderResponse.json() as PlatformOrder;

  const attemptResponse = await request.post(`${e2eApiUrl}/platform/subscription-orders/${order.publicId}/payment-attempts`, {
    headers: authHeaders(fixture.ownerToken, `negative-attempt-${Date.now()}-${Math.random()}`),
    data: { provider: 'SIMULATOR', method: 'SIMULATOR' },
  });
  expect(attemptResponse.ok()).toBe(true);
  const attempt = await attemptResponse.json() as PlatformAttempt;
  return { order, attempt };
}

async function orderDetails(request: APIRequestContext, orderId: string): Promise<PlatformOrder & { attempts: PlatformAttempt[] }> {
  const response = await request.get(`${e2eApiUrl}/platform/subscription-orders/${orderId}`, {
    headers: authHeaders(fixture.ownerToken),
  });
  expect(response.ok()).toBe(true);
  return await response.json() as PlatformOrder & { attempts: PlatformAttempt[] };
}

test.describe('Platform subscription negative journeys', () => {
  test.describe.configure({ mode: 'serial', retries: 0, timeout: 120_000 });
  test.skip(!journeyReady, 'Set admin credentials and simulator signing variables before running platform negative E2E evidence.');

  test.beforeAll(async ({ browser }) => {
    const setupPage = await browser.newPage();
    await routeToE2eBackend(setupPage);
    const unique = `platform-negative-${Date.now()}`;
    fixture = {
      ownerEmail: `${unique}@example.test`,
      ownerPassword: 'PlatformNegative!2026',
      ownerToken: '',
      propertyId: 0,
      planId: 0,
      planPrice: 0,
    };

    await setupPage.goto('/partner/register', { waitUntil: 'domcontentloaded' });
    await setupPage.locator('#fullName').fill('Platform Negative Owner');
    await setupPage.locator('#email').fill(fixture.ownerEmail);
    await setupPage.locator('#phone').fill('0900000001');
    await setupPage.locator('#password').fill(fixture.ownerPassword);
    await setupPage.locator('#propertyName').fill(`Platform Negative Hotel ${unique}`);
    await setupPage.locator('#propertyAddress').fill('2 Platform Street, Ho Chi Minh City');
    await setupPage.locator('button[type="submit"]').click();
    await expect(setupPage).toHaveURL(/\/login(?:\?|$)/, { timeout: 15_000 });

    fixture.ownerToken = await login(setupPage, fixture.ownerEmail, fixture.ownerPassword);
    const ownerHeaders = authHeaders(fixture.ownerToken);
    const hotelsResponse = await setupPage.request.get(`${e2eApiUrl}/v1/hotels/my-hotels`, { headers: ownerHeaders });
    expect(hotelsResponse.ok()).toBe(true);
    const hotels = await hotelsResponse.json() as Array<{ id: number; name: string; approvalStatus?: string }>;
    const property = hotels.find(item => item.name.includes(unique));
    expect(property?.approvalStatus).toBe('PENDING_APPROVAL');
    fixture.propertyId = property!.id;

    const adminPage = await browser.newPage();
    await routeToE2eBackend(adminPage);
    const adminToken = await login(adminPage, adminUsername!, adminPassword!);
    const approval = await adminPage.request.post(`${e2eApiUrl}/v1/hotels/${fixture.propertyId}/approve`, {
      headers: authHeaders(adminToken),
    });
    expect(approval.ok()).toBe(true);
    await adminPage.close();

    const plansResponse = await setupPage.request.get(`${e2eApiUrl}/platform/subscription-plans`, { headers: ownerHeaders });
    expect(plansResponse.ok()).toBe(true);
    const plans = await plansResponse.json() as Array<{ id: number; price: number }>;
    expect(plans.length).toBeGreaterThan(0);
    fixture.planId = plans[0].id;
    fixture.planPrice = plans[0].price;
    await setupPage.close();
  });

  test('rejects tampered price and wrong merchant without changing the order', async ({ page }) => {
    await routeToE2eBackend(page);
    const { order: tamperedOrder, attempt: tamperedAttempt } = await createOrderAndAttempt(page.request);
    await expectCallbackError(page.request, signedCallback(tamperedAttempt, { amount: tamperedAttempt.expectedAmount + 1 }), 400, 'CALLBACK_AMOUNT_MISMATCH');
    const tamperedDetails = await orderDetails(page.request, tamperedOrder.publicId);
    expect(tamperedDetails.status).toBe('PENDING_PAYMENT');
    expect(tamperedDetails.attempts[0].status).toBe('PENDING');

    const { order: merchantOrder, attempt: merchantAttempt } = await createOrderAndAttempt(page.request);
    await expectCallbackError(page.request, signedCallback(merchantAttempt, { merchantId: 'WRONG-SYSTEM-MERCHANT' }), 400, 'CALLBACK_MERCHANT_MISMATCH');
    const merchantDetails = await orderDetails(page.request, merchantOrder.publicId);
    expect(merchantDetails.status).toBe('PENDING_PAYMENT');
    expect(merchantDetails.attempts[0].status).toBe('PENDING');
  });

  test('accepts an equivalent callback replay exactly once', async ({ page }) => {
    await routeToE2eBackend(page);
    const { order, attempt } = await createOrderAndAttempt(page.request);
    const payload = signedCallback(attempt);
    const first = await page.request.post(`${e2eApiUrl}/payment-providers/platform/SIMULATOR/callback`, {
      headers: { 'X-Payment-Signature': String(payload.signature) },
      data: payload,
    });
    expect(first.ok()).toBe(true);
    expect((await first.json()).replayed).toBe(false);
    const replay = await page.request.post(`${e2eApiUrl}/payment-providers/platform/SIMULATOR/callback`, {
      headers: { 'X-Payment-Signature': String(payload.signature) },
      data: payload,
    });
    expect(replay.ok()).toBe(true);
    const replayBody = await replay.json() as { replayed: boolean; orderStatus: string };
    expect(replayBody.replayed).toBe(true);
    expect(replayBody.orderStatus).toBe('APPLIED');
    expect((await orderDetails(page.request, order.publicId)).status).toBe('APPLIED');
  });

  test('cancels an unpaid order and rejects a late callback', async ({ page }) => {
    await routeToE2eBackend(page);
    const { order, attempt } = await createOrderAndAttempt(page.request);
    const cancel = await page.request.post(`${e2eApiUrl}/platform/subscription-orders/${order.publicId}/cancel`, {
      headers: authHeaders(fixture.ownerToken, `negative-cancel-${Date.now()}`),
    });
    expect(cancel.ok()).toBe(true);
    expect((await cancel.json()).status).toBe('CANCELLED');
    await expectCallbackError(page.request, signedCallback(attempt), 409, 'INVALID_STATE_TRANSITION');
    expect((await orderDetails(page.request, order.publicId)).status).toBe('CANCELLED');
  });

  test('blocks unsupported downgrade before creating an order', async ({ page }) => {
    await routeToE2eBackend(page);
    const response = await page.request.post(`${e2eApiUrl}/platform/subscriptions/${fixture.propertyId}/downgrade-orders`, {
      headers: authHeaders(fixture.ownerToken, `negative-downgrade-${Date.now()}`),
      data: { targetPlanId: fixture.planId },
    });
    expect(response.status()).toBe(409);
    const body = await response.json() as { code?: string };
    expect(body.code).toBe('POLICY_NOT_CONFIGURED');
  });

  test('rejects an expired order when the short-expiry E2E profile is enabled', async ({ page }) => {
    test.skip(!shortExpiryEnabled, 'Start the E2E backend with platform.billing.order-expiry-minutes=1 to run expiry evidence.');
    await routeToE2eBackend(page);
    const { order } = await createOrderAndAttempt(page.request);
    const waitMs = Math.max(0, Date.parse(order.expiresAt) - Date.now() + 1_500);
    test.setTimeout(Math.max(120_000, waitMs + 30_000));
    await page.waitForTimeout(waitMs);
    const response = await page.request.post(`${e2eApiUrl}/platform/subscription-orders/${order.publicId}/payment-attempts`, {
      headers: authHeaders(fixture.ownerToken, `expired-attempt-${Date.now()}`),
      data: { provider: 'SIMULATOR', method: 'SIMULATOR' },
    });
    expect(response.status()).toBe(409);
    const body = await response.json() as { code?: string };
    expect(body.code).toBe('ATTEMPT_EXPIRED');
  });
});
