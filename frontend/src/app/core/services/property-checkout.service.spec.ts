import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { PropertyCheckoutService } from './property-checkout.service';

describe('PropertyCheckoutService', () => {
  let service: PropertyCheckoutService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PropertyCheckoutService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('adds a server-priced service without a caller-authoritative price', () => {
    service.addServiceCharge(
      42,
      { serviceId: 7, chargeType: 'MINIBAR', quantity: 2 },
      { idempotencyKey: 'service-charge-42', correlationId: 'service-42' },
    ).subscribe();

    const request = http.expectOne(
      `${environment.apiUrl}/management/reservations/42/charges/services`,
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ serviceId: 7, chargeType: 'MINIBAR', quantity: 2 });
    expect(request.request.body.unitPrice).toBeUndefined();
    expect(request.request.headers.get('Idempotency-Key')).toBe('service-charge-42');
    expect(request.request.headers.get('X-Correlation-ID')).toBe('service-42');
    request.flush({});
  });

  it('creates an explicit negative adjustment payload', () => {
    service.addNegativeAdjustment(42, {
      type: 'SERVICE_RECOVERY',
      description: 'Service recovery',
      amount: 50000,
    }, { idempotencyKey: 'adjustment-42', correlationId: 'adjustment-correlation' }).subscribe();

    const request = http.expectOne(
      `${environment.apiUrl}/management/reservations/42/charges/surcharges`,
    );
    expect(request.request.body).toEqual({
      type: 'SERVICE_RECOVERY',
      negativeType: 'SERVICE_RECOVERY',
      description: 'Service recovery',
      amount: 50000,
      negativeAdjustment: true,
    });
    expect(request.request.headers.get('Idempotency-Key')).toBe('adjustment-42');
    expect(request.request.headers.get('X-Correlation-ID')).toBe('adjustment-correlation');
    request.flush({});
  });

  it('loads checkout preview without sending totals', () => {
    service.preview(42).subscribe();

    const request = http.expectOne(
      `${environment.apiUrl}/management/reservations/42/checkout-preview`,
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    request.flush({});
  });

  it('checks out with only a server-issued override identifier', () => {
    service.checkout(42, 99, { idempotencyKey: 'checkout-42' }).subscribe();

    const request = http.expectOne(
      `${environment.apiUrl}/management/reservations/42/checkout`,
    );
    expect(request.request.body).toEqual({ checkoutOverrideId: 99 });
    expect(request.request.body.paymentAmount).toBeUndefined();
    expect(request.request.body.paymentMethod).toBeUndefined();
    expect(request.request.body.transactionId).toBeUndefined();
    expect(request.request.headers.get('Idempotency-Key')).toBe('checkout-42');
    request.flush({});
  });

  it('issues an append-only credit note through the management invoice endpoint', () => {
    service.issueCreditNote(
      88,
      { reason: 'Approved correction', lines: [{ invoiceLineId: 5, description: 'Correction', amount: 25000 }] },
      { correlationId: 'credit-88' },
    ).subscribe();

    const request = http.expectOne(
      `${environment.apiUrl}/management/invoices/88/credit-notes`,
    );
    expect(request.request.body).toEqual({
      reason: 'Approved correction',
      lines: [{ invoiceLineId: 5, description: 'Correction', amount: 25000 }],
      correlationId: 'credit-88',
    });
    request.flush({});
  });
});
