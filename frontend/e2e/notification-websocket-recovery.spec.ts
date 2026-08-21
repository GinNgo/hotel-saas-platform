import { expect, test, type Page, type Route } from '@playwright/test';

function testToken(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    exp: Math.floor(Date.now() / 1000) + 3600,
    sub: 'notification-admin',
  })}.test-signature`;
}

async function seedAdminSession(page: Page): Promise<void> {
  await page.addInitScript(({ token, user }) => {
    sessionStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  }, {
    token: testToken(),
    user: {
      fullName: 'Notification Admin',
      permissions: [{ actionMask: 1, function: 'REPORT' }],
      roles: ['SUPER_ADMIN'],
      username: 'notification-admin',
    },
  });
}

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ json: body, status: 200 });
}

test.describe('Admin notification WebSocket recovery', () => {
  test('announces offline state and exposes an explicit reconnect action', async ({ context, page }) => {
    await seedAdminSession(page);
    await page.route('**/ws/**', route => route.abort());
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/users/me') {
        await fulfillJson(route, {
          email: 'notification-admin@luxestay.test',
          fullName: 'Notification Admin',
          id: 1,
          roles: ['SUPER_ADMIN'],
          username: 'notification-admin',
        });
        return;
      }
      if (path === '/api/notifications') {
        await fulfillJson(route, {
          content: [],
          first: true,
          last: true,
          number: 0,
          retentionDays: 90,
          size: 20,
          totalElements: 0,
          totalPages: 0,
          unreadCount: 0,
        });
        return;
      }
      await fulfillJson(route, []);
    });

    await page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });
    const notificationButton = page.getByRole('button', { name: /Thông báo, 0 chưa đọc/ });
    await expect(notificationButton).toBeVisible();
    await notificationButton.click();

    await context.setOffline(true);
    const panel = page.locator('#notification-panel');
    const connectionStatus = panel.locator('.notification-connection-status');
    await expect(connectionStatus).toContainText('Mất kết nối mạng');
    await expect(connectionStatus).toHaveAttribute('role', 'alert');
    await expect(panel.getByRole('button', { name: 'Kết nối lại' })).toBeVisible();

    await panel.getByRole('button', { name: 'Kết nối lại' }).click();
    await expect(connectionStatus).toContainText('Kiểm tra kết nối rồi thử lại');
    await context.setOffline(false);
  });
});
