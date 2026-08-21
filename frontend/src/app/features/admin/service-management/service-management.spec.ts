import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { NEVER, of } from 'rxjs';

import { HotelServiceService } from '@app/core/services/hotel-service.service';
import { ManagementApiService } from '@app/core/services/management-api.service';
import { ServiceManagement } from './service-management';
import { PermissionService } from '@app/core/services/permission.service';

describe('ServiceManagement', () => {
  let fixture: ComponentFixture<ServiceManagement>;
  let component: ServiceManagement;
  let hotelService: {
    getServices: ReturnType<typeof vi.fn>;
    createService: ReturnType<typeof vi.fn>;
    updateService: ReturnType<typeof vi.fn>;
    deleteService: ReturnType<typeof vi.fn>;
  };
  let managementApi: { context: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    hotelService = {
      getServices: vi.fn(() => of([])),
      createService: vi.fn((service) => of({ ...service, id: 99 })),
      updateService: vi.fn((id, service) => of({ ...service, id })),
      deleteService: vi.fn(() => of(undefined)),
    };
    managementApi = {
      context: vi.fn(() => of({
        properties: [
          { id: 10, code: 'P-10', nameVi: 'Property 10' },
          { id: 20, code: 'P-20', nameVi: 'Property 20' },
        ],
        activePropertyId: 20,
      })),
    };

    await TestBed.configureTestingModule({
      imports: [ServiceManagement],
      providers: [
        { provide: HotelServiceService, useValue: hotelService },
        { provide: ManagementApiService, useValue: managementApi },
        { provide: PermissionService, useValue: { hasPermission: vi.fn(() => true) } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } }, queryParamMap: of({ get: () => null }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ServiceManagement);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads services for the server-authorized active property', () => {
    expect(component.selectedPropertyId).toBe(20);
    expect(hotelService.getServices).toHaveBeenCalledWith(20);
  });

  it('reloads the catalog when the selected property changes', () => {
    component.selectedPropertyId = 10;
    component.onPropertyChange();

    expect(hotelService.getServices).toHaveBeenLastCalledWith(10);
  });

  it('creates a tenant service for the selected property', () => {
    component.openCreate();
    component.form = {
      ...component.form,
      code: ' breakfast ',
      nameVi: 'Bữa sáng',
      nameEn: '',
      price: 150000,
    };

    component.save();

    expect(hotelService.createService).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'BREAKFAST', nameEn: 'Bữa sáng', hotelId: 20 }),
      20,
    );
  });

  it('updates and deletes only tenant-owned services', () => {
    const service = {
      id: 7,
      hotelId: 20,
      code: 'SPA',
      nameVi: 'Spa',
      nameEn: 'Spa',
      price: 400000,
      status: 'ACTIVE',
      systemService: false,
    };
    component.openEdit(service);
    component.form.price = 450000;
    component.save();

    expect(hotelService.updateService).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ price: 450000, hotelId: 20 }),
    );
  });

  it('stops loading when the management context request times out', async () => {
    vi.useFakeTimers();
    managementApi.context.mockReturnValue(NEVER);

    const timeoutFixture = TestBed.createComponent(ServiceManagement);
    timeoutFixture.detectChanges();
    await vi.advanceTimersByTimeAsync(15001);

    expect(timeoutFixture.componentInstance.loading).toBe(false);
    expect(timeoutFixture.componentInstance.errorMessage).toBeTruthy();
    vi.useRealTimers();
  });
});
