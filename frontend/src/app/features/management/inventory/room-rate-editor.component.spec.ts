import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { PermissionService } from '../../../core/services/permission.service';
import { RoomRateOverrideService } from '../../../core/services/room-rate-override.service';
import { RoomRateEditorComponent } from './room-rate-editor.component';

describe('RoomRateEditorComponent', () => {
  let fixture: ComponentFixture<RoomRateEditorComponent>;
  let component: RoomRateEditorComponent;
  let api: { list: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  let hasPermission: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    api = {
      list: vi.fn(() => of([])),
      create: vi.fn(() => of({})),
      update: vi.fn(() => of({})),
      delete: vi.fn(() => of(void 0)),
    };
    hasPermission = vi.fn(() => true);
    await TestBed.configureTestingModule({
      imports: [RoomRateEditorComponent],
      providers: [
        { provide: RoomRateOverrideService, useValue: api },
        { provide: PermissionService, useValue: { hasPermission } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(RoomRateEditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('roomTypes', [{ id: 'type-1', code: 'DLX', nameVi: 'Deluxe', basePrice: 900000 }]);
    fixture.detectChanges();
  });

  it('loads the first room type and creates a valid date range', () => {
    expect(component.selectedRoomTypeId).toBe('type-1');
    expect(api.list).toHaveBeenCalledWith('type-1');
    component.openCreate();
    component.form = { roomTypeId: 'type-1', startDate: '2026-09-01', endDate: '2026-09-03', nightlyPrice: 1250000, priority: 5, isActive: true };
    component.save();
    expect(api.create).toHaveBeenCalledWith(component.form);
  });

  it('blocks an invalid range before making a request', () => {
    component.openCreate();
    component.form = { roomTypeId: 'type-1', startDate: '2026-09-04', endDate: '2026-09-01', nightlyPrice: 1250000, priority: 0, isActive: true };
    component.save();
    expect(api.create).not.toHaveBeenCalled();
    expect(component.validForm).toBe(false);
  });

  it('does not expose mutations when the permission mask denies them', () => {
    hasPermission.mockReturnValue(false);
    component.openCreate();
    expect(component.showForm).toBe(false);
    component.form = { roomTypeId: 'type-1', startDate: '2026-09-01', endDate: '2026-09-03', nightlyPrice: 1250000, priority: 0, isActive: true };
    component.save();
    expect(api.create).not.toHaveBeenCalled();
  });

  it('surfaces list failures without throwing away the editor', () => {
    api.list.mockReturnValue(throwError(() => ({ error: { message: 'rate service unavailable' } })));
    component.load();
    expect(component.error).toBe('rate service unavailable');
    expect(component.rates).toEqual([]);
  });
});
