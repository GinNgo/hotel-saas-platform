import { expect, type Locator, type Page, type Route, test } from '@playwright/test';

interface StoredUser {
  fullName: string;
  permissions: Array<{ actionMask: number; function: string }>;
  roles: string[];
  username: string;
}

const propertyId = 7;

async function seedSession(page: Page, user: StoredUser): Promise<void> {
  await page.addInitScript(sessionUser => {
    const rewrite = (source: string) => source.startsWith('http://localhost:8080/api')
      ? source.replace('http://localhost:8080/api', '/api')
      : source;
    const originalFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const source = typeof input === 'string' || input instanceof URL ? input.toString() : input.url;
      const rewritten = rewrite(source);
      return input instanceof Request
        ? originalFetch(new Request(rewritten, input), init)
        : originalFetch(rewritten, init);
    };
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(
      method: string,
      url: string | URL,
      async = true,
      username?: string | null,
      password?: string | null,
    ) {
      return originalOpen.call(this, method, rewrite(url.toString()), async, username, password);
    };

    localStorage.setItem('luxestay.locale', 'en');
    localStorage.setItem('token', 'financial-accessibility-e2e-token');
    localStorage.setItem('user', JSON.stringify(sessionUser));
  }, user);
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ json: body, status });
}

async function mockManagementApis(page: Page): Promise<void> {
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/management/context') {
      await fulfillJson(route, {
        activePropertyId: propertyId,
        lifetime: false,
        limits: {},
        planCode: 'PRO',
        properties: [{
          address: 'Da Nang',
          approvalStatus: 'APPROVED',
          code: 'LUXE-7',
          id: propertyId,
          isDemo: true,
          nameVi: 'LuxeStay Da Nang',
          operationStatus: 'ACTIVE',
          propertyType: 'HOTEL',
        }],
        subscriptionStatus: 'ACTIVE',
        upgradeRequired: false,
        usage: {},
      });
      return;
    }

    if (url.pathname === `/api/management/properties/${propertyId}/payment-configuration`) {
      await fulfillJson(route, {
        accountName: 'LUXESTAY HOTEL',
        accountNumberMasked: '****6789',
        bankCode: 'LUXE',
        bankName: 'Luxe Bank',
        depositPolicyType: 'PERCENTAGE',
        depositValue: 30,
        enabled: true,
        environment: 'SIMULATOR',
        id: 17,
        instructionsEn: 'Scan the code and pay.',
        instructionsVi: 'Quet ma va thanh toan.',
        methods: [{ enabled: true, method: 'MANUAL_TRANSFER', provider: 'BANK' }],
        paymentExpiryMinutes: 30,
        propertyId,
        qrProvider: 'VIETQR',
        readiness: {
          blockers: [],
          environment: 'SIMULATOR',
          methods: [{ blockers: [], method: 'MANUAL_TRANSFER', provider: 'BANK', ready: true }],
          ready: true,
        },
        transferTemplate: 'BOOKING {paymentCode}',
        version: 2,
      });
      return;
    }

    await fulfillJson(route, []);
  });
}

async function mockAdminShell(page: Page): Promise<void> {
  await page.route('**/ws/**', route => route.abort());
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/users/me') {
      await fulfillJson(route, {
        email: 'admin@luxestay.test',
        fullName: 'Financial Accessibility Admin',
        id: 1,
        roles: ['SUPER_ADMIN'],
        username: 'financial-a11y-admin',
      });
      return;
    }
    if (url.pathname === '/api/notifications' || url.pathname === '/api/auth/my-menu') {
      await fulfillJson(route, []);
      return;
    }
    await fulfillJson(route, []);
  });
}

async function refreshAngularComponent(page: Page, selector: string): Promise<void> {
  await page.evaluate(targetSelector => {
    const debugApi = (globalThis as typeof globalThis & {
      ng?: {
        applyChanges?: (component: object) => void;
        getComponent?: (target: Element) => object | null;
      };
    }).ng;
    const host = document.querySelector(targetSelector);
    const component = host && debugApi?.getComponent?.(host);
    if (component && debugApi?.applyChanges) debugApi.applyChanges(component);
  }, selector);
}

