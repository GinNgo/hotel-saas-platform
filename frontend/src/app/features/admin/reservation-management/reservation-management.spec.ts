import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { Reservation, ReservationService } from '../../../core/services/reservation.service';
import { PaymentService } from '../../../core/services/payment.service';
import { InvoiceService } from '../../../core/services/invoice.service';
import { HotelServiceService } from '../../../core/services/hotel-service.service';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { ReservationManagement } from './reservation-management';
import { PermissionService } from '../../../core/services/permission.service';

describe('ReservationManagement payment and refund states', () => {
  let component: ReservationManagement;
  let fixture: ComponentFixture<ReservationManagement>;
  let reservations$: Subject<Reservation[]>;
  let routeQuery: Record<string, string>;
  let invoiceService: { getInvoiceByReservation: ReturnType<typeof vi.fn>; downloadPdf: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    reservations$ = new Subject<Reservation[]>();
    routeQuery = {};
    invoiceService = {
      getInvoiceByReservation: vi.fn(() => of({ id: 'invoice-42', reservationId: 42, invoiceNumber: 'INV-42' })),
      downloadPdf: vi.fn(() => of({ body: new Blob(['pdf'], { type: 'application/pdf' }) })),
    };
    await TestBed.configureTestingModule({
      imports: [ReservationManagement],
      providers: [
        {
          provide: ReservationService,
          useValue: { getAllReservations: vi.fn(() => reservations$.asObservable()), cancelOperational: vi.fn(() => of({})) },
        },
        { provide: PaymentService, useValue: {} },
        { provide: InvoiceService, useValue: invoiceService },
        { provide: PermissionService, useValue: { hasPermission: vi.fn(() => true) } },
        { provide: HotelServiceService, useValue: { getServices: vi.fn(() => of([])) } },
        { provide: Router, useValue: { url: '/admin/reservations', navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { get queryParamMap() { return convertToParamMap(routeQuery); } } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReservationManagement);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders reservations received after the initial zoneless change-detection pass', () => {
    reservations$.next([
      {
        id: 42,
        bookingCode: 'PMS-20260818-ABC123',
        userId: 7,
        username: 'fixture-customer',
        checkInDate: '2026-08-01',
        checkOutDate: '2026-08-02',
        guests: 2,
        adults: 1,
        children: 1,
        totalAmount: 1_250_000,
        status: 'PENDING_PAYMENT',
        paymentMethod: 'VNPAY',
        details: [{ roomId: 'room-101', roomNumber: '101' }],
        payment: {
          provider: 'VNPAY',
          amount: 1_250_000,
          currency: 'VND',
          status: 'PENDING',
          reconciliationRequired: false,
        },
      },
    ]);

    expect(fixture.nativeElement.querySelector('[data-booking-id="42"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-payment-status="PENDING"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('PMS-20260818-ABC123');
    expect(fixture.nativeElement.textContent).toContain('1 người lớn');
    expect(fixture.nativeElement.textContent).toContain('1 trẻ em');
    expect(fixture.nativeElement.textContent).toContain('Dự kiến: VNPay');
    expect(fixture.nativeElement.textContent).toContain('Phòng 101');
  });

  it('hydrates booking search and status from a timeline deep link', () => {
    routeQuery = { q: 'PMS-FOCUS', status: 'confirmed' };
    component.ngOnInit();

    expect(component.searchTerm).toBe('PMS-FOCUS');
    expect(component.statusFilter).toBe('CONFIRMED');
  });

  it('distinguishes unassigned and partially assigned multi-room bookings', () => {
    expect(component.roomAssignmentLabel({ details: [{ roomId: null }]} as Reservation)).toBe('Chưa xếp phòng');
    expect(component.roomAssignmentLabel({ details: [{ roomId: 'room-1' }, { roomId: null }]} as Reservation)).toBe('Đã xếp 1/2 phòng');
  });

  it('keeps the booking snapshot when a background refresh fails', () => {
    const getAllReservations = TestBed.inject(ReservationService).getAllReservations as ReturnType<typeof vi.fn>;
    getAllReservations.mockReturnValueOnce(throwError(() => new Error('offline')));

    component.refreshIfVisible();

    expect(component.reservations).toHaveLength(0);
    expect(component.syncWarning).toContain('Dữ liệu hiện tại vẫn được giữ nguyên');
  });

  it('counts only confirmed arrivals from today forward in the front-desk KPI', () => {
    const today = new Date();
    const key = (offset: number) => {
      const date = new Date(today);
      date.setDate(date.getDate() + offset);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };
    component.reservations = [
      { status: 'CONFIRMED', checkInDate: key(-1) } as Reservation,
      { status: 'CONFIRMED', checkInDate: key(0) } as Reservation,
      { status: 'CONFIRMED', checkInDate: key(3) } as Reservation,
      { status: 'CHECKED_IN', checkInDate: key(1) } as Reservation,
    ];

    expect(component.upcomingArrivalCount).toBe(2);
  });

  it('requires a second click before cancelling an operational booking', () => {
    component.requestCancel(42);
    expect(component.cancelPendingId).toBe(42);
    expect((TestBed.inject(ReservationService).cancelOperational as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();

    component.requestCancel(42);
    expect(component.cancelPendingId).toBeNull();
  });

  it('requires a second click before marking an operational booking no-show', () => {
    component.requestNoShow(43);
    expect(component.noShowPendingId).toBe(43);
    expect((TestBed.inject(ReservationService).markNoShow as ReturnType<typeof vi.fn> | undefined)).toBeUndefined();
    component.clearNoShowConfirmation();
    expect(component.noShowPendingId).toBeNull();
  });

  it('presents payment failure and reconciliation as explicit labelled states', () => {
    expect(component.getPaymentMethodLabel('CREDIT_CARD')).toBe('Thẻ tín dụng');
    expect(component.getPaymentLabel({
      provider: 'VNPAY', amount: 500000, currency: 'VND', status: 'FAILED', reconciliationRequired: false,
    })).toBe('Th\u1ea5t b\u1ea1i');
    expect(component.getPaymentTone({
      provider: 'VNPAY', amount: 500000, currency: 'VND', status: 'SUCCEEDED', reconciliationRequired: true,
    })).toBe('warning');
    expect(component.getPaymentIcon({
      provider: 'VNPAY', amount: 500000, currency: 'VND', status: 'EXPIRED', reconciliationRequired: false,
    })).toBe('pi pi-clock');
  });

  it('shows the latest refund lifecycle state for admin follow-up', () => {
    const reservation = {
      id: 1, userId: 2, checkInDate: '2026-08-01', checkOutDate: '2026-08-02', guests: 2,
      totalAmount: 900000, status: 'CANCELLED', paymentMethod: 'MOMO', details: [],
      refunds: [
        { publicId: 'r1', amount: 900000, currency: 'VND', provider: 'MOMO', status: 'REQUESTED', requestedAt: '2026-07-30' },
        { publicId: 'r2', amount: 900000, currency: 'VND', provider: 'MOMO', status: 'PENDING_PROVIDER', requestedAt: '2026-07-30' },
      ],
    } as Reservation;

    const refund = component.getLatestRefund(reservation);
    expect(refund?.status).toBe('PENDING_PROVIDER');
    expect(component.getRefundLabel(refund)).toBe('\u0110ang x\u1eed l\u00fd');
    expect(component.getRefundTone(refund)).toBe('warning');
  });

  it('downloads the finalized invoice PDF instead of only showing a toast', () => {
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:invoice-42');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    component.generateInvoice(42);

    expect(invoiceService.getInvoiceByReservation).toHaveBeenCalledWith(42);
    expect(invoiceService.downloadPdf).toHaveBeenCalledWith('invoice-42');
    expect(createObjectUrl).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:invoice-42');
  });

  it('surfaces the authoritative invoice error instead of assuming payment is missing', () => {
    invoiceService.getInvoiceByReservation.mockReturnValue(throwError(() => ({ error: { message: 'Reservation chưa có hóa đơn đã chốt.' } })));
    const messageService = (component as any).messageService as { add: ReturnType<typeof vi.fn> };
    const add = vi.spyOn(messageService, 'add');

    component.generateInvoice(42);

    expect(add).toHaveBeenCalledWith(expect.objectContaining({
      severity: 'error',
      detail: 'Reservation chưa có hóa đơn đã chốt.',
    }));
  });
});
