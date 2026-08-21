import type { Page } from '@playwright/test';

export type CredentialRole = 'ADMIN' | 'CUSTOMER' | 'OWNER';

export interface AuditCredentials {
  password: string;
  username: string;
}

export interface AuditUserSession {
  fullName: string;
  permissions: Array<{ actionMask: number; function: string }>;
  roles: string[];
  token: string;
  userId?: number;
  username: string;
}

export function credentials(role: CredentialRole): AuditCredentials | null {
  const username = process.env[`LUXESTAY_E2E_${role}_USERNAME`];
  const password = process.env[`LUXESTAY_E2E_${role}_PASSWORD`];
  return username && password ? { password, username } : null;
}

export function missingCredentialRoles(): CredentialRole[] {
  return (['CUSTOMER', 'ADMIN', 'OWNER'] as const).filter(role => credentials(role) === null);
}

export async function seedSession(page: Page, session: AuditUserSession): Promise<void> {
  const token = isJwt(session.token) ? session.token : createFutureJwt(session);
  await page.addInitScript(user => {
    localStorage.setItem('token', user.token);
    localStorage.setItem('user', JSON.stringify({
      fullName: user.fullName,
      permissions: user.permissions,
      roles: user.roles,
      id: user.userId,
      userId: user.userId,
      username: user.username,
    }));
  }, { ...session, token });
}

function isJwt(token: string): boolean {
  return token.split('.').length === 3;
}

function createFutureJwt(session: AuditUserSession): string {
  const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');
  const payload = {
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
    name: session.fullName,
    preferred_username: session.username,
    role: session.roles,
    sub: String(session.userId || session.username),
  };
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.e2e`;
}

export async function routeApiToEnvironment(page: Page): Promise<void> {
  const configured = process.env.LUXESTAY_E2E_API_URL;
  if (!configured) return;
  const targetPrefix = configured.replace(/\/$/, '');
  await page.route('**/api/**', route => {
    const original = route.request().url();
    return original.startsWith('http://localhost:8080/api')
      ? route.continue({ url: original.replace('http://localhost:8080/api', targetPrefix) })
      : route.continue();
  });
}

export function syntheticAdminSession(): AuditUserSession {
  return {
    fullName: 'UI Audit Admin',
    permissions: [],
    roles: ['ADMIN', 'SUPER_ADMIN'],
    token: 'ui-audit-synthetic-token',
    username: 'ui-audit-admin',
  };
}

export function syntheticOwnerSession(): AuditUserSession {
  return {
    fullName: 'UI Audit Owner',
    permissions: [
      { function: 'ROOM', actionMask: 71 },
      { function: 'ROOM_TYPE', actionMask: 7 },
      { function: 'RESERVATION', actionMask: 7 },
      { function: 'HOUSEKEEPING', actionMask: 103 },
      { function: 'CHECKIN', actionMask: 64 },
      { function: 'CHECKOUT', actionMask: 65 },
      { function: 'HOTEL_SERVICE', actionMask: 1 },
      { function: 'HOTEL', actionMask: 1 },
    ],
    roles: ['PROPERTY_OWNER'],
    token: 'ui-audit-owner-token',
    userId: 42,
    username: 'ui-audit-owner',
  };
}
