import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EmailOutboxService } from './email-outbox.service';
import { environment } from '../../../environments/environment';

describe('EmailOutboxService', () => {
  let service: EmailOutboxService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [EmailOutboxService, provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(EmailOutboxService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads failure pages with bounded pagination', () => {
    service.failures(2, 50).subscribe(response => expect(response.totalElements).toBe(1));
    const request = http.expectOne(`${environment.apiUrl}/admin/email-outbox/failures?page=2&size=50`);
    expect(request.request.method).toBe('GET');
    request.flush({ content: [{ id: 1 }], totalElements: 1, totalPages: 1, number: 2, size: 50 });
  });

  it('posts an explicit manual retry command', () => {
    service.retry(7).subscribe(response => expect(response.status).toBe('PENDING'));
    const request = http.expectOne(`${environment.apiUrl}/admin/email-outbox/7/retry`);
    expect(request.request.method).toBe('POST');
    request.flush({ id: 7, status: 'PENDING' });
  });
});
