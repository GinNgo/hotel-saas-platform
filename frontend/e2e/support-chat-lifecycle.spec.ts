import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';

const webUrl = process.env.LUXESTAY_E2E_WEB_URL || 'http://localhost:4200';
const customerUsername = process.env.LUXESTAY_E2E_CUSTOMER_USERNAME;
const customerPassword = process.env.LUXESTAY_E2E_CUSTOMER_PASSWORD;
const adminUsername = process.env.LUXESTAY_E2E_ADMIN_USERNAME;
const adminPassword = process.env.LUXESTAY_E2E_ADMIN_PASSWORD;

async function login(page: Page, username: string, password: string): Promise<void> {
  await page.goto(`${webUrl}/login`);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập arrow_forward' }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
}

async function openCustomerChat(page: Page): Promise<void> {
  await page.goto(`${webUrl}/`);
  await page.getByRole('button', { name: 'Mở hỗ trợ trực tuyến LuxeStay' }).click();
  await expect(page.locator('#support-chat-panel')).toContainText('Đã kết nối');
}

test.describe('Authenticated customer and support chat lifecycle', () => {
  test.skip(
    !customerUsername || !customerPassword || !adminUsername || !adminPassword,
    'Set customer/admin E2E credentials before running support chat browser evidence.',
  );

  test('loads history, sends, replies, reconnects and recovers after offline mode', async ({ browser }) => {
    const customerContext: BrowserContext = await browser.newContext();
    const adminContext: BrowserContext = await browser.newContext();
    const recoveryContext: BrowserContext = await browser.newContext();
    const customerPage = await customerContext.newPage();
    const adminPage = await adminContext.newPage();
    const recoveryPage = await recoveryContext.newPage();
    const suffix = Date.now();
    const customerMessage = `T055 customer ${suffix}`;
    const supportReply = `T055 support ${suffix}`;

    try {
      await login(customerPage, customerUsername!, customerPassword!);
      await openCustomerChat(customerPage);

      await customerPage.locator('#support-message').fill(customerMessage);
      await customerPage.getByRole('button', { name: 'Gửi tin nhắn hỗ trợ' }).click();
      await expect(customerPage.locator('.message-bubble p', { hasText: customerMessage })).toHaveCount(1);

      await login(adminPage, adminUsername!, adminPassword!);
      await adminPage.goto(`${webUrl}/admin/chat`);
      const conversation = adminPage.locator('.conversation-item', { hasText: customerMessage });
      await expect(conversation).toHaveCount(1);
      await conversation.click();
      await expect(adminPage.locator('.message-bubble p', { hasText: customerMessage })).toHaveCount(1);

      await adminPage.locator('#support-dashboard-message').fill(supportReply);
      await adminPage.getByRole('button', { name: 'Gửi phản hồi' }).click();
      await expect(adminPage.locator('.message-bubble p', { hasText: supportReply })).toHaveCount(1);
      await expect(customerPage.locator('.message-bubble p', { hasText: supportReply })).toHaveCount(1);

      await customerPage.reload();
      await customerPage.getByRole('button', { name: 'Mở hỗ trợ trực tuyến LuxeStay' }).click();
      await expect(customerPage.locator('.message-bubble p', { hasText: customerMessage })).toHaveCount(1);
      await expect(customerPage.locator('.message-bubble p', { hasText: supportReply })).toHaveCount(1);

      const blockChatTransport = (route: Route) => route.abort();
      await recoveryContext.route('**/ws-chat/**', blockChatTransport);
      await login(recoveryPage, customerUsername!, customerPassword!);
      await recoveryPage.getByRole('button', { name: 'Mở hỗ trợ trực tuyến LuxeStay' }).click();
      await expect(recoveryPage.locator('#support-chat-panel')).toContainText('Kết nối lại', { timeout: 15_000 });

      await recoveryContext.unroute('**/ws-chat/**', blockChatTransport);
      await expect(recoveryPage.locator('#support-chat-panel')).toContainText('Đã kết nối', { timeout: 15_000 });
    } finally {
      await recoveryContext.close();
      await adminContext.close();
      await customerContext.close();
    }
  });
});
