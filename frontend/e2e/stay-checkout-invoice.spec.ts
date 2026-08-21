import { expect, Page, Route, test } from '@playwright/test';
import { seedSession, syntheticAdminSession } from './helpers/audit-fixtures';

const reservationId = 314;
const roomId = 1204;
const invoiceId = 420;
const stayCheckInDate = new Date().toISOString().slice(0, 10);
const stayCheckOutDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

interface JourneyState {
  checkoutMutations: number;
  checkInMutations: number;
  confirmationMutations: number;
  customerView: boolean;
  paidAmount: number;
  paymentAttemptBodies: Array<Record<string, unknown>>;
  reservationStatus: 'CONFIRMED' | 'CHECKED_IN' | 'CHECKED_OUT';
  roomStatus: 'RESERVED' | 'OCCUPIED' | 'DIRTY';
  serviceAdded: boolean;
  serviceMutations: number;
  legacyInvoiceMutations: number;
}

async function seedAdminSession(page: Page): Promise<void> {
  await seedSession(page, {
    ...syntheticAdminSession(),
    fullName: 'Checkout Administrator',
    userId: 900,
    username: 'checkout-admin',
  });
  await page.addInitScript(() => {
    localStorage.setItem('luxestay.locale', 'vi');
    window.print = () => document.body.setAttribute('data-invoice-printed', 'true');
  });
}

