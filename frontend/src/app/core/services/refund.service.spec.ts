import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { RefundService } from './refund.service';

describe('RefundService', () => {
  let service: RefundService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RefundService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('keeps property refund requests scoped and sends retry headers', () => {
    service.requestPropertyRefund(
      'property/charge 1',
      { amount: 250000, reason: 'Guest cancellation' },
      { idempotencyKey: 'property-refund-1', correlationId: 'corr-property-1' },
    ).subscribe();

    const request = http.expectOne(
      `${environment.apiUrl}/property-payments/property%2Fcharge%201/refunds`,
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ amount: 250000, reason: 'Guest cancellation' });
    expect(request.request.headers.get('Idempotency-Key')).toBe('property-refund-1');
    expect(request.request.headers.get('X-Correlation-ID')).toBe('corr-property-1');
    request.flush(propertyResult());
  });

  it('reads a property refund and posts an approval with an empty body', () => {
    service.getPropertyRefund('refund/property').subscribe();
    const get = http.expectOne(`${environment.apiUrl}/property-refunds/refund%2Fproperty`);
    expect(get.request.method).toBe('GET');
    get.flush(propertyResult());

    service.approvePropertyRefund('refund/property', { correlationId: 'approve-corr' }).subscribe();
    const approve = http.expectOne(`${environment.apiUrl}/property-refunds/refund%2Fproperty/approve`);
    expect(approve.request.method).toBe('POST');
    expect(approve.request.body).toBeNull();
    expect(approve.request.headers.get('X-Correlation-ID')).toBe('approve-corr');
    approve.flush(propertyResult());
  });

  function propertyResult() {
    return {
      publicId: 'refund-1',
      originalTransactionPublicId: 'transaction-1',
      requestedAmount: 250000,
      currency: 'VND',
      status: 'REQUESTED',
      remainingRefundableAmount: 750000,
      requestedAt: '2026-08-02T00:00:00Z',
      completedAt: null,
      replayed: false,
    };
  }
});
