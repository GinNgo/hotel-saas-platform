import { expect, test } from '@playwright/test';

const token = 'eyJhbGciOiJub25lIn0.eyJleHAiOjQwMDAwMDAwMDB9.customer-invoice-smoke';

test('customer invoice list and finalized detail remain usable on mobile', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'eyJhbGciOiJub25lIn0.eyJleHAiOjQwMDAwMDAwMDB9.customer-invoice-smoke');
    localStorage.setItem('user', JSON.stringify({ id: 701, username: 'invoice-customer', roles: ['CUSTOMER'], permissions: [] }));
    window.print = () => document.body.setAttribute('data-invoice-printed', 'true');
  });
  await page.route('**/api/users/me', route => route.fulfill({ json: {
    id: 701, username: 'invoice-customer', fullName: 'Invoice Customer', email: 'invoice@example.com', roles: ['CUSTOMER'],
  } }));
  await page.route('**/api/invoices/finalized/my', route => route.fulfill({ json: [{
    id: 420, reservationId: 7004, invoiceNumber: 'INV-MOBILE-420', invoiceCode: 'INV-MOBILE-420',
    status: 'FINALIZED', currency: 'VND', finalizedAt: '2026-09-03T10:30:00Z', totalAmount: 2_400_000,
    issueDate: '2026-09-03T10:30:00Z', customerSnapshotJson: '{"fullName":"Invoice Customer"}',
    propertySnapshotJson: '{"nameVi":"Luxe Bay"}',
  }] }));
  await page.route('**/api/invoices/420', route => route.fulfill({ json: {
    id: 420, reservationId: 7004, invoiceNumber: 'INV-MOBILE-420', invoiceCode: 'INV-MOBILE-420',
    status: 'FINALIZED', currency: 'VND', finalizedAt: '2026-09-03T10:30:00Z', issueDate: '2026-09-03T10:30:00Z',
    totalAmount: 2_400_000, subtotal: 2_200_000, taxAmount: 200_000, feeAmount: 0, discountAmount: 0,
    paidAmount: 2_400_000, refundedAmount: 0, balanceAmount: 0,
    customerSnapshotJson: '{"fullName":"Invoice Customer","email":"invoice@example.com"}',
    propertySnapshotJson: '{"nameVi":"Luxe Bay","address":"Đà Nẵng"}',
    lines: [{ id: 1, lineType: 'ROOM', code: 'ROOM', name: 'Deluxe room', description: null, quantity: 2, unitPrice: 1_100_000, taxAmount: 0, discountAmount: 0, totalAmount: 2_200_000 }],
    allocations: [{ id: 1, transactionId: 2, transactionPublicId: 'txn-420', allocatedAmount: 2_400_000, method: 'VNPAY', provider: 'VNPAY', occurredAt: '2026-09-03T09:00:00Z' }],
    creditNotes: [],
  } }));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/my-invoices');

  const invoiceCard = page.locator('.invoice-card');
  await expect(invoiceCard).toBeVisible({ timeout: 15000 });
  await expect(invoiceCard).toContainText('INV-MOBILE-420');
  await invoiceCard.click();

  const detail = page.locator('#customer-invoice-print-area');
  await expect(detail).toHaveAttribute('role', 'region');
  await expect(detail).toContainText('Deluxe room');
  await expect(detail).toContainText('Luxe Bay');
  await expect(detail.getByRole('button', { name: /In hóa đơn|Print invoice/i })).toBeVisible();
  await detail.getByRole('button', { name: /In hóa đơn|Print invoice/i }).click();
  await expect(page.locator('body')).toHaveAttribute('data-invoice-printed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
