import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';

import { ManagementApiService } from '../../../core/services/management-api.service';
import { ManagementInventoryComponent } from './management-inventory.component';
import { PermissionService } from '../../../core/services/permission.service';

describe('ManagementInventoryComponent', () => {
  let fixture: ComponentFixture<ManagementInventoryComponent>;
  let component: ManagementInventoryComponent;
  let api: {
    context: ReturnType<typeof vi.fn>;
    rooms: ReturnType<typeof vi.fn>;
    roomTypes: ReturnType<typeof vi.fn>;
    startRoomMaintenance: ReturnType<typeof vi.fn>;
    completeRoomMaintenance: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    api = {
      context: vi.fn(() => of({ properties: [{ id: 3, nameVi: 'Hotel' }], activePropertyId: 3 })),
      rooms: vi.fn(() => of([{ id: 12, status: 'AVAILABLE', maintenanceStatus: 'NONE' }])),
      roomTypes: vi.fn(() => of([])),
      startRoomMaintenance: vi.fn(() => of({})),
      completeRoomMaintenance: vi.fn(() => of({})),
    };

    await TestBed.configureTestingModule({
      imports: [ManagementInventoryComponent],
      providers: [
        { provide: ManagementApiService, useValue: api },
        { provide: PermissionService, useValue: { hasPermission: vi.fn(() => true) } },
        { provide: ActivatedRoute, useValue: { snapshot: { data: { mode: 'rooms' } } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ManagementInventoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('uses dedicated maintenance commands instead of a generic room update', () => {
    component.toggleMaintenance({ id: 12, status: 'AVAILABLE', maintenanceStatus: 'NONE' });
    component.maintenanceReason = 'Điều hòa không hoạt động';
    component.confirmMaintenance();
    component.toggleMaintenance({ id: 12, status: 'MAINTENANCE', maintenanceStatus: 'MAINTENANCE' });

    expect(api.startRoomMaintenance).toHaveBeenCalledWith(12, 'Điều hòa không hoạt động');
    expect(api.completeRoomMaintenance).toHaveBeenCalledWith(12);
  });
});
