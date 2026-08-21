import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpClient, provideHttpClient, withInterceptors, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { ClientObservabilityService } from '../services/client-observability.service';
import { errorInterceptor } from './error-interceptor';

describe('errorInterceptor', () => {
  let httpMock: HttpTestingController;
  let httpClient: HttpClient;
  let routerSpy: any;
  let authServiceSpy: any;
  let observabilitySpy: any;

  beforeEach(() => {
    routerSpy = { navigate: vi.fn(), url: '/' };
    authServiceSpy = { logout: vi.fn() };
    observabilitySpy = { recordHttpFailure: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: routerSpy },
        { provide: AuthService, useValue: authServiceSpy },
        { provide: ClientObservabilityService, useValue: observabilitySpy }
      ]
    });

    httpMock = TestBed.inject(HttpTestingController);
    httpClient = TestBed.inject(HttpClient);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should navigate to /403 on 403 error if not already at /403', () => {
    httpClient.get('/api/test').subscribe({
      next: () => { throw new Error('should have failed with 403'); },
      error: (error: HttpErrorResponse) => {
        expect(error.status).toBe(403);
      }
    });

    const req = httpMock.expectOne('/api/test');
    req.flush('Forbidden', { status: 403, statusText: 'Forbidden' });

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/403'], { queryParams: { reason: 'ACCESS_DENIED' } });
  });

  it('should not navigate to /403 on 403 error if already at /403', () => {
    routerSpy.url = '/403';

    httpClient.get('/api/test').subscribe({
      next: () => { throw new Error('should have failed with 403'); },
      error: (error: HttpErrorResponse) => {
        expect(error.status).toBe(403);
      }
    });

    const req = httpMock.expectOne('/api/test');
    req.flush('Forbidden', { status: 403, statusText: 'Forbidden' });

    expect(routerSpy.navigate).not.toHaveBeenCalled();
  });

  it('keeps mutation permission errors on the current page for inline notification', () => {
    routerSpy.url = '/admin/rooms';

    httpClient.put('/api/rooms/1', { roomNumber: '101' }).subscribe({ error: () => undefined });

    const req = httpMock.expectOne('/api/rooms/1');
    req.flush({
      status: 403,
      code: 'FORBIDDEN_PERMISSION',
      message: 'Bạn không có quyền chỉnh sửa phòng.',
      retryable: false,
      fieldErrors: {},
      path: '/api/rooms/1',
    }, { status: 403, statusText: 'Forbidden' });

    expect(routerSpy.navigate).not.toHaveBeenCalled();
  });

  it('keeps an authentication failure on the login page for inline error handling', () => {
    routerSpy.url = '/login';
    httpClient.post('/api/auth/login', { username: 'customer@example.com', password: 'wrong' })
      .subscribe({ error: () => undefined });

    const req = httpMock.expectOne('/api/auth/login');
    req.flush({ code: 'INVALID_CREDENTIALS' }, { status: 403, statusText: 'Forbidden' });

    expect(routerSpy.navigate).not.toHaveBeenCalled();
  });

  it('uses the stable API error code as the forbidden-route reason', () => {
    httpClient.get('/api/test').subscribe({ error: () => undefined });

    const req = httpMock.expectOne('/api/test');
    req.flush({
      status: 403,
      code: 'FORBIDDEN_FEATURE',
      message: 'Upgrade required',
      retryable: false,
      fieldErrors: {},
      path: '/api/test',
    }, { status: 403, statusText: 'Forbidden' });

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/403'], {
      queryParams: { reason: 'FORBIDDEN_FEATURE' },
    });
    expect(observabilitySpy.recordHttpFailure).toHaveBeenCalledWith('GET', 403, undefined);
  });

  it('records the response correlation id without forwarding the request body or URL', () => {
    httpClient.post('/api/private/customer@example.com', { password: 'secret' }).subscribe({ error: () => undefined });

    const req = httpMock.expectOne('/api/private/customer@example.com');
    req.flush({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Unavailable',
      correlationId: 'corr-safe-42',
      retryable: true,
    }, { status: 503, statusText: 'Unavailable' });

    expect(observabilitySpy.recordHttpFailure).toHaveBeenCalledWith('POST', 503, 'corr-safe-42');
  });

  it('should handle 401 error in admin area', () => {
    routerSpy.url = '/admin/dashboard';

    httpClient.get('/api/test').subscribe({
      next: () => { throw new Error('should have failed with 401'); },
      error: (error: HttpErrorResponse) => {
        expect(error.status).toBe(401);
      }
    });

    const req = httpMock.expectOne('/api/test');
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(authServiceSpy.logout).toHaveBeenCalled();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/admin/login']);
  });

  it('should not navigate to /admin/login if already there on 401', () => {
    routerSpy.url = '/admin/login';

    httpClient.get('/api/test').subscribe({
      next: () => { throw new Error('should have failed with 401'); },
      error: (error: HttpErrorResponse) => {
        expect(error.status).toBe(401);
      }
    });

    const req = httpMock.expectOne('/api/test');
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(authServiceSpy.logout).toHaveBeenCalled();
    expect(routerSpy.navigate).not.toHaveBeenCalled();
  });

  it('should handle 401 error in client area', () => {
    routerSpy.url = '/profile';

    httpClient.get('/api/test').subscribe({
      next: () => { throw new Error('should have failed with 401'); },
      error: (error: HttpErrorResponse) => {
        expect(error.status).toBe(401);
      }
    });

    const req = httpMock.expectOne('/api/test');
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(authServiceSpy.logout).toHaveBeenCalled();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/profile' } });
  });

  it('should not navigate to /login if already there on 401', () => {
    routerSpy.url = '/login';

    httpClient.get('/api/test').subscribe({
      next: () => { throw new Error('should have failed with 401'); },
      error: (error: HttpErrorResponse) => {
        expect(error.status).toBe(401);
      }
    });

    const req = httpMock.expectOne('/api/test');
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(authServiceSpy.logout).toHaveBeenCalled();
    expect(routerSpy.navigate).not.toHaveBeenCalled();
  });

  it('clears the session and preserves the stable reason when an account is disabled', () => {
    routerSpy.url = '/profile';
    httpClient.get('/api/users/me').subscribe({ error: () => undefined });

    const req = httpMock.expectOne('/api/users/me');
    req.flush({
      status: 401,
      code: 'ACCOUNT_DISABLED',
      message: 'This account is not active.',
      retryable: false,
      fieldErrors: {},
      path: '/api/users/me',
    }, { status: 401, statusText: 'Unauthorized' });

    expect(authServiceSpy.logout).toHaveBeenCalled();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: '/profile', reason: 'ACCOUNT_DISABLED' },
    });
  });
});