async function expectNamedControls(container: Locator): Promise<void> {
  const controls = container.locator('button, input:not([type="hidden"]), select, textarea');
  for (let index = 0; index < await controls.count(); index += 1) {
    const control = controls.nth(index);
    if (await control.isVisible()) await expect(control).toHaveAccessibleName(/\S/);
  }
}

async function expectKeyboardFocusIndicator(locator: Locator): Promise<void> {
  const indicator = await locator.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      boxShadow: style.boxShadow,
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth) || 0,
    };
  });
  expect(
    (indicator.outlineStyle !== 'none' && indicator.outlineWidth >= 2)
      || indicator.boxShadow !== 'none',
    'Keyboard focus must have a visible outline or focus ring.',
  ).toBe(true);
}

async function contrastRatio(locator: Locator): Promise<number> {
  return locator.evaluate(element => {
    interface Rgba {
      alpha: number;
      blue: number;
      green: number;
      red: number;
    }

    const parse = (value: string): Rgba => {
      const match = value.match(/rgba?\(([^)]+)\)/i);
      if (!match) throw new Error(`Unsupported computed color: ${value}`);
      const channels = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return {
        alpha: channels.length > 3 ? channels[3] : 1,
        blue: channels[2],
        green: channels[1],
        red: channels[0],
      };
    };
    const composite = (foreground: Rgba, background: Rgba): Rgba => {
      const alpha = foreground.alpha + background.alpha * (1 - foreground.alpha);
      const channel = (front: number, back: number) => alpha === 0
        ? 0
        : (front * foreground.alpha + back * background.alpha * (1 - foreground.alpha)) / alpha;
      return {
        alpha,
        blue: channel(foreground.blue, background.blue),
        green: channel(foreground.green, background.green),
        red: channel(foreground.red, background.red),
      };
    };
    const luminance = (color: Rgba): number => {
      const linear = (channel: number) => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * linear(color.red) + 0.7152 * linear(color.green) + 0.0722 * linear(color.blue);
    };

    const layers: Rgba[] = [];
    for (let current: Element | null = element; current; current = current.parentElement) {
      layers.push(parse(getComputedStyle(current).backgroundColor));
    }
    const background = layers.reverse().reduce(
      (result, layer) => composite(layer, result),
      { alpha: 1, blue: 255, green: 255, red: 255 },
    );
    const foreground = composite(parse(getComputedStyle(element).color), background);
    const lighter = Math.max(luminance(foreground), luminance(background));
    const darker = Math.min(luminance(foreground), luminance(background));
    return (lighter + 0.05) / (darker + 0.05);
  });
}

