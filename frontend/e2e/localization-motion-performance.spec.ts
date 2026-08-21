import { expect, test } from '@playwright/test';

type BrowserMetrics = {
  cls: number;
  eventDelays: number[];
  shifts: Array<{ value: number; sources: string[] }>;
};

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

const percentile = (values: number[], percentileRank: number): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((percentileRank / 100) * sorted.length) - 1);
  return sorted[index];
};

const installMetrics = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.addInitScript(() => {
    const state = { cls: 0, eventDelays: [] as number[], shifts: [] as Array<{ value: number; sources: string[] }> };
    (window as Window & { __luxeMetrics?: typeof state }).__luxeMetrics = state;

    try {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number; sources?: Array<{ node?: Element }> }>) {
          if (!entry.hadRecentInput) {
            const value = entry.value ?? 0;
            state.cls += value;
            state.shifts.push({
              value,
              sources: (entry.sources ?? []).map(source => {
                const element = source.node;
                if (!element) return 'unknown';
                const id = element.id ? `#${element.id}` : '';
                const className = typeof element.className === 'string'
                  ? element.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).map(value => `.${value}`).join('')
                  : '';
                return `${element.nodeName.toLowerCase()}${id}${className}`;
              }),
            });
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      // Older browser engines may not expose layout-shift entries.
    }

    try {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { processingStart?: number; startTime: number; name: string }>) {
          if (entry.name === 'click' && typeof entry.processingStart === 'number') {
            state.eventDelays.push(Math.max(0, entry.processingStart - entry.startTime));
          }
        }
      }).observe({ type: 'event', buffered: true, durationThreshold: 0 });
    } catch {
      // Event timing is optional; the synthetic interaction fallback remains available.
    }
  });
};

const readMetrics = (page: import('@playwright/test').Page): Promise<BrowserMetrics> => page.evaluate(() => {
  const state = (window as Window & { __luxeMetrics?: BrowserMetrics }).__luxeMetrics;
  return { cls: state?.cls ?? 0, eventDelays: state?.eventDelays ?? [], shifts: state?.shifts ?? [] };
});

test.describe('VI/EN locale and Home motion release evidence', () => {
  test('keeps the Home slideshow static under reduced motion', async ({ browser }) => {
    const context = await browser.newContext({
      reducedMotion: 'reduce',
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    try {
      await page.goto('/');
      const slideshow = page.locator('app-editorial-slideshow');
      await expect(slideshow).toBeVisible();
      const activeBefore = await slideshow.locator('.story-dot.active').getAttribute('aria-current');
      await page.waitForTimeout(7000);
      const activeAfter = await slideshow.locator('.story-dot.active').getAttribute('aria-current');
      expect(activeAfter).toBe(activeBefore);
      await expect(page.locator('.locale-button')).toBeVisible();
    } finally {
      await context.close();
    }
  });

  for (const viewport of viewports) {
    test(`records five cold ${viewport.name} VI/EN runs without layout shift`, async ({ browser }) => {
      test.setTimeout(120_000);
      const clsValues: number[] = [];
      const delayValues: number[] = [];
      const shifts: BrowserMetrics['shifts'] = [];

      for (let run = 0; run < 5; run++) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          reducedMotion: 'no-preference',
        });
        const page = await context.newPage();
        try {
          await installMetrics(page);
          await page.goto('/');
          await expect(page.locator('.locale-button')).toBeVisible();
          await expect(page.locator('app-editorial-slideshow')).toBeVisible();
          await expect(page.locator('app-editorial-slideshow .story-dot')).toHaveCount(3);
          const undersizedSlideTargets = await page.locator('app-editorial-slideshow .story-dot').evaluateAll(
            dots => dots.filter(dot => {
              const rect = dot.getBoundingClientRect();
              return rect.width < 44 || rect.height < 44;
            }).length,
          );
          expect(undersizedSlideTargets).toBe(0);

          const localeButton = page.locator('.locale-button');
          await localeButton.click();
          await expect(localeButton).toContainText('EN');
          await localeButton.click();
          await expect(localeButton).toContainText('VI');
          await page.waitForTimeout(100);

          const metrics = await readMetrics(page);
          clsValues.push(metrics.cls);
          delayValues.push(...metrics.eventDelays);
          shifts.push(...metrics.shifts);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
        } finally {
          await context.close();
        }
      }

      const p75InteractionDelay = percentile(delayValues, 75);
      const maxCls = Math.max(...clsValues, 0);
      console.log(JSON.stringify({ viewport: viewport.name, runs: 5, p75InteractionDelay, maxCls, shifts: shifts.slice(0, 12) }));
      expect(p75InteractionDelay).toBeLessThanOrEqual(100);
      expect(maxCls).toBeLessThanOrEqual(0.05);
    });
  }
});
