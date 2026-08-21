import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { RoomStatusRealtimeService, RoomStatusRealtimeItem } from '../../../core/services/room-status-realtime.service';
import { RoomManagement } from './room-management';

describe('RoomManagement', () => {
  let component: RoomManagement;
  let fixture: ComponentFixture<RoomManagement>;
  let events: Subject<RoomStatusRealtimeItem[]>;
  let realtime: { roomStatusChanged$: Subject<RoomStatusRealtimeItem[]>; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    events = new Subject<RoomStatusRealtimeItem[]>();
    realtime = { roomStatusChanged$: events, connect: vi.fn(), disconnect: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [RoomManagement],
      providers: [{ provide: RoomStatusRealtimeService, useValue: realtime }],
    }).compileComponents();

    fixture = TestBed.createComponent(RoomManagement);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
    expect(realtime.connect).toHaveBeenCalledTimes(1);
  });

  it('ignores realtime snapshots that do not contain a visible room', async () => {
    const reload = vi.spyOn(component, 'loadData');
    component.rooms = [{ id: 1, roomNumber: '101' } as never];

    events.next([{ tenantId: 'other', roomId: 2, roomNumber: '201', status: 'OCCUPIED' }]);
    await new Promise(resolve => setTimeout(resolve, 350));

    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads the current filtered page after a visible room changes', async () => {
    const reload = vi.spyOn(component, 'loadData');
    component.rooms = [{ id: 1, roomNumber: '101' } as never];

    events.next([{ tenantId: 'tenant-a', roomId: 1, roomNumber: '101', status: 'OCCUPIED' }]);
    await new Promise(resolve => setTimeout(resolve, 350));

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('groups the operational room matrix by floor with text and icons in addition to color', () => {
    component.loading = false;
    component.rooms = [
      { id: 1, hotelId: 7, roomTypeId: 9, roomNumber: '101', floor: 1, status: 'AVAILABLE', housekeepingStatus: 'CLEAN', maintenanceStatus: 'NONE', roomTypeNameVi: 'Deluxe' },
      { id: 2, hotelId: 7, roomTypeId: 9, roomNumber: '201', floor: 2, status: 'OCCUPIED', housekeepingStatus: 'DIRTY', maintenanceStatus: 'NONE', roomTypeNameVi: 'Deluxe' },
      { id: 3, hotelId: 7, roomTypeId: 9, roomNumber: '202', floor: 2, status: 'DIRTY', housekeepingStatus: 'DIRTY', maintenanceStatus: 'NONE', roomTypeNameVi: 'Deluxe' },
    ];
    component.totalItems = 3;
    component.viewMode = 'matrix';

    expect(component.roomGroups.map(group => [group.floor, group.rooms.length])).toEqual([[1, 1], [2, 2]]);
    expect(component.roomStatusLabel('AVAILABLE')).toBe('Phòng trống');
    expect(component.roomStatusLabel('OCCUPIED')).toBe('Đang có khách');
    expect(component.roomStatusIcon('OCCUPIED')).toBe('pi-user');
    expect(component.roomStatusClass(component.rooms[2])).toBe('dirty');
  });
});
