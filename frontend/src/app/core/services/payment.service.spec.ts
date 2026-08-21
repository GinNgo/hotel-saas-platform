import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { PaymentService } from './payment.service';

describe('PaymentService', () => {
  let service: PaymentService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PaymentService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends separate idempotency and booking access keys when creating a session', () => {
    const reservationId = '6b31ee33-9f48-4f75-8e7d-b9f77d2de430';
    service.createPaymentSession(reservationId, 'VNPAY', 'payment-key', 'booking-key').subscribe();

    const request = http.expectOne(`${environment.apiUrl}/payments/sessions`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ reservationId, provider: 'VNPAY' });
    expect(request.request.headers.get('Idempotency-Key')).toBe('payment-key');
    expect(request.request.headers.get('Booking-Access-Key')).toBe('booking-key');
    request.flush({});
  });

  it('uses the booking access key when reading authoritative session status', () => {
    service.getPaymentSessionStatus('session/id', 'booking-key').subscribe();

    const request = http.expectOne(`${environment.apiUrl}/payments/sessions/session%2Fid`);
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Booking-Access-Key')).toBe('booking-key');
    request.flush({});
  });
});
