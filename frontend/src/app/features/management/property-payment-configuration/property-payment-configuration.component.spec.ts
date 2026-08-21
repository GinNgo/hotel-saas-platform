import { convertToParamMap, ActivatedRoute } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import {
  PropertyPaymentConfiguration,
  PropertyPaymentConfigurationService,
} from '../../../core/services/property-payment-configuration.service';
import { ActionCode, PermissionService } from '../../../core/services/permission.service';
import { PropertyPaymentConfigurationComponent } from './property-payment-configuration.component';

describe('PropertyPaymentConfigurationComponent', () => {
  let canManage: boolean;
  let api: {
    get: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    validate: ReturnType<typeof vi.fn>;
  };

  const readyConfiguration: PropertyPaymentConfiguration = {
    id: 11,
    propertyId: 7,
    enabled: true,
    environment: 'SIMULATOR',
    bankName: 'Luxe Bank',
    bankCode: 'LUXE',
    accountName: 'LUXESTAY HOTEL',
    accountNumberMasked: '****6789',
    depositPolicyType: 'PERCENTAGE',
    depositValue: 30,
    paymentExpiryMinutes: 30,
    transferTemplate: 'BOOKING {paymentCode}',
    qrProvider: 'VIETQR',
    instructionsVi: 'Quet ma va thanh toan.',
    instructionsEn: 'Scan the code and pay.',
    version: 3,
    methods: [
      { method: 'MANUAL_TRANSFER', enabled: true, provider: 'BANK' },
    ],
    readiness: {
      ready: true,
      environment: 'SIMULATOR',
      blockers: [],
      methods: [
        { method: 'MANUAL_TRANSFER', provider: 'BANK', ready: true, blockers: [] },
      ],
    },
  };

  beforeEach(async () => {
    canManage = true;
    api = {
      get: vi.fn(() => of(structuredClone(readyConfiguration))),
      update: vi.fn(() => of(structuredClone(readyConfiguration))),
      validate: vi.fn(() => of(structuredClone(readyConfiguration.readiness))),
    };

    await TestBed.configureTestingModule({
      imports: [PropertyPaymentConfigurationComponent],
      providers: [
        provideTranslateService({ fallbackLang: 'en' }),
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: of(convertToParamMap({ propertyId: '7' })) },
        },
        { provide: PropertyPaymentConfigurationService, useValue: api },
        {
          provide: PermissionService,
          useValue: {
            hasPermission: vi.fn((_functionCode: string, action: number) => {
              return action === ActionCode.VIEW || canManage;
            }),
          },
        },
      ],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      PROPERTY_PAYMENT_CONFIG: {
        TITLE: 'Property payment configuration',
        FORM: {
          CURRENT_MASKED: 'Stored',
          SECRET_PLACEHOLDER: 'Leave blank to keep the current value',
        },
        STATUS: { READY: 'Ready', DISABLED: 'Disabled', NEEDS_ATTENTION: 'Needs attention' },
        METHODS: { MANUAL_TRANSFER: 'Manual bank transfer' },
        READINESS: {
          EYEBROW: 'Payment readiness',
          READY_TITLE: 'Ready for testing',
          READY_BODY: 'Ready body',
          BLOCKED_TITLE: 'Not ready yet',
          BLOCKED_BODY: 'Blocked body',
          CHECKLIST: 'Validation results',
          METHODS_OK: 'Methods ready',
          INSTRUCTIONS_OK: 'Instructions ready',
          RECEIVER_OK: 'Receiver ready',
        },
        BLOCKERS: {
          PRODUCTION_NOT_APPROVED: 'Production has not been approved.',
        },
      },
    }, true);
    translate.use('en');
  });

  it('loads the selected property and displays only the masked account value', () => {
    const fixture = TestBed.createComponent(PropertyPaymentConfigurationComponent);
    fixture.detectChanges();

    expect(api.get).toHaveBeenCalledWith(7);
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('[data-testid="masked-account"]')?.textContent).toContain('****6789');
    expect((element.querySelector('input[formcontrolname="accountNumber"]') as HTMLInputElement).value).toBe('');
    expect(element.querySelector('.config-layout')).not.toBeNull();
    expect(element.querySelectorAll('.method-card').length).toBe(8);
  });

  it('saves a typed request without echoing the masked account as a new secret', () => {
    const fixture = TestBed.createComponent(PropertyPaymentConfigurationComponent);
    fixture.detectChanges();

    fixture.componentInstance.save();

    expect(api.update).toHaveBeenCalledTimes(1);
    const request = api.update.mock.calls[0][1];
    expect(request.accountNumber).toBeUndefined();
    expect(request.environment).toBe('SIMULATOR');
    expect(request.methods.find((method: { method: string }) => method.method === 'MANUAL_TRANSFER').enabled).toBe(true);
  });

  it('disables the form and hides mutation actions without update permission', () => {
    canManage = false;
    const fixture = TestBed.createComponent(PropertyPaymentConfigurationComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.form.disabled).toBe(true);
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('.read-only-notice')).not.toBeNull();
    expect(element.querySelector('.form-actions')).toBeNull();
  });

  it('renders the truthful production approval blocker', () => {
    api.get.mockReturnValue(of({
      ...structuredClone(readyConfiguration),
      environment: 'PRODUCTION',
      readiness: {
        ready: false,
        environment: 'PRODUCTION',
        blockers: ['manual_transfer.production_not_approved'],
        methods: [
          {
            method: 'MANUAL_TRANSFER',
            provider: 'BANK',
            ready: false,
            blockers: ['production_not_approved'],
          },
        ],
      },
    }));
    const fixture = TestBed.createComponent(PropertyPaymentConfigurationComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Production has not been approved.');
    expect(fixture.nativeElement.textContent).toContain('Not ready yet');
  });
});
