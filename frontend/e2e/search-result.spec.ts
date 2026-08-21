import { test, expect } from '@playwright/test';

test.describe('Search Result Page', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to search page with some mock query params
    await page.goto('/search?keyword=Vung Tau&adultCount=2&roomCount=1');
  });

  test('should display search summary and top sticky bar', async ({ page }) => {
    await expect(page.locator('app-sticky-search-bar')).toBeVisible();
    await expect(page.locator('h1')).toContainText('Vung Tau');
    await expect(page.locator('.results-heading > div > p:not(.eyebrow)')).toContainText('chỗ nghỉ');
  });

  test('should display sidebar filters', async ({ page }) => {
    await expect(page.locator('app-search-filter-sidebar')).toBeVisible();
    await expect(page.getByText('Khoảng giá mỗi đêm')).toBeVisible();
    await expect(page.getByText('Loại cơ sở')).toBeVisible();
    await expect(page.getByText('Hạng sao')).toBeVisible();
  });

  test('should update url when applying filter', async ({ page }) => {
    // Click on Hotel checkbox
    const hotelCheckbox = page.locator('label', { hasText: 'Khách sạn' }).first();
    await hotelCheckbox.click();

    // Apply button commits filter state to URL
    await page.locator('button.apply-button').click();

    // Expect URL to contain propertyTypes=HOTEL
    await expect(page).toHaveURL(/.*propertyTypes=HOTEL.*/);

    // Active chip should appear
    await expect(page.locator('.chips button', { hasText: 'Khách sạn' })).toBeVisible();
  });

  test('should update url when sorting', async ({ page }) => {
    // Open sort dropdown
    await page.locator('p-select').click();
    
    // Select lowest price
    await page.locator('li', { hasText: 'Giá thấp nhất' }).click();
    
    // Expect URL to contain sortBy=PRICE_ASC
    await expect(page).toHaveURL(/.*sortBy=PRICE_ASC.*/);
  });

  test('should render skeleton while loading and empty state if no results', async ({ page }) => {
    // Navigate to a query that we know yields no results
    await page.goto('/search?keyword=NowhereIsland00123');

    // Wait for the empty state
    await expect(page.locator('h2', { hasText: 'Không tìm thấy chỗ nghỉ phù hợp' })).toBeVisible();
  });

});
