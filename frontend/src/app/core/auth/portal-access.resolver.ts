import { AuthPermission } from '../services/auth';

export type PortalKind = 'client' | 'management' | 'admin';

export interface PortalIdentity {
  roles: string[];
  permissions: AuthPermission[];
  assignedProperties?: Array<{ id?: string | number; active?: boolean }>;
  username?: string;
}

export interface PortalResolution {
  portal: PortalKind;
  defaultRoute: string;
}

const ADMIN_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);
const MANAGEMENT_ROLES = new Set(['PROPERTY_OWNER', 'HOTEL_ADMIN', 'HOTEL_MANAGER', 'RECEPTIONIST', 'HOUSEKEEPING']);

export function normalizeRole(role: unknown): string {
  const compact = String(role || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return ({
    OWNER: 'PROPERTY_OWNER', PROPERTYOWNER: 'PROPERTY_OWNER', MANAGER: 'HOTEL_MANAGER',
    HOTELMANAGER: 'HOTEL_MANAGER', HOTELADMIN: 'HOTEL_ADMIN', HOUSEKEEPER: 'HOUSEKEEPING',
    HOUSEKEEPING: 'HOUSEKEEPING', SUPERADMIN: 'SUPER_ADMIN', ADMIN: 'ADMIN',
  } as Record<string, string>)[compact] || compact;
}

export function canonicalRoles(roles: unknown): string[] {
  return [...new Set((Array.isArray(roles) ? roles : []).map(normalizeRole).filter(Boolean))];
}

export function hasPortalPermission(identity: PortalIdentity, functionCode: string, actionMask = 1): boolean {
  if (canonicalRoles(identity.roles).some(role => ADMIN_ROLES.has(role))) return true;
  const permission = (identity.permissions || []).find(item => item.function === functionCode);
  return Boolean(permission && (permission.actionMask & actionMask) === actionMask);
}

export function resolvePortal(identity: PortalIdentity): PortalResolution {
  const roles = canonicalRoles(identity.roles);
  if (roles.some(role => ADMIN_ROLES.has(role))) return { portal: 'admin', defaultRoute: '/admin/dashboard' };
  if (roles.includes('PROPERTY_OWNER') || (identity.assignedProperties || []).some(property => property.active !== false)) {
    return { portal: 'management', defaultRoute: '/management/dashboard' };
  }
  if (roles.some(role => MANAGEMENT_ROLES.has(role))) {
    const route = roles.includes('HOUSEKEEPING') && !roles.some(role => ['HOTEL_ADMIN', 'HOTEL_MANAGER'].includes(role))
      ? '/management/housekeeping'
      : '/management/dashboard';
    return { portal: 'management', defaultRoute: route };
  }
  return { portal: 'client', defaultRoute: '/' };
}

export function isAllowedReturnUrl(value: unknown, portal: PortalKind): value is string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return false;
  const path = value.split(/[?#]/, 1)[0];
  if (path === '/login' || path === '/admin/login' || path === '/register') return false;
  if (portal === 'admin') return path === '/admin' || path.startsWith('/admin/');
  if (portal === 'management') return path === '/management' || path.startsWith('/management/');
  return !(['/admin', '/management', '/403'].some(prefix => path === prefix || path.startsWith(`${prefix}/`)));
}
