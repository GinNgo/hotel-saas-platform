import { registerLocaleData } from '@angular/common';
import localeVi from '@angular/common/locales/vi';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NEVER, of, throwError } from 'rxjs';
import {
  CheckoutPreview,
  CheckoutResult,
  PropertyCheckoutService,
} from '../../../core/services/property-checkout.service';
import { ReservationCheckoutComponent } from './reservation-checkout.component';
import { HotelServiceService } from '../../../core/services/hotel-service.service';
import { PermissionService } from '../../../core/services/permission.service';

registerLocaleData(localeVi);

describe('ReservationCheckoutComponent', () => {
  let component: ReservationCheckoutComponent;
  let fixture: ComponentFixture<ReservationCheckoutComponent>;
  let checkoutService: {
    preview: ReturnType<typeof vi.fn>;
    addServiceCharge: ReturnType<typeof vi.fn>;
    addSurcharge: ReturnType<typeof vi.fn>;
    addNegativeAdjustment: ReturnType<typeof vi.fn>;
    authorizeDebtOverride: ReturnType<typeof vi.fn>;
    checkout: ReturnType<typeof vi.fn>;
  };
  let hotelService: { getServicesForHotel: ReturnType<typeof vi.fn> };
  let permissionService: { hasPermission: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    checkoutService = {
      preview: vi.fn(),
      addServiceCharge: vi.fn(),
      addSurcharge: vi.fn(),
      addNegativeAdjustment: vi.fn(),
      authorizeDebtOverride: vi.fn(),
      checkout: vi.fn(),
    };
    hotelService = { getServicesForHotel: vi.fn(() => of([])) };
    permissionService = { hasPermission: vi.fn(() => true) };

    await TestBed.configureTestingModule({
      imports: [ReservationCheckoutComponent],
      providers: [
        { provide: PropertyCheckoutService, useValue: checkoutService },
        { provide: HotelServiceService, useValue: hotelService },
        { provide: PermissionService, useValue: permissionService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReservationCheckoutComponent);
    component = fixture.componentInstance;
    component.reservationId = 42;
  });

  it('allows checkout only when the authoritative folio is settled', () => {
    component.preview.set(makePreview('SETTLED', 0, true));
    fixture.detectChanges();

    expect(component.canCheckout()).toBe(true);
    expect(component.needsDebtOverride()).toBe(false);
    expect(component.isOverpaid()).toBe(false);
    expect(fixture.nativeElement.querySelector('.settlement-chip.settled')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.override-panel')).toBeNull();
    expect(fixture.nativeElement.querySelector('.blocking-message')).toBeNull();
  });

  it('blocks an outstanding folio until a server-issued debt override is authorized', () => {
    const outstanding = makePreview('OUTSTANDING', 250_000, false);
    component.preview.set(outstanding);
    checkoutService.authorizeDebtOverride.mockReturnValue(of({
      overrideId: 77,
      debtOverrideApplied: true,
      preview: outstanding,
    }));
    component.overrideForm.setValue({ reason: 'Approved corporate debt account' });
    fixture.detectChanges();

    expect(component.canCheckout()).toBe(false);
    expect(component.needsDebtOverride()).toBe(true);
    expect(fixture.nativeElement.querySelector('.override-panel')).not.toBeNull();

    component.authorizeDebtOverride();
    fixture.detectChanges();

    expect(checkoutService.authorizeDebtOverride).toHaveBeenCalledWith(
      42,
      'Approved corporate debt account',
    );
    expect(component.checkoutOverrideId()).toBe(77);
    expect(component.canCheckout()).toBe(true);
    expect(component.needsDebtOverride()).toBe(false);
  });

  it('keeps an overpaid folio blocked and exposes the resolution warning', () => {
    component.preview.set(makePreview('OVERPAID', -100_000, false));
    fixture.detectChanges();

    expect(component.isOverpaid()).toBe(true);
    expect(component.canCheckout()).toBe(false);
    expect(component.needsDebtOverride()).toBe(false);
    expect(fixture.nativeElement.querySelector('.blocking-message')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.override-panel')).toBeNull();
  });

  it('emits the finalized invoice result after atomic checkout succeeds', () => {
    const result = makeCheckoutResult();
    const completed = vi.fn();
    component.preview.set(makePreview('SETTLED', 0, true));
    component.completed.subscribe(completed);
    checkoutService.checkout.mockReturnValue(of(result));

    component.checkout();

    expect(checkoutService.checkout).toHaveBeenCalledWith(42, undefined);
    expect(completed).toHaveBeenCalledWith(result);
    expect(component.successMessage()).toContain('INV-2026-0042');
    expect(component.busyAction()).toBeNull();
  });

  it('passes only the approved override identifier into checkout', () => {
    const result = makeCheckoutResult();
    component.preview.set(makePreview('OUTSTANDING', 250_000, false));
    component.checkoutOverrideId.set(77);
    checkoutService.checkout.mockReturnValue(of(result));

    component.checkout();

    expect(checkoutService.checkout).toHaveBeenCalledWith(42, 77);
  });

  it('loads the tenant catalog from the reservation property returned by preview', () => {
    checkoutService.preview.mockReturnValue(of(makePreview('SETTLED', 0, true)));
    hotelService.getServicesForHotel.mockReturnValue(of([{
      id: 17,
      hotelId: 9,
      code: 'BREAKFAST',
      nameVi: 'Bua sang',
      nameEn: 'Breakfast',
      price: 150_000,
      status: 'ACTIVE',
    }]));

    component.loadPreview();

    expect(hotelService.getServicesForHotel).toHaveBeenCalledWith(9);
    expect(component.catalogHotelId()).toBe(9);
    expect(component.serviceOptions()).toEqual([
      expect.objectContaining({ value: 17 }),
    ]);
  });

  it('stops the catalog loading state when the service endpoint times out', () => {
    vi.useFakeTimers();
    checkoutService.preview.mockReturnValue(of(makePreview('SETTLED', 0, true)));
    hotelService.getServicesForHotel.mockReturnValue(NEVER);

    component.loadPreview();
    expect(component.catalogLoading()).toBe(true);
    vi.advanceTimersByTime(15_001);

    expect(component.catalogLoading()).toBe(false);
    expect(component.catalogError()).toContain('Timeout');
    vi.useRealTimers();
  });

  it('presents service and minibar as explicit usage choices', () => {
    fixture.detectChanges();
    const options = fixture.nativeElement.querySelectorAll('.charge-type-option');

    expect(options).toHaveLength(2);
    expect(options[0].textContent).toContain('Dịch vụ');
    expect(options[1].textContent).toContain('Minibar');

    options[1].click();
    fixture.detectChanges();
    expect(component.serviceForm.controls.chargeType.value).toBe('MINIBAR');
    expect(options[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('reuses the same idempotency key when a service submission is retried', () => {
    component.serviceForm.setValue({ serviceId: 17, chargeType: 'MINIBAR', quantity: 2 });
    checkoutService.addServiceCharge
      .mockReturnValueOnce(throwError(() => new Error('network timeout')))
      .mockReturnValueOnce(of({}));
    checkoutService.preview.mockReturnValue(of(makePreview('SETTLED', 0, true)));

    component.addService();
    const firstKey = checkoutService.addServiceCharge.mock.calls[0][2].idempotencyKey;
    component.addService();
    const retryKey = checkoutService.addServiceCharge.mock.calls[1][2].idempotencyKey;

    expect(firstKey).toMatch(/^reservation-42-service-/);
    expect(retryKey).toBe(firstKey);
  });

  it('shows the server upgrade instruction when the Basic plan blocks folio charges', () => {
    component.serviceForm.setValue({ serviceId: 17, chargeType: 'SERVICE', quantity: 1 });
    checkoutService.addServiceCharge.mockReturnValue(throwError(() => ({
      status: 409,
      error: {
        code: 'FOLIO_UPGRADE_REQUIRED',
        message: 'Thêm dịch vụ và điều chỉnh folio chỉ khả dụng từ gói PRO. Vui lòng nâng cấp gói dịch vụ.',
      },
    })));

    component.addService();
    fixture.detectChanges();

    expect(component.errorMessage()).toContain('gói PRO');
    const alert = fixture.nativeElement.querySelector('.feedback.error[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert.textContent).toContain('nâng cấp gói dịch vụ');
  });

  it('reuses the same idempotency key when an approved adjustment is retried', () => {
    component.adjustmentForm.setValue({
      mode: 'NEGATIVE_ADJUSTMENT',
      surchargeType: 'OTHER',
      negativeType: 'SERVICE_RECOVERY',
      description: 'Approved service recovery',
      amount: 50_000,
    });
    checkoutService.addNegativeAdjustment
      .mockReturnValueOnce(throwError(() => new Error('network timeout')))
      .mockReturnValueOnce(of({}));
    checkoutService.preview.mockReturnValue(of(makePreview('SETTLED', 0, true)));

    component.addAdjustment();
    const firstKey = checkoutService.addNegativeAdjustment.mock.calls[0][2].idempotencyKey;
    component.addAdjustment();
    const retryKey = checkoutService.addNegativeAdjustment.mock.calls[1][2].idempotencyKey;

    expect(firstKey).toMatch(/^reservation-42-adjustment-/);
    expect(retryKey).toBe(firstKey);
  });

  it('shows immutable surcharge and adjustment history from the authoritative folio', () => {
    const preview = makePreview('SETTLED', 0, true);
    preview.folio.lines.push({
      sourceType: 'RESERVATION_CHARGE',
      sourceId: 71,
      category: 'DISCOUNT',
      code: 'ADJUSTMENT:SERVICE_RECOVERY',
      name: 'Adjustment - Service recovery',
      description: 'Approved service recovery',
      quantity: 1,
      unitPrice: 0,
      taxAmount: 0,
      discountAmount: 50_000,
      snapshotAmount: 50_000,
      signedEffect: -50_000,
      usageStartedAt: null,
      usageEndedAt: null,
    });
    component.preview.set(preview);
    fixture.detectChanges();

    expect(component.adjustmentHistory()).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.adjustment-history')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.adjustment-history').textContent)
      .toContain('Approved service recovery');
  });

  it('defensively refuses mutation methods when permission checks fail', () => {
    permissionService.hasPermission.mockReturnValue(false);
    const restrictedFixture = TestBed.createComponent(ReservationCheckoutComponent);
    const restricted = restrictedFixture.componentInstance;
    restricted.reservationId = 42;
    restricted.preview.set(makePreview('SETTLED', 0, true));

    restricted.addService();
    restricted.addAdjustment();
    restricted.authorizeDebtOverride();
    restricted.checkout();

    expect(checkoutService.addServiceCharge).not.toHaveBeenCalled();
    expect(checkoutService.addSurcharge).not.toHaveBeenCalled();
    expect(checkoutService.addNegativeAdjustment).not.toHaveBeenCalled();
    expect(checkoutService.authorizeDebtOverride).not.toHaveBeenCalled();
    expect(checkoutService.checkout).not.toHaveBeenCalled();
  });
});

function makePreview(
  settlementState: CheckoutPreview['settlementState'],
  balance: number,
  checkoutAllowed: boolean,
): CheckoutPreview {
  return {
    reservationId: 42,
    hotelId: 9,
    settlementState,
    checkoutAllowed,
    blockingError: checkoutAllowed ? null : settlementState === 'OUTSTANDING'
      ? 'OUTSTANDING_BALANCE'
      : 'OVERPAYMENT_REQUIRES_RESOLUTION',
    sourceVersion: 5,
    calculatedAt: '2026-08-01T09:30:00Z',
    folio: {
      roomCharges: 1_000_000,
      serviceCharges: 150_000,
      surchargeCharges: 50_000,
      taxCharges: 0,
      feeCharges: 0,
      discounts: 0,
      grossCharges: 1_200_000,
      depositRequired: 300_000,
      successfulPayments: 1_200_000 - balance,
      successfulRefunds: 0,
      otherCredits: 0,
      netSettled: 1_200_000 - balance,
      balance,
      lines: [{
        sourceType: 'RESERVATION',
        sourceId: 42,
        category: 'ROOM',
        code: 'ROOM-DELUXE',
        name: 'Deluxe room',
        description: null,
        quantity: 1,
        unitPrice: 1_000_000,
        taxAmount: 0,
        discountAmount: 0,
        snapshotAmount: 1_000_000,
        signedEffect: 1_000_000,
        usageStartedAt: '2026-07-31T14:00:00Z',
        usageEndedAt: '2026-08-01T09:00:00Z',
      }],
      sourceVersion: 5,
      calculatedAt: '2026-08-01T09:30:00Z',
    },
  };
}

function makeCheckoutResult(): CheckoutResult {
  return {
    reservationId: 42,
    reservationStatus: 'CHECKED_OUT',
    invoiceId: 420,
    invoiceNumber: 'INV-2026-0042',
    invoiceStatus: 'FINALIZED',
    totalAmount: 1_200_000,
    dirtyRoomIds: [12],
    financialSummary: {
      grossCharges: 1_200_000,
      depositRequired: 300_000,
      successfulPayments: 1_200_000,
      successfulRefunds: 0,
      remainingBalance: 0,
      financialState: 'SETTLED',
      sourceVersion: 5,
      calculatedAt: '2026-08-01T09:30:00Z',
    },
  };
}
