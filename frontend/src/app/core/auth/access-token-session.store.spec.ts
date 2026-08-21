import { TestBed } from '@angular/core/testing';

import { AccessTokenSessionStore, inspectAccessToken } from './access-token-session.store';

describe('AccessTokenSessionStore', () => {
  let store: AccessTokenSessionStore;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    store = TestBed.inject(AccessTokenSessionStore);
  });

  afterEach(() => {
    store.clearToken();
    localStorage.clear();
  });

  it('keeps a valid access token in tab-scoped storage only', () => {
    const token = tokenExpiringAt(Date.now() + 60_000);

    expect(store.saveToken(token)).toBe(true);
    expect(sessionStorage.getItem('token')).toBe(token);
    expect(localStorage.getItem('token')).toBeNull();
    expect(store.getValidToken()).toBe(token);
  });

  it('migrates a valid legacy local-storage token into session storage', () => {
    const token = tokenExpiringAt(Date.now() + 60_000);
    localStorage.setItem('token', token);

    expect(store.getValidToken()).toBe(token);
    expect(sessionStorage.getItem('token')).toBe(token);
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('rejects and clears expired or malformed tokens', () => {
    const expired = tokenExpiringAt(Date.now() - 60_000);
    sessionStorage.setItem('token', expired);
    expect(store.getValidToken()).toBeNull();

    sessionStorage.setItem('token', 'not-a-jwt');
    expect(store.getValidToken()).toBeNull();
    expect(inspectAccessToken('not-a-jwt').status).toBe('malformed');
  });
});

function tokenExpiringAt(expiresAt: number): string {
  const encode = (value: object) => btoa(JSON.stringify(value))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ exp: Math.floor(expiresAt / 1_000) })}.signature`;
}
