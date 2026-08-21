import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { InvoiceService } from './invoice.service';

describe('InvoiceService finalized invoice operations', () => {
  let service: InvoiceService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(InvoiceService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads invoices scoped to the authenticated customer', () => {
    service.getMyInvoices().subscribe();

    const request = http.expectOne(`${environment.apiUrl}/invoices/finalized/my`);
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('loads finalized invoices for authorized property staff', () => {
    service.getFinalizedInvoices().subscribe();

    const request = http.expectOne(`${environment.apiUrl}/management/invoices/finalized`);
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('loads the immutable invoice detail by id', () => {
    service.getInvoice(88).subscribe();

    const request = http.expectOne(`${environment.apiUrl}/invoices/88`);
    expect(request.request.method).toBe('GET');
    request.flush({});
  });

  it('loads the finalized invoice by reservation without using legacy generation', () => {
    service.getInvoiceByReservation(42).subscribe();

    const request = http.expectOne(`${environment.apiUrl}/management/reservations/42/invoice`);
    expect(request.request.method).toBe('GET');
    request.flush({});
  });

  it('downloads the finalized PDF as a response blob', () => {
    service.downloadPdf(88).subscribe((response) => {
      expect(response.body?.type).toBe('application/pdf');
    });

    const request = http.expectOne(`${environment.apiUrl}/invoices/88/pdf`);
    expect(request.request.method).toBe('GET');
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['%PDF-1.4'], { type: 'application/pdf' }));
  });

  it('requests email delivery without a caller-selected recipient', () => {
    service.emailInvoice(88).subscribe();

    const request = http.expectOne(`${environment.apiUrl}/invoices/88/email`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    request.flush({
      invoiceId: 88,
      invoiceNumber: 'INV-88',
      recipient: 'verified@example.com',
      sent: true,
      contentSha256: 'abc123',
      correlationId: null,
    });
  });
});
