import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { PropertyPaymentService } from './property-payment.service';

describe('PropertyPaymentService', () => {
  let service: PropertyPaymentService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PropertyPaymentService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the authoritative booking financial summary', () => {
    service.getFinancialSummary(42).subscribe();

    const request = http.expectOne(`${environment.apiUrl}/reservations/42/financial-summary`);
    expect(request.request.method).toBe('GET');
    request.flush({
      reservationId: 42,
      grossCharges: 1000000,
      depositRequired: 300000,
      successfulPayments: 0,
      successfulRefunds: 0,
      remainingBalance: 1000000,
      currency: 'VND',
      financialState: 'UNPAID',
      sourceVersion: 0,
      calculatedAt: '2026-07-31T12:00:00',
    });
  });

  it('keeps a reservation GUID intact in financial URLs', () => {
    const reservationId = '6b31ee33-9f48-4f75-8e7d-b9f77d2de430';

    service.getFinancialSummary(reservationId).subscribe();

    const request = http.expectOne(
      `${environment.apiUrl}/reservations/${reservationId}/financial-summary`,
    );
    expect(request.request.method).toBe('GET');
    request.flush({ reservationId });
  });

  it('creates an attempt without caller-authoritative amount or property data', () => {
    service.createAttempt(
      42,
      { purpose: 'DEPOSIT', method: 'QR_TRANSFER' },
      { idempotencyKey: 'attempt-key', correlationId: 'attempt-correlation' },
    ).subscribe();

    const request = http.expectOne(`${environment.apiUrl}/reservations/42/payment-attempts`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ purpose: 'DEPOSIT', method: 'QR_TRANSFER' });
    expect(request.request.body.amount).toBeUndefined();
    expect(request.request.body.propertyId).toBeUndefined();
    expect(request.request.headers.get('Idempotency-Key')).toBe('attempt-key');
    expect(request.request.headers.get('X-Correlation-ID')).toBe('attempt-correlation');
    request.flush(attemptResponse());
  });

  it('reads an attempt using an encoded public identifier', () => {
    service.getAttempt('attempt/with space').subscribe();

    const request = http.expectOne(
      `${environment.apiUrl}/payment-attempts/attempt%2Fwith%20space`,
    );
    expect(request.request.method).toBe('GET');
    request.flush(attemptResponse());
  });

  it('cancels an attempt with an empty body and retry identity headers', () => {
    service.cancelAttempt('attempt-1', {
      idempotencyKey: 'cancel-key',
      correlationId: 'cancel-correlation',
    }).subscribe();

    const request = http.expectOne(`${environment.apiUrl}/payment-attempts/attempt-1/cancel`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    expect(request.request.headers.get('Idempotency-Key')).toBe('cancel-key');
    expect(request.request.headers.get('X-Correlation-ID')).toBe('cancel-correlation');
    request.flush({ ...attemptResponse(), status: 'CANCELLED' });
  });

  it('sends only reason and evidence to the management manual-confirm endpoint', () => {
    service.confirmManual(
      'attempt-1',
      { reason: 'Statement checked', evidenceReference: 'BANK-TRACE-001' },
      { idempotencyKey: 'confirm-key' },
    ).subscribe();

    const request = http.expectOne(
      `${environment.apiUrl}/management/payment-attempts/attempt-1/confirm-manual`,
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      reason: 'Statement checked',
      evidenceReference: 'BANK-TRACE-001',
    });
    expect(request.request.body.amount).toBeUndefined();
    expect(request.request.headers.get('Idempotency-Key')).toBe('confirm-key');
    request.flush({
      attemptId: 'attempt-1',
      transactionId: 'transaction-1',
      status: 'SUCCESS',
      amount: 300000,
      confirmedAt: '2026-07-31T12:05:00',
      replayed: false,
    });
  });

  function attemptResponse() {
    return {
      attemptId: 'attempt-1',
      reservationId: 42,
      purpose: 'DEPOSIT',
      status: 'PENDING_VERIFICATION',
      environment: 'SIMULATOR',
      expectedAmount: 300000,
      currency: 'VND',
      expiresAt: '2026-07-31T12:15:00',
      method: 'QR_TRANSFER',
      provider: 'BANK',
      receiver: {
        bankName: 'Test Bank',
        bankCode: 'TEST',
        accountName: 'Hotel Test',
        accountNumberMasked: '****6789',
        qrProvider: 'VIETQR',
        merchantReferenceMasked: null,
        instructionsVi: 'Chuyen khoan',
        instructionsEn: 'Transfer',
      },
      uniqueTransferContent: 'BOOKING-LS42',
      qrData: null,
      redirectUrl: null,
      replayed: false,
    };
  }
});
