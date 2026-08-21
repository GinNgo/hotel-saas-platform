import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EmailOutboxComponent } from './email-outbox.component';
import { environment } from '../../../../environments/environment';

describe('EmailOutboxComponent', () => {
  let fixture: ComponentFixture<EmailOutboxComponent>;
  let component: EmailOutboxComponent;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmailOutboxComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(EmailOutboxComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/admin/email-outbox/failures?page=0&size=25`).flush({
      content: [{ id: 4, templateKey: 'invoice', templateVersion: 'v1', maskedRecipient: 'g***@example.com', status: 'DEAD_LETTER', attemptCount: 5, maxAttempts: 5, manualRetryCount: 0, lastErrorCode: 'DELIVERY_DISABLED', subject: 'Invoice', failedAt: '2026-08-04T10:00:00Z', createdAt: '2026-08-04T10:00:00Z' }],
      totalElements: 1, totalPages: 1, number: 0, size: 25,
    });
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('renders a masked recipient and terminal error state', () => {
    expect(component.failures.length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('g***@example.com');
    expect(fixture.nativeElement.textContent).toContain('DELIVERY_DISABLED');
  });

  it('loads attempt history only when the row is expanded', () => {
    component.toggleAttempts(component.failures[0]);
    http.expectOne(`${environment.apiUrl}/admin/email-outbox/4/attempts`).flush([
      { id: 1, attemptNumber: 5, outcome: 'FAILED', errorCode: 'DELIVERY_DISABLED', providerMessageId: null, durationMs: 0, attemptedAt: '2026-08-04T10:00:00Z' },
    ]);
    expect(component.attemptsById.get(4)?.[0].attemptNumber).toBe(5);
  });
});
