import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ClientApiService } from '../../../core/services/client-api.service';
import { PaymentService } from '../../../core/services/payment.service';
import { GuestBookingComponent } from './guest-booking.component';

describe('GuestBookingComponent', () => {
  let fixture: ComponentFixture<GuestBookingComponent>;
  const getGuestBooking = vi.fn();
  const cancelGuestBooking = vi.fn();
  const recoverGuestBooking = vi.fn();
  const resendGuestConfirmationEmail = vi.fn();
  const getActivePaymentSession = vi.fn();
  const createPaymentSession = vi.fn();
  const bookingCode = 'LXS-20260819-GUEST12345';

  beforeEach(async () => {
    sessionStorage.clear();
    getGuestBooking.mockReset();
    cancelGuestBooking.mockReset();
    recoverGuestBooking.mockReset();
    resendGuestConfirmationEmail.mockReset();
    getActivePaymentSession.mockReset();
    createPaymentSession.mockReset();
    const booking = {
      id: 'reservation-guid', bookingCode, checkInDate: '2026-09-01', checkOutDate: '2026-09-03',
      guests: 2, adults: 2, children: 0, quantity: 1, totalAmount: 2400000,
      status: 'CONFIRMED', paymentMethod: 'VNPAY', canSelfCancel: true,
      confirmationEmailStatus: 'NOT_CONFIGURED', confirmationEmailRecipient: 'guest@example.com',
      property: { name: 'Luxe Bay', address: 'Da Nang' },
    };
    getGuestBooking.mockReturnValue(of(booking));
    cancelGuestBooking.mockReturnValue(of({ ...booking, status: 'CANCELLED', canSelfCancel: false }));
    recoverGuestBooking.mockReturnValue(of({ ...booking, guestAccessKey: 'recovered-access-key' }));
    resendGuestConfirmationEmail.mockReturnValue(of({ ...booking, confirmationEmailStatus: 'SENT', confirmationEmailSent: true }));
    getActivePaymentSession.mockReturnValue(throwError(() => ({ status: 404 })));
    createPaymentSession.mockReturnValue(of({ sessionId: 'session-1', url: '' }));
    await TestBed.configureTestingModule({
      imports: [GuestBookingComponent],
      providers: [
        { provide: ClientApiService, useValue: { getGuestBooking, cancelGuestBooking, recoverGuestBooking, resendGuestConfirmationEmail } },
        { provide: PaymentService, useValue: { getActivePaymentSession, createPaymentSession } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ bookingCode }) } } },
      ],
    }).compileComponents();
  });

  it('loads and displays a booking only with the capability stored for its code', () => {
    sessionStorage.setItem(`hotel:booking:access:${bookingCode}`, 'guest-access-key');
    fixture = TestBed.createComponent(GuestBookingComponent);
    fixture.detectChanges();

    expect(getGuestBooking).toHaveBeenCalledWith(bookingCode, 'guest-access-key');
    expect(fixture.nativeElement.textContent).toContain(bookingCode);
    expect(fixture.nativeElement.textContent).toContain('Luxe Bay');
    expect(fixture.nativeElement.textContent).toContain('Email xác nhận chưa được gửi');
    expect(fixture.nativeElement.textContent).not.toContain('reservation-guid');
  });

  it('shows recovery when the browser no longer has the booking capability', () => {
    fixture = TestBed.createComponent(GuestBookingComponent);
    fixture.detectChanges();

    expect(getGuestBooking).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Nhận lại quyền truy cập booking');
  });

  it('recovers, stores, and displays a booking with matching contact details', () => {
    fixture = TestBed.createComponent(GuestBookingComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.recoveryEmail = 'guest@example.com';
    component.recoveryPhone = '0901234567';
    component.recoverAccess();
    fixture.detectChanges();

    expect(recoverGuestBooking).toHaveBeenCalledWith({
      bookingCode, email: 'guest@example.com', phone: '0901234567',
    });
    expect(sessionStorage.getItem(`hotel:booking:access:${bookingCode}`)).toBe('recovered-access-key');
    expect(fixture.nativeElement.textContent).toContain('Luxe Bay');
  });

  it('cancels an eligible booking with the same capability', () => {
    sessionStorage.setItem(`hotel:booking:access:${bookingCode}`, 'guest-access-key');
    fixture = TestBed.createComponent(GuestBookingComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.cancelOpen = true;
    component.cancelReasonCode = 'CHANGE_OF_PLAN';
    component.submitCancellation();
    fixture.detectChanges();

    expect(cancelGuestBooking).toHaveBeenCalledWith(
      bookingCode, 'guest-access-key', { reasonCode: 'CHANGE_OF_PLAN', reason: undefined }, expect.any(String),
    );
    expect(component.booking?.status).toBe('CANCELLED');
    expect(component.cancelOpen).toBe(false);
  });

  it('resends confirmation email with the guest capability and reflects SENT state', () => {
    sessionStorage.setItem(`hotel:booking:access:${bookingCode}`, 'guest-access-key');
    fixture = TestBed.createComponent(GuestBookingComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.resendConfirmationEmail();
    fixture.detectChanges();

    expect(resendGuestConfirmationEmail).toHaveBeenCalledWith(bookingCode, 'guest-access-key');
    expect(component.booking?.confirmationEmailStatus).toBe('SENT');
  });

  it('creates a payment session only when no active session can be recovered', () => {
    getGuestBooking.mockReturnValue(of({
      id: 'reservation-guid', bookingCode, checkInDate: '2026-09-01', checkOutDate: '2026-09-03',
      guests: 2, totalAmount: 2400000, status: 'PENDING_PAYMENT', paymentMethod: 'VNPAY',
    }));
    sessionStorage.setItem(`hotel:booking:access:${bookingCode}`, 'guest-access-key');
    fixture = TestBed.createComponent(GuestBookingComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.resumePayment();
    fixture.detectChanges();

    expect(getActivePaymentSession).toHaveBeenCalledWith('reservation-guid', 'guest-access-key');
    expect(createPaymentSession).toHaveBeenCalledWith(
      'reservation-guid', 'VNPAY', expect.any(String), 'guest-access-key',
    );
    expect(component.paymentError).toContain('đường dẫn hợp lệ');
  });
});
