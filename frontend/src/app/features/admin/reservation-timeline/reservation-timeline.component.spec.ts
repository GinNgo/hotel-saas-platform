import { TestBed } from '@angular/core/testing';
import { registerLocaleData } from '@angular/common';
import localeVi from '@angular/common/locales/vi';
import { of, throwError } from 'rxjs';
import { ReservationService } from '../../../core/services/reservation.service';
import { RoomService } from '../../../core/services/room.service';
import { ReservationTimelineComponent } from './reservation-timeline.component';
import { provideRouter } from '@angular/router';

registerLocaleData(localeVi);

describe('ReservationTimelineComponent', () => {
  it('exposes no-show as a first-class timeline lifecycle filter', async () => {
    await TestBed.configureTestingModule({
      imports: [ReservationTimelineComponent],
      providers: [
        { provide: RoomService, useValue: { getAllRooms: () => of([]) } },
        { provide: ReservationService, useValue: { getAllReservations: () => of([]) } },
        provideRouter([]),
      ],
    }).compileComponents();
    const component = TestBed.createComponent(ReservationTimelineComponent).componentInstance;

    expect(component.statusOptions).toContainEqual(expect.objectContaining({ value: 'NO_SHOW' }));
    expect(component.statusLabel('NO_SHOW')).toBe('Không đến');
    expect(component.statusClass('NO_SHOW')).toBe('status-no-show');
  });

  it('searches the complete room inventory before applying the display limit', async () => {
    const rooms = Array.from({ length: 301 }, (_, index) => ({
      id: index + 1,
      roomNumber: index === 300 ? 'TARGET-ROOM' : `R-${index + 1}`,
      floor: 1,
      status: 'AVAILABLE',
    }));
    await TestBed.configureTestingModule({
      imports: [ReservationTimelineComponent],
      providers: [
        { provide: RoomService, useValue: { getAllRooms: () => of(rooms) } },
        { provide: ReservationService, useValue: { getAllReservations: () => of([]) } },
        provideRouter([]),
      ],
    }).compileComponents();
    const component = TestBed.createComponent(ReservationTimelineComponent).componentInstance;

    component.ngOnInit();
    component.roomQuery = 'target';

    expect(component.rooms).toHaveLength(301);
    expect(component.filteredRooms.map((room) => room.roomNumber)).toEqual(['TARGET-ROOM']);
  });

  it('uses an inclusive custom date range and caps it at 31 days', async () => {
    await TestBed.configureTestingModule({
      imports: [ReservationTimelineComponent],
      providers: [
        { provide: RoomService, useValue: { getAllRooms: () => of([]) } },
        { provide: ReservationService, useValue: { getAllReservations: () => of([]) } },
        provideRouter([]),
      ],
    }).compileComponents();
    const component = TestBed.createComponent(ReservationTimelineComponent).componentInstance;
    component.startDate = new Date(2026, 7, 1);
    component.endDate = new Date(2026, 8, 20);

    component.onEndDateChange();

    expect(component.visibleDays).toBe(31);
    expect(component.dates).toHaveLength(31);
    expect(component.endDate).toEqual(new Date(2026, 7, 31));
  });

  it('surfaces unassigned bookings and supports flattened room-type responses', async () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    await TestBed.configureTestingModule({
      imports: [ReservationTimelineComponent],
      providers: [
        { provide: RoomService, useValue: { getAllRooms: () => of([{ id: 1, roomNumber: '101', floor: 1, status: 'AVAILABLE', roomTypeNameVi: 'Deluxe biển' }]) } },
        { provide: ReservationService, useValue: { getAllReservations: () => of([{
          id: 'reservation-1', bookingCode: 'LXS-1001', userId: null, userFullName: 'Nguyễn An',
          checkInDate: dateKey(today), checkOutDate: dateKey(tomorrow), guests: 2,
          paymentMethod: 'CASH', status: 'CONFIRMED', details: [{ roomId: null }],
        }]) } },
        provideRouter([]),
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ReservationTimelineComponent);

    fixture.componentInstance.ngOnInit();
    fixture.detectChanges();

    expect(fixture.componentInstance.unassignedReservations).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('1 booking chưa xếp phòng');
    expect(fixture.nativeElement.textContent).toContain('Deluxe biển');
    expect(fixture.nativeElement.querySelector('.queue-action')?.getAttribute('href')).toContain('q=LXS-1001');
  });

  it('keeps the current timeline when a background refresh fails', async () => {
    const getAllReservations = vi.fn()
      .mockReturnValueOnce(of([]))
      .mockReturnValueOnce(throwError(() => new Error('offline')));
    await TestBed.configureTestingModule({
      imports: [ReservationTimelineComponent],
      providers: [
        { provide: RoomService, useValue: { getAllRooms: () => of([{ id: 1, roomNumber: '101', floor: 1, status: 'AVAILABLE' }]) } },
        { provide: ReservationService, useValue: { getAllReservations } },
        provideRouter([]),
      ],
    }).compileComponents();
    const component = TestBed.createComponent(ReservationTimelineComponent).componentInstance;
    component.ngOnInit();

    component.refreshIfVisible();

    expect(component.rooms).toHaveLength(1);
    expect(component.syncing).toBe(false);
    expect(component.syncWarning).toContain('Dữ liệu hiện tại vẫn được giữ nguyên');
  });

  it('requests only reservations overlapping the visible date range', async () => {
    const getAllReservations = vi.fn(() => of([]));
    await TestBed.configureTestingModule({
      imports: [ReservationTimelineComponent],
      providers: [
        { provide: RoomService, useValue: { getAllRooms: () => of([]) } },
        { provide: ReservationService, useValue: { getAllReservations } },
        provideRouter([]),
      ],
    }).compileComponents();
    const component = TestBed.createComponent(ReservationTimelineComponent).componentInstance;
    component.startDate = new Date(2026, 7, 10);
    component.endDate = new Date(2026, 7, 16);
    component.visibleDays = 7;

    component.ngOnInit();
    component.moveRange(7);

    expect(getAllReservations).toHaveBeenNthCalledWith(1, '2026-08-10', '2026-08-16');
    expect(getAllReservations).toHaveBeenNthCalledWith(2, '2026-08-17', '2026-08-23');
  });
});
