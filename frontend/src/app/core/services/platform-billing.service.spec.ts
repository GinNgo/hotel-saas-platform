import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { PlatformBillingService } from './platform-billing.service';

describe('PlatformBillingService', () => {
  let service: PlatformBillingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PlatformBillingService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the backend-owned platform catalog', () => {
    service.getCatalog().subscribe();
    const request = http.expectOne(`${environment.apiUrl}/platform/subscription-plans`);
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('creates a purchase order with only property, plan and idempotency identity', () => {
    service.createPurchaseOrder(42, 7, 'purchase-key').subscribe();
    const request = http.expectOne(`${environment.apiUrl}/platform/subscription-orders`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ targetHotelId: 42, planId: 7 });
    expect(request.request.body.price).toBeUndefined();
    expect(request.request.headers.get('Idempotency-Key')).toBe('purchase-key');
    request.flush({ publicId: 'order-1' });
  });

  it('creates a payment attempt without client amount or merchant fields', () => {
    service.createPaymentAttempt('order/1', { provider: 'SIMULATOR', method: 'SIMULATOR' }, 'attempt-key').subscribe();
    const request = http.expectOne(
      `${environment.apiUrl}/platform/subscription-orders/order%2F1/payment-attempts`,
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ provider: 'SIMULATOR', method: 'SIMULATOR' });
    expect(request.request.body.amount).toBeUndefined();
    expect(request.request.body.merchant).toBeUndefined();
    expect(request.request.headers.get('Idempotency-Key')).toBe('attempt-key');
    request.flush({ publicId: 'attempt-1' });
  });

  it('loads history and sends cancellation correlation metadata', () => {
    service.getHistory(42).subscribe();
    const history = http.expectOne(`${environment.apiUrl}/platform/subscriptions/42/history`);
    expect(history.request.method).toBe('GET');
    history.flush([]);

    service.cancelOrder('order-1', { correlationId: 'cancel-correlation' }).subscribe();
    const cancel = http.expectOne(`${environment.apiUrl}/platform/subscription-orders/order-1/cancel`);
    expect(cancel.request.method).toBe('POST');
    expect(cancel.request.body).toBeNull();
    expect(cancel.request.headers.get('X-Correlation-ID')).toBe('cancel-correlation');
    cancel.flush({ publicId: 'order-1', attempts: [] });
  });

  it('reads masked readiness without accepting a secret from the client', () => {
    service.validatePaymentConfiguration('MOMO').subscribe();
    const request = http.expectOne(
      `${environment.apiUrl}/platform/payment-configuration/validate?provider=MOMO`,
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    request.flush({ ready: false, mode: 'SANDBOX', provider: 'MOMO', blockers: ['missing'] });
  });

  it('uses a dedicated production approval endpoint', () => {
    service.approvePaymentConfiguration('VNPAY', 'PRODUCTION').subscribe();
    const request = http.expectOne(`${environment.apiUrl}/platform/payment-configuration/VNPAY/PRODUCTION/approve`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    request.flush({ provider: 'VNPAY', environment: 'PRODUCTION', productionApproved: true });
  });
});
