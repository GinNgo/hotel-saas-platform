import { expect, test } from '@playwright/test';

test.describe('credential login and logout', () => {
  test('accepts a username, creates a browser session, and clears it on logout', async ({ page }) => {
    const accessToken = browserToken(Date.now() + 60_000);
    await page.route('**/api/**', route => route.fulfill({ status: 200, json: [] }));
    await page.route('**/api/users/me', route => route.fulfill({
      status: 200,
      json: {
        id: 215,
        username: 'fixture-customer',
        email: 'fixture-customer@example.com',
        fullName: 'Fixture Customer',
        roles: ['CUSTOMER'],
        points: 120,
      },
    }));
    await page.route('**/api/auth/login', async route => {
      const payload = route.request().postDataJSON() as { password: string; username: string };
      expect(payload).toEqual(expect.objectContaining({
        password: 'Password@123',
        username: 'fixture-customer',
      }));
      await route.fulfill({
        status: 200,
        json: {
          accessToken,
          userId: 215,
          username: 'fixture-customer',
          roles: ['CUSTOMER'],
          permissions: [],
        },
      });
    });

    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#username')).toHaveAttribute('type', 'text');

    await page.locator('#username').fill('fixture-customer');
    await page.locator('#password').fill('Password@123');
    await page.locator('form button[type="submit"]').click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('.account-trigger')).toBeVisible();
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('token')))
      .toBe(accessToken);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('token'))).toBeNull();

    await page.locator('.account-trigger').click();
    await page.locator('.logout-item').click();

    await expect(page.locator('.login-button')).toBeVisible();
    await expect.poll(() => page.evaluate(() => ({
      token: localStorage.getItem('token'),
      sessionToken: sessionStorage.getItem('token'),
      user: localStorage.getItem('user'),
    }))).toEqual({ token: null, sessionToken: null, user: null });
  });
});

function browserToken(expiresAt: number): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ exp: Math.floor(expiresAt / 1_000), sub: 'fixture-customer' })}.test-signature`;
}
