import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';

import { jwtInterceptor } from './jwt-interceptor';

describe('jwtInterceptor access-token lifecycle', () => {
  let http: HttpClient;
  let controller: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([jwtInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    controller.verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('attaches a valid bearer token after migrating it out of local storage', () => {
    const token = tokenExpiringAt(Date.now() + 60_000);
    localStorage.setItem('token', token);

    http.get('/api/protected').subscribe();

    const request = controller.expectOne('/api/protected');
    expect(request.request.headers.get('Authorization')).toBe(`Bearer ${token}`);
    expect(localStorage.getItem('token')).toBeNull();
    expect(sessionStorage.getItem('token')).toBe(token);
    request.flush({});
  });

  it('does not attach an expired token and removes it from browser storage', () => {
    sessionStorage.setItem('token', tokenExpiringAt(Date.now() - 60_000));

    http.get('/api/protected').subscribe();

    const request = controller.expectOne('/api/protected');
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(sessionStorage.getItem('token')).toBeNull();
    request.flush({});
  });
});

function tokenExpiringAt(expiresAt: number): string {
  const encode = (value: object) => btoa(JSON.stringify(value))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ exp: Math.floor(expiresAt / 1_000) })}.signature`;
}
