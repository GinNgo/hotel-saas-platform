import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { SubscriptionService } from './subscription.service';

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(SubscriptionService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('uses GUID plan identifiers without numeric coercion', () => {
    const id = '0a6b75ef-ec3d-49aa-b894-9d769c5a2ee4';
    service.updateAdminPlan(id, { code: 'PRO', nameVi: 'Pro', nameEn: 'Pro', billingType: 'YEARLY', price: 1, isLifetime: false, features: [] }).subscribe();
    http.expectOne(`${environment.apiUrl}/admin/subscription-plans/${id}`).flush({});

    service.setAdminPlanStatus(id, 'INACTIVE').subscribe();
    const status = http.expectOne(req => req.url === `${environment.apiUrl}/admin/subscription-plans/${id}/status`);
    expect(status.request.params.get('value')).toBe('INACTIVE');
    status.flush({});
  });

  it('loads tenant-scoped entitlement and usage contracts', () => {
    service.getMySubscriptions().subscribe();
    http.expectOne(`${environment.apiUrl}/subscriptions/me`).flush([]);
    service.getMyUsage().subscribe();
    http.expectOne(`${environment.apiUrl}/subscriptions/me/usage`).flush({});
  });
});
