import { expect, Page, test } from '@playwright/test';

interface Credentials {
  username: string;
  password: string;
}

interface PageAudit {
  cls: number;
  domContentLoadedMs: number;
  focus: { tag: string; inViewport: boolean };
  missingKeys: string[];
  overflow: boolean;
  sponsoredMarkers: number;
  shifts: Array<{
    value: number;
    sources: Array<{
      current: { height: number; width: number; x: number; y: number } | null;
      element: string;
      previous: { height: number; width: number; x: number; y: number } | null;
    }>;
  }>;
}

const apiUrl = (process.env.LUXESTAY_E2E_API_URL || '').replace(/\/$/, '');
const viewports = [
  { name: 'mobile', width: 375, height: 812, locale: 'vi' },
  { name: 'tablet', width: 768, height: 1024, locale: 'en' },
  { name: 'laptop', width: 1024, height: 768, locale: 'vi' },
  { name: 'desktop', width: 1440, height: 900, locale: 'en' },
] as const;

function credentials(prefix: 'CUSTOMER' | 'ADMIN' | 'OWNER'): Credentials | null {
  const username = process.env[`LUXESTAY_E2E_${prefix}_USERNAME`];
  const password = process.env[`LUXESTAY_E2E_${prefix}_PASSWORD`];
  return username && password ? { username, password } : null;
}

function collectRuntimeErrors(page: Page, runtimeErrors: string[]): void {
  page.on('pageerror', error => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() !== 'error' || message.text().includes('favicon')) return;
    const location = message.location();
    const source = location.url ? ` (${location.url}:${location.lineNumber ?? 0})` : '';
    runtimeErrors.push(`console: ${message.text()}${source}`);
  });
  page.on('response', response => {
    if (response.status() >= 400 && !response.url().includes('favicon')) {
      runtimeErrors.push(`http ${response.status()}: ${response.url()}`);
    }
  });
}

async function routeToE2eBackend(page: Page): Promise<void> {
  if (!apiUrl) return;
  const apiBaseUrl = apiUrl.endsWith('/api') ? apiUrl : `${apiUrl}/api`;
  const apiOrigin = new URL(apiBaseUrl).origin;
  await page.addInitScript(({ sourceOrigin, targetOrigin }) => {
    const NativeWebSocket = window.WebSocket;
    const sourceWebSocketOrigin = sourceOrigin.replace(/^http/, 'ws');
    const targetWebSocketOrigin = targetOrigin.replace(/^http/, 'ws');

    window.WebSocket = class RoutedWebSocket extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        const requestedUrl = url.toString();
        const routedUrl = requestedUrl.startsWith(sourceWebSocketOrigin)
          ? requestedUrl.replace(sourceWebSocketOrigin, targetWebSocketOrigin)
          : requestedUrl;
        if (protocols === undefined) super(routedUrl);
        else super(routedUrl, protocols);
      }
    };
  }, { sourceOrigin: 'http://localhost:8080', targetOrigin: apiOrigin });
  await page.route('**/api/**', route => {
    const requestUrl = route.request().url();
    return requestUrl.startsWith('http://localhost:8080/api')
      ? route.continue({ url: requestUrl.replace('http://localhost:8080/api', apiBaseUrl) })
      : route.continue();
  });
  for (const endpoint of ['ws', 'ws-chat']) {
    await page.route(`**/${endpoint}/**`, route => {
      const requestUrl = route.request().url();
      return requestUrl.startsWith(`http://localhost:8080/${endpoint}`)
        ? route.continue({ url: requestUrl.replace('http://localhost:8080', apiOrigin) })
        : route.continue();
    });
  }
}

async function installAuditProbe(page: Page, locale: 'vi' | 'en'): Promise<void> {
  await page.addInitScript(selectedLocale => {
    localStorage.setItem('luxestay.locale', selectedLocale);
    type RectSnapshot = { height: number; width: number; x: number; y: number };
    type ShiftSource = {
      current: RectSnapshot | null;
      element: string;
      previous: RectSnapshot | null;
    };
    const state = { cls: 0, shifts: [] as Array<{ value: number; sources: ShiftSource[] }> };
    (window as Window & { __releaseAudit?: typeof state }).__releaseAudit = state;
    try {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & {
          hadRecentInput?: boolean;
          value?: number;
          sources?: Array<{ currentRect?: DOMRectReadOnly; node?: Element; previousRect?: DOMRectReadOnly }>;
        }>) {
          if (!entry.hadRecentInput) {
            const value = entry.value ?? 0;
            state.cls += value;
            state.shifts.push({
              value,
              sources: (entry.sources ?? []).map(source => {
                const element = source.node;
                const snapshot = (rect?: DOMRectReadOnly): RectSnapshot | null => rect ? {
                  height: Math.round(rect.height),
                  width: Math.round(rect.width),
                  x: Math.round(rect.x),
                  y: Math.round(rect.y),
                } : null;
                if (!element) return { current: snapshot(source.currentRect), element: 'unknown', previous: snapshot(source.previousRect) };
                const id = element.id ? `#${element.id}` : '';
                const className = typeof element.className === 'string'
                  ? element.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).map(name => `.${name}`).join('')
                  : '';
                return {
                  current: snapshot(source.currentRect),
                  element: `${element.nodeName.toLowerCase()}${id}${className}`,
                  previous: snapshot(source.previousRect),
                };
              }),
            });
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      // Layout-shift entries are optional in older engines.
    }
  }, locale);
}

