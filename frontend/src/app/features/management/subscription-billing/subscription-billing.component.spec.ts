import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { PlatformCatalogPlan } from '../../../core/services/platform-billing.service';
import { SubscriptionBillingComponent } from './subscription-billing.component';
import { of } from 'rxjs';
import { PermissionService } from '../../../core/services/permission.service';

describe('SubscriptionBillingComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<SubscriptionBillingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SubscriptionBillingComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PermissionService, useValue: { hasPermission: vi.fn(() => true) } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: { get: (key: string) => key === 'propertyId' ? '42' : null } },
            queryParamMap: of({ get: (key: string) => key === 'propertyId' ? '42' : null }),
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SubscriptionBillingComponent);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('creates a backend-owned purchase order and renders truthful policy blockers', async () => {
    const plan = standardPlan();
    flushInitial([plan], entitlement(1, undefined, 'NONE'));
    await fixture.whenStable();
    fixture.componentInstance.createOrder(plan);

    const request = http.expectOne(`${environment.apiUrl}/platform/subscription-orders`);
    expect(request.request.body).toEqual({ targetHotelId: 42, planId: 1 });
    expect(request.request.body.price).toBeUndefined();
    expect(request.request.headers.has('Idempotency-Key')).toBe(true);
    request.flush(orderResponse('PURCHASE', plan));
    await fixture.whenStable();
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Chưa cấu hình chính sách hạ gói');
    expect(element.textContent).toContain('Đơn SUB-1');
    expect(element.textContent).toContain('01/08/2026 18:30');
  });

  it('creates a renewal order for the current plan', async () => {
    const plan = standardPlan();
    flushInitial([plan], entitlement(1, plan));
    await fixture.whenStable();
    fixture.componentInstance.createOrder(plan);

    const request = http.expectOne(`${environment.apiUrl}/platform/subscriptions/42/renewal-orders`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    expect(request.request.headers.has('Idempotency-Key')).toBe(true);
    request.flush(orderResponse('RENEW', plan));
  });

  it('creates an upgrade order without client price or credit fields', async () => {
    const current = standardPlan();
    const target = { ...standardPlan(), id: 2, code: 'PRO', nameVi: 'Professional', nameEn: 'Professional', price: 2400000 };
    flushInitial([current, target], entitlement(1, current));
    await fixture.whenStable();
    fixture.componentInstance.createOrder(target);

    const request = http.expectOne(`${environment.apiUrl}/platform/subscriptions/42/upgrade-orders`);
    expect(request.request.body).toEqual({ targetPlanId: 2 });
    expect(request.request.body.price).toBeUndefined();
    expect(request.request.body.credit).toBeUndefined();
    request.flush(orderResponse('UPGRADE', target));
  });

  it('renders a catalog failure without offering stale plan actions', async () => {
    http.expectOne(`${environment.apiUrl}/platform/subscription-plans`).flush(
      { message: 'Catalog unavailable' }, { status: 503, statusText: 'Unavailable' },
    );
    flushEntitlementAndPolicy(entitlement(1, undefined, 'NONE'));
    await fixture.whenStable();
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Catalog unavailable');
    expect(element.textContent).not.toContain('Create purchase order');
  });

  it('defensively refuses direct order creation when billing permission is revoked', async () => {
    const plan = standardPlan();
    flushInitial([plan], entitlement(1, undefined, 'NONE'));
    await fixture.whenStable();
    (fixture.componentInstance as unknown as { canCreateOrder: boolean }).canCreateOrder = false;

    fixture.componentInstance.createOrder(plan);

    expect(fixture.componentInstance.creatingOrderFor).toBeUndefined();
    expect(fixture.componentInstance.orderError).toBe('');
    http.expectNone(`${environment.apiUrl}/platform/subscription-orders`);
  });

  function flushInitial(plans: PlatformCatalogPlan[], current: unknown): void {
    http.expectOne(`${environment.apiUrl}/platform/subscription-plans`).flush(plans);
    flushEntitlementAndPolicy(current);
  }

  function flushEntitlementAndPolicy(current: unknown): void {
    http.expectOne(`${environment.apiUrl}/platform/subscriptions/42/entitlement`).flush(current as object);
    http.expectOne(`${environment.apiUrl}/platform/subscription-policies`).flush({
      downgradeConfigured: false,
      prorationConfigured: false,
      errorCode: 'POLICY_NOT_CONFIGURED',
      downgradeMessage: 'Downgrade is blocked',
      prorationMessage: 'Proration is blocked',
    });
  }

  function standardPlan(): PlatformCatalogPlan {
    return {
      id: 1, code: 'STANDARD', nameVi: 'Standard', nameEn: 'Standard', billingType: 'MONTHLY',
      price: 100000, currency: 'VND', isLifetime: false, status: 'ACTIVE',
      features: [{ code: 'MAX_PROPERTIES', nameVi: 'Properties', nameEn: 'Properties', valueType: 'NUMERIC', limit: 3 }],
    };
  }

  function entitlement(planId: number, plan?: PlatformCatalogPlan, status = 'ACTIVE') {
    return {
      targetHotelId: 42,
      source: status === 'NONE' ? 'NONE' : 'PLATFORM',
      platformAuthoritative: status !== 'NONE',
      planId: status === 'NONE' ? null : plan?.id ?? planId,
      planCode: status === 'NONE' ? 'NO_PLAN' : plan?.code ?? 'STANDARD',
      planName: status === 'NONE' ? null : plan?.nameVi ?? 'Standard',
      status,
      effectiveFrom: '2026-07-01T00:00:00',
      effectiveUntil: status === 'NONE' ? null : '2026-08-01T00:00:00',
      lifetime: false,
      limits: status === 'NONE' ? {} : { MAX_PROPERTIES: 3 },
      sourceReference: status === 'NONE' ? null : 'contract-1',
      migrationBlocker: status === 'NONE' ? 'LEGACY_SCOPE_AMBIGUOUS_OR_MISSING' : null,
    };
  }

  function orderResponse(operation: 'PURCHASE' | 'RENEW' | 'UPGRADE', plan: PlatformCatalogPlan) {
    return {
      publicId: `order-${operation.toLowerCase()}`, orderCode: 'SUB-1', ownerUserId: 10,
      targetHotelId: 42, operation, planId: plan.id, planVersion: `PLAN-${plan.id}-V1`,
      planCode: plan.code, planName: plan.nameVi, price: plan.price, currency: 'VND',
      billingPeriod: plan.billingType, durationValue: 1, durationUnit: 'MONTH',
      featureSnapshotJson: '{}', status: 'CREATED', expiresAt: '2026-08-01T18:30:00', replayed: false,
    };
  }
});
