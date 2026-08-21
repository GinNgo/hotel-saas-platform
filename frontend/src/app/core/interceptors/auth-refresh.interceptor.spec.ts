import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth';
import { authRefreshInterceptor } from './auth-refresh.interceptor';
import { jwtInterceptor } from './jwt-interceptor';

describe('authRefreshInterceptor', () => {
  let authService: AuthService;
  let controller: HttpTestingController;
  let http: HttpClient;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([jwtInterceptor, authRefreshInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    authService = TestBed.inject(AuthService);
    controller = TestBed.inject(HttpTestingController);
    http = TestBed.inject(HttpClient);
    authService.setSession(tokenExpiringAt(Date.now() + 60_000), {
      id: 7,
      username: 'refresh-user',
      roles: ['CUSTOMER'],
    });
  });

  afterEach(() => {
    controller.verify();
    authService.logout();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('uses one refresh request for concurrent 401 responses and retries both calls', () => {
    const responses: string[] = [];
    http.get<{ value: string }>('/api/protected/one')
      .subscribe(response => responses.push(response.value));
    http.get<{ value: string }>('/api/protected/two')
      .subscribe(response => responses.push(response.value));

    const first = controller.expectOne('/api/protected/one');
    const second = controller.expectOne('/api/protected/two');
    expect(first.request.headers.has('Authorization')).toBe(true);
    expect(second.request.headers.has('Authorization')).toBe(true);

    first.flush({}, { status: 401, statusText: 'Unauthorized' });
    second.flush({}, { status: 401, statusText: 'Unauthorized' });

    const refresh = controller.expectOne(`${environment.apiUrl}/auth/refresh`);
    expect(refresh.request.withCredentials).toBe(true);
    expect(refresh.request.headers.get('X-Refresh-Request')).toBe('1');

    const renewedToken = tokenExpiringAt(Date.now() + 120_000);
    refresh.flush({
      accessToken: renewedToken,
      userId: 7,
      username: 'refresh-user',
      roles: ['CUSTOMER'],
      permissions: [],
    });

    const firstRetry = controller.expectOne('/api/protected/one');
    const secondRetry = controller.expectOne('/api/protected/two');
    expect(firstRetry.request.headers.get('Authorization')).toBe(`Bearer ${renewedToken}`);
    expect(secondRetry.request.headers.get('Authorization')).toBe(`Bearer ${renewedToken}`);
    firstRetry.flush({ value: 'one' });
    secondRetry.flush({ value: 'two' });

    expect(responses).toEqual(['one', 'two']);
    expect(authService.getAccessToken()).toBe(renewedToken);
  });

  it('does not recursively refresh an authentication endpoint', () => {
    let status: number | undefined;
    http.post(`${environment.apiUrl}/auth/login`, {})
      .subscribe({ error: error => { status = error.status; } });

    controller.expectOne(`${environment.apiUrl}/auth/login`)
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    controller.expectNone(`${environment.apiUrl}/auth/refresh`);
    expect(status).toBe(401);
  });
});

function tokenExpiringAt(expiresAt: number): string {
  const encode = (value: object) => btoa(JSON.stringify(value))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ exp: Math.floor(expiresAt / 1_000) })}.signature`;
}
