import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PublicI18nService } from '../../../core/i18n/public-i18n.service';
import { BookingHold, ClientApiService, PromotionQuote, PublicPlacementDisclosure, ReservationRequest } from '../../../core/services/client-api.service';
import {
  PropertyPaymentConfigurationService,
  PropertyPaymentMethodCode,
  PublicPropertyPaymentOption,
} from '../../../core/services/property-payment-configuration.service';
import {
  PropertyPaymentAttempt,
  PropertyPaymentService,
} from '../../../core/services/property-payment.service';
import { PropertyPaymentPanelComponent } from './property-payment-panel.component';
import { AsyncActionCoordinatorService } from '../../../core/services/async-action-coordinator.service';
import { PaymentService } from '../../../core/services/payment.service';

@Component({
  selector: 'app-booking-checkout',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, PropertyPaymentPanelComponent],
  templateUrl: './booking-checkout.component.html',
  styleUrls: ['./booking-checkout.component.css']
})
export class BookingCheckoutComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private clientApi = inject(ClientApiService);
  private propertyPaymentService = inject(PropertyPaymentService);
  private paymentConfiguration = inject(PropertyPaymentConfigurationService);
  private paymentService = inject(PaymentService);
  private changeDetector = inject(ChangeDetectorRef);
  private actionCoordinator = inject(AsyncActionCoordinatorService);
  readonly i18n = inject(PublicI18nService);

  roomTypeId: string | number = '';
  roomTypeName = '';
  nightlyPrice = 0;
  serverEstimate = 0;
  hotelId: string | number = '';
  
  bookingData: ReservationRequest = {
    roomTypeId: 0,
    checkInDate: '',
    checkOutDate: '',
    guests: 2,
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    paymentMethod: 'PAY_AT_HOTEL'
    ,quantity: 1
    ,adults: 2
    ,children: 0
    ,specialRequests: ''
  };

  isSubmitting = false;
  bookingSuccess = false;
  errorMessage = '';
  contextError = '';
  reservationDetails: any = null;
  paymentAttempt: PropertyPaymentAttempt | null = null;
  paymentOptions: PublicPropertyPaymentOption[] = [
    { code: 'PAY_AT_HOTEL', provider: 'CASH', requiresPrepayment: false },
  ];
  paymentOptionsLoading = false;
  paymentOptionsError = '';
  quote: PromotionQuote | null = null;
  quoteLoading = false;
  quoteError = '';
  holdLoading = false;
  holdError = '';
  bookingHold: BookingHold | null = null;
  sponsoredPlacement: PublicPlacementDisclosure | null = null;
  private quoteRequestIdentity = '';
  private paymentOptionsRequestVersion = 0;
  private paymentIdempotencyKey = '';
  private paymentRequestIdentity = '';
  private paymentIdempotencyStorageKey = '';
  private reservedPaymentMethod = '';
  private bookingIdempotencyKey = '';
  private bookingAccessKey = '';
  private bookingRequestIdentity = '';
  private bookingHoldStorageKey = '';
  private bookingHoldIdentity = '';
  private quoteTimer: ReturnType<typeof setInterval> | null = null;
  remainingQuoteSeconds = 0;

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const id = params.get('roomTypeId');
      if (id) {
        this.roomTypeId = /^\d+$/.test(id) ? Number(id) : id;
        this.bookingData.roomTypeId = this.roomTypeId;
        this.validateBookingContext();
        this.loadQuote();
      }
    });

    this.route.queryParams.subscribe((params) => {
      // Accept both the checkout shorthand and the public-search date names so deep links preserve the stay.
      if (params['checkIn'] || params['checkInDate']) this.bookingData.checkInDate = params['checkIn'] || params['checkInDate'];
      if (params['checkOut'] || params['checkOutDate']) this.bookingData.checkOutDate = params['checkOut'] || params['checkOutDate'];
      if (params['guests']) this.bookingData.guests = Number(params['guests']) || this.bookingData.guests;
      this.bookingData.adults = Number(params['adultCount']) || this.bookingData.guests;
      this.bookingData.children = Number(params['childCount']) || 0;
      this.bookingData.quantity = Math.max(1, Number(params['quantity']) || Number(params['roomCount']) || 1);
      this.bookingData.guests = (this.bookingData.adults || 0) + (this.bookingData.children || 0);
      this.roomTypeName = params['roomTypeName'] || '';
      this.nightlyPrice = Number(params['nightlyPrice']) || 0;
      this.serverEstimate = Number(params['estimatedTotal']) || 0;
      const rawHotelId = String(params['hotelId'] || '').trim();
      this.hotelId = /^\d+$/.test(rawHotelId) ? Number(rawHotelId) : rawHotelId;
      this.loadPlacementDisclosure();
      this.loadPaymentOptions();
      this.bookingData.couponCode = params['couponCode'] || undefined;
      this.validateBookingContext();
      this.loadQuote();
    });

    this.prefillUserInfo();
  }

  submitBooking(): void {
    if (this.isSubmitting || !this.bookingContextValid) return;
    this.errorMessage = '';
    if (this.paymentOptionsLoading || this.paymentOptions.length === 0) {
      this.errorMessage = this.paymentOptionsError || 'Khách sạn chưa có phương thức thanh toán khả dụng.';
      return;
    }
    if (this.isQuoteExpired) {
      this.errorMessage = this.i18n.text('PUBLIC.BOOKING.QUOTE_REQUIRED');
      this.refreshQuote();
      return;
    }
    if (this.quoteLoading || !this.quote) {
      this.errorMessage = this.quoteError || this.i18n.text('PUBLIC.BOOKING.QUOTE_REQUIRED');
      if (!this.quoteLoading) this.loadQuote();
      return;
    }
    if (this.holdRequired && (this.holdLoading || !this.bookingHold)) {
      this.errorMessage = this.holdError || 'Chưa thể giữ phòng. Vui lòng thử lại.';
      if (!this.holdLoading) this.ensureBookingHold();
      return;
    }
    if (this.reservationDetails?.id && !this.paymentAttempt) {
      this.isSubmitting = true;
      this.createPaymentAttempt(this.reservationDetails.id);
      return;
    }
    if (this.bookingData.checkOutDate <= this.bookingData.checkInDate) {
      this.errorMessage = this.i18n.text('PUBLIC.BOOKING.ERROR_CHECKOUT_AFTER_CHECKIN');
      return;
    }
    if (this.bookingData.guests < 1) {
      this.errorMessage = this.i18n.text('PUBLIC.BOOKING.ERROR_GUEST_COUNT');
      return;
    }
    if (!this.bookingData.quantity || this.bookingData.quantity < 1) {
      this.errorMessage = this.i18n.text('PUBLIC.BOOKING.ERROR_ROOM_COUNT');
      return;
    }

    this.isSubmitting = true;
    const bookingKey = this.getBookingIdempotencyKey();
    this.actionCoordinator.run('booking:create', () => this.clientApi.bookRoom(this.bookingData, bookingKey)).subscribe({
      next: (res) => {
        this.reservationDetails = res;
        if (this.bookingHoldStorageKey) sessionStorage.removeItem(this.bookingHoldStorageKey);
        this.bookingHold = null;
        this.bookingAccessKey = res.guestAccessKey || this.bookingIdempotencyKey;
        if (res.bookingCode) sessionStorage.setItem(`hotel:booking:access:${res.bookingCode}`, this.bookingAccessKey);
        this.reservedPaymentMethod = this.bookingData.paymentMethod;
        
        if (this.bookingData.paymentMethod !== 'PAY_AT_HOTEL') {
          this.createPaymentAttempt(res.id);
        } else {
          // Pay at hotel: finish immediately
          this.isSubmitting = false;
          this.bookingSuccess = true;
          this.changeDetector.markForCheck();
        }
      },
      error: (err) => {
        console.error('Error submitting booking', err);
        this.isSubmitting = false;
        if (err?.error?.message) {
          this.errorMessage = err.error.message;
          this.changeDetector.markForCheck();
          return;
        }
        if (err?.status === 409) {
          this.errorMessage = this.i18n.text('PUBLIC.BOOKING.ERROR_ROOM_SOLD_OUT');
          this.changeDetector.markForCheck();
          return;
        }
        this.errorMessage = this.i18n.text('PUBLIC.BOOKING.ERROR_BOOKING_GENERIC');
        this.changeDetector.markForCheck();
      }
    });
  }

  get nights(): number {
    if (!this.bookingData.checkInDate || !this.bookingData.checkOutDate) return 0;
    return Math.max(1, Math.round((new Date(this.bookingData.checkOutDate).getTime() - new Date(this.bookingData.checkInDate).getTime()) / 86400000));
  }

  get guestSummary(): string {
    const adults = this.i18n.count('PUBLIC.GUESTS.ADULT_COUNT', this.bookingData.adults || 0);
    const children = this.bookingData.children
      ? `, ${this.i18n.count('PUBLIC.GUESTS.CHILD_COUNT', this.bookingData.children)}`
      : '';
    return `${adults}${children}`;
  }

  get estimatedTotal(): number {
    return this.quote?.finalTotal ?? 0;
  }

  get isQuoteExpired(): boolean {
    return !!this.quote && this.remainingQuoteSeconds <= 0;
  }

  get holdRequired(): boolean {
    return this.isGuid(this.hotelId) && this.isGuid(this.roomTypeId);
  }

  get countdownLabel(): string {
    const minutes = Math.floor(this.remainingQuoteSeconds / 60);
    const seconds = this.remainingQuoteSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  get promotionNames(): string {
    return (this.quote?.appliedPromotions ?? [])
      .map(promotion => this.i18n.dateLocale() === 'en-US'
        ? (promotion.nameEn || promotion.nameVi)
        : promotion.nameVi)
      .join(', ');
  }

  get memberTierLabel(): string {
    const benefit = this.quote?.memberBenefit;
    if (!benefit?.eligible) return '';
    return this.i18n.dateLocale() === 'en-US'
      ? (benefit.tierNameEn || benefit.tierNameVi || '')
      : (benefit.tierNameVi || benefit.tierNameEn || '');
  }

  get sponsoredDisclosure(): string {
    const placement = this.sponsoredPlacement;
    return placement ? (this.i18n.dateLocale() === 'en-US' ? placement.disclosureEn : placement.disclosureVi) : '';
  }

  formatVnd(value: number): string {
    const locale = this.i18n.dateLocale();
    const currencyLabel = locale === 'en-US' ? 'VND' : '₫';
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value || 0)} ${currencyLabel}`;
  }

  goHome() {
    this.releaseCurrentHold(() => this.router.navigate(['/']));
  }

  goToProfileBookings() {
    const bookingCode = this.reservationDetails?.bookingCode;
    if (bookingCode && sessionStorage.getItem(`hotel:booking:access:${bookingCode}`)) {
      this.router.navigate(['/booking/manage', bookingCode]);
      return;
    }
    this.router.navigate(['/profile'], { queryParams: { tab: 'bookings' } });
  }

  goToSearch(): void {
    this.releaseCurrentHold(() => this.router.navigate(['/search']));
  }

  paymentMethodLabel(code: string): string {
    return ({
      PAY_AT_HOTEL: 'Thanh toán tại khách sạn',
      VNPAY: 'VNPAY',
      MANUAL_TRANSFER: 'Chuyển khoản ngân hàng',
      QR_TRANSFER: 'Quét mã chuyển khoản',
      MOMO: 'Ví MoMo',
      ZALOPAY: 'ZaloPay',
      CARD_TERMINAL: 'Thẻ tại quầy',
      OTHER: 'Phương thức khác',
    } as Record<string, string>)[code] || code;
  }

  paymentMethodHelp(option: PublicPropertyPaymentOption): string {
    if (option.code === 'PAY_AT_HOTEL') return this.i18n.text('PUBLIC.BOOKING.PAY_AT_HOTEL_HELP');
    if (option.code === 'VNPAY') return this.i18n.text('PUBLIC.BOOKING.VNPAY_HELP');
    return option.requiresPrepayment
      ? 'Thanh toán trước để xác nhận đặt phòng.'
      : 'Thanh toán theo hướng dẫn của khách sạn.';
  }

  retryPaymentOptions(): void {
    if (!this.isGuid(this.hotelId) || this.paymentOptionsLoading) return;
    this.loadPaymentOptions();
  }

  refreshQuote(): void {
    this.quoteRequestIdentity = '';
    this.bookingHold = null;
    this.holdError = '';
    this.loadQuote();
  }

  onPaymentAttemptChange(attempt: PropertyPaymentAttempt): void {
    this.paymentAttempt = attempt;
  }

  retryPaymentAttempt(): void {
    const reservationId = this.reservationDetails?.id as string | number | undefined;
    if (this.isSubmitting || reservationId == null || !this.hasValidIdentifier(reservationId)) return;

    this.errorMessage = '';
    this.isSubmitting = true;
    this.bookingData.holdToken = this.bookingHold?.holdToken;
    if (this.paymentIdempotencyStorageKey) localStorage.removeItem(this.paymentIdempotencyStorageKey);
    this.paymentRequestIdentity = '';
    this.paymentIdempotencyKey = '';
    this.createPaymentAttempt(reservationId);
  }

  get bookingContextValid(): boolean {
    return !this.contextError;
  }

  private validateBookingContext(): void {
    const validRoom = this.hasValidIdentifier(this.roomTypeId);
    const validHotel = this.hasValidIdentifier(this.hotelId);
    const validDates = !!this.bookingData.checkInDate && !!this.bookingData.checkOutDate
      && this.bookingData.checkOutDate > this.bookingData.checkInDate;
    const validName = !!this.roomTypeName.trim();

    this.contextError = validRoom && validHotel && validDates && validName
      ? ''
      : this.i18n.text('PUBLIC.BOOKING.ERROR_INVALID_CONTEXT');
  }

  private loadPlacementDisclosure(): void {
    if (!this.hasValidIdentifier(this.hotelId)) {
      this.sponsoredPlacement = null;
      return;
    }
    this.clientApi.getHotelById(this.hotelId).subscribe({
      next: hotel => {
        this.sponsoredPlacement = hotel.sponsoredPlacement ?? null;
        this.changeDetector.markForCheck();
      },
      error: () => {
        this.sponsoredPlacement = null;
        this.changeDetector.markForCheck();
      },
    });
  }

  private hasValidIdentifier(value: string | number): boolean {
    return typeof value === 'number' ? Number.isInteger(value) && value > 0 : value.trim().length > 0;
  }

  private loadQuote(): void {
    this.validateBookingContext();
    if (!this.bookingContextValid) return;
    const identity = [
      this.hotelId,
      this.roomTypeId,
      this.bookingData.checkInDate,
      this.bookingData.checkOutDate,
      this.bookingData.quantity,
      this.bookingData.adults,
      this.bookingData.children,
      this.bookingData.couponCode || '',
    ].join(':');
    if (identity === this.quoteRequestIdentity && (this.quote || this.quoteLoading)) return;
    this.quoteRequestIdentity = identity;
    this.quote = null;
    this.quoteError = '';
    this.quoteLoading = true;
    this.clientApi.getPromotionQuote({
      propertyId: this.hotelId,
      roomTypeId: this.roomTypeId,
      checkInDate: this.bookingData.checkInDate,
      checkOutDate: this.bookingData.checkOutDate,
      quantity: this.bookingData.quantity || 1,
      adultCount: this.bookingData.adults || 1,
      childCount: this.bookingData.children || 0,
      couponCode: this.bookingData.couponCode,
    }).subscribe({
      next: (quote) => {
        this.quote = quote;
        this.serverEstimate = quote.finalTotal;
        this.quoteLoading = false;
        this.ensureBookingHold();
        this.changeDetector.markForCheck();
      },
      error: (error) => {
        this.quoteLoading = false;
        this.quoteError = error?.error?.message || this.i18n.text('PUBLIC.BOOKING.QUOTE_ERROR');
        this.changeDetector.markForCheck();
      },
    });
  }

  private prefillUserInfo() {
    const userStr = localStorage.getItem('user');
    if (!userStr) return;

    try {
      const user = JSON.parse(userStr);
      const displayName = user.fullName || user.username || '';
      const parts = displayName.trim().split(' ').filter(Boolean);
      this.bookingData.firstName = parts.length > 1 ? parts.pop() || '' : displayName;
      this.bookingData.lastName = parts.join(' ');
      this.bookingData.email = user.email || '';
    } catch {
      return;
    }
  }

  private ensureBookingHold(): void {
    if (!this.quote || !this.holdRequired) {
      if (this.quote) this.startQuoteCountdown(this.quote.expiresAt);
      return;
    }
    const identity = [this.hotelId, this.roomTypeId, this.bookingData.checkInDate,
      this.bookingData.checkOutDate, this.bookingData.quantity,
      this.bookingData.couponCode?.trim().toUpperCase() || ''].join(':');
    if (this.bookingHold && this.bookingHoldIdentity && this.bookingHoldIdentity !== identity) {
      const previousStorageKey = this.bookingHoldStorageKey;
      this.clientApi.releaseBookingHold(this.bookingHold.holdToken).subscribe({
        next: () => previousStorageKey && sessionStorage.removeItem(previousStorageKey),
        error: () => undefined,
      });
      this.bookingHold = null;
      this.bookingData.holdToken = undefined;
    }
    this.bookingHoldIdentity = identity;
    const storageKey = `hotel:booking:hold:${identity}`;
    this.bookingHoldStorageKey = storageKey;
    const stored = sessionStorage.getItem(storageKey);
    if (stored) {
      try {
        const hold = JSON.parse(stored) as BookingHold;
        if (hold.holdToken && Date.parse(hold.expiresAtUtc) > Date.now()) {
          this.bookingHold = hold;
          this.bookingData.holdToken = hold.holdToken;
          this.syncQuoteToHold(hold);
          this.startQuoteCountdown(this.earliestExpiry(this.quote.expiresAt, hold.expiresAtUtc));
          return;
        }
      } catch {
        // Replace malformed state with a new server hold.
      }
      sessionStorage.removeItem(storageKey);
    }

    this.holdLoading = true;
    this.holdError = '';
    const holdRequestKey = this.sharedPaymentIdempotencyKey(`hotel:booking:hold-idempotency:${identity}`);
    this.clientApi.createBookingHold({
      tenantId: this.hotelId,
      roomTypeId: this.roomTypeId,
      checkInDate: this.bookingData.checkInDate,
      checkOutDate: this.bookingData.checkOutDate,
      quantity: this.bookingData.quantity || 1,
      couponCode: this.bookingData.couponCode,
    }, holdRequestKey).subscribe({
      next: hold => {
        this.bookingHold = hold;
        this.bookingData.holdToken = hold.holdToken;
        this.syncQuoteToHold(hold);
        this.holdLoading = false;
        sessionStorage.setItem(storageKey, JSON.stringify(hold));
        this.startQuoteCountdown(this.earliestExpiry(this.quote!.expiresAt, hold.expiresAtUtc));
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.holdLoading = false;
        this.holdError = error?.error?.message || 'Không thể giữ phòng trong 15 phút.';
        this.startQuoteCountdown(this.quote!.expiresAt);
        this.changeDetector.markForCheck();
      },
    });
  }

  private loadPaymentOptions(): void {
    const requestVersion = ++this.paymentOptionsRequestVersion;
    const fallback: PublicPropertyPaymentOption[] = [
      { code: 'PAY_AT_HOTEL', provider: 'CASH', requiresPrepayment: false },
    ];
    if (!this.isGuid(this.hotelId)) {
      this.paymentOptions = fallback;
      this.paymentOptionsLoading = false;
      this.paymentOptionsError = '';
      this.bookingData.paymentMethod = fallback[0].code;
      return;
    }

    this.paymentOptionsLoading = true;
    this.paymentOptionsError = '';
    this.paymentConfiguration.publicOptions(this.hotelId).subscribe({
      next: options => {
        if (requestVersion !== this.paymentOptionsRequestVersion) return;
        this.paymentOptions = options;
        this.paymentOptionsLoading = false;
        if (!options.some(option => option.code === this.bookingData.paymentMethod)) {
          this.bookingData.paymentMethod = options[0]?.code || '';
        }
        if (options.length === 0) {
          this.paymentOptionsError = 'Khách sạn chưa có phương thức thanh toán khả dụng.';
        }
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (requestVersion !== this.paymentOptionsRequestVersion) return;
        this.paymentOptions = [];
        this.bookingData.paymentMethod = '';
        this.paymentOptionsLoading = false;
        this.paymentOptionsError = 'Không tải được phương thức thanh toán. Vui lòng thử lại trước khi đặt phòng.';
        this.changeDetector.markForCheck();
      },
    });
  }

  private earliestExpiry(first: string, second: string): string {
    return Date.parse(first) <= Date.parse(second) ? first : second;
  }

  private syncQuoteToHold(hold: BookingHold): void {
    if (!this.quote || hold.baseSubtotal == null || hold.discountAmount == null) return;
    this.quote = {
      ...this.quote,
      baseSubtotal: hold.baseSubtotal,
      taxAmount: hold.taxAmount ?? 0,
      feeAmount: hold.feeAmount ?? 0,
      taxesAndFees: (hold.taxAmount ?? 0) + (hold.feeAmount ?? 0),
      totalDiscount: hold.discountAmount,
      finalTotal: hold.estimatedTotal,
      appliedPromotions: hold.promotionCode ? [{
        campaignId: hold.promotionId || hold.promotionCode,
        code: hold.promotionCode,
        applicationType: this.bookingData.couponCode ? 'COUPON' : 'AUTOMATIC',
        nameVi: hold.promotionTitle || hold.promotionCode,
        nameEn: null,
        discountAmount: hold.discountAmount,
      }] : [],
    };
    this.serverEstimate = hold.estimatedTotal;
  }

  private isGuid(value: string | number): boolean {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private releaseCurrentHold(afterRelease: () => void): void {
    const hold = this.bookingHold;
    if (!hold) {
      afterRelease();
      return;
    }
    this.clientApi.releaseBookingHold(hold.holdToken).subscribe({
      next: () => {
        if (this.bookingHoldStorageKey) sessionStorage.removeItem(this.bookingHoldStorageKey);
        this.bookingHold = null;
        afterRelease();
      },
      error: () => afterRelease(),
    });
  }

  private createPaymentAttempt(reservationId: string | number): void {
    const method = (this.reservedPaymentMethod || this.bookingData.paymentMethod) as PropertyPaymentMethodCode;
    const requestIdentity = `${reservationId}:DEPOSIT:${method}`;
    if (this.paymentRequestIdentity !== requestIdentity) {
      this.paymentRequestIdentity = requestIdentity;
      this.paymentIdempotencyStorageKey = `hotel:payment:idempotency:${requestIdentity}`;
      this.paymentIdempotencyKey = this.sharedPaymentIdempotencyKey(this.paymentIdempotencyStorageKey);
    }

    if (method === 'VNPAY') {
      this.paymentService.createPaymentSession(
        reservationId,
        'VNPAY',
        this.paymentIdempotencyKey,
        this.bookingAccessKey || this.bookingIdempotencyKey,
      ).subscribe({
        next: (session) => {
          this.isSubmitting = false;
          if (!session.url) {
            this.errorMessage = this.i18n.text('PUBLIC.BOOKING.ERROR_PAYMENT_CONNECTION');
            this.changeDetector.markForCheck();
            return;
          }
          sessionStorage.setItem(
            `hotel:payment:access:${session.sessionId}`,
            this.bookingAccessKey || this.bookingIdempotencyKey,
          );
          window.location.href = session.url;
        },
        error: (err) => {
          console.error('Unable to create VNPAY payment session', err);
          this.isSubmitting = false;
          this.errorMessage = err?.error?.message
            || this.i18n.text('PUBLIC.BOOKING.ERROR_PAYMENT_CONNECTION');
          this.changeDetector.markForCheck();
        },
      });
      return;
    }

    this.propertyPaymentService.createAttempt(
      reservationId,
      { purpose: 'DEPOSIT', method },
      { idempotencyKey: this.paymentIdempotencyKey, bookingAccessKey: this.bookingAccessKey || undefined },
    ).subscribe({
      next: (attempt) => {
        this.paymentAttempt = attempt;
        this.isSubmitting = false;
        this.bookingSuccess = true;
        this.changeDetector.markForCheck();
        if (attempt.redirectUrl) {
          window.location.href = attempt.redirectUrl;
        }
      },
      error: (err) => {
        console.error('Unable to create property payment attempt', err);
        this.isSubmitting = false;
        this.errorMessage = err?.error?.message
          || this.i18n.text('PUBLIC.BOOKING.ERROR_PAYMENT_CONNECTION');
        this.changeDetector.markForCheck();
      },
    });
  }

  private newRequestId(): string {
    const cryptoApi = globalThis.crypto as Crypto | undefined;
    if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
    return `payment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private sharedPaymentIdempotencyKey(storageKey: string): string {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { key?: string; expiresAt?: number };
        if (parsed.key && Number(parsed.expiresAt) > Date.now()) return parsed.key;
      } catch {
        // Replace malformed or legacy entries with a bounded shared key.
      }
    }
    const key = this.newRequestId();
    localStorage.setItem(storageKey, JSON.stringify({ key, expiresAt: Date.now() + 30 * 60 * 1000 }));
    return key;
  }

  private getBookingIdempotencyKey(): string {
    const identity = [
      this.roomTypeId,
      this.bookingData.checkInDate,
      this.bookingData.checkOutDate,
      this.bookingData.quantity,
      this.bookingData.adults,
      this.bookingData.children,
      this.bookingData.paymentMethod,
      this.bookingData.couponCode || '',
      this.bookingData.firstName.trim(),
      this.bookingData.lastName.trim(),
      this.bookingData.phone.trim(),
      this.bookingData.email.trim().toLowerCase(),
      this.bookingData.specialRequests?.trim() || '',
    ].join(':');
    if (this.bookingIdempotencyKey && this.bookingRequestIdentity === identity)
      return this.bookingIdempotencyKey;
    this.bookingRequestIdentity = identity;
    this.bookingIdempotencyKey = '';
    const storageKey = `hotel:booking:idempotency:${identity}`;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { key?: string; expiresAt?: number };
        if (parsed.key && Number(parsed.expiresAt) > Date.now()) {
          this.bookingIdempotencyKey = parsed.key;
          return this.bookingIdempotencyKey;
        }
      } catch {
        // Replace legacy/plain entries with the bounded shared-tab format.
      }
    }

    this.bookingIdempotencyKey = this.newRequestId();
    localStorage.setItem(storageKey, JSON.stringify({
      key: this.bookingIdempotencyKey,
      expiresAt: Date.now() + 30 * 60 * 1000,
    }));
    return this.bookingIdempotencyKey;
  }

  private startQuoteCountdown(expiresAt: string): void {
    this.stopQuoteCountdown();
    const expiresAtMs = new Date(expiresAt).getTime();
    const update = () => {
      this.remainingQuoteSeconds = Number.isFinite(expiresAtMs)
        ? Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000))
        : 0;
      this.changeDetector.markForCheck();
      if (this.remainingQuoteSeconds <= 0) this.stopQuoteCountdown();
    };
    update();
    if (this.remainingQuoteSeconds > 0) this.quoteTimer = setInterval(update, 1000);
  }

  private stopQuoteCountdown(): void {
    if (this.quoteTimer) clearInterval(this.quoteTimer);
    this.quoteTimer = null;
  }

  ngOnDestroy(): void {
    this.stopQuoteCountdown();
  }
}
