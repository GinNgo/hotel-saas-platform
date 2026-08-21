import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { AdminInventoryService } from '../../../core/services/admin-inventory.service';
import { ReservationService } from '../../../core/services/reservation.service';
import { ReservationCreate } from './reservation-create';

describe('ReservationCreate', () => {
  let fixture: ComponentFixture<ReservationCreate>;
  let component: ReservationCreate;
  const createReservation = vi.fn(() => of({}));
  const getOperationalQuote = vi.fn(() => of({ roomId: 'room-1', roomNumber: '101', roomTypeId: 'type-1', roomTypeName: 'Deluxe', nightlyPrice: 1000000, nights: 2, baseSubtotal: 2000000, discount: 0, finalTotal: 2000000, currency: 'VND' }));
  const navigate = vi.fn();

  beforeEach(async () => {
    createReservation.mockClear();
    getOperationalQuote.mockClear();
    navigate.mockClear();
    await TestBed.configureTestingModule({
      imports: [ReservationCreate],
      providers: [
        { provide: AdminInventoryService, useValue: { getRooms: () => of([{ id: 'room-1', hotelId: 'hotel-1', roomTypeId: 'type-1', roomTypeNameVi: 'Deluxe', roomNumber: '101', floor: 1, status: 'AVAILABLE', housekeepingStatus: 'CLEAN', maintenanceStatus: 'NONE' }]) } },
        { provide: ReservationService, useValue: { createReservation, getOperationalQuote } },
        { provide: Router, useValue: { url: '/admin/reservations/create', navigate } },
        { provide: MessageService, useValue: { add: vi.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ReservationCreate);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('submits guest identity and the selected physical room using GUID-safe ids', () => {
    component.selectedRoomId = 'room-1';
    component.reservation = {
      userId: null, guestFullName: 'Nguyen Van An', guestPhoneNumber: '0901234567', guestEmail: 'an@example.com',
      checkInDate: '2026-08-20', checkOutDate: '2026-08-22', guests: 3, adults: 2, children: 1, paymentMethod: 'CASH', details: []
    };
    component.quote = { roomId: 'room-1', roomNumber: '101', roomTypeId: 'type-1', roomTypeName: 'Deluxe', nightlyPrice: 1000000, nights: 2, baseSubtotal: 2000000, discount: 0, finalTotal: 2000000, currency: 'VND' };

    component.save();

    expect(createReservation).toHaveBeenCalledWith(expect.objectContaining({
      roomId: 'room-1', roomTypeId: 'type-1', guestFullName: 'Nguyen Van An',
      checkInDate: '2026-08-20', checkOutDate: '2026-08-22', guests: 3, adults: 2, children: 1, expectedTotal: 2000000, details: [{ roomId: 'room-1' }]
    }), expect.any(String));
    expect(navigate).toHaveBeenCalledWith(['/admin/reservations']);
  });

  it('loads the authoritative quote after selecting a room and dates', () => {
    component.selectedRoomId = 'room-1';
    component.reservation.checkInDate = '2026-08-20';
    component.reservation.checkOutDate = '2026-08-22';
    component.reservation.adults = 2;
    component.reservation.children = 1;

    component.onRoomOrGuestsChange();

    expect(getOperationalQuote).toHaveBeenCalledWith('room-1', '2026-08-20', '2026-08-22', 2, 1);
    expect(component.quote?.finalTotal).toBe(2000000);
  });

  it('refreshes the quote when create detects a price change', () => {
    createReservation.mockReturnValueOnce(throwError(() => ({ error: { code: 'PRICE_CHANGED', message: 'Giá đã đổi' } })));
    component.selectedRoomId = 'room-1';
    component.reservation = { guestFullName: 'An', guestPhoneNumber: '0901', checkInDate: '2026-08-20', checkOutDate: '2026-08-22', guests: 3, adults: 2, children: 1, paymentMethod: 'CASH', details: [] };
    component.quote = { roomId: 'room-1', roomNumber: '101', roomTypeId: 'type-1', roomTypeName: 'Deluxe', nightlyPrice: 1000000, nights: 2, baseSubtotal: 2000000, discount: 0, finalTotal: 2000000, currency: 'VND' };

    component.save();

    expect(getOperationalQuote).toHaveBeenCalledWith('room-1', '2026-08-20', '2026-08-22', 2, 1);
  });
});
