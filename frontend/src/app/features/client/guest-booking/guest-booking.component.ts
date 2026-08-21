import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ClientApiService, ReservationSummary } from '../../../core/services/client-api.service';
import { PaymentService, PaymentSession } from '../../../core/services/payment.service';

@Component({
  selector: 'app-guest-booking',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './guest-booking.component.html',
  styleUrl: './guest-booking.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuestBookingComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ClientApiService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly paymentService = inject(PaymentService);

  booking: ReservationSummary | null = null;
  loading = true;
  error = '';
  cancelOpen = false;
  cancelling = false;
  cancelError = '';
  cancelReasonCode = 'CHANGE_OF_PLAN';
  cancelReason = '';
  recoveryEmail = '';
  recoveryPhone = '';
  recovering = false;
  recoveryRequired = false;
  paying = false;
  paymentError = '';
  emailSending = false;
  emailError = '';
  bookingCode = '';
  private accessKey = '';

  @HostListener('document:keydown.escape')
  closeCancellationWithEscape(): void {
    if (!this.cancelling && this.cancelOpen) {
      this.cancelOpen = false;
      this.cancelError = '';
      this.changeDetector.detectChanges();
    }
  }

  ngOnInit(): void {
    this.bookingCode = this.route.snapshot.paramMap.get('bookingCode')?.trim() || '';
    this.accessKey = sessionStorage.getItem(`hotel:booking:access:${this.bookingCode}`) || '';
    if (!this.bookingCode || !this.accessKey) {
      this.loading = false;
      this.recoveryRequired = Boolean(this.bookingCode);
      this.error = this.bookingCode ? '' : 'Mã booking không hợp lệ.';
      return;
    }
    this.api.getGuestBooking(this.bookingCode, this.accessKey).subscribe({
      next: booking => {
        this.booking = booking;
        this.loading = false;
        this.changeDetector.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.recoveryRequired = true;
        this.error = '';
        this.changeDetector.detectChanges();
      },
    });
  }

  recoverAccess(): void {
    if (this.recovering || !this.recoveryEmail.trim() || !this.recoveryPhone.trim()) return;
    this.recovering = true;
    this.error = '';
    this.api.recoverGuestBooking({
      bookingCode: this.bookingCode,
      email: this.recoveryEmail.trim(),
      phone: this.recoveryPhone.trim(),
    }).subscribe({
      next: booking => {
        const accessKey = booking.guestAccessKey || '';
        if (!accessKey) {
          this.recovering = false;
          this.error = 'Hệ thống chưa thể cấp lại quyền truy cập. Vui lòng liên hệ hỗ trợ.';
          this.changeDetector.detectChanges();
          return;
        }
        this.accessKey = accessKey;
        sessionStorage.setItem(`hotel:booking:access:${this.bookingCode}`, accessKey);
        this.booking = booking;
        this.recoveryRequired = false;
        this.recovering = false;
        this.changeDetector.detectChanges();
      },
      error: () => {
        this.recovering = false;
        this.error = 'Không tìm thấy booking khớp với email và số điện thoại đã nhập.';
        this.changeDetector.detectChanges();
      },
    });
  }

  submitCancellation(): void {
    if (this.cancelling || !this.booking?.canSelfCancel) return;
    if (this.cancelReasonCode === 'OTHER' && !this.cancelReason.trim()) {
      this.cancelError = 'Vui lòng nhập lý do hủy cụ thể.';
      return;
    }
    this.cancelling = true;
    this.cancelError = '';
    const requestKey = this.sharedRequestKey(`hotel:booking:cancel:${this.booking.id}`);
    this.api.cancelGuestBooking(this.bookingCode, this.accessKey, {
      reasonCode: this.cancelReasonCode,
      reason: this.cancelReason.trim() || undefined,
    }, requestKey).subscribe({
      next: booking => {
        this.booking = booking;
        this.cancelling = false;
        this.cancelOpen = false;
        localStorage.removeItem(`hotel:booking:cancel:${booking.id}`);
        this.changeDetector.detectChanges();
      },
      error: error => {
        this.cancelling = false;
        this.cancelError = error?.error?.message || 'Không thể hủy booking lúc này.';
        this.changeDetector.detectChanges();
      },
    });
  }

  resumePayment(): void {
    if (this.paying || this.booking?.status !== 'PENDING_PAYMENT' || !this.accessKey) return;
    this.paying = true;
    this.paymentError = '';
    this.paymentService.getActivePaymentSession(this.booking.id, this.accessKey).subscribe({
      next: session => this.redirectToPayment(session),
      error: error => {
        if (error?.status !== 404) {
          this.paymentFailed(error);
          return;
        }
        const storageKey = `hotel:payment:idempotency:${this.booking!.id}:DEPOSIT:VNPAY`;
        const requestKey = this.sharedRequestKey(storageKey);
        this.paymentService.createPaymentSession(this.booking!.id, 'VNPAY', requestKey, this.accessKey).subscribe({
          next: session => this.redirectToPayment(session),
          error: createError => this.paymentFailed(createError),
        });
      },
    });
  }

  resendConfirmationEmail(): void {
    if (this.emailSending || !this.booking || !this.accessKey) return;
    this.emailSending = true;
    this.emailError = '';
    this.api.resendGuestConfirmationEmail(this.bookingCode, this.accessKey).subscribe({
      next: booking => { this.booking = booking; this.emailSending = false; this.changeDetector.detectChanges(); },
      error: error => { this.emailSending = false; this.emailError = error?.error?.message || 'Không thể gửi lại email lúc này.'; this.changeDetector.detectChanges(); },
    });
  }

  private redirectToPayment(session: PaymentSession): void {
    if (!session.url) {
      this.paymentFailed({ error: { message: 'Cổng thanh toán chưa trả về đường dẫn hợp lệ.' } });
      return;
    }
    sessionStorage.setItem(`hotel:payment:access:${session.sessionId}`, this.accessKey);
    window.location.href = session.url;
  }

  private paymentFailed(error: any): void {
    this.paying = false;
    this.paymentError = error?.error?.message || 'Không thể tiếp tục thanh toán lúc này.';
    this.changeDetector.detectChanges();
  }

  private sharedRequestKey(storageKey: string): string {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { key?: string; expiresAt?: number };
        if (parsed.key && Number(parsed.expiresAt) > Date.now()) return parsed.key;
      } catch {
        // Replace malformed payment retry state.
      }
    }
    const key = globalThis.crypto?.randomUUID?.() || `payment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(storageKey, JSON.stringify({ key, expiresAt: Date.now() + 30 * 60 * 1000 }));
    return key;
  }

  formatVnd(value: number): string {
    return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value || 0)} ₫`;
  }

  statusLabel(status: string): string {
    return ({
      PENDING_PAYMENT: 'Chờ thanh toán', CONFIRMED: 'Đã xác nhận', CHECKED_IN: 'Đang lưu trú',
      CHECKED_OUT: 'Đã trả phòng', CANCELLED: 'Đã hủy', NO_SHOW: 'Không đến',
    } as Record<string, string>)[status] || status;
  }
}
