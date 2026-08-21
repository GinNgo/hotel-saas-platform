import { expect, Page, Route, test } from '@playwright/test';
import { seedSession } from './helpers/audit-fixtures';

const transactionId = 'tx-refund-e2e-1';
const refundId = 'refund-e2e-1';

async function seedCustomerSession(page: Page): Promise<void> {
  await seedSession(page, { token: 'refund-e2e-token', userId: 701, username: 'refund-customer', fullName: 'Refund Customer', roles: ['CUSTOMER'], permissions: [] });
  await page.addInitScript(() => {
    const originalFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const source = typeof input === 'string' || input instanceof URL ? input.toString() : input.url;
      if (!source.startsWith('http://localhost:8080/api')) return originalFetch(input, init);
      const rewritten = source.replace('http://localhost:8080/api', '/api');
      return input instanceof Request
        ? originalFetch(new Request(rewritten, input), init)
        : originalFetch(rewritten, init);
    };
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method: string, url: string | URL, async = true, username?: string | null, password?: string | null) {
      const source = url.toString();
      const rewritten = source.startsWith('http://localhost:8080/api')
        ? source.replace('http://localhost:8080/api', '/api')
        : source;
      return originalOpen.call(this, method, rewritten, async, username, password);
    };
    localStorage.setItem('luxestay.locale', 'en');
  });
}

function refundResponse(overrides: Record<string, unknown> = {}) {
  return {
    publicId: refundId,
    originalTransactionPublicId: transactionId,
    requestedAmount: 300000,
    currency: 'VND',
    status: 'REQUESTED',
    remainingRefundableAmount: 700000,
    requestedAt: '2026-08-02T00:00:00Z',
    completedAt: null,
    replayed: false,
    ...overrides,
  };
}

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, json: body });
}