async function installJourneyApi(page: Page, state: JourneyState): Promise<void> {
  const attemptAmounts = new Map<string, number>();

  await page.route('**/api/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const json = (status: number, body: unknown) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

    if (method === 'GET' && path === '/api/users/me') {
      return json(200, state.customerView ? customerProfile() : adminProfile());
    }
    if (method === 'GET' && path === '/api/notifications') {
      return json(200, { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 });
    }
    if (method === 'GET' && path === '/api/services') return json(200, [breakfastService()]);

    if (method === 'GET' && path === '/api/reservations') {
      return json(200, [reservationSummary(state)]);
    }
    if (method === 'POST' && path === `/api/reservations/${reservationId}/check-in`) {
      state.checkInMutations += 1;
      state.reservationStatus = 'CHECKED_IN';
      state.roomStatus = 'OCCUPIED';
      return json(200, reservationSummary(state));
    }

    if (method === 'POST' && path === `/api/management/reservations/${reservationId}/charges/services`) {
      const body = request.postDataJSON() as Record<string, unknown>;
      expect(body).toEqual({ serviceId: 81, chargeType: 'SERVICE', quantity: 1 });
      expect(body).not.toHaveProperty('unitPrice');
      state.serviceAdded = true;
      state.serviceMutations += 1;
      return json(201, {
        id: 610,
        reservationId,
        chargeType: 'SERVICE',
        code: 'BREAKFAST',
        name: 'Breakfast buffet',
        description: null,
        quantity: 1,
        unitPrice: 50_000,
        taxAmount: 0,
        discountAmount: 0,
        totalAmount: 50_000,
        serviceUsedAt: '2026-08-01T08:00:00Z',
        correlationId: null,
      });
    }
    if (method === 'POST' && path === `/api/management/reservations/${reservationId}/checkout-preview`) {
      return json(200, checkoutPreview(state));
    }

    if (method === 'POST' && path === `/api/reservations/${reservationId}/payment-attempts`) {
      const body = request.postDataJSON() as Record<string, unknown>;
      state.paymentAttemptBodies.push(body);
      const sequence = state.paymentAttemptBodies.length;
      const expectedAmount = sequence === 1 ? 400_000 : grossAmount(state) - state.paidAmount;
      const attemptId = `balance-attempt-${sequence}`;
      attemptAmounts.set(attemptId, expectedAmount);
      return json(201, {
        attemptId,
        reservationId,
        purpose: 'BALANCE',
        status: 'PENDING_VERIFICATION',
        environment: 'SIMULATOR',
        expectedAmount,
        currency: 'VND',
        expiresAt: '2026-08-01T12:00:00Z',
        method: 'MANUAL_TRANSFER',
        provider: 'SIMULATOR',
        receiver: {},
        uniqueTransferContent: `RES314-${sequence}`,
        qrData: null,
        redirectUrl: null,
        replayed: false,
      });
    }

    const confirmationMatch = path.match(/^\/api\/management\/payment-attempts\/(.+)\/confirm-manual$/);
    if (method === 'POST' && confirmationMatch) {
      const attemptId = confirmationMatch[1];
      const expectedAmount = attemptAmounts.get(attemptId);
      expect(expectedAmount).toBeDefined();
      const body = request.postDataJSON() as Record<string, unknown>;
      expect(body).not.toHaveProperty('amount');
      state.paidAmount += expectedAmount ?? 0;
      state.confirmationMutations += 1;
      return json(200, {
        transactionId: `txn-${attemptId}`,
        attemptId,
        status: 'SUCCESS',
        amount: expectedAmount,
        currency: 'VND',
        replayed: false,
      });
    }

    if (method === 'POST' && path === `/api/management/reservations/${reservationId}/checkout`) {
      expect(request.postData()).toBeNull();
      expect(state.paidAmount).toBe(grossAmount(state));
      state.checkoutMutations += 1;
      state.reservationStatus = 'CHECKED_OUT';
      state.roomStatus = 'DIRTY';
      return json(200, checkoutResult(state));
    }

    if (method === 'GET' && path === '/api/v1/hotels') {
      return json(200, [{ id: 9, name: 'Fixture Hotel', nameVi: 'Khách sạn Fixture' }]);
    }
    if (method === 'GET' && path === '/api/room-types') {
      return json(200, [{
        id: 17,
        hotelId: 9,
        code: 'DLX',
        nameVi: 'Phòng Deluxe',
        nameEn: 'Deluxe room',
        maxGuests: 2,
        basePrice: 1_000_000,
        status: 'ACTIVE',
      }]);
    }
    if (method === 'GET' && path === '/api/rooms') {
      return json(200, [{
        id: roomId,
        hotelId: 9,
        roomTypeId: 17,
        roomTypeCode: 'DLX',
        roomTypeNameVi: 'Phòng Deluxe',
        roomNumber: '1204',
        floor: 12,
        status: state.roomStatus,
        housekeepingStatus: state.roomStatus === 'DIRTY' ? 'DIRTY' : 'CLEAN',
        maintenanceStatus: 'NONE',
      }]);
    }
    if (method === 'GET' && path === '/api/rooms/paged') {
      return json(200, {
        items: [{
          id: roomId,
          hotelId: 9,
          roomTypeId: 17,
          roomTypeCode: 'DLX',
          roomTypeNameVi: 'Phòng Deluxe',
          roomNumber: '1204',
          floor: 12,
          status: state.roomStatus,
          housekeepingStatus: state.roomStatus === 'DIRTY' ? 'DIRTY' : 'CLEAN',
          maintenanceStatus: 'NONE',
        }],
        page: 1, pageSize: 15, totalItems: 1, totalPages: 1,
      });
    }

    if (method === 'GET' && path === '/api/invoices/finalized/my') {
      return json(200, state.reservationStatus === 'CHECKED_OUT' ? [invoiceSummary()] : []);
    }
    if (method === 'GET' && path === '/api/management/invoices/finalized') {
      return json(200, state.reservationStatus === 'CHECKED_OUT' ? [invoiceSummary()] : []);
    }
    if (method === 'GET' && path === `/api/invoices/${invoiceId}`) {
      return json(200, invoiceDetail(state));
    }
    if (method === 'GET' && path === `/api/invoices/${invoiceId}/pdf`) {
      return route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        headers: {
          'Content-Disposition': 'attachment; filename="INV-2026-0314.pdf"',
          'X-Content-SHA256': 'fixture-checksum',
        },
        body: '%PDF-1.4\nBreakfast buffet\nMineral water\n%%EOF',
      });
    }
    if (method === 'POST' && path === `/api/invoices/${invoiceId}/email`) {
      return json(200, {
        invoiceId,
        invoiceNumber: 'INV-2026-0314',
        recipient: 'customer@example.test',
        sent: true,
        contentSha256: 'fixture-checksum',
        correlationId: null,
      });
    }
    if (method === 'POST' && path === `/api/invoices/reservation/${reservationId}`) {
      state.legacyInvoiceMutations += 1;
      return json(409, { code: 'FINALIZED_INVOICE_REQUIRED' });
    }

    return json(404, { code: 'E2E_ROUTE_NOT_STUBBED', method, path });
  });
}

