import { Route } from '@angular/router';
import { routes } from './app.routes';
import { permissionGuard } from './core/guards/permission.guard';
import { authGuard } from './core/guards/auth-guard';
import { roleGuard } from './core/guards/role-guard';
import { ActionCode, FunctionCode } from './core/services/permission.service';

describe('admin route permission coverage', () => {
  const expected: Record<string, [FunctionCode, ActionCode]> = {
    properties: [FunctionCode.HOTEL, ActionCode.VIEW],
    plans: [FunctionCode.PLATFORM_BILLING, ActionCode.VIEW],
    refunds: [FunctionCode.PROPERTY_REFUND, ActionCode.VIEW],
    'property-owners': [FunctionCode.USER, ActionCode.VIEW],
    'property-registrations': [FunctionCode.HOTEL, ActionCode.VIEW],
    'unsubscribed-owners': [FunctionCode.PLATFORM_BILLING, ActionCode.VIEW],
    'property-approvals': [FunctionCode.HOTEL, ActionCode.APPROVE],
    'property-staff': [FunctionCode.USER, ActionCode.VIEW],
    'property-room-types': [FunctionCode.ROOM_TYPE, ActionCode.VIEW],
    'property-rooms': [FunctionCode.ROOM, ActionCode.VIEW],
    'subscription-orders': [FunctionCode.PLATFORM_BILLING, ActionCode.VIEW],
    'subscription-payments': [FunctionCode.PLATFORM_BILLING, ActionCode.VIEW],
    'software-contracts': [FunctionCode.PLATFORM_BILLING, ActionCode.VIEW],
  };

  const admin = routes.find(route => route.path === 'admin') as Route;

  it('does not expose new admin feature routes without a permission guard', () => {
    const intentionallyUnscoped = new Set(['profile', '404', '', '**', 'role', 'roles-management', 'permissions/roles', 'room-type', 'manage-rooms']);
    const unguarded = (admin.children || [])
      .filter(route => route.loadComponent && !intentionallyUnscoped.has(route.path || ''))
      .filter(route => !route.canActivate?.includes(permissionGuard))
      .map(route => route.path);

    expect(unguarded).toEqual([]);
  });

  for (const [path, [functionCode, actionCode]] of Object.entries(expected)) {
    it(`guards /admin/${path} with ${functionCode}:${actionCode}`, () => {
      const route = admin.children?.find(child => child.path === path);

      expect(route).toBeTruthy();
      expect(route?.canActivate).toContain(permissionGuard);
      expect(route?.data?.['functionCode']).toBe(functionCode);
      expect(route?.data?.['actionCode']).toBe(actionCode);
    });
  }
});

describe('management route RBAC coverage', () => {
  const management = routes.find(route => route.path === 'management') as Route;

  it('requires an allowed operational role at the management boundary', () => {
    expect(management.canActivate).toContain(authGuard);
    expect(management.canActivate).toContain(roleGuard);
    expect(management.data?.['roles']).toEqual(expect.arrayContaining([
      'PROPERTY_OWNER', 'HOTEL_ADMIN', 'HOTEL_MANAGER', 'RECEPTIONIST', 'HOUSEKEEPING', 'SUPER_ADMIN', 'ADMIN'
    ]));
  });

  it('permission-scopes every operational child except the dashboard and property switcher', () => {
    const intentionallyUnscoped = new Set(['dashboard', 'properties', '', 'subscription']);
    const unguarded = (management.children || [])
      .filter(route => route.loadComponent && !intentionallyUnscoped.has(route.path || ''))
      .filter(route => !route.canActivate?.some(guard => guard === permissionGuard))
      .map(route => route.path);

    expect(unguarded).toEqual([]);
  });

  it('uses dedicated permission codes for operational actions', () => {
    const expectations: Record<string, [FunctionCode, ActionCode]> = {
      'front-desk': [FunctionCode.RESERVATION, ActionCode.VIEW],
      'front-desk/create': [FunctionCode.RESERVATION, ActionCode.CREATE],
      housekeeping: [FunctionCode.HOUSEKEEPING, ActionCode.VIEW],
      tasks: [FunctionCode.OPERATIONAL_TASK, ActionCode.VIEW],
      'payment-configuration': [FunctionCode.PROPERTY_PAYMENT_CONFIG, ActionCode.VIEW],
      refunds: [FunctionCode.PROPERTY_REFUND, ActionCode.VIEW],
      billing: [FunctionCode.PLATFORM_BILLING, ActionCode.VIEW],
    };

    for (const [path, [functionCode, actionCode]] of Object.entries(expectations)) {
      const route = management.children?.find(child => child.path === path);
      expect(route, `/management/${path}`).toBeTruthy();
      expect(route?.canActivate).toContain(permissionGuard);
      expect(route?.data?.['functionCode']).toBe(functionCode);
      expect(route?.data?.['actionCode']).toBe(actionCode);
    }
  });
});
