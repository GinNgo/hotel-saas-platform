import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { PaymentService, PaymentSessionStatus } from '../../../core/services/payment.service';
import { PaymentResultComponent } from './payment-result';

describe('PaymentResult', () => {
  let component: PaymentResultComponent;
  let fixture: ComponentFixture<PaymentResultComponent>;

  const succeeded: PaymentSessionStatus = {
    sessionId: 'session-1',
    reservationId: 42,
    bookingCode: 'LXS-20260819-ABC1234567',
    provider: 'VNPAY',
    amount: 350000,
    currency: 'VND',
    status: 'SUCCEEDED',
    expiresAt: '2026-07-29T12:00:00',
    reconciliationRequired: false,
    confirmationEmailStatus: 'NOT_CONFIGURED',
    confirmationEmailRecipient: 'guest@example.com',
    confirmationEmailSent: false,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaymentResultComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { queryParams: of({}) } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: PaymentService, useValue: { getPaymentSessionStatus: vi.fn(() => of(succeeded)) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PaymentResultComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('shows success only after the authenticated server session succeeds', () => {
    applyStatus(succeeded);
    fixture.detectChanges();

    expect(component.status).toBe('SUCCESS');
    expect(component.reservationId).toBe(42);
    expect(component.bookingReference).toBe('LXS-20260819-ABC1234567');
    expect(component.message).toContain('đã xác nhận giao dịch');
    expect(component.confirmationEmailStatus).toBe('NOT_CONFIGURED');
    expect(component.confirmationEmailRecipient).toBe('guest@example.com');
  });

  it('copies the customer-facing booking code instead of the reservation id', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    applyStatus(succeeded);

    await component.copyReservationReference();

    expect(writeText).toHaveBeenCalledWith('LXS-20260819-ABC1234567');
  });

  it('keeps browser return pending while the authoritative callback has not arrived', () => {
    applyStatus({ ...succeeded, status: 'PENDING' });
    fixture.detectChanges();

    expect(component.status).toBe('PENDING');
    expect(component.message).toContain('máy chủ xác nhận giao dịch');
  });

  it('exposes live status semantics to assistive technology', () => {
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.payment-result-card')?.getAttribute('aria-busy')).toBe('false');
    expect(fixture.nativeElement.querySelector('.payment-message')?.getAttribute('role')).toBe('status');
  });

  it('shows a reconciliation state instead of reviving an expired reservation', () => {
    applyStatus({ ...succeeded, reconciliationRequired: true });
    fixture.detectChanges();

    expect(component.status).toBe('RECONCILIATION');
    expect(component.message).toContain('đối soát');
  });

  function applyStatus(status: PaymentSessionStatus): void {
    (component as unknown as { applySessionStatus: (value: PaymentSessionStatus) => void })
      .applySessionStatus(status);
  }
});