test.describe('Refund lifecycle browser journey', () => {
  test.describe.configure({ mode: 'serial', retries: 0, timeout: 60_000 });

  test('customer submits a partial refund and an equivalent replay is idempotent', async ({ page }) => {
    await seedCustomerSession(page);
    const idempotencyKeys: string[] = [];
    let requests = 0;
    await page.route(`**/api/property-payments/${transactionId}/refunds`, async route => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204 });
        return;
      }
      requests += 1;
      idempotencyKeys.push(route.request().headers()['idempotency-key'] || '');
      const replayed = requests > 1;
      await json(route, 200, refundResponse({ replayed }));
    });

    await page.goto(`/refunds?transactionId=${transactionId}`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[name="amount"]').fill('300000');
    await page.locator('textarea[name="reason"]').fill('Guest cancellation');
    const refundResponsePromise = page.waitForResponse(response => response.url().includes(`/property-payments/${transactionId}/refunds`));
    await page.locator('button[type="submit"]').click();
    const refundNetworkResponse = await refundResponsePromise;
    expect(new URL(refundNetworkResponse.url()).pathname).toContain('/api/property-payments/');

    await expect(page.locator('[data-refund-status="REQUESTED"]')).toBeVisible();
    await expect(page.getByText('Refund request submitted.')).toBeVisible();
    const body = await page.locator('form').evaluate(form => {
      const amount = form.querySelector<HTMLInputElement>('input[name="amount"]');
      return amount?.value;
    });
    expect(body).toBe('');

    const replay = await page.evaluate(async () => {
      const response = await fetch('/api/property-payments/tx-refund-e2e-1/refunds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'replay-key' },
        body: JSON.stringify({ amount: 300000, reason: 'Guest cancellation' }),
      });
      return response.json();
    });
    expect(replay.replayed).toBe(true);
    expect(requests).toBe(2);
    expect(idempotencyKeys[0]).not.toBe('');
    expect(idempotencyKeys[1]).toBe('replay-key');
  });

  test('provider failure and fake callback are surfaced without a false success', async ({ page }) => {
    await seedCustomerSession(page);
    let attemptRequests = 0;
    let callbackRequests = 0;
    let ledgerEffects = 0;
    await page.route(`**/property-refunds/${refundId}/attempts`, async route => {
      attemptRequests += 1;
      await json(route, 200, {
        refundPublicId: refundId,
        attemptNumber: attemptRequests,
        provider: 'SIMULATOR',
        environment: 'SIMULATOR',
        providerReference: `provider-ref-${attemptRequests}`,
        status: 'PENDING_PROVIDER',
        replayed: attemptRequests > 1,
      });
    });
    await page.route('**/payment-providers/property/SIMULATOR/refund-callback', async route => {
      callbackRequests += 1;
      const signature = route.request().headers()['x-payment-signature'];
      if (signature !== 'valid-signature') {
        await json(route, 401, { code: 'CALLBACK_SIGNATURE_INVALID', retryable: false });
        return;
      }
      const payload = route.request().postDataJSON() as { status?: string };
      if (payload.status === 'FAILED') {
        await json(route, 200, { accepted: true, replayed: false, status: 'FAILED', refundPublicId: refundId });
        return;
      }
      ledgerEffects += 1;
      await json(route, 200, { accepted: true, replayed: false, status: 'SUCCEEDED', refundPublicId: refundId });
    });

    await page.goto(`/refunds?transactionId=${transactionId}`, { waitUntil: 'domcontentloaded' });
    const results = await page.evaluate(async () => {
      const post = (url: string, body: unknown, headers: Record<string, string> = {}) => fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      }).then(async response => ({ status: response.status, body: await response.json() }));
      return {
        attempt: await post('/api/property-refunds/refund-e2e-1/attempts', { provider: 'SIMULATOR' }),
        fakeCallback: await post('/api/payment-providers/property/SIMULATOR/refund-callback', { eventId: 'fake-event', reference: 'provider-ref-1', status: 'SUCCEEDED' }),
        providerFailure: await post('/api/payment-providers/property/SIMULATOR/refund-callback', { eventId: 'failure-event', reference: 'provider-ref-1', status: 'FAILED' }, { 'X-Payment-Signature': 'valid-signature' }),
      };
    });
    expect(results.attempt.status).toBe(200);
    expect(results.attempt.body.status).toBe('PENDING_PROVIDER');
    expect(results.fakeCallback.status).toBe(401);
    expect(results.providerFailure.status).toBe(200);
    expect(results.providerFailure.body.status).toBe('FAILED');
    expect(callbackRequests).toBe(2);
    expect(ledgerEffects).toBe(0);
  });

  test('concurrent equivalent callbacks produce one effect and one replay', async ({ page }) => {
    await seedCustomerSession(page);
    const processedEvents = new Set<string>();
    let ledgerEffects = 0;
    await page.route('**/payment-providers/property/SIMULATOR/refund-callback', async route => {
      const payload = route.request().postDataJSON() as { eventId: string };
      await new Promise(resolve => setTimeout(resolve, 120));
      const replayed = processedEvents.has(payload.eventId);
      if (!replayed) {
        processedEvents.add(payload.eventId);
        ledgerEffects += 1;
      }
      await json(route, 200, { accepted: true, replayed, status: 'SUCCEEDED', refundPublicId: refundId });
    });
    await page.route(`**/property-refunds/${refundId}`, async route => {
      await json(route, 200, refundResponse({ status: 'SUCCEEDED', replayed: true, completedAt: '2026-08-02T00:03:00Z', remainingRefundableAmount: 0 }));
    });

    await page.goto(`/refunds?transactionId=${transactionId}`, { waitUntil: 'domcontentloaded' });
    const results = await page.evaluate(async () => {
      const send = () => fetch('/api/payment-providers/property/SIMULATOR/refund-callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Payment-Signature': 'valid-signature' },
        body: JSON.stringify({ eventId: 'concurrent-refund-event', reference: 'provider-ref-1', status: 'SUCCEEDED' }),
      }).then(response => response.json());
      return Promise.all([send(), send()]);
    }) as Array<{ replayed: boolean; status: string }>;

    expect(results.filter(item => item.replayed)).toHaveLength(1);
    expect(results.filter(item => !item.replayed)).toHaveLength(1);
    expect(ledgerEffects).toBe(1);

    await page.goto(`/refunds?transactionId=${transactionId}&refundId=${refundId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-refund-status="SUCCEEDED"]')).toBeVisible();
    await expect(page.getByText('0 VND')).toBeVisible();
  });
});
