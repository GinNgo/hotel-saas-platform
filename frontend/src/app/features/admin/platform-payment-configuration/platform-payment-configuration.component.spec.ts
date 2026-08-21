import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { PlatformPaymentConfigurationComponent } from './platform-payment-configuration.component';
import { PermissionService } from '../../../core/services/permission.service';

describe('PlatformPaymentConfigurationComponent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlatformPaymentConfigurationComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: PermissionService, useValue: { hasPermission: vi.fn(() => true) } }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('renders masked merchant readiness and never renders a secret reference', async () => {
    const fixture = TestBed.createComponent(PlatformPaymentConfigurationComponent);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/platform/payment-configuration`).flush([{
      provider: 'MOMO',
      environment: 'SANDBOX',
      enabled: true,
      merchantReferenceMasked: '****7890',
      secretConfigured: true,
      bankName: null,
      bankAccountMasked: null,
      callbackUrl: 'https://api.example.test/callback',
      productionApproved: false,
      ready: true,
      blockers: [],
    }]);
    await fixture.whenStable();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('****7890');
    expect(element.textContent).toContain('Configured (masked)');
    expect(element.textContent).not.toContain('env:PLATFORM_MOMO');
  });

  it('validates readiness using only a provider and renders masked evidence', async () => {
    const fixture = TestBed.createComponent(PlatformPaymentConfigurationComponent);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/platform/payment-configuration`).flush([{
      provider: 'MOMO', environment: 'SANDBOX', enabled: true,
      merchantReferenceMasked: '****7890', secretConfigured: true,
      productionApproved: false, ready: false, blockers: ['sandbox_credentials_incomplete'],
    }]);
    await fixture.whenStable();
    fixture.componentInstance.validate();

    const request = http.expectOne(
      `${environment.apiUrl}/platform/payment-configuration/validate?provider=MOMO`,
    );
    expect(request.request.body).toBeNull();
    request.flush({
      ready: true, mode: 'SANDBOX', provider: 'MOMO', maskedMerchant: '****7890', blockers: [],
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Ready for SANDBOX');
    expect(element.textContent).toContain('****7890');
    expect(fixture.componentInstance.form.secretReference).toBe('');
  });
});
