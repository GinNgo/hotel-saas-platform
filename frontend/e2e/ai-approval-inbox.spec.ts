import { expect, test } from '@playwright/test';
import { seedSession, syntheticOwnerSession } from './helpers/audit-fixtures';

test('AI approval inbox filters AI tasks and keeps property scope', async ({ page }) => {
  const session = syntheticOwnerSession();
  session.permissions = [...session.permissions, { function: 'OPERATIONAL_TASK', actionMask: 71 }];
  const propertyId = '11111111-1111-4111-8111-111111111111';
  await page.route('**/api/auth/my-menu', route => route.fulfill({ json: [] }));
  await page.route('**/api/v1/hotels**', route => route.fulfill({ json: [{ id: propertyId, nameVi: 'LuxeStay' }] }));
  await page.route('**/api/management/properties**', route => route.fulfill({ json: [{ id: propertyId, code: 'LUXE', nameVi: 'LuxeStay', propertyType: 'HOTEL', address: 'Hanoi', approvalStatus: 'APPROVED', operationStatus: 'ACTIVE', operational: true, isDemo: true }] }));
  await page.route('**/api/management/context**', route => route.fulfill({ json: { activePropertyId: propertyId, properties: [{ id: propertyId, nameVi: 'LuxeStay' }], activePropertyOperational: true, planCode: 'PRO', subscriptionStatus: 'ACTIVE', lifetime: false, limits: {}, usage: {}, upgradeRequired: false } }));
  await page.route(/\/api\/management\/tasks\/assignees(?:\?|$)/, route => route.fulfill({ json: [] }));
  await page.route(/\/api\/management\/tasks(?:\?|$)/, route => route.fulfill({ json: [
    { id: 'ai-1', publicId: 'AI-ABC', hotelId: propertyId, taskType: 'AI_TOOL', toolName: 'reservation.checkin', functionCode: 'reservation.execute', requiredAction: 1, aggregateType: 'Reservation', aggregateId: 'reservation-1', status: 'OPEN', version: 1 },
  ] }));
  await seedSession(page, session);
  await page.goto(`/management/ai-tasks?propertyId=${propertyId}`);
  await expect(page.getByRole('heading', { name: 'Hàng đợi vận hành' })).toBeVisible();
  await expect(page.getByText('AI · reservation.checkin')).toBeVisible();
  await expect(page.getByText('AI approval inbox')).toBeVisible();
  await expect(page.getByText('AI-ABC')).toBeVisible();
});
