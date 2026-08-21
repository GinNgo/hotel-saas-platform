import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { financialRequestInterceptor } from './financial-request.interceptor';

describe('financialRequestInterceptor', () => {
  let client: HttpClient;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([financialRequestInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('adds correlation and idempotency headers to API mutations', () => {
    client.post('/api/payments', { amount: 100 }).subscribe();
    const request = http.expectOne('/api/payments');
    expect(request.request.headers.has('X-Correlation-ID')).toBe(true);
    expect(request.request.headers.has('Idempotency-Key')).toBe(true);
    request.flush({ ok: true });
  });

  it('keeps reads correlation-aware without adding an idempotency key', () => {
    client.get('/api/payments/1').subscribe();
    const request = http.expectOne('/api/payments/1');
    expect(request.request.headers.has('X-Correlation-ID')).toBe(true);
    expect(request.request.headers.has('Idempotency-Key')).toBe(false);
    request.flush({ status: 'PENDING' });
  });

  it('preserves caller-supplied identities', () => {
    client.post('/api/refunds', {}, {
      headers: { 'X-Correlation-ID': 'corr-1', 'Idempotency-Key': 'idem-1' },
    }).subscribe();
    const request = http.expectOne('/api/refunds');
    expect(request.request.headers.get('X-Correlation-ID')).toBe('corr-1');
    expect(request.request.headers.get('Idempotency-Key')).toBe('idem-1');
    request.flush({ ok: true });
  });

  it('preserves stable retry and current-state metadata from API errors', () => {
    let captured: any;
    client.post('/api/payments', {}).subscribe({ error: error => captured = error });
    const request = http.expectOne('/api/payments');
    request.flush({
      status: 409,
      code: 'CONCURRENT_MODIFICATION',
      message: 'Reload current state.',
      correlationId: 'corr-1',
      fieldErrors: {},
      retryable: true,
      currentState: 'PENDING',
      path: '/api/payments',
    }, { status: 409, statusText: 'Conflict' });

    expect(captured.error.retryable).toBe(true);
    expect(captured.error.currentState).toBe('PENDING');
    expect(captured.error.correlationId).toBe('corr-1');
  });
});
