import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { PlatformPaymentPanelComponent } from './platform-payment-panel.component';
import { PermissionService } from '../../../core/services/permission.service';

describe('PlatformPaymentPanelComponent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlatformPaymentPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: PermissionService, useValue: { hasPermission: vi.fn(() => true) } }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('creates a server-owned attempt and exposes no client activation control', async () => {
    const fixture = TestBed.createComponent(PlatformPaymentPanelComponent);
    fixture.componentRef.setInput('order', {
      publicId: 'order-1', orderCode: 'SUB-1', ownerUserId: 1, targetHotelId: 42,
      operation: 'PURCHASE', planId: 7, planVersion: 'PLAN-7-V1', planCode: 'PRO',
      planName: 'Professional', price: 2400000, currency: 'VND', billingPeriod: 'YEARLY',
      durationValue: 1, durationUnit: 'YEAR', featureSnapshotJson: '{}', status: 'CREATED',
      expiresAt: '2026-08-02T01:00:00',
    });
    fixture.detectChanges();
    fixture.componentInstance.createAttempt();

    const request = http.expectOne(`${environment.apiUrl}/platform/subscription-orders/order-1/payment-attempts`);
    expect(request.request.body).toEqual({ provider: 'SIMULATOR', method: 'SIMULATOR' });
    expect(request.request.headers.has('Idempotency-Key')).toBe(true);
    request.flush({
      publicId: 'attempt-1', orderPublicId: 'order-1', status: 'PENDING', provider: 'SIMULATOR',
      method: 'SIMULATOR', environment: 'SIMULATOR', expectedAmount: 2400000, currency: 'VND',
      providerOrderReference: 'provider-order-1', expiresAt: '2026-08-02T01:00:00',
      merchantReferenceMasked: '****ATOR', replayed: false,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Chờ nhà cung cấp');
    expect(element.textContent).toContain('Gói chưa thay đổi');
    expect(element.textContent).not.toContain('Kích hoạt gói');
  });
});
