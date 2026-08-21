import { expect, Page, Route, test } from '@playwright/test';
import { seedSession } from './helpers/audit-fixtures';

interface CallbackResult {
  attemptId: string;
  status: 'SUCCESS';
  transactionId: string;
  replayed: boolean;
}

const reservationId = 91;
const attemptId = 'attempt-91-deposit';

async function seedCustomerSession(page: Page): Promise<void> {
  await seedSession(page, { token: 'property-booking-payment-e2e-token', userId: 501, username: 'payment-customer', fullName: 'Payment Customer', roles: ['CUSTOMER'], permissions: [] });
  await page.addInitScript(() => localStorage.setItem('luxestay.locale', 'en'));
}

function paymentAttempt(status: 'PENDING' | 'SUCCESS') {
  return {
    attemptId,
    reservationId,
    purpose: 'DEPOSIT',
    status,
    environment: 'SIMULATOR',
    expectedAmount: 600000,
    currency: 'VND',
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
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
    replayed: status === 'SUCCESS',
  };
}

test.describe('Property booking deposit journey', () => {
  test.describe.configure({ mode: 'serial', retries: 0, timeout: 60_000 });

  test('creates one booking and one attempt, then handles concurrent and replayed confirmation once', async ({ page }) => {
    await seedCustomerSession(page);

    let bookingMutations = 0;
    let attemptMutations = 0;
    let callbackRequests = 0;
    let ledgerEffects = 0;
    let bookingBody: Record<string, unknown> | null = null;
    let attemptBody: Record<string, unknown> | null = null;
    let attemptIdempotencyKey = '';
    const processedEvents = new Set<string>();

    await page.route('**/api/users/me', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 501,
        username: 'payment-customer',
        email: 'payment@example.test',
        fullName: 'Payment Customer',
        roles: ['CUSTOMER'],
      }),
    }));
    await page.route('**/api/public/quotes', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ quoteId: 'quote-91', expiresAt: new Date(Date.now() + 900000).toISOString(), propertyId: 'property-7', roomTypeId: 'room-501', nightlyPrice: 1000000, numberOfNights: 2, roomQuantity: 1, baseSubtotal: 2000000, taxAmount: 0, feeAmount: 0, taxesAndFees: 0, appliedPromotions: [], memberBenefit: { eligible: false }, totalDiscount: 0, finalTotal: 2000000, currency: 'VND' }),
    }));
    await page.route('**/api/public/properties/*/payment-options', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{ code: 'MOMO', provider: 'MOMO', requiresPrepayment: true }]),
    }));

    await page.route('**/api/reservations/book', async route => {
      bookingMutations += 1;
      bookingBody = route.request().postDataJSON() as Record<string, unknown>;
      await new Promise(resolve => setTimeout(resolve, 250));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: reservationId, status: 'PENDING' }),
      });
    });

    await page.route(`**/api/reservations/${reservationId}/payment-attempts`, async route => {
      attemptMutations += 1;
      attemptBody = route.request().postDataJSON() as Record<string, unknown>;
      attemptIdempotencyKey = route.request().headers()['idempotency-key'] || '';
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(paymentAttempt('PENDING')),
      });
    });

    await page.route(`**/api/payment-attempts/${attemptId}`, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(paymentAttempt(ledgerEffects === 1 ? 'SUCCESS' : 'PENDING')),
    }));

    await page.route('**/api/payment-providers/property/SIMULATOR/callback', async (route: Route) => {
      callbackRequests += 1;
      const payload = route.request().postDataJSON() as { eventId: string };
      const replayed = processedEvents.has(payload.eventId);
      if (!replayed) {
        processedEvents.add(payload.eventId);
        ledgerEffects += 1;
      }
      const result: CallbackResult = {
        attemptId,
        status: 'SUCCESS',
        transactionId: 'txn-91-deposit',
        replayed,
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(result),
      });
    });

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
    });
    await page.goto(`/booking/501?${query}`, { waitUntil: 'domcontentloaded' });

    await page.locator('input[name="lastName"]').fill('Nguyen');
    await page.locator('input[name="firstName"]').fill('An');
    await page.locator('input[name="phone"]').fill('0900000000');
    await page.locator('input[name="email"]').fill('payment@example.test');
    await page.locator('input[value="MOMO"]').check();

    const submit = page.locator('button[type="submit"]');
    await submit.click();
    await expect(submit).toBeDisabled();
    await expect.poll(() => bookingMutations).toBe(1);
    await page.waitForTimeout(350);
    expect(bookingMutations).toBe(1);
    await expect.poll(() => attemptMutations).toBe(1);

    const panel = page.locator('app-property-payment-panel');
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await expect(panel.locator('.amount-block strong')).toContainText(/600[.,]000/);
    await expect(panel.locator('.environment-chip')).toContainText('Simulator - no real money');
    await expect(panel.locator('.status-block strong')).toHaveText('Pending');

    expect(bookingMutations).toBe(1);
    expect(attemptMutations).toBe(1);
    expect(bookingBody).not.toHaveProperty('totalAmount');
    expect(attemptBody).toEqual({ purpose: 'DEPOSIT', method: 'MOMO' });
    expect(attemptIdempotencyKey).not.toBe('');

    const callbackPayload = {
      eventId: 'sim-event-91',
      transactionId: 'sim-txn-91',
      reference: attemptId,
      merchant: 'PROPERTY-SIMULATOR',
      amount: 600000,
      currency: 'VND',
      status: 'SUCCESS',
    };
    const concurrentResults = await page.evaluate(async payload => {
      const send = () => fetch('/api/payment-providers/property/SIMULATOR/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(response => response.json());
      return Promise.all([send(), send()]);
    }, callbackPayload) as CallbackResult[];

    expect(concurrentResults.filter(result => result.replayed)).toHaveLength(1);
    expect(concurrentResults.filter(result => !result.replayed)).toHaveLength(1);

    const replayResult = await page.evaluate(async payload => {
      const response = await fetch('/api/payment-providers/property/SIMULATOR/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return response.json();
    }, callbackPayload) as CallbackResult;

    expect(replayResult.replayed).toBe(true);
    expect(callbackRequests).toBe(3);
    expect(ledgerEffects).toBe(1);
    await expect(panel.locator('.status-block strong')).toHaveText('Successful', { timeout: 10_000 });
  });
});