async function collectBalancePayment(page: Page, sequence: number): Promise<void> {
  const response = await page.evaluate(async ({ id, paymentSequence }) => {
    const attemptResponse = await fetch(`/api/reservations/${id}/payment-attempts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `stay-balance-${paymentSequence}`,
      },
      body: JSON.stringify({ purpose: 'BALANCE', method: 'MANUAL_TRANSFER' }),
    });
    const attempt = await attemptResponse.json() as { attemptId: string; expectedAmount: number };
    const confirmationResponse = await fetch(
      `/api/management/payment-attempts/${attempt.attemptId}/confirm-manual`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `stay-confirm-${paymentSequence}`,
        },
        body: JSON.stringify({
          reason: `Verified transfer ${paymentSequence}`,
          evidenceReference: `BANK-REF-${paymentSequence}`,
        }),
      },
    );
    return {
      amount: attempt.expectedAmount,
      attemptStatus: attemptResponse.status,
      confirmationStatus: confirmationResponse.status,
    };
  }, { id: reservationId, paymentSequence: sequence });

  expect(response.attemptStatus).toBe(201);
  expect(response.confirmationStatus).toBe(200);
  expect(response.amount).toBeGreaterThan(0);
}

async function addServerPricedService(page: Page): Promise<void> {
  const response = await page.evaluate(async id => {
    const result = await fetch(`/api/management/reservations/${id}/charges/services`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'stay-service-breakfast',
      },
      body: JSON.stringify({ serviceId: 81, chargeType: 'SERVICE', quantity: 1 }),
    });
    return result.status;
  }, reservationId);
  expect(response).toBe(201);
}

test.describe('Stay checkout and invoice journey', () => {
  test.describe.configure({ mode: 'serial', retries: 0, timeout: 90_000 });

  test('checks in, adds service, settles with multiple payments, checks out and exposes invoice/housekeeping evidence', async ({ page }) => {
    const state: JourneyState = {
      checkoutMutations: 0,
      checkInMutations: 0,
      confirmationMutations: 0,
      customerView: false,
      paidAmount: 300_000,
      paymentAttemptBodies: [],
      reservationStatus: 'CONFIRMED',
      roomStatus: 'RESERVED',
      serviceAdded: false,
      serviceMutations: 0,
      legacyInvoiceMutations: 0,
    };
    await seedAdminSession(page);
    await installJourneyApi(page, state);

    await page.goto('/admin/reservations', { waitUntil: 'domcontentloaded' });
    const reservationRow = page.locator(`[data-booking-id="${reservationId}"]`);
    await expect(reservationRow).toBeVisible();

    await reservationRow.locator('button:has(.pi-sign-in)').click();
    await expect.poll(() => state.checkInMutations).toBe(1);
    await expect(reservationRow.locator('button:has(.pi-sign-out)')).toBeVisible();

    await reservationRow.locator('button:has(.pi-sign-out)').click();
    const workspace = page.locator('app-reservation-checkout');
    await expect(workspace).toBeVisible();
    await expect(workspace.locator('.settlement-chip.outstanding')).toBeVisible();

    await addServerPricedService(page);
    await expect.poll(() => state.serviceMutations).toBe(1);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(reservationRow.locator('button:has(.pi-sign-out)')).toBeVisible();
    await reservationRow.locator('button:has(.pi-sign-out)').click();
    await expect(workspace).toBeVisible();
    const servicePreview = await page.evaluate(async id => {
      const response = await fetch(`/api/management/reservations/${id}/checkout-preview`, {
        method: 'POST',
      });
      return response.json() as Promise<{ folio: { lines: Array<{ name: string }> } }>;
    }, reservationId);
    expect(servicePreview.folio.lines.map(line => line.name)).toContain('Breakfast buffet');

    await collectBalancePayment(page, 1);
    await collectBalancePayment(page, 2);
    expect(state.paymentAttemptBodies).toEqual([
      { purpose: 'BALANCE', method: 'MANUAL_TRANSFER' },
      { purpose: 'BALANCE', method: 'MANUAL_TRANSFER' },
    ]);
    expect(state.confirmationMutations).toBe(2);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await reservationRow.locator('button:has(.pi-sign-out)').click();
    await expect(workspace).toBeVisible();
    await expect(workspace.locator('.settlement-chip.settled')).toBeVisible();
    await expect(workspace.locator('.folio-metrics')).toContainText('1.050.000');

    await workspace.locator('.checkout-action').click();
    await expect.poll(() => state.checkoutMutations).toBe(1);
    await expect(workspace).toBeHidden();
    await expect(reservationRow.locator('button:has(.pi-file-pdf)')).toBeVisible();
    await expect(page.getByText('INV-2026-0314')).toBeVisible();

    await page.goto('/admin/invoices', { waitUntil: 'domcontentloaded' });
    const finalizedRow = page.locator('tbody tr').filter({ hasText: 'INV-2026-0314' });
    await expect(finalizedRow).toContainText('Invoice Customer');
    await finalizedRow.getByRole('button', { name: /Xem và in|View & print/i }).click();
    const adminInvoice = page.locator('#invoice-print-area');
    await expect(adminInvoice).toContainText('Breakfast buffet');
    await expect(adminInvoice).toContainText('Deluxe room');
    await expect(adminInvoice).toContainText('MANUAL_TRANSFER');
    await page.getByRole('button', { name: /In hóa đơn|Print invoice/i }).click();
    await expect(page.locator('body')).toHaveAttribute('data-invoice-printed', 'true');
    expect(state.legacyInvoiceMutations).toBe(0);

    await page.goto('/admin/rooms', { waitUntil: 'domcontentloaded' });
    const roomRow = page.locator('tbody tr').filter({ hasText: '1204' });
    await expect(roomRow).toContainText('Chờ dọn');

    state.customerView = true;
    const customerPage = await page.context().newPage();
    await seedSession(customerPage, {
      fullName: 'Invoice Customer', permissions: [], roles: ['CUSTOMER'],
      token: 'stay-checkout-e2e-customer-token', userId: 501, username: 'invoice-customer',
    });
    await customerPage.addInitScript(() => {
      localStorage.setItem('luxestay.locale', 'vi');
      window.print = () => document.body.setAttribute('data-invoice-printed', 'true');
    });
    await installJourneyApi(customerPage, state);
    await customerPage.goto('/my-invoices', { waitUntil: 'domcontentloaded' });
    const invoiceCard = customerPage.locator('.invoice-card').filter({ hasText: 'INV-2026-0314' });
    await expect(invoiceCard).toBeVisible();
    await invoiceCard.click();
    await expect(customerPage.locator('.detail-panel')).toContainText('INV-2026-0314');
    await expect(customerPage.locator('.detail-panel')).toContainText('Breakfast buffet');
    await expect(customerPage.locator('.detail-panel')).toContainText('MANUAL_TRANSFER');
    await customerPage.getByRole('button', { name: /In hóa đơn|Print invoice/i }).click();
    await expect(customerPage.locator('body')).toHaveAttribute('data-invoice-printed', 'true');

    expect(state.reservationStatus).toBe('CHECKED_OUT');
    expect(state.roomStatus).toBe('DIRTY');
    expect(state.paidAmount).toBe(1_050_000);
  });
});

function grossAmount(state: JourneyState): number {
  return 1_000_000 + (state.serviceAdded ? 50_000 : 0);
}

function reservationSummary(state: JourneyState) {
  return {
    id: reservationId,
    userId: 501,
    username: 'invoice-customer',
    userFullName: 'Invoice Customer',
    checkInDate: stayCheckInDate,
    checkOutDate: stayCheckOutDate,
    guests: 2,
    totalAmount: grossAmount(state),
    status: state.reservationStatus,
    paymentMethod: 'MIXED',
    details: [{ id: 1, reservationId, roomId, roomNumber: '1204', priceAtBooking: 1_000_000 }],
    payment: {
      provider: 'MIXED',
      amount: state.paidAmount,
      currency: 'VND',
      status: 'SUCCEEDED',
      completedAt: '2026-08-01T09:20:00Z',
      reconciliationRequired: false,
    },
    refunds: [],
  };
}

function breakfastService() {
  return {
    id: 81,
    code: 'BREAKFAST',
    nameVi: 'Bữa sáng',
    nameEn: 'Breakfast buffet',
    price: 50_000,
    status: 'ACTIVE',
  };
}

function checkoutPreview(state: JourneyState) {
  const gross = grossAmount(state);
  const balance = gross - state.paidAmount;
  const settlementState = balance === 0 ? 'SETTLED' : balance > 0 ? 'OUTSTANDING' : 'OVERPAID';
  return {
    reservationId,
    hotelId: 9,
    settlementState,
    checkoutAllowed: settlementState === 'SETTLED',
    blockingError: settlementState === 'SETTLED'
      ? null
      : settlementState === 'OUTSTANDING' ? 'OUTSTANDING_BALANCE' : 'OVERPAYMENT_REQUIRES_RESOLUTION',
    sourceVersion: 8,
    calculatedAt: '2026-08-01T09:30:00Z',
    folio: {
      roomCharges: 1_000_000,
      serviceCharges: state.serviceAdded ? 50_000 : 0,
      surchargeCharges: 0,
      taxCharges: 0,
      feeCharges: 0,
      discounts: 0,
      grossCharges: gross,
      depositRequired: 300_000,
      successfulPayments: state.paidAmount,
      successfulRefunds: 0,
      otherCredits: 0,
      netSettled: state.paidAmount,
      balance,
      lines: [
        {
          sourceType: 'RESERVATION', sourceId: reservationId, category: 'ROOM', code: 'DLX',
          name: 'Deluxe room', description: null, quantity: 1, unitPrice: 1_000_000,
          taxAmount: 0, discountAmount: 0, snapshotAmount: 1_000_000, signedEffect: 1_000_000,
          usageStartedAt: '2026-07-31T14:00:00Z', usageEndedAt: '2026-08-01T09:00:00Z',
        },
        ...(state.serviceAdded ? [{
          sourceType: 'CHARGE', sourceId: 610, category: 'SERVICE', code: 'BREAKFAST',
          name: 'Breakfast buffet', description: null, quantity: 1, unitPrice: 50_000,
          taxAmount: 0, discountAmount: 0, snapshotAmount: 50_000, signedEffect: 50_000,
          usageStartedAt: '2026-08-01T08:00:00Z', usageEndedAt: null,
        }] : []),
      ],
      sourceVersion: 8,
      calculatedAt: '2026-08-01T09:30:00Z',
    },
  };
}

function checkoutResult(state: JourneyState) {
  return {
    reservationId,
    reservationStatus: 'CHECKED_OUT',
    invoiceId,
    invoiceNumber: 'INV-2026-0314',
    invoiceStatus: 'FINALIZED',
    totalAmount: grossAmount(state),
    dirtyRoomIds: [roomId],
    financialSummary: {
      grossCharges: grossAmount(state),
      depositRequired: 300_000,
      successfulPayments: state.paidAmount,
      successfulRefunds: 0,
      remainingBalance: 0,
      financialState: 'SETTLED',
      sourceVersion: 8,
      calculatedAt: '2026-08-01T09:30:00Z',
    },
  };
}

function invoiceSummary() {
  return {
    id: invoiceId,
    reservationId,
    invoiceNumber: 'INV-2026-0314',
    finalizedAt: '2026-08-01T09:31:00Z',
    totalAmount: 1_050_000,
    status: 'FINALIZED',
    currency: 'VND',
    customerSnapshotJson: '{"fullName":"Invoice Customer","email":"customer@example.test"}',
    propertySnapshotJson: '{"nameVi":"Khách sạn Fixture","nameEn":"Fixture Hotel"}',
  };
}

function invoiceDetail(state: JourneyState) {
  return {
    ...invoiceSummary(),
    currency: 'VND',
    subtotal: 1_050_000,
    taxAmount: 0,
    feeAmount: 0,
    discountAmount: 0,
    paidAmount: state.paidAmount,
    refundedAmount: 0,
    balanceAmount: 0,
    customerSnapshotJson: '{"name":"Invoice Customer"}',
    propertySnapshotJson: '{"name":"Fixture Hotel"}',
    lines: [
      {
        id: 1, lineType: 'ROOM', code: 'DLX', name: 'Deluxe room', description: null,
        quantity: 1, unitPrice: 1_000_000, taxAmount: 0, discountAmount: 0,
        totalAmount: 1_000_000, usageStartedAt: '2026-07-31T14:00:00Z', usageEndedAt: '2026-08-01T09:00:00Z',
      },
      {
        id: 2, lineType: 'SERVICE', code: 'BREAKFAST', name: 'Breakfast buffet', description: null,
        quantity: 1, unitPrice: 50_000, taxAmount: 0, discountAmount: 0,
        totalAmount: 50_000, usageStartedAt: '2026-08-01T08:00:00Z', usageEndedAt: null,
      },
    ],
    allocations: [
      { id: 1, transactionId: 1, transactionPublicId: 'deposit-314', allocatedAmount: 300_000, method: 'MOMO', provider: 'SIMULATOR', occurredAt: '2026-07-30T10:00:00Z' },
      { id: 2, transactionId: 2, transactionPublicId: 'balance-314-1', allocatedAmount: 400_000, method: 'MANUAL_TRANSFER', provider: 'SIMULATOR', occurredAt: '2026-08-01T09:10:00Z' },
      { id: 3, transactionId: 3, transactionPublicId: 'balance-314-2', allocatedAmount: 350_000, method: 'MANUAL_TRANSFER', provider: 'SIMULATOR', occurredAt: '2026-08-01T09:20:00Z' },
    ],
    creditNotes: [],
  };
}

function adminProfile() {
  return {
    id: 900,
    username: 'checkout-admin',
    email: 'admin@example.test',
    fullName: 'Checkout Administrator',
    roles: ['ADMIN'],
    permissions: [],
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00Z',
  };
}

function customerProfile() {
  return {
    id: 501,
    username: 'invoice-customer',
    email: 'customer@example.test',
    fullName: 'Invoice Customer',
    roles: ['CUSTOMER'],
    permissions: [],
    assignedProperties: [],
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00Z',
  };
}
