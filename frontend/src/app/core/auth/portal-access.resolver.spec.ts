import { describe, expect, it } from 'vitest';
import { isAllowedReturnUrl, resolvePortal } from './portal-access.resolver';

describe('portal access resolver', () => {
  it.each([
    [['CUSTOMER'], 'client', '/'],
    [['PROPERTY_OWNER'], 'management', '/management/dashboard'],
    [['RECEPTIONIST'], 'management', '/management/dashboard'],
    [['HOUSEKEEPING'], 'management', '/management/housekeeping'],
    [['ADMIN'], 'admin', '/admin/dashboard'],
    [['SUPER_ADMIN'], 'admin', '/admin/dashboard'],
  ])('resolves %s to %s', (roles, portal, route) => {
    expect(resolvePortal({ roles, permissions: [] })).toEqual({ portal, defaultRoute: route });
  });

  it('uses fixed precedence for multi-role accounts', () => {
    expect(resolvePortal({ roles: ['CUSTOMER', 'RECEPTIONIST', 'ADMIN'], permissions: [] }).portal).toBe('admin');
    expect(resolvePortal({ roles: ['CUSTOMER', 'RECEPTIONIST'], permissions: [] }).portal).toBe('management');
  });

  it('recognizes active assigned property as management access', () => {
    expect(resolvePortal({ roles: ['CUSTOMER'], permissions: [], assignedProperties: [{ id: 'p1' }] }).portal).toBe('management');
  });

  it('rejects cross-portal and unsafe return URLs', () => {
    expect(isAllowedReturnUrl('/admin/dashboard', 'client')).toBe(false);
    expect(isAllowedReturnUrl('/management/rooms', 'management')).toBe(true);
    expect(isAllowedReturnUrl('//evil.example', 'client')).toBe(false);
  });
});
