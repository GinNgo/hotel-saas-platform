import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '@app/core/services/auth';
import { ClientApiService, UserContext } from '@app/core/services/client-api.service';
import { ReservationService } from '@app/core/services/reservation.service';
import { UserService } from '@app/core/services/user';
import { EmailVerificationService } from '@app/core/services/email-verification.service';
import { PaymentService } from '@app/core/services/payment.service';
import { ProfileComponent } from './profile.component';

describe('ProfileComponent payment and refund states', () => {
  let component: ProfileComponent;
  let fixture: ComponentFixture<ProfileComponent>;
  let reservationService: { cancelMyReservation: ReturnType<typeof vi.fn> };
  let clientApi: { getProfile: ReturnType<typeof vi.fn>; getMyBookings: ReturnType<typeof vi.fn>; submitReview: ReturnType<typeof vi.fn>; resendConfirmationEmail: ReturnType<typeof vi.fn> };
  let paymentService: { getActivePaymentSession: ReturnType<typeof vi.fn>; createPaymentSession: ReturnType<typeof vi.fn> };

  const user: UserContext = {
    id: 7,
    username: 'customer',
    email: 'customer@example.test',
    fullName: 'Customer Test',
    roles: ['CUSTOMER'],
  };

  beforeEach(async () => {
    reservationService = { cancelMyReservation: vi.fn(() => of({ id: 42, status: 'CANCELLED', refunds: [] })) };
    clientApi = { getProfile: vi.fn(() => of(user)), getMyBookings: vi.fn(() => of([])), submitReview: vi.fn(() => of({ id: 'review-1', score: 9, title: 'Great', comment: 'A verified comfortable stay', createdAt: '2026-08-18' })), resendConfirmationEmail: vi.fn() };
    paymentService = { getActivePaymentSession: vi.fn(() => of({ sessionId: 'session-1', url: '' })), createPaymentSession: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [ProfileComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { data: {} }, queryParams: of({}) } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: AuthService, useValue: { updateCurrentUser: vi.fn(), logout: vi.fn() } },
        { provide: ClientApiService, useValue: clientApi },
        { provide: UserService, useValue: { updateProfile: vi.fn(() => of(user)), uploadAvatar: vi.fn() } },
        { provide: EmailVerificationService, useValue: { requestEmailChange: vi.fn(), resend: vi.fn() } },
        { provide: ReservationService, useValue: reservationService },
        { provide: PaymentService, useValue: paymentService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('labels payment states and reconciliation without relying on color alone', () => {
    expect(component.getPaymentLabel({
      provider: 'VNPAY', amount: 200000, currency: 'VND', status: 'PENDING', reconciliationRequired: false,
    })).toBe('Ch\u1edd nh\u00e0 cung c\u1ea5p x\u00e1c nh\u1eadn');
    expect(component.getPaymentLabel({
      provider: 'VNPAY', amount: 200000, currency: 'VND', status: 'SUCCEEDED', reconciliationRequired: true,
    })).toBe('C\u1ea7n \u0111\u1ed1i so\u00e1t');
    expect(component.getPaymentDescription({
      provider: 'VNPAY', amount: 200000, currency: 'VND', status: 'FAILED', reconciliationRequired: false,
    })).toContain('ch\u01b0a th\u00e0nh c\u00f4ng');
  });

  it('distinguishes requested, provider-pending, succeeded and failed refunds', () => {
    expect(component.getRefundLabel({
      publicId: 'r1', amount: 100000, currency: 'VND', provider: 'MOMO', status: 'REQUESTED', requestedAt: '2026-07-30',
    })).toBe('\u0110\u00e3 t\u1ea1o y\u00eau c\u1ea7u');
    expect(component.getRefundTone({
      publicId: 'r2', amount: 100000, currency: 'VND', provider: 'MOMO', status: 'PENDING_PROVIDER', requestedAt: '2026-07-30',
    })).toBe('warning');
    expect(component.getRefundLabel({
      publicId: 'r3', amount: 100000, currency: 'VND', provider: 'MOMO', status: 'SUCCEEDED', requestedAt: '2026-07-30',
    })).toBe('\u0110\u00e3 ho\u00e0n ti\u1ec1n');
    expect(component.getRefundLabel({
      publicId: 'r4', amount: 100000, currency: 'VND', provider: 'MOMO', status: 'FAILED', requestedAt: '2026-07-30',
    })).toBe('Ho\u00e0n ti\u1ec1n th\u1ea5t b\u1ea1i');
  });

  it('opens a reason form instead of cancelling immediately', () => {
    component.cancelBooking(42);

    expect(component.cancellationBookingId).toBe(42);
    expect(component.cancellationForm.controls.reasonCode.value).toBe('');
    expect(reservationService.cancelMyReservation).not.toHaveBeenCalled();
  });

  it('closes the active trip dialog with Escape semantics', () => {
    component.cancelBooking(42);
    component.closeOpenDialog();
    expect(component.cancellationBookingId).toBeNull();

    component.openReview({
      id: 43, checkInDate: '2026-08-01', checkOutDate: '2026-08-02', guests: 2,
      totalAmount: 100, status: 'CHECKED_OUT', paymentMethod: 'CASH',
    });
    component.closeOpenDialog();
    expect(component.reviewBookingId).toBeNull();
  });

  it('offers and submits a review only for a checked-out stay', () => {
    const booking = { id: 'stay-1', checkInDate: '2026-08-01', checkOutDate: '2026-08-02', guests: 2, totalAmount: 100, status: 'CHECKED_OUT', paymentMethod: 'CASH' };
    component.bookings = [booking];
    component.openReview(booking);
    component.reviewForm.patchValue({ comment: 'A verified comfortable stay' });
    component.submitReview();

    expect(clientApi.submitReview).toHaveBeenCalledWith('stay-1', expect.objectContaining({ score: 9, comment: 'A verified comfortable stay' }));
    expect(component.bookings[0].review?.score).toBe(9);
    expect(component.reviewBookingId).toBeNull();
  });

  it('resends a failed booking confirmation and replaces its delivery state', () => {
    const booking = { id: 'email-1', checkInDate: '2026-08-01', checkOutDate: '2026-08-02', guests: 2, totalAmount: 100,
      status: 'CONFIRMED', paymentMethod: 'CASH', confirmationEmailStatus: 'FAILED' as const };
    component.bookings = [booking];
    clientApi.resendConfirmationEmail.mockReturnValue(of({ ...booking, confirmationEmailStatus: 'SENT', confirmationEmailSent: true }));

    component.resendBookingConfirmation(booking);

    expect(clientApi.resendConfirmationEmail).toHaveBeenCalledWith('email-1');
    expect(component.bookings[0].confirmationEmailStatus).toBe('SENT');
  });

  it('recovers an active VNPay session for a pending authenticated booking', () => {
    const booking = {
      id: 'pending-1', checkInDate: '2026-09-01', checkOutDate: '2026-09-02', guests: 2,
      totalAmount: 1000000, status: 'PENDING_PAYMENT', paymentMethod: 'VNPAY',
    };

    component.resumePayment(booking);

    expect(paymentService.getActivePaymentSession).toHaveBeenCalledWith('pending-1');
    expect(paymentService.createPaymentSession).not.toHaveBeenCalled();
    expect(component.paymentActionErrors['pending-1']).toContain('đường dẫn hợp lệ');
  });

});
