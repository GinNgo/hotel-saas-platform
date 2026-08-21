import { test, expect } from '@playwright/test';

const input = (page: any) => page.locator('app-hero-search app-location-autocomplete input');
const typeSearch = async (page: any, keyword: string) => {
  await input(page).click();
  await input(page).fill(keyword);
};

test.describe('LuxeStay Home Search', () => {
  test.describe.configure({ timeout: 60_000 });

  test.beforeEach(async ({ page }, testInfo) => {
    if (!testInfo.title.includes('capture verified')) {
      await page.route('**/api/public/properties/search**', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 8 })
      }));
    }
    await page.goto('/');
  });

  test('empty focus shows Recent Search and backend Popular Destinations', async ({ page }) => {
    await input(page).focus();
    await expect(page.getByText('Tìm kiếm gần đây')).toBeVisible();
    await expect(page.getByText('Tỉnh/Thành phố phổ biến')).toBeVisible();
    await expect(page.locator('.popular-item').first()).toBeVisible();
  });

  test('accented and unaccented ward searches return the same result type', async ({ page }) => {
    await typeSearch(page, 'my tho');
    await expect(page.locator('[data-suggestion-type="WARD"]').first()).toBeVisible();
    const plainText = await page.locator('[data-suggestion-type="WARD"]').first().innerText();

    await typeSearch(page, 'Mỹ Tho');
    await expect(page.locator('[data-suggestion-type="WARD"]').first()).toBeVisible();
    await expect(page.locator('[data-suggestion-type="WARD"]').first()).toContainText(plainText.split('\n')[0]);
  });

  test('property name and address are grouped as Property', async ({ page }) => {
    await typeSearch(page, 'Ocean Pearl');
    await expect(page.locator('[data-suggestion-type="PROPERTY"]').first()).toBeVisible();
    await expect(page.locator('.result-group h3').filter({ hasText: 'Cơ sở lưu trú' })).toBeVisible();

    await typeSearch(page, '21 duong vuon xanh');
    await expect(page.locator('[data-suggestion-type="PROPERTY"]').first()).toBeVisible();
  });

  test('Province and Ward selection set the correct search query', async ({ page }) => {
    await typeSearch(page, 'gia lai');
    await page.locator('[data-suggestion-type="PROVINCE"]').first().click();
    await page.getByRole('button', { name: 'TÌM' }).first().click();
    await expect(page).toHaveURL(/provinceId=/);
    await expect(page).not.toHaveURL(/wardId=/);

    await page.goto('/');
    await typeSearch(page, 'phuc xa');
    await page.locator('[data-suggestion-type="WARD"]').first().click();
    await page.getByRole('button', { name: 'TÌM' }).first().click();
    await expect(page).toHaveURL(/provinceId=.*wardId=/);
  });

  test('Property selection opens details and preserves booking parameters', async ({ page }) => {
    await typeSearch(page, 'Ocean Pearl');
    await page.locator('[data-suggestion-type="PROPERTY"]').first().click();
    await expect(page).toHaveURL(/\/hotel\/\d+/);
    await expect(page).toHaveURL(/checkInDate=/);
    await expect(page).toHaveURL(/adultCount=/);
    await expect(page).toHaveURL(/roomCount=/);
  });

  test('keyboard selection and Escape work', async ({ page }) => {
    await typeSearch(page, 'my tho');
    await expect(page.locator('[data-suggestion-type="WARD"]').first()).toBeVisible();
    await input(page).press('ArrowDown');
    await expect(page.locator('.suggestion-item.active')).toBeVisible();
    await input(page).press('Escape');
    await expect(page.locator('.location-popup')).toBeHidden();
  });

  test('outside click closes popup and no result has a useful empty state', async ({ page }) => {
    await typeSearch(page, 'zzzz-no-result-12345');
    await expect(page.getByText('Không tìm thấy địa điểm hoặc cơ sở phù hợp.')).toBeVisible();
    await page.locator('h1').click();
    await expect(page.locator('.location-popup')).toBeHidden();
  });

  test('API error offers retry', async ({ page }) => {
    await page.route('**/api/public/search/suggestions**', route => route.abort());
    await typeSearch(page, 'my tho');
    await expect(page.getByText('Không thể tải gợi ý.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Thử lại' })).toBeVisible();
  });

  test('mobile popup stays inside viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await input(page).focus();
    const box = await page.locator('.location-popup').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.width).toBeLessThanOrEqual(390);
    expect(box!.height).toBeLessThanOrEqual(844);
  });

  test('capture verified desktop and mobile states', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await typeSearch(page, 'my tho');
    await expect(page.locator('[data-suggestion-type="WARD"]').first()).toBeVisible();
    await page.screenshot({ path: '../docs/screenshots/home-search-after-desktop.png', fullPage: false });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await input(page).click();
    await expect(page.getByText('Tỉnh/Thành phố phổ biến')).toBeVisible();
    await expect(page.locator('.popular-item').first()).toBeVisible();
    await page.screenshot({ path: '../docs/screenshots/home-search-after-mobile.png', fullPage: false });
  });
});
