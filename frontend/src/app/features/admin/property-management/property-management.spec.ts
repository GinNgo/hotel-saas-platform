import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth';
import { PropertyManagementComponent } from './property-management';
import { PermissionService } from '../../../core/services/permission.service';

describe('PropertyManagementComponent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PropertyManagementComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { getRoles: () => ['SUPER_ADMIN'] } },
        { provide: PermissionService, useValue: { hasPermission: vi.fn(() => true) } }
      ]
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('renders properties as soon as the list request completes', () => {
    const fixture = TestBed.createComponent(PropertyManagementComponent);
    fixture.detectChanges();

    http.expectOne(`${environment.apiUrl}/v1/hotels`).flush([
      {
        id: 181,
        name: 'LuxeStay Test',
        address: '01 Duong Bien',
        city: 'Da Nang',
        propertyType: 'HOTEL',
        status: 'DRAFT'
      }
    ]);
    http.expectOne(`${environment.apiUrl}/public/locations/provinces`).flush([]);

    expect(fixture.nativeElement.textContent).toContain('LuxeStay Test');
    fixture.destroy();
  });

  it('opens the create form and submits a typed draft payload', () => {
    const fixture = TestBed.createComponent(PropertyManagementComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    http.expectOne(`${environment.apiUrl}/v1/hotels`).flush([]);
    http.expectOne(`${environment.apiUrl}/public/locations/provinces`).flush([
      { id: 1, nameVi: 'Đà Nẵng', locationType: 'PROVINCE' }
    ]);
    fixture.detectChanges();

    component.openCreate();
    component.form.patchValue({
      nameVi: 'LuxeStay T046',
      propertyType: 'HOTEL',
      provinceId: 1,
      wardId: 10,
      address: '01 Đường Biển',
      starRating: 4
    });
    component.save();

    const create = http.expectOne({ method: 'POST', url: `${environment.apiUrl}/v1/hotels` });
    expect(create.request.body).toMatchObject({
      name: 'LuxeStay T046',
      addressLine: '01 Đường Biển',
      city: 'Đà Nẵng',
      country: 'Việt Nam',
      status: 'DRAFT',
      approvalStatus: 'DRAFT',
      operationStatus: 'INACTIVE',
      isDemo: false
    });
    create.flush({ id: 99, name: 'LuxeStay T046' });
    http.expectOne(`${environment.apiUrl}/v1/hotels`).flush([]);
    fixture.detectChanges();

    expect(component.dialogVisible).toBe(false);
    expect(component.saving).toBe(false);
    fixture.destroy();
  }, 15000);

  it('blocks an incomplete form before sending a create request', () => {
    const fixture = TestBed.createComponent(PropertyManagementComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    http.expectOne(`${environment.apiUrl}/v1/hotels`).flush([]);
    http.expectOne(`${environment.apiUrl}/public/locations/provinces`).flush([
      { id: 1, nameVi: 'Đà Nẵng', locationType: 'PROVINCE' }
    ]);
    fixture.detectChanges();

    component.openCreate();
    component.save();

    expect(component.formError).toContain('bắt buộc');
    expect(http.match({ method: 'POST', url: `${environment.apiUrl}/v1/hotels` })).toHaveLength(0);
    component.closeCreate();
    fixture.destroy();
  });

  it('updates tax and service fee for an existing property', () => {
    const fixture = TestBed.createComponent(PropertyManagementComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    const property = { id: 'hotel-1', name: 'LuxeStay', propertyType: 'HOTEL', taxRatePercent: 8, serviceFeeRatePercent: 5 } as any;
    http.expectOne(`${environment.apiUrl}/v1/hotels`).flush([property]);
    http.expectOne(`${environment.apiUrl}/public/locations/provinces`).flush([]);

    component.openPricingSettings(property);
    component.pricingForm.setValue({ taxRatePercent: 10, serviceFeeRatePercent: 4 });
    component.savePricingSettings();

    const update = http.expectOne({ method: 'PUT', url: `${environment.apiUrl}/v1/hotels/hotel-1/pricing-settings` });
    expect(update.request.body).toEqual({ taxRatePercent: 10, serviceFeeRatePercent: 4 });
    update.flush({ ...property, taxRatePercent: 10, serviceFeeRatePercent: 4 });
    fixture.detectChanges();

    expect(component.pricingDialogVisible).toBe(false);
    expect(component.properties[0].taxRatePercent).toBe(10);
    fixture.destroy();
  });

  it('approves a pending property and updates its SaaS tier authoritatively', () => {
    const fixture = TestBed.createComponent(PropertyManagementComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    const property = { id: 'hotel-1', name: 'LuxeStay', status: 'PENDING', approvalStatus: 'PENDING_APPROVAL', subscriptionTier: 'Basic' } as any;
    http.expectOne(`${environment.apiUrl}/v1/hotels`).flush([property]);
    http.expectOne(`${environment.apiUrl}/public/locations/provinces`).flush([]);

    component.approve(property);
    http.expectOne({ method: 'POST', url: `${environment.apiUrl}/v1/hotels/hotel-1/approve` }).flush({ ...property, status: 'ACTIVE', approvalStatus: 'APPROVED' });
    http.expectOne(`${environment.apiUrl}/v1/hotels`).flush([{ ...property, status: 'ACTIVE', approvalStatus: 'APPROVED' }]);

    component.openSubscription(property);
    component.selectedSubscriptionTier = 'Pro';
    component.saveSubscription();
    const tier = http.expectOne({ method: 'PUT', url: `${environment.apiUrl}/tenants/hotel-1/subscription-tier` });
    expect(tier.request.body).toEqual({ newTier: 'Pro' });
    tier.flush({ succeeded: true, message: 'Đã cập nhật gói.' });
    fixture.detectChanges();

    expect(property.subscriptionTier).toBe('Pro');
    expect(component.subscriptionDialogVisible).toBe(false);
    fixture.destroy();
  });
});
