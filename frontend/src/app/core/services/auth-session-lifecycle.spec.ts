import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AuthService } from './auth';

describe('AuthService session lifecycle', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => {
    TestBed.inject(AuthService).logout();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('does not restore an expired session and clears stale user metadata', () => {
    localStorage.setItem('token', tokenExpiringAt(Date.now() - 60_000));
    localStorage.setItem('user', JSON.stringify({ username: 'expired-user', roles: ['CUSTOMER'] }));

    const service = TestBed.inject(AuthService);

    expect(service.isLoggedIn()).toBe(false);
    expect(localStorage.getItem('user')).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
    expect(sessionStorage.getItem('token')).toBeNull();
  });

  it('stores a valid token for the current tab and clears every auth artifact on logout', () => {
    const service = TestBed.inject(AuthService);
    const token = tokenExpiringAt(Date.now() + 60_000);

    service.setSession(token, { username: 'session-user', roles: ['CUSTOMER'] });

    expect(service.isLoggedIn()).toBe(true);
    expect(service.getAccessToken()).toBe(token);
    expect(sessionStorage.getItem('token')).toBe(token);
    expect(localStorage.getItem('token')).toBeNull();

    service.logout();

    expect(service.isLoggedIn()).toBe(false);
    expect(sessionStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('automatically clears the in-memory session when the access token expires', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T00:00:00.000Z'));

    try {
      const service = TestBed.inject(AuthService);
      const token = tokenExpiringAt(Date.now() + 10_000);

      service.setSession(token, { username: 'expiring-user', roles: ['CUSTOMER'] });
      expect(service.isLoggedIn()).toBe(true);

      vi.advanceTimersByTime(10_000);

      expect(service.isLoggedIn()).toBe(false);
      expect(sessionStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

function tokenExpiringAt(expiresAt: number): string {
  const encode = (value: object) => btoa(JSON.stringify(value))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ exp: Math.floor(expiresAt / 1_000) })}.signature`;
}