async function auditVisiblePage(page: Page, selector: string, runtimeErrors: string[]): Promise<PageAudit> {
  await page.locator(selector).waitFor({ state: 'visible', timeout: 20_000 });
  await page.evaluate(async () => {
    if ('fonts' in document) await document.fonts.ready;
  });
  await page.waitForTimeout(250);
  await page.keyboard.press('Tab');
  const audit = await page.evaluate(() => {
    const documentWidth = document.documentElement.scrollWidth;
    const viewportWidth = document.documentElement.clientWidth;
    const active = document.activeElement as HTMLElement | null;
    const rect = active?.getBoundingClientRect();
    const text = document.body.innerText;
    const missingKeys = [...new Set(text.match(/\b(?:PUBLIC|AUTH|ADMIN|MANAGEMENT)\.[A-Z0-9_.]+\b/g) ?? [])].slice(0, 20);
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const state = (window as Window & { __releaseAudit?: Pick<PageAudit, 'cls' | 'shifts'> }).__releaseAudit;
    return {
      cls: state?.cls ?? 0,
      domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? 0,
      focus: {
        tag: active?.tagName.toLowerCase() ?? '',
        inViewport: Boolean(rect && rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.right >= 0 && rect.top <= innerHeight && rect.left <= innerWidth),
      },
      missingKeys,
      overflow: documentWidth > viewportWidth + 1,
      sponsoredMarkers: document.querySelectorAll('[data-sponsored], .sponsored-placement, [data-ad-placement]').length,
      shifts: (state?.shifts ?? []).slice(0, 12),
    };
  });

  console.log(JSON.stringify({ url: page.url(), audit }));
  expect(runtimeErrors, `Browser errors on ${page.url()}`).toEqual([]);
  expect(audit.overflow).toBe(false);
  expect(audit.missingKeys).toEqual([]);
  expect(audit.focus.tag).not.toBe('body');
  expect(audit.focus.inViewport).toBe(true);
  expect(audit.cls).toBeLessThanOrEqual(0.1);
  expect(audit.domContentLoadedMs).toBeLessThanOrEqual(15_000);
  return audit;
}

async function loginCustomer(page: Page, account: Credentials): Promise<void> {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#username').fill(account.username);
  await page.locator('#password').fill(account.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 15_000 });
}

async function loginStaff(page: Page, account: Credentials): Promise<void> {
  await page.goto('/admin/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#username').fill(account.username);
  await page.locator('p-password input, #password input').first().fill(account.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/admin\/login(?:\?|$)/, { timeout: 15_000 });
}

test.describe('Integrated release viewport matrix', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });
  test.skip(
    !apiUrl || !credentials('CUSTOMER') || !credentials('ADMIN') || !credentials('OWNER'),
    'Set the E2E API and customer/admin/owner credentials before running the integrated matrix.',
  );

  for (const viewport of viewports) {
    test(`${viewport.name} covers public, customer, admin and management surfaces`, async ({ browser }) => {
      const results: Record<string, PageAudit> = {};

      const publicContext = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        reducedMotion: 'reduce',
      });
      const publicPage = await publicContext.newPage();
      const publicErrors: string[] = [];
      collectRuntimeErrors(publicPage, publicErrors);
      await routeToE2eBackend(publicPage);
      await installAuditProbe(publicPage, viewport.locale);
      await publicPage.goto('/', { waitUntil: 'domcontentloaded' });
      results.home = await auditVisiblePage(publicPage, 'app-home app-editorial-slideshow', publicErrors);
      await expect(publicPage.locator('html')).toHaveAttribute('lang', viewport.locale);
      await publicPage.goto('/search', { waitUntil: 'domcontentloaded' });
      results.search = await auditVisiblePage(publicPage, 'app-property-search-page main.search-page', publicErrors);
      expect(results.search.sponsoredMarkers).toBe(0);
      await publicContext.close();

      const customerContext = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const customerPage = await customerContext.newPage();
      const customerErrors: string[] = [];
      collectRuntimeErrors(customerPage, customerErrors);
      await routeToE2eBackend(customerPage);
      await installAuditProbe(customerPage, viewport.locale);
      await loginCustomer(customerPage, credentials('CUSTOMER')!);
      await customerPage.goto('/profile?tab=bookings', { waitUntil: 'domcontentloaded' });
      results.customer = await auditVisiblePage(customerPage, 'app-profile', customerErrors);
      await customerContext.close();

      const adminContext = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const adminPage = await adminContext.newPage();
      const adminErrors: string[] = [];
      collectRuntimeErrors(adminPage, adminErrors);
      await routeToE2eBackend(adminPage);
      await installAuditProbe(adminPage, viewport.locale);
      await loginStaff(adminPage, credentials('ADMIN')!);
      await adminPage.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });
      results.admin = await auditVisiblePage(adminPage, 'app-dashboard', adminErrors);
      await adminContext.close();

      const ownerContext = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const ownerPage = await ownerContext.newPage();
      const ownerErrors: string[] = [];
      collectRuntimeErrors(ownerPage, ownerErrors);
      await routeToE2eBackend(ownerPage);
      await installAuditProbe(ownerPage, viewport.locale);
      await loginStaff(ownerPage, credentials('OWNER')!);
      await ownerPage.goto('/management/dashboard', { waitUntil: 'domcontentloaded' });
      results.management = await auditVisiblePage(ownerPage, 'app-management-dashboard', ownerErrors);
      await ownerContext.close();

      console.log(JSON.stringify({ viewport, results }));
    });
  }
});
