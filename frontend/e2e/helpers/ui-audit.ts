import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

export interface RuntimeIssue {
  kind: 'console' | 'http' | 'pageerror';
  message: string;
  url?: string;
}

export interface LinkAuditResult {
  href: string | null;
  text: string;
}

export function collectRuntimeIssues(page: Page): RuntimeIssue[] {
  const issues: RuntimeIssue[] = [];

  page.on('pageerror', error => {
    issues.push({ kind: 'pageerror', message: error.message });
  });
  page.on('console', message => {
    if (message.type() !== 'error' || message.text().includes('favicon')) return;
    issues.push({ kind: 'console', message: message.text(), url: message.location().url });
  });
  page.on('response', response => {
    if (response.status() < 400 || response.url().includes('favicon')) return;
    issues.push({ kind: 'http', message: `HTTP ${response.status()}`, url: response.url() });
  });

  return issues;
}

export async function expectStableApp(page: Page): Promise<void> {
  await expect(page.locator('app-root')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Cannot GET');
}

export async function auditLinks(locator: Locator): Promise<LinkAuditResult[]> {
  return locator.evaluateAll(elements => elements.map(element => ({
    href: element.getAttribute('href'),
    text: (element.textContent || '').replace(/\s+/g, ' ').trim(),
  })));
}

export function placeholderLinks(links: LinkAuditResult[]): LinkAuditResult[] {
  return links.filter(link => !link.href || link.href === '#' || link.href.startsWith('javascript:'));
}

export async function attachJson(
  testInfo: TestInfo,
  name: string,
  value: unknown,
): Promise<void> {
  await testInfo.attach(name, {
    body: JSON.stringify(value, null, 2),
    contentType: 'application/json',
  });
}

export async function horizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}

export async function firstTabStop(page: Page): Promise<{ inViewport: boolean; tag: string }> {
  await page.keyboard.press('Tab');
  return page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    const rect = active?.getBoundingClientRect();
    return {
      inViewport: Boolean(rect && rect.width > 0 && rect.height > 0
        && rect.bottom > 0 && rect.right > 0
        && rect.top < window.innerHeight && rect.left < window.innerWidth),
      tag: active?.tagName.toLowerCase() || 'none',
    };
  });
}
