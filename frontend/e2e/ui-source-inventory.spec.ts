import { expect, test } from '@playwright/test';
import {
  activeRouteImports,
  comingSoonMatches,
  e2eRouteLiterals,
  incompleteImplementationMatches,
  placeholderHrefMatches,
  routeDeclarations,
  unsupportedMatches,
} from './helpers/source-inventory';
import { attachJson } from './helpers/ui-audit';

test.describe('UI source inventory audit', () => {
  test('router exposes a non-trivial auditable surface inventory', async ({}, testInfo) => {
    const routes = routeDeclarations();
    await attachJson(testInfo, 'route-declarations', routes);
    expect(routes.length).toBeGreaterThanOrEqual(60);
  });

  test('E2E route literals do not use removed client-prefixed routes', async ({}, testInfo) => {
    const stale = e2eRouteLiterals().filter(item => item.route.startsWith('/client/'));
    await attachJson(testInfo, 'stale-route-literals', stale);
    expect(stale, 'Remove or update Playwright routes that no longer exist in app.routes.ts').toEqual([]);
  });

  test('rendered application sources do not publish placeholder hash links', async ({}, testInfo) => {
    const placeholders = placeholderHrefMatches();
    await attachJson(testInfo, 'placeholder-links', placeholders);
    expect(placeholders, 'Replace visible href="#" controls with real destinations or non-link text').toEqual([]);
  });

  test('unsupported user-facing functions are explicitly inventoried as gaps', async ({}, testInfo) => {
    const unsupported = unsupportedMatches();
    await attachJson(testInfo, 'unsupported-functions', unsupported);
    expect(unsupported, 'User-facing unsupported functions must remain in the gap register until implemented').toEqual([]);
  });

  test('known incomplete implementation markers are visible to the audit', async ({}, testInfo) => {
    const markers = incompleteImplementationMatches();
    await attachJson(testInfo, 'incomplete-markers', markers);
    expect(markers.length).toBeGreaterThan(0);
  });

  test('Coming Soon tabs are explicitly disabled in source', async ({}, testInfo) => {
    const markers = comingSoonMatches();
    await attachJson(testInfo, 'coming-soon-markers', markers);
    expect(markers.filter(marker => marker.text.includes('disabled: true'))).toHaveLength(2);
  });

  test('dormant mock components are not imported by the active router', () => {
    const routes = activeRouteImports();
    expect(routes).not.toContain('./features/customer/room-search/room-search.component');
    expect(routes).not.toContain('./features/customer/checkout/checkout.component');
    expect(routes).not.toContain('./features/admin/room-management/room-management.component');
    expect(routes).not.toContain('./features/admin/invoice-management/invoice-management.component');
  });
});
