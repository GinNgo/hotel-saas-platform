import { expect, test } from '@playwright/test';
import { attachJson, firstTabStop, horizontalOverflow } from './helpers/ui-audit';

const viewports = [
  { height: 812, name: 'mobile', width: 375 },
  { height: 1024, name: 'tablet', width: 768 },
  { height: 768, name: 'laptop', width: 1024 },
  { height: 900, name: 'desktop', width: 1440 },
] as const;

test.describe('Responsive and accessibility audit', () => {
  test.describe.configure({ retries: 0 });

  for (const viewport of viewports) {
    test(`home has no page overflow and exposes a visible first tab stop at ${viewport.name}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ height: viewport.height, width: viewport.width });
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'LuxeStay', exact: true })).toBeVisible();
      const audit = {
        firstTabStop: await firstTabStop(page),
        overflow: await horizontalOverflow(page),
        viewport,
      };
      await attachJson(testInfo, `home-${viewport.name}-audit`, audit);
      expect(audit.overflow, `Home has horizontal overflow at ${viewport.width}px`).toBe(false);
      expect(audit.firstTabStop.inViewport, `First tab stop is not visible at ${viewport.width}px`).toBe(true);
      expect(audit.firstTabStop.tag).not.toBe('body');
    });

    test(`login form remains operable and focused at ${viewport.name}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ height: viewport.height, width: viewport.width });
      await page.goto('/login', { waitUntil: 'domcontentloaded' });
      const username = page.locator('#username');
      await username.focus();
      const audit = {
        focusedId: await page.evaluate(() => (document.activeElement as HTMLElement | null)?.id || ''),
        overflow: await horizontalOverflow(page),
        viewport,
      };
      await attachJson(testInfo, `login-${viewport.name}-audit`, audit);
      expect(audit.overflow, `Login has horizontal overflow at ${viewport.width}px`).toBe(false);
      expect(audit.focusedId).toBe('username');
    });
  }
});
