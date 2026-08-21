import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NEVER, of } from 'rxjs';
import { Reservation, ReservationService } from '../../../core/services/reservation.service';
import { PaymentService } from '../../../core/services/payment.service';
import { InvoiceService } from '../../../core/services/invoice.service';
import { HotelServiceService } from '../../../core/services/hotel-service.service';
import { PermissionService, ActionCode, FunctionCode } from '../../../core/services/permission.service';
import { PropertyCheckoutService } from '../../../core/services/property-checkout.service';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { ReservationManagement } from './reservation-management';

describe('ReservationManagement lifecycle permissions', () => {
  let fixture: ComponentFixture<ReservationManagement>;
  let component: ReservationManagement;
  let reservationService: {
    getAllReservations: ReturnType<typeof vi.fn>;
    checkIn: ReturnType<typeof vi.fn>;
    assignRooms: ReturnType<typeof vi.fn>;
    cancelOperational: ReturnType<typeof vi.fn>;
    markNoShow: ReturnType<typeof vi.fn>;
    updateReservationStatus: ReturnType<typeof vi.fn>;
  };

  const reservation: Reservation = {
    id: 55,
    userId: 8,
    username: 'guest',
    checkInDate: new Date().toISOString().slice(0, 10),
    checkOutDate: '2026-08-03',
    guests: 2,
    totalAmount: 500000,
    status: 'CONFIRMED',
    paymentMethod: 'MOMO',
    details: [{ roomId: null }],
  };

  beforeEach(async () => {
    reservationService = {
      getAllReservations: vi.fn(() => of([reservation])),
      checkIn: vi.fn(() => of(reservation)),
      assignRooms: vi.fn(() => of(reservation)),
      cancelOperational: vi.fn(() => of(reservation)),
      markNoShow: vi.fn(() => of(reservation)),
      updateReservationStatus: vi.fn(() => of(reservation)),
    };

    await TestBed.configureTestingModule({
      imports: [ReservationManagement],
      providers: [
        { provide: ReservationService, useValue: reservationService },
        { provide: PaymentService, useValue: {} },
        { provide: InvoiceService, useValue: {} },
        { provide: HotelServiceService, useValue: { getServices: vi.fn(() => of([])) } },
        { provide: PropertyCheckoutService, useValue: { preview: vi.fn(() => NEVER) } },
        { provide: Router, useValue: { url: '/admin/reservations', navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
        {
          provide: PermissionService,
          useValue: {
            hasPermission: vi.fn((functionCode: string, actionCode: number) =>
              (functionCode === FunctionCode.RESERVATION && actionCode === ActionCode.UPDATE) ||
              (functionCode === FunctionCode.RESERVATION_ASSIGNMENT && actionCode === ActionCode.TASK_EXECUTE) ||
              (functionCode === FunctionCode.HOTEL_SERVICE && actionCode === ActionCode.VIEW) ||
              (functionCode === FunctionCode.CHECKIN && actionCode === ActionCode.TASK_EXECUTE) ||
              (functionCode === FunctionCode.CHECKOUT && actionCode === ActionCode.VIEW) ||
              (functionCode === FunctionCode.CHECKOUT && actionCode === ActionCode.TASK_EXECUTE) ||
              (functionCode === FunctionCode.INVOICE && actionCode === ActionCode.VIEW) ||
              (functionCode === FunctionCode.RESERVATION_CANCEL && actionCode === ActionCode.UPDATE) ||
              (functionCode === FunctionCode.RESERVATION_NO_SHOW && actionCode === ActionCode.UPDATE)),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReservationManagement);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('shows dedicated actions and invokes their dedicated client commands', () => {
    expect(fixture.nativeElement.querySelector('[data-action="assign-rooms"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-action="check-in"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-action="no-show"]')).not.toBeNull();

    (fixture.nativeElement.querySelector('[data-action="assign-rooms"]') as HTMLButtonElement).click();
    expect(reservationService.assignRooms).toHaveBeenCalledWith(55);
    expect(fixture.nativeElement.querySelector('[data-action="cancel-operational"]')).not.toBeNull();

    component.checkIn(55);
    component.markNoShow(55);
    component.cancelOperational(55);

    expect(reservationService.checkIn).toHaveBeenCalledWith(55);
    expect(reservationService.markNoShow).toHaveBeenCalledWith(55);
    expect(reservationService.cancelOperational).toHaveBeenCalledWith(55);
  });

  it('hides check-in for a future arrival even when the user has permission', () => {
    component.reservations = [{ ...reservation, checkInDate: '2999-01-01' }];
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-action="check-in"]')).toBeNull();
  });

  it('hides no-show for a future arrival even when the user has permission', () => {
    component.reservations = [{ ...reservation, checkInDate: '2999-01-01' }];
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-action="no-show"]')).toBeNull();
  });

  it('does not render lifecycle controls when the dedicated masks are absent', async () => {
    const permissionService = TestBed.inject(PermissionService) as unknown as { hasPermission: ReturnType<typeof vi.fn> };
    permissionService.hasPermission.mockReturnValue(false);

    fixture = TestBed.createComponent(ReservationManagement);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-action="check-in"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-action="no-show"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-action="cancel-operational"]')).toBeNull();
  });

  it('hides check-out when the dedicated execute permission is absent', () => {
    const permissionService = TestBed.inject(PermissionService) as unknown as { hasPermission: ReturnType<typeof vi.fn> };
    permissionService.hasPermission.mockImplementation((functionCode: string, actionCode: number) =>
      functionCode === FunctionCode.CHECKOUT && actionCode === ActionCode.VIEW);
    fixture = TestBed.createComponent(ReservationManagement);
    component = fixture.componentInstance;
    component.reservations = [{ ...reservation, status: 'CHECKED_IN' }];
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-action="check-out"]')).toBeNull();
  });

  it('hides invoice download when the dedicated view permission is absent', () => {
    const permissionService = TestBed.inject(PermissionService) as unknown as { hasPermission: ReturnType<typeof vi.fn> };
    permissionService.hasPermission.mockReturnValue(false);
    fixture = TestBed.createComponent(ReservationManagement);
    component = fixture.componentInstance;
    component.reservations = [{ ...reservation, status: 'CHECKED_OUT' }];
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-action="invoice"]')).toBeNull();
  });

  it('does not substitute reservation update for room-assignment permission', () => {
    const permissionService = TestBed.inject(PermissionService) as unknown as { hasPermission: ReturnType<typeof vi.fn> };
    permissionService.hasPermission.mockImplementation((functionCode: string, actionCode: number) =>
      functionCode === FunctionCode.RESERVATION && actionCode === ActionCode.UPDATE);

    fixture = TestBed.createComponent(ReservationManagement);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-action="assign-rooms"]')).toBeNull();
  });

  it('does not substitute hotel-service view for checkout preview permission', () => {
    const permissionService = TestBed.inject(PermissionService) as unknown as { hasPermission: ReturnType<typeof vi.fn> };
    permissionService.hasPermission.mockImplementation((functionCode: string, actionCode: number) =>
      functionCode === FunctionCode.HOTEL_SERVICE && actionCode === ActionCode.VIEW);
    fixture = TestBed.createComponent(ReservationManagement);
    component = fixture.componentInstance;
    component.reservations = [{ ...reservation, status: 'CHECKED_IN' }];
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-action="open-authoritative-folio"]')).toBeNull();
  });

  it('defensively refuses direct lifecycle calls when all permissions are absent', () => {
    const permissionService = TestBed.inject(PermissionService) as unknown as { hasPermission: ReturnType<typeof vi.fn> };
    permissionService.hasPermission.mockReturnValue(false);
    const restricted = TestBed.createComponent(ReservationManagement).componentInstance;

    restricted.updateStatus(55, 'CONFIRMED');
    restricted.checkIn(55);
    restricted.assignRooms(55);
    restricted.cancelOperational(55);
    restricted.markNoShow(55);
    restricted.openCheckoutWorkspace({ ...reservation, status: 'CHECKED_IN' });
    restricted.generateInvoice(55);

    expect(reservationService.updateReservationStatus).not.toHaveBeenCalled();
    expect(reservationService.checkIn).not.toHaveBeenCalled();
    expect(reservationService.assignRooms).not.toHaveBeenCalled();
    expect(reservationService.cancelOperational).not.toHaveBeenCalled();
    expect(reservationService.markNoShow).not.toHaveBeenCalled();
    expect(restricted.showCheckoutDialog).toBe(false);
  });

  it('does not advertise payment confirmation for generic pending reservations', () => {
    component.reservations = [{ ...reservation, status: 'PENDING' }];
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[aria-label="Xác nhận đặt phòng"]')).toBeNull();
  });

  it('does not advertise operational cancellation for generic pending or paid bookings', () => {
    component.reservations = [{ ...reservation, status: 'PENDING' }];
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-action="cancel-operational"]')).toBeNull();

    component.reservations = [{
      ...reservation,
      status: 'CONFIRMED',
      payment: { provider: 'VNPAY', amount: 500000, currency: 'VND', status: 'SUCCEEDED', reconciliationRequired: false },
    }];
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-action="cancel-operational"]')).toBeNull();
  });

  it('routes in-stay service work to the authoritative folio workspace', () => {
    component.openCheckoutWorkspace({ ...reservation, status: 'CHECKED_IN' });

    expect(component.selectedReservationId).toBe(55);
    expect(component.showCheckoutDialog).toBe(true);
    expect('openAddServiceDialog' in component).toBe(false);
    expect('submitAddService' in component).toBe(false);
    expect('processPayment' in component).toBe(false);
  });
});
