import { expect, test } from '@playwright/test';

test('an expired browser session cannot enter a protected customer route', async ({ page }) => {
  const expiredToken = browserToken(Date.now() - 60_000);
  await page.addInitScript(({ token }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify({
      username: 'expired-customer',
      roles: ['CUSTOMER'],
      permissions: [],
    }));
  }, { token: expiredToken });

  await page.goto('/profile', { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveURL(/\/login\?returnUrl=%2Fprofile/);
  await expect.poll(() => page.evaluate(() => ({
    localToken: localStorage.getItem('token'),
    sessionToken: sessionStorage.getItem('token'),
    user: localStorage.getItem('user'),
  }))).toEqual({ localToken: null, sessionToken: null, user: null });
});

function browserToken(expiresAt: number): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ exp: Math.floor(expiresAt / 1_000) })}.test-signature`;
}
