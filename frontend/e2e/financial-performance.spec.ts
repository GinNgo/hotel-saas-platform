import { expect, Locator, Page, Route, test } from '@playwright/test';

const propertyId = 11;
const acknowledgementBudgetMs = 300;
const measuredSamples = 20;

const plan = {
  id: 7,
  code: 'PRO',
  nameVi: 'Professional',
  nameEn: 'Professional',
  billingType: 'MONTHLY',
  price: 2_500_000,
  currency: 'VND',
  isLifetime: false,
  status: 'ACTIVE',
  features: [],
};

const order = {
  publicId: 'performance-order-1',
  orderCode: 'PERF-ORDER-1',
  ownerUserId: 110,
  targetHotelId: propertyId,
  operation: 'PURCHASE',
  planId: plan.id,
  planVersion: '2026.08',
  planCode: plan.code,
  planName: plan.nameEn,
  price: plan.price,
  currency: 'VND',
  billingPeriod: 'MONTHLY',
  durationValue: 1,
  durationUnit: 'MONTH',
  featureSnapshotJson: '{}',
  status: 'PENDING_PAYMENT',
  expiresAt: '2026-08-04T10:00:00Z',
};

const attempt = {
  publicId: 'performance-attempt-1',
  orderPublicId: order.publicId,
  status: 'PENDING',
  provider: 'SIMULATOR',
  method: 'SIMULATOR',
  environment: 'SIMULATOR',
  expectedAmount: plan.price,
  currency: 'VND',
  providerOrderReference: 'SIM-PERF-ORDER-1',
  expiresAt: '2026-08-04T10:00:00Z',
  merchantReferenceMasked: 'SIM-***-LOCAL',
};

async function seedLocalSession(page: Page): Promise<void> {
  await page.addInitScript(
    ({ user }) => {
      const rewrite = (source: string) =>
        source.startsWith('http://localhost:8080/api')
          ? source.replace('http://localhost:8080/api', '/api')
          : source;
      const originalFetch = globalThis.fetch.bind(globalThis);
      globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const source =
          typeof input === 'string' || input instanceof URL ? input.toString() : input.url;
        const rewritten = rewrite(source);
        return input instanceof Request
          ? originalFetch(new Request(rewritten, input), init)
          : originalFetch(rewritten, init);
      };
      const originalOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (
        method: string,
        url: string | URL,
        async = true,
        username?: string | null,
        password?: string | null,
      ) {
        return originalOpen.call(this, method, rewrite(url.toString()), async, username, password);
      };
      // Keep the fixture compatible with the browser's JWT expiry guard.
      sessionStorage.setItem('token', 'e30.eyJleHAiOjQxMDI0NDQ4MDB9.local-performance');
      localStorage.removeItem('token');
      localStorage.setItem('user', JSON.stringify(user));
    },
    {
      user: {
        id: 110,
        username: 'performance-owner',
        fullName: 'Performance Owner',
        roles: ['PROPERTY_OWNER'],
        permissions: [],
      },
    },
  );
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, json: body });
}

async function openPaymentAttemptAction(page: Page): Promise<Locator> {
  await page.goto(`/management/billing?propertyId=${propertyId}`, {
    waitUntil: 'domcontentloaded',
  });
  const createOrder = page.getByRole('button', { name: 'Create purchase order' });
  await expect(createOrder).toBeVisible();
  await createOrder.click();
  const createAttempt = page.getByRole('button', { name: 'Create payment attempt' });
  await expect(createAttempt).toBeVisible();
  return createAttempt;
}

async function measureBrowserAcknowledgement(button: Locator): Promise<number> {
  return button.evaluate(
    (node) =>
      new Promise<number>((resolve, reject) => {
        const element = node as HTMLButtonElement;
        const startedAt = performance.now();
        let completed = false;
        let timeoutId = 0;

        const finish = () => {
          if (completed || !element.disabled || !element.textContent?.includes('Creating...'))
            return;
          completed = true;
          observer.disconnect();
          window.clearTimeout(timeoutId);
          resolve(performance.now() - startedAt);
        };
        const observer = new MutationObserver(finish);
        observer.observe(element, {
          attributes: true,
          childList: true,
          characterData: true,
          subtree: true,
        });
        timeoutId = window.setTimeout(() => {
          if (completed) return;
          completed = true;
          observer.disconnect();
          reject(new Error('Financial action did not acknowledge within 1 second.'));
        }, 1_000);

        element.click();
        queueMicrotask(finish);
      }),
  );
}

