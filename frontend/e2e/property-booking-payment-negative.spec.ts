import { expect, Page, test } from '@playwright/test';
import { seedSession } from './helpers/audit-fixtures';

const bookingId = 92;

async function seedCustomerSession(page: Page): Promise<void> {
  await seedSession(page, { token: 'property-payment-negative-e2e-token', userId: 502, username: 'negative-payment-customer', fullName: 'Negative Payment Customer', roles: ['CUSTOMER'], permissions: [] });
  await page.addInitScript(() => localStorage.setItem('luxestay.locale', 'en'));
}

async function routeCustomerContext(page: Page): Promise<void> {
  await page.route('**/api/users/me', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      id: 502,
      username: 'negative-payment-customer',
      email: 'negative-payment@example.test',
      fullName: 'Negative Payment Customer',
      roles: ['CUSTOMER'],
    }),
  }));
}

function bookingUrl(overrides: Record<string, string> = {}): string {
  const query = new URLSearchParams({
    checkIn: '2026-08-10',
    checkOut: '2026-08-12',
    adultCount: '2',
    childCount: '0',
    quantity: '1',
    hotelId: '7f6f2b7f-2d5a-4eb6-8f2d-9f9a1b6d7007',
    roomTypeName: 'Deluxe Suite',
    nightlyPrice: '1000000',
    estimatedTotal: '2000000',
    ...overrides,
  });
  return `/booking/501?${query}`;
}

async function fillCheckout(page: Page): Promise<void> {
  await page.locator('input[name="lastName"]').fill('Nguyen');
  await page.locator('input[name="firstName"]').fill('An');
  await page.locator('input[name="phone"]').fill('0900000000');
  await page.locator('input[name="email"]').fill('negative-payment@example.test');
  await page.locator('input[value="MOMO"]').check();
}

function expiredAttempt(attemptId: string) {
  return {
    attemptId,
    reservationId: bookingId,
    purpose: 'DEPOSIT',
    status: 'EXPIRED',
    environment: 'SIMULATOR',
    expectedAmount: 600000,
    currency: 'VND',
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
    method: 'MOMO',
    provider: 'SIMULATOR',
    receiver: {
      bankName: null,
      bankCode: null,
      accountName: null,
      accountNumberMasked: null,
      qrProvider: null,
      merchantReferenceMasked: 'PROPERTY-SIMULATOR',
      instructionsVi: null,
      instructionsEn: null,
    },
    uniqueTransferContent: null,
    qrData: null,
    redirectUrl: null,
    replayed: false,
  };
}

