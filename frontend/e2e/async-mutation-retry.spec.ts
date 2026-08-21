import { expect, test } from '@playwright/test';

const bookingUrl = '/booking/1?checkIn=2026-08-10&checkOut=2026-08-12&adultCount=2&childCount=0&quantity=1&hotelId=10&roomTypeName=Deluxe&nightlyPrice=500000&estimatedTotal=1000000';

test.describe('duplicate-safe booking mutation', () => {
  test('reuses one idempotency key after a retryable timeout/failure', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'e2e-customer-token');
      localStorage.setItem('user', JSON.stringify({
        username: 'customer.demo@example.com',
        fullName: 'Customer Demo',
        roles: ['CUSTOMER'],
      }));
    });
    await page.route('**/api/users/me', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 91,
        username: 'customer.demo@example.com',
        email: 'customer.demo@example.com',
        fullName: 'Customer Demo',
        roles: [{ code: 'CUSTOMER' }],
      }),
    }));

    const requests: string[] = [];
    let attempt = 0;
    await page.route('**/api/reservations/book', async route => {
      attempt += 1;
      requests.push(route.request().headers()['idempotency-key'] || '');
      if (attempt === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 503,
            code: 'PROVIDER_UNAVAILABLE',
            message: 'Retry safely.',
            retryable: true,
          }),
        });
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 77, status: 'PENDING_PAYMENT' }),
      });
    });

    await page.goto(bookingUrl);
    await page.locator('#booking-last-name').fill('Nguyen');
    await page.locator('#booking-first-name').fill('An');
    await page.locator('#booking-phone').fill('0900000000');

    const submit = page.locator('form button[type="submit"]');
    await submit.click();
    await expect(page.locator('[role="alert"]').first()).toBeVisible();
    await submit.click();

    await expect(page.locator('text=#77')).toBeVisible();
    expect(attempt).toBe(2);
    expect(requests[0]).toBeTruthy();
    expect(requests[1]).toBe(requests[0]);
  });

  test('keeps the booking key across a reload after an unknown outcome', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'e2e-customer-token');
      localStorage.setItem('user', JSON.stringify({
        username: 'customer.demo@example.com',
        fullName: 'Customer Demo',
        roles: ['CUSTOMER'],
      }));
    });
    await page.route('**/api/users/me', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 91,
        username: 'customer.demo@example.com',
        email: 'customer.demo@example.com',
        fullName: 'Customer Demo',
        roles: [{ code: 'CUSTOMER' }],
      }),
    }));

    const requests: string[] = [];
    let firstAttempt = true;
    await page.route('**/api/reservations/book', async route => {
      const key = route.request().headers()['idempotency-key'] || '';
      requests.push(key);
      if (firstAttempt) {
        firstAttempt = false;
        await route.abort('timedout');
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 88, status: 'PENDING_PAYMENT' }),
      });
    });

    await page.goto(bookingUrl);
    await page.locator('#booking-last-name').fill('Nguyen');
    await page.locator('#booking-first-name').fill('An');
    await page.locator('#booking-phone').fill('0900000000');
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator('[role="alert"]').first()).toBeVisible();

    await page.reload();
    await page.locator('#booking-last-name').fill('Nguyen');
    await page.locator('#booking-first-name').fill('An');
    await page.locator('#booking-phone').fill('0900000000');
    await page.locator('form button[type="submit"]').click();

    await expect(page.locator('text=#88')).toBeVisible();
    expect(requests).toHaveLength(2);
    expect(requests[0]).toBeTruthy();
    expect(requests[1]).toBe(requests[0]);
  });
});