function percentile(samples: number[], target: number): number {
  const sorted = [...samples].sort((left, right) => left - right);
  const nearestRank = Math.ceil((sorted.length * target) / 100);
  return sorted[Math.max(0, nearestRank - 1)];
}

test.describe('Financial action performance budget', () => {
  test.describe.configure({ mode: 'serial', retries: 0, timeout: 90_000 });

  test('payment-attempt acknowledgement p95 is at most 300 ms excluding provider latency', async ({
    page,
  }) => {
    await seedLocalSession(page);
    let providerResponseSettled = false;
    let releaseProviderResponse: (() => void) | undefined;
    let attemptRequests = 0;

    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();

      if (method === 'GET' && url.pathname === '/api/management/context') {
        await fulfillJson(route, {
          properties: [
            {
              id: propertyId,
              code: 'PERF-11',
              nameVi: 'Local Performance Hotel',
              propertyType: 'HOTEL',
              address: 'Local fixture',
              approvalStatus: 'APPROVED',
              operationStatus: 'ACTIVE',
              operational: true,
              isDemo: true,
            },
          ],
          activePropertyId: propertyId,
          activePropertyOperational: true,
          planCode: 'NONE',
          subscriptionStatus: 'NONE',
          lifetime: false,
          limits: {},
          usage: {},
          upgradeRequired: false,
        });
      } else if (method === 'GET' && url.pathname === '/api/platform/subscription-plans') {
        await fulfillJson(route, [plan]);
      } else if (
        method === 'GET' &&
        url.pathname === `/api/platform/subscriptions/${propertyId}/entitlement`
      ) {
        await fulfillJson(route, {
          targetHotelId: propertyId,
          source: 'NONE',
          platformAuthoritative: true,
          planCode: 'NONE',
          status: 'NONE',
          lifetime: false,
          limits: {},
        });
      } else if (method === 'GET' && url.pathname === '/api/platform/subscription-policies') {
        await fulfillJson(route, {
          downgradeConfigured: true,
          prorationConfigured: true,
          errorCode: 'NONE',
          downgradeMessage: 'Available',
          prorationMessage: 'Available',
        });
      } else if (method === 'POST' && url.pathname === '/api/platform/subscription-orders') {
        await fulfillJson(route, order);
      } else if (
        method === 'POST' &&
        url.pathname === `/api/platform/subscription-orders/${order.publicId}/payment-attempts`
      ) {
        attemptRequests += 1;
        await new Promise<void>((resolve) => {
          releaseProviderResponse = resolve;
        });
        providerResponseSettled = true;
        await fulfillJson(route, attempt);
      } else {
        await fulfillJson(route, []);
      }
    });

    providerResponseSettled = false;
    releaseProviderResponse = undefined;
    const warmupButton = await openPaymentAttemptAction(page);
    await measureBrowserAcknowledgement(warmupButton);
    expect(providerResponseSettled).toBe(false);
    await expect.poll(() => Boolean(releaseProviderResponse)).toBe(true);
    releaseProviderResponse?.();
    await expect.poll(() => providerResponseSettled).toBe(true);

    const samples: number[] = [];
    for (let sample = 0; sample < measuredSamples; sample += 1) {
      providerResponseSettled = false;
      releaseProviderResponse = undefined;
      const button = await openPaymentAttemptAction(page);
      const acknowledgementMs = await measureBrowserAcknowledgement(button);
      expect(providerResponseSettled).toBe(false);
      samples.push(acknowledgementMs);
      await expect.poll(() => Boolean(releaseProviderResponse)).toBe(true);
      releaseProviderResponse?.();
      await expect.poll(() => providerResponseSettled).toBe(true);
    }

    const p95 = percentile(samples, 95);
    test.info().annotations.push({
      type: 'performance',
      description: `financial-action acknowledgement p95=${p95.toFixed(1)}ms; samples=${samples.map((value) => value.toFixed(1)).join(',')}`,
    });
    expect(attemptRequests).toBe(measuredSamples + 1);
    expect(p95).toBeLessThanOrEqual(acknowledgementBudgetMs);
  });
});
