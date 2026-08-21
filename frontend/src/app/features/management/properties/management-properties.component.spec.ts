import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { AuthService } from '../../../core/services/auth';
import { ManagedProperty, ManagementApiService } from '../../../core/services/management-api.service';
import { PropertyService } from '../../../core/services/property.service';
import { ManagementPropertiesComponent } from './management-properties.component';

describe('ManagementPropertiesComponent', () => {
  it('renders assigned properties and creates a draft property for an owner', async () => {
    const create$ = new Subject<ManagedProperty>();
    const createProperty = vi.fn(() => create$);
    await TestBed.configureTestingModule({
      imports: [ManagementPropertiesComponent],
      providers: [
        { provide: AuthService, useValue: { getRoles: () => ['PROPERTY_OWNER'] } },
        { provide: ManagementApiService, useValue: { properties: () => of([]), createProperty } },
        { provide: PropertyService, useValue: { getProvinces: () => of([{ id: 1, nameVi: 'Da Nang' }]), getWards: () => of([{ id: 2, nameVi: 'Hai Chau' }]) } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ManagementPropertiesComponent);
    fixture.detectChanges();
    fixture.componentInstance.openCreate();
    fixture.componentInstance.form.patchValue({ nameVi: 'LuxeStay Test', provinceId: 1, wardId: 2, address: '01 Bien Dong' });
    fixture.componentInstance.save();
    expect(createProperty).toHaveBeenCalledWith(expect.objectContaining({ nameVi: 'LuxeStay Test', provinceId: 1, wardId: 2 }));

    create$.next({ id: 9, code: 'OWNER-9', nameVi: 'LuxeStay Test', propertyType: 'HOTEL', address: '01 Bien Dong', approvalStatus: 'DRAFT', operationStatus: 'INACTIVE', isDemo: false });
    create$.complete();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Đã tạo cơ sở ở trạng thái bản nháp.');
    fixture.destroy();
  });
});