test.describe('Property booking payment negative journeys', () => {
  test.describe.configure({ mode: 'serial', retries: 0, timeout: 60_000 });

  test.beforeEach(async ({ page }) => {
    await seedCustomerSession(page);
    await routeCustomerContext(page);
    await page.route('**/api/public/quotes', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ quoteId: 'quote-negative', expiresAt: new Date(Date.now() + 900000).toISOString(), propertyId: 'property-7', roomTypeId: 'room-501', nightlyPrice: 1000000, numberOfNights: 2, roomQuantity: 1, baseSubtotal: 2000000, taxAmount: 0, feeAmount: 0, taxesAndFees: 0, appliedPromotions: [], memberBenefit: { eligible: false }, totalDiscount: 0, finalTotal: 2000000, currency: 'VND' }),
    }));
    await page.route('**/api/public/properties/*/payment-options', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{ code: 'MOMO', provider: 'MOMO', requiresPrepayment: true }]),
    }));
  });

  test('blocks invalid dates and capacity conflicts before any payment attempt', async ({ page }) => {
    let bookingMutations = 0;
    let attemptMutations = 0;

    await page.route('**/api/reservations/book', async route => {
      bookingMutations += 1;
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'CAPACITY_UNAVAILABLE',
          message: 'The selected room capacity is no longer available.',
          retryable: true,
        }),
      });
    });
    await page.route('**/api/reservations/*/payment-attempts', route => {
      attemptMutations += 1;
      return route.fulfill({ status: 500, body: 'unexpected payment attempt' });
    });

    await page.goto(bookingUrl({ checkOut: '2026-08-10' }), { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.checkout-state')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toHaveCount(0);
    expect(bookingMutations).toBe(0);
    expect(attemptMutations).toBe(0);

    await page.goto(bookingUrl(), { waitUntil: 'domcontentloaded' });
    await fillCheckout(page);
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('[role="alert"]')).toBeVisible();
    expect(bookingMutations).toBe(1);
    expect(attemptMutations).toBe(0);
  });

  test('ignores caller price tampering and retries an expired attempt without another booking', async ({ page }) => {
    let bookingMutations = 0;
    let attemptMutations = 0;
    let bookingBody: Record<string, unknown> | null = null;
    const attemptBodies: Array<Record<string, unknown>> = [];
    const idempotencyKeys: string[] = [];

    await page.route('**/api/reservations/book', async route => {
      bookingMutations += 1;
      bookingBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: bookingId, status: 'PENDING' }),
      });
    });
    await page.route(`**/api/reservations/${bookingId}/payment-attempts`, async route => {
      attemptMutations += 1;
      attemptBodies.push(route.request().postDataJSON() as Record<string, unknown>);
      idempotencyKeys.push(route.request().headers()['idempotency-key'] || '');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(expiredAttempt(`expired-attempt-${attemptMutations}`)),
      });
    });

    await page.goto(bookingUrl({ nightlyPrice: '1', estimatedTotal: '1' }), { waitUntil: 'domcontentloaded' });
    await fillCheckout(page);
    await page.locator('button[type="submit"]').click();

    const panel = page.locator('app-property-payment-panel');
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await expect(panel.locator('.amount-block strong')).toContainText('600,000');
    await expect(panel.locator('.status-block strong')).toHaveText('Expired');
    await expect(panel.locator('.retry-payment')).toBeVisible();

    expect(bookingBody).not.toHaveProperty('totalAmount');
    expect(bookingBody).not.toHaveProperty('expectedAmount');
    expect(attemptBodies[0]).toEqual({ purpose: 'DEPOSIT', method: 'MOMO' });
    expect(idempotencyKeys[0]).not.toBe('');

    await panel.locator('.retry-payment').click();
    await expect.poll(() => attemptMutations).toBe(2);

    expect(bookingMutations).toBe(1);
    expect(attemptBodies[1]).toEqual({ purpose: 'DEPOSIT', method: 'MOMO' });
    expect(idempotencyKeys[1]).not.toBe(idempotencyKeys[0]);
  });

  test('rejects an invalid callback signature and hides a foreign attempt', async ({ page }) => {
    let ledgerEffects = 0;

    await page.route('**/api/payment-providers/property/SIMULATOR/callback', route => route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'CALLBACK_SIGNATURE_INVALID',
        message: 'The provider callback signature is invalid.',
        retryable: false,
      }),
    }));
    await page.route('**/api/payment-attempts/foreign-attempt', route => route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'RESOURCE_NOT_FOUND',
        message: 'Payment attempt was not found.',
        retryable: false,
      }),
    }));

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const results = await page.evaluate(async () => {
      const callback = await fetch('/api/payment-providers/property/SIMULATOR/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: 'forged-event',
          amount: 600000,
          currency: 'VND',
          signature: 'forged',
        }),
      });
      const foreignAttempt = await fetch('/api/payment-attempts/foreign-attempt');
      return {
        callback: { status: callback.status, body: await callback.json() },
        foreignAttempt: { status: foreignAttempt.status, body: await foreignAttempt.json() },
      };
    });

    expect(results.callback.status).toBe(401);
    expect(results.callback.body.code).toBe('CALLBACK_SIGNATURE_INVALID');
    expect(results.foreignAttempt.status).toBe(404);
    expect(results.foreignAttempt.body).toEqual({
      code: 'RESOURCE_NOT_FOUND',
      message: 'Payment attempt was not found.',
      retryable: false,
    });
    expect(JSON.stringify(results.foreignAttempt.body)).not.toContain('expectedAmount');
    expect(JSON.stringify(results.foreignAttempt.body)).not.toContain('receiver');
    expect(ledgerEffects).toBe(0);
  });
});
