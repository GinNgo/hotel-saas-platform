import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { ClientApiService } from '../../../core/services/client-api.service';
import { PropertyPaymentService } from '../../../core/services/property-payment.service';
import { BookingCheckoutComponent } from './booking-checkout.component';
import { AsyncActionCoordinatorService } from '../../../core/services/async-action-coordinator.service';
import { PaymentService } from '../../../core/services/payment.service';
import { PropertyPaymentConfigurationService } from '../../../core/services/property-payment-configuration.service';
import { LocaleService } from '../../../core/i18n/locale.service';

describe('BookingCheckoutComponent', () => {
  let fixture: ComponentFixture<BookingCheckoutComponent>;
  let component: BookingCheckoutComponent;
  let reservation$: Subject<any>;
  let queryParams$: Subject<Record<string, string>>;
  let clientApi: {
    bookRoom: ReturnType<typeof vi.fn>;
    getHotelById: ReturnType<typeof vi.fn>;
    getPromotionQuote: ReturnType<typeof vi.fn>;
    createBookingHold: ReturnType<typeof vi.fn>;
    releaseBookingHold: ReturnType<typeof vi.fn>;
  };
  let paymentApi: {
    createAttempt: ReturnType<typeof vi.fn>;
    getAttempt: ReturnType<typeof vi.fn>;
  };
  let paymentSessionApi: {
    createPaymentSession: ReturnType<typeof vi.fn>;
  };
  let paymentConfigurationApi: {
    publicOptions: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    reservation$ = new Subject<any>();
    queryParams$ = new Subject<Record<string, string>>();
    clientApi = {
      bookRoom: vi.fn(() => reservation$),
      getHotelById: vi.fn(() => of({ id: 10, name: 'LuxeStay' })),
      getPromotionQuote: vi.fn(() => of(quoteResponse())),
      createBookingHold: vi.fn(() => of(holdResponse())),
      releaseBookingHold: vi.fn(() => of(undefined)),
    };
    paymentApi = {
      createAttempt: vi.fn(),
      getAttempt: vi.fn((attemptId: string) => of({ ...attemptResponse(), attemptId })),
    };
    paymentSessionApi = {
      createPaymentSession: vi.fn(),
    };
    paymentConfigurationApi = {
      publicOptions: vi.fn(() => of([
        { code: 'PAY_AT_HOTEL', provider: 'CASH', requiresPrepayment: false },
        { code: 'VNPAY', provider: 'VNPAY', requiresPrepayment: true },
      ])),
    };

    await TestBed.configureTestingModule({
      imports: [BookingCheckoutComponent],
      providers: [
        { provide: ClientApiService, useValue: clientApi },
        { provide: PropertyPaymentService, useValue: paymentApi },
        { provide: PaymentService, useValue: paymentSessionApi },
        { provide: PropertyPaymentConfigurationService, useValue: paymentConfigurationApi },
        { provide: AsyncActionCoordinatorService, useValue: new AsyncActionCoordinatorService() },
        { provide: Router, useValue: { navigate: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ roomTypeId: '1' })),
            queryParams: queryParams$
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(BookingCheckoutComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('blocks checkout when booking context is missing', () => {
    expect(component.bookingContextValid).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Phiên đặt phòng không hợp lệ');

    component.submitBooking();
    expect(clientApi.bookRoom).not.toHaveBeenCalled();
  });

  it('accepts the complete room-selection context after route parameters resolve', () => {
    queryParams$.next({
      checkIn: '2026-08-10',
      checkOut: '2026-08-12',
      adultCount: '2',
      childCount: '0',
      quantity: '1',
      hotelId: '10',
      roomTypeName: 'Deluxe',
      nightlyPrice: '500000',
      estimatedTotal: '1000000'
    });

    expect(component.bookingContextValid).toBe(true);
    expect(component.quote?.quoteId).toBe('quote-1');
  });

  it('formats checkout totals with the active public locale', () => {
    const locale = TestBed.inject(LocaleService);
    expect(component.formatVnd(537500)).toBe('537.500 ₫');

    locale.setLocale('en');
    expect(component.formatVnd(537500)).toBe('537,500 VND');
  });

  it('accepts public-search date parameter names for deep-linked checkout', () => {
    queryParams$.next({
      checkInDate: '2026-08-10',
      checkOutDate: '2026-08-12',
      adultCount: '2',
      childCount: '1',
      quantity: '1',
      hotelId: '10',
    });

    expect(component.bookingData.checkInDate).toBe('2026-08-10');
    expect(component.bookingData.checkOutDate).toBe('2026-08-12');
    expect(component.bookingData.adults).toBe(2);
    expect(component.bookingData.children).toBe(1);
  });

  it('renders only the payment methods returned for a GUID property', () => {
    const hotelId = '11111111-1111-4111-8111-111111111111';
    paymentConfigurationApi.publicOptions.mockReturnValue(of([
      { code: 'MANUAL_TRANSFER', provider: 'BANK', requiresPrepayment: true },
      { code: 'VNPAY', provider: 'VNPAY', requiresPrepayment: true },
    ]));
    queryParams$.next({
      checkIn: '2026-08-10', checkOut: '2026-08-12', adultCount: '2', childCount: '0',
      quantity: '1', hotelId, roomTypeName: 'Deluxe'
    });
    fixture.detectChanges();

    const paymentInputs = fixture.nativeElement.querySelectorAll(
      'input[name="paymentMethod"]'
    ) as NodeListOf<HTMLInputElement>;
    const methods = Array.from(paymentInputs, input => input.value);
    expect(methods).toEqual(['MANUAL_TRANSFER', 'VNPAY']);
    expect(component.bookingData.paymentMethod).toBe('MANUAL_TRANSFER');
    expect(paymentConfigurationApi.publicOptions).toHaveBeenCalledWith(hotelId);
    expect(fixture.nativeElement.querySelector('img[src="/assets/payment/vnpay-logo.svg"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).not.toContain('Thanh toán tại khách sạn');
  });

  it('keeps the legacy pay-at-hotel fallback for numeric property ids', () => {
    queryParams$.next({
      checkIn: '2026-08-10', checkOut: '2026-08-12', adultCount: '2', childCount: '0',
      quantity: '1', hotelId: '10', roomTypeName: 'Deluxe'
    });
    fixture.detectChanges();

    const methods = Array.from(
      fixture.nativeElement.querySelectorAll('input[name="paymentMethod"]') as NodeListOf<HTMLInputElement>,
      input => input.value,
    );
    expect(methods).toEqual(['PAY_AT_HOTEL']);
    expect(paymentConfigurationApi.publicOptions).not.toHaveBeenCalled();
  });

  it('blocks GUID checkout when payment options cannot be loaded', () => {
    paymentConfigurationApi.publicOptions.mockReturnValue(throwError(() => new Error('offline')));
    queryParams$.next({
      checkIn: '2026-08-10', checkOut: '2026-08-12', adultCount: '2', childCount: '0',
      quantity: '1', hotelId: '11111111-1111-4111-8111-111111111111', roomTypeName: 'Deluxe'
    });
    fixture.detectChanges();

    expect(component.paymentOptions).toEqual([]);
    expect(component.bookingData.paymentMethod).toBe('');
    expect(fixture.nativeElement.querySelector('button[type="submit"]')?.disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.mobile-checkout-bar button')?.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Vui lòng thử lại trước khi đặt phòng');
  });

  it('retries payment options without reloading the checkout page', () => {
    paymentConfigurationApi.publicOptions
      .mockReturnValueOnce(throwError(() => new Error('offline')))
      .mockReturnValueOnce(of([{ code: 'VNPAY', provider: 'VNPAY', requiresPrepayment: true }]));
    queryParams$.next({
      checkIn: '2026-08-10', checkOut: '2026-08-12', adultCount: '2', childCount: '0',
      quantity: '1', hotelId: '11111111-1111-4111-8111-111111111111', roomTypeName: 'Deluxe'
    });
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.payment-options-error button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(paymentConfigurationApi.publicOptions).toHaveBeenCalledTimes(2);
    expect(component.paymentOptions.map(option => option.code)).toEqual(['VNPAY']);
    expect(component.bookingData.paymentMethod).toBe('VNPAY');
    expect(component.paymentOptionsError).toBe('');
  });

  it('ignores a stale payment-options response from the previous property', () => {
    const oldOptions$ = new Subject<any[]>();
    paymentConfigurationApi.publicOptions
      .mockReturnValueOnce(oldOptions$)
      .mockReturnValueOnce(of([{ code: 'VNPAY', provider: 'VNPAY', requiresPrepayment: true }]));
    queryParams$.next({ hotelId: '11111111-1111-4111-8111-111111111111' });
    queryParams$.next({ hotelId: '22222222-2222-4222-8222-222222222222' });
    oldOptions$.next([{ code: 'MANUAL_TRANSFER', provider: 'BANK', requiresPrepayment: true }]);
    fixture.detectChanges();

    expect(component.paymentOptions.map(option => option.code)).toEqual(['VNPAY']);
    expect(component.bookingData.paymentMethod).toBe('VNPAY');
  });

  it('exposes autofill metadata and an accessible progress label', () => {
    queryParams$.next({
      checkIn: '2026-08-10', checkOut: '2026-08-12', adultCount: '2', childCount: '0',
      quantity: '1', hotelId: '10', roomTypeName: 'Deluxe'
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#booking-first-name')?.getAttribute('autocomplete')).toBe('given-name');
    expect(fixture.nativeElement.querySelector('#booking-last-name')?.getAttribute('autocomplete')).toBe('family-name');
    expect(fixture.nativeElement.querySelector('#booking-email')?.getAttribute('autocomplete')).toBe('email');
    expect(fixture.nativeElement.querySelector('.checkout-progress')?.getAttribute('aria-label')).toBe('Tiến trình đặt phòng');
  });

  it('renders canonical original/final price, member tier, and typed sponsored disclosure', () => {
    clientApi.getHotelById.mockReturnValue(of({
      id: 10,
      name: 'LuxeStay',
      sponsoredPlacement: {
        placementId: 77,
        placementKind: 'SPONSORED',
        disclosureVi: '\u0110\u01b0\u1ee3c t\u00e0i tr\u1ee3',
        disclosureEn: 'Sponsored',
        endsAt: '2026-08-04T00:00:00Z',
      },
    }));
    queryParams$.next({
      checkIn: '2026-08-10',
      checkOut: '2026-08-12',
      adultCount: '2',
      childCount: '0',
      quantity: '1',
      hotelId: '10',
      roomTypeName: 'Deluxe',
      nightlyPrice: '500000',
      estimatedTotal: '1000000',
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-sponsored="true"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.original-price')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.promotion-proof').textContent).toContain('V\u00e0ng');
    expect(fixture.nativeElement.querySelector('.estimate strong').textContent).toContain('1.035.000');
  });

  it('submits a valid booking only once while the request is pending', () => {
    component.roomTypeId = 1;
    component.hotelId = 10;
    component.roomTypeName = 'Deluxe';
    component.nightlyPrice = 500000;
    component.contextError = '';
    component.bookingData = {
      roomTypeId: 1,
      checkInDate: '2026-08-10',
      checkOutDate: '2026-08-12',
      guests: 2,
      adults: 2,
      children: 0,
      quantity: 1,
      firstName: 'An',
      lastName: 'Nguyen',
      phone: '0900000000',
      email: 'guest@example.com',
      paymentMethod: 'PAY_AT_HOTEL',
      specialRequests: ''
    };

    component.submitBooking();
    component.submitBooking();

    expect(clientApi.bookRoom).toHaveBeenCalledTimes(1);
    expect(clientApi.bookRoom.mock.calls[0][1]).toEqual(expect.any(String));
    expect(component.isSubmitting).toBe(true);

    reservation$.next({ id: 77, bookingCode: 'LXS-EMAIL-STATE', confirmationEmailStatus: 'NOT_CONFIGURED', confirmationEmailRecipient: 'guest@example.com' });
    reservation$.complete();
    fixture.detectChanges();
    expect(component.bookingSuccess).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('dịch vụ email chưa được cấu hình');
  });

  it('creates and converts a server hold for GUID booking inventory', () => {
    const tenantId = 'fdbf2b21-b29a-4fe5-b4fa-68fbb9a20d51';
    const roomTypeId = '3db8e9d4-ce7e-488c-84bb-c5f02212d1d2';
    component.hotelId = tenantId;
    component.roomTypeId = roomTypeId;
    component.roomTypeName = 'Deluxe';
    component.bookingData = {
      roomTypeId, checkInDate: '2026-08-10', checkOutDate: '2026-08-12', guests: 2,
      adults: 2, children: 0, quantity: 1, firstName: 'An', lastName: 'Nguyen',
      phone: '0900000000', email: 'guest@example.com', paymentMethod: 'PAY_AT_HOTEL',
    };
    component.contextError = '';

    component.refreshQuote();
    component.submitBooking();

    expect(clientApi.createBookingHold).toHaveBeenCalledWith(
      { tenantId, roomTypeId, checkInDate: '2026-08-10', checkOutDate: '2026-08-12', quantity: 1 },
      expect.any(String),
    );
    expect(clientApi.bookRoom.mock.calls[0][0].holdToken).toBe('hold-token-123');
    expect(component.quote?.finalTotal).toBe(900000);
  });

  it('releases an active hold before returning to search', () => {
    const tenantId = 'fdbf2b21-b29a-4fe5-b4fa-68fbb9a20d51';
    const roomTypeId = '3db8e9d4-ce7e-488c-84bb-c5f02212d1d2';
    component.hotelId = tenantId;
    component.roomTypeId = roomTypeId;
    component.roomTypeName = 'Deluxe';
    component.bookingData.roomTypeId = roomTypeId;
    component.bookingData.checkInDate = '2026-08-10';
    component.bookingData.checkOutDate = '2026-08-12';
    component.contextError = '';
    component.refreshQuote();

    component.goToSearch();

    expect(clientApi.releaseBookingHold).toHaveBeenCalledWith('hold-token-123');
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/search']);
  });

  it('shares one booking identity with a second tab after an unknown outcome', () => {
    setValidBooking('PAY_AT_HOTEL');
    component.submitBooking();
    const firstKey = clientApi.bookRoom.mock.calls[0][1];
    reservation$.error({ status: 0 });
    reservation$ = new Subject<any>();

    const secondFixture = TestBed.createComponent(BookingCheckoutComponent);
    const secondComponent = secondFixture.componentInstance;
    secondFixture.detectChanges();
    setValidBooking('PAY_AT_HOTEL', secondComponent);
    secondComponent.submitBooking();

    expect(clientApi.bookRoom).toHaveBeenCalledTimes(2);
    expect(clientApi.bookRoom.mock.calls[1][1]).toBe(firstKey);
    secondFixture.destroy();
  });

  it('shows the backend message for a financial conflict instead of reporting sold out', () => {
    setValidBooking('VNPAY');

    component.submitBooking();
    reservation$.error({
      status: 409,
      error: { code: 'POLICY_NOT_CONFIGURED', message: 'Payment policy is not configured.' },
    });

    expect(component.errorMessage).toBe('Payment policy is not configured.');
  });

  it('creates a server-owned deposit attempt after the reservation succeeds', () => {
    const paymentAttempt$ = new Subject<any>();
    paymentApi.createAttempt.mockReturnValue(paymentAttempt$);
    setValidBooking('MOMO');

    component.submitBooking();
    reservation$.next({ id: 77 });

    expect(paymentApi.createAttempt).toHaveBeenCalledWith(
      77,
      { purpose: 'DEPOSIT', method: 'MOMO' },
      { idempotencyKey: expect.any(String), bookingAccessKey: expect.any(String) },
    );
    expect(paymentApi.createAttempt.mock.calls[0][1].amount).toBeUndefined();
    paymentAttempt$.next(attemptResponse());
    paymentAttempt$.complete();
    expect(component.paymentAttempt?.expectedAmount).toBe(300000);
    expect(component.bookingSuccess).toBe(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-property-payment-panel')).not.toBeNull();
  });

  it('retries the same attempt request without creating a second reservation', () => {
    const firstAttempt$ = new Subject<any>();
    paymentSessionApi.createPaymentSession
      .mockReturnValueOnce(firstAttempt$)
      .mockReturnValueOnce(of({ url: 'https://sandbox.vnpayment.vn/pay' }));
    setValidBooking('VNPAY');

    component.submitBooking();
    reservation$.next({ id: 88 });
    firstAttempt$.error({ status: 503 });

    const firstKey = paymentSessionApi.createPaymentSession.mock.calls[0][2];
    const bookingAccessKey = clientApi.bookRoom.mock.calls[0][1];
    expect(paymentSessionApi.createPaymentSession.mock.calls[0][3]).toBe(bookingAccessKey);
    component.submitBooking();

    expect(clientApi.bookRoom).toHaveBeenCalledTimes(1);
    expect(paymentSessionApi.createPaymentSession).toHaveBeenCalledTimes(2);
    expect(paymentSessionApi.createPaymentSession.mock.calls[1][2]).toBe(firstKey);
  });

  it('creates a fresh terminal retry without creating a second reservation', () => {
    paymentApi.createAttempt
      .mockReturnValueOnce(of({ ...attemptResponse(), status: 'FAILED' }))
      .mockReturnValueOnce(of({ ...attemptResponse(), attemptId: 'attempt-2' }));
    setValidBooking('MOMO');

    component.submitBooking();
    reservation$.next({ id: 91 });

    const firstKey = paymentApi.createAttempt.mock.calls[0][2].idempotencyKey;
    component.retryPaymentAttempt();

    expect(clientApi.bookRoom).toHaveBeenCalledTimes(1);
    expect(paymentApi.createAttempt).toHaveBeenCalledTimes(2);
    expect(paymentApi.createAttempt.mock.calls[1][0]).toBe(91);
    expect(paymentApi.createAttempt.mock.calls[1][2].idempotencyKey).not.toBe(firstKey);
    expect(component.paymentAttempt?.attemptId).toBe('attempt-2');
  });

  it('retries payment with the reservation GUID returned by the backend', () => {
    const reservationId = '6b31ee33-9f48-4f75-8e7d-b9f77d2de430';
    paymentApi.createAttempt
      .mockReturnValueOnce(of({ ...attemptResponse(), reservationId, status: 'FAILED' }))
      .mockReturnValueOnce(of({ ...attemptResponse(), reservationId, attemptId: 'attempt-guid-2' }));
    setValidBooking('MOMO');

    component.submitBooking();
    reservation$.next({ id: reservationId });
    component.retryPaymentAttempt();

    expect(clientApi.bookRoom).toHaveBeenCalledTimes(1);
    expect(paymentApi.createAttempt).toHaveBeenCalledTimes(2);
    expect(paymentApi.createAttempt.mock.calls[1][0]).toBe(reservationId);
    expect(component.paymentAttempt?.attemptId).toBe('attempt-guid-2');
  });

  it('shares the payment idempotency key across tabs for the same booking', () => {
    paymentSessionApi.createPaymentSession.mockImplementation(() => new Subject<any>());
    const reservationId = '6b31ee33-9f48-4f75-8e7d-b9f77d2de430';
    setValidBooking('VNPAY');
    const secondFixture = TestBed.createComponent(BookingCheckoutComponent);
    const secondComponent = secondFixture.componentInstance;
    secondFixture.detectChanges();
    setValidBooking('VNPAY', secondComponent);

    (component as unknown as { createPaymentAttempt: (id: string) => void }).createPaymentAttempt(reservationId);
    (secondComponent as unknown as { createPaymentAttempt: (id: string) => void }).createPaymentAttempt(reservationId);

    expect(paymentSessionApi.createPaymentSession.mock.calls[0][2])
      .toBe(paymentSessionApi.createPaymentSession.mock.calls[1][2]);
    secondFixture.destroy();
  });

  it('uses a fresh booking capability when guest details change after a failed request', () => {
    setValidBooking('PAY_AT_HOTEL');
    component.submitBooking();
    const firstKey = clientApi.bookRoom.mock.calls[0][1];
    reservation$.error({ status: 0 });
    reservation$ = new Subject<any>();

    component.bookingData.phone = '0911111111';
    component.submitBooking();

    expect(clientApi.bookRoom).toHaveBeenCalledTimes(2);
    expect(clientApi.bookRoom.mock.calls[1][1]).not.toBe(firstKey);
  });

  function setValidBooking(
    paymentMethod: string,
    target: BookingCheckoutComponent = component,
  ): void {
    target.roomTypeId = 1;
    target.hotelId = 10;
    target.roomTypeName = 'Deluxe';
    target.nightlyPrice = 500000;
    target.contextError = '';
    target.quote = quoteResponse();
    target.remainingQuoteSeconds = 15 * 60;
    target.bookingData = {
      roomTypeId: 1,
      checkInDate: '2026-08-10',
      checkOutDate: '2026-08-12',
      guests: 2,
      adults: 2,
      children: 0,
      quantity: 1,
      firstName: 'An',
      lastName: 'Nguyen',
      phone: '0900000000',
      email: 'guest@example.com',
      paymentMethod,
      specialRequests: '',
    };
  }

  function attemptResponse() {
    return {
      attemptId: 'attempt-1',
      reservationId: 77,
      purpose: 'DEPOSIT',
      status: 'PENDING',
      environment: 'SIMULATOR',
      expectedAmount: 300000,
      currency: 'VND',
      expiresAt: '2099-08-10T12:15:00',
      method: 'MOMO',
      provider: 'SIMULATOR',
      receiver: {
        bankName: null,
        bankCode: null,
        accountName: null,
        accountNumberMasked: null,
        qrProvider: null,
        merchantReferenceMasked: null,
        instructionsVi: null,
        instructionsEn: null,
      },
      uniqueTransferContent: null,
      qrData: null,
      redirectUrl: null,
      replayed: false,
    };
  }

  function quoteResponse() {
    return {
      quoteId: 'quote-1',
      expiresAt: '2099-08-10T12:15:00Z',
      propertyId: 10,
      roomTypeId: 1,
      nightlyPrice: 500000,
      numberOfNights: 2,
      roomQuantity: 1,
      baseSubtotal: 1000000,
      taxAmount: 120000,
      feeAmount: 15000,
      taxesAndFees: 135000,
      appliedPromotions: [{
        campaignId: 71,
        code: 'MEMBER10',
        applicationType: 'AUTOMATIC' as const,
        nameVi: 'Gi\u00e1 th\u00e0nh vi\u00ean',
        nameEn: 'Member price',
        discountAmount: 100000,
      }],
      memberBenefit: {
        eligible: true,
        tierCode: 'GOLD',
        tierNameVi: 'V\u00e0ng',
        tierNameEn: 'Gold',
      },
      totalDiscount: 100000,
      finalTotal: 1035000,
      currency: 'VND' as const,
    };
  }

  function holdResponse() {
    return {
      holdToken: 'hold-token-123',
      expiresAtUtc: '2099-08-10T12:15:00Z',
      tenantId: 'fdbf2b21-b29a-4fe5-b4fa-68fbb9a20d51',
      roomTypeId: '3db8e9d4-ce7e-488c-84bb-c5f02212d1d2',
      checkInDate: '2026-08-10',
      checkOutDate: '2026-08-12',
      estimatedTotal: 900000,
      baseSubtotal: 1000000,
      discountAmount: 100000,
      promotionId: 'promotion-1',
      promotionCode: 'MEMBER10',
      promotionTitle: 'Giá thành viên',
    };
  }
});