async function expectTextContrast(locator: Locator, label: string): Promise<void> {
  const ratio = await contrastRatio(locator);
  expect(ratio, `${label} contrast ratio was ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
}

async function maxMotionDuration(locator: Locator): Promise<number> {
  return locator.evaluate(element => {
    const milliseconds = (value: string): number => Math.max(...value.split(',').map(part => {
      const duration = part.trim();
      return duration.endsWith('ms') ? Number.parseFloat(duration) : Number.parseFloat(duration) * 1000;
    }));
    const style = getComputedStyle(element);
    return Math.max(milliseconds(style.animationDuration), milliseconds(style.transitionDuration));
  });
}

test.describe('Financial form and dialog accessibility', () => {
  test.describe.configure({ retries: 0, timeout: 45_000 });

  test('property payment configuration supports named controls, keyboard order, error focus, contrast, and reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedSession(page, {
      fullName: 'Payment Owner',
      permissions: [{ actionMask: 5, function: 'PROPERTY_PAYMENT_CONFIG' }],
      roles: ['PROPERTY_OWNER'],
      username: 'payment-owner',
    });
    await mockManagementApis(page);

    await page.goto(`/management/payment-configuration?propertyId=${propertyId}`, { waitUntil: 'domcontentloaded' });
    const screen = page.locator('app-property-payment-configuration');
    await expect(screen.getByRole('heading', { level: 2, name: 'Property payment configuration' })).toBeVisible();
    await expect(page.locator('section[aria-labelledby="payment-config-title"]')).toBeVisible();

    const form = screen.locator('form');
    await expectNamedControls(form);
    await expect(screen.getByRole('group', { name: 'Payment environment' })).toBeVisible();
    await expect(screen.getByRole('spinbutton', { name: 'Payment expiry' })).toBeVisible();
    await expect(screen.getByRole('textbox', { name: 'Vietnamese instructions' })).toBeVisible();

    const enabled = screen.getByRole('checkbox', { name: /Enable this configuration/ });
    const simulator = screen.getByRole('radio', { name: /Simulator/ });
    const sandbox = screen.getByRole('radio', { name: /Sandbox/ });
    const production = screen.getByRole('radio', { name: /Production/ });
    const manualTransfer = screen.getByRole('checkbox', { name: 'Manual bank transfer' });
    await enabled.focus();
    await page.keyboard.press('Tab');
    await expect(simulator).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(sandbox).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(production).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(manualTransfer).toBeFocused();

    const save = screen.getByRole('button', { name: 'Save configuration' });
    await expectTextContrast(save, 'Save configuration button');
    await expect.poll(() => page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    // The global reduced-motion rule uses a 0.01ms safety duration rather than a literal zero.
    expect(await maxMotionDuration(save)).toBeLessThanOrEqual(1);
    expect(await maxMotionDuration(screen.locator('.environment-option').first())).toBeLessThanOrEqual(1);

    const vietnameseInstructions = screen.getByRole('textbox', { name: 'Vietnamese instructions' });
    await vietnameseInstructions.fill('');
    await save.focus();
    await page.keyboard.press('Enter');
    const validationSummary = screen.getByRole('alert');
    await expect(validationSummary).toContainText('Both Vietnamese and English instructions are required.');
    await expect(vietnameseInstructions).toBeFocused();
  });

  test('invoice dialog has a name, traps keyboard focus, and restores it on close', async ({ page }) => {
    await seedSession(page, {
      fullName: 'Financial Accessibility Admin',
      permissions: [],
      roles: ['SUPER_ADMIN'],
      username: 'financial-a11y-admin',
    });
    await page.route('**/ws/**', route => route.abort());
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      const normalizedPath = url.pathname.replace(/\/+$/, '');
      if (normalizedPath === '/api/reservations' || normalizedPath === '/api/reservation') {
        await fulfillJson(route, [{
          checkInDate: '2026-07-20',
          checkOutDate: '2026-07-22',
          details: [{ id: 1, priceAtBooking: 1_500_000, roomId: 11, roomNumber: 'A501' }],
          guests: 2,
          id: 501,
          paymentMethod: 'BANK_TRANSFER',
          status: 'CHECKED_OUT',
          totalAmount: 1_500_000,
          userFullName: 'Accessible Guest',
          userId: 901,
          username: 'accessible-guest',
        }]);
        return;
      }
      if (url.pathname === '/api/invoices/reservation/501') {
        await fulfillJson(route, {
          id: 601,
          invoiceCode: 'INV-A11Y-501',
          issueDate: '2026-07-22T10:00:00Z',
          reservationId: 501,
          status: 'FINALIZED',
          totalAmount: 1_500_000,
        });
        return;
      }
      if (url.pathname === '/api/users/me') {
        await fulfillJson(route, {
          email: 'admin@luxestay.test',
          fullName: 'Financial Accessibility Admin',
          id: 1,
          roles: ['SUPER_ADMIN'],
          username: 'financial-a11y-admin',
        });
        return;
      }
      await fulfillJson(route, []);
    });

    const reservationsLoaded = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname.replace(/\/+$/, '') === '/api/reservations';
    });
    await page.goto('/admin/invoices', { waitUntil: 'domcontentloaded' });
    await reservationsLoaded;
    await refreshAngularComponent(page, 'app-invoice-management');
    const invoiceRow = page.getByRole('row').filter({ hasText: 'RES-501' }).first();
    await expect(invoiceRow).toBeVisible();
    const trigger = invoiceRow.getByRole('button');
    await expect(trigger).toHaveAccessibleName(/\S/);
    await trigger.focus();
    const invoiceLoaded = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname.replace(/\/+$/, '') === '/api/invoices/reservation/501';
    });
    await trigger.click();
    await invoiceLoaded;
    await refreshAngularComponent(page, 'app-invoice-management');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleName(/\S/);
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expectNamedControls(dialog);
    await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);

    for (let index = 0; index < 6; index += 1) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});
