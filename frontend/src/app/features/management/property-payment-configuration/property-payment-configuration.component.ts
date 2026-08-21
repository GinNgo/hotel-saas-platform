import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { distinctUntilChanged, finalize, map } from 'rxjs';
import {
  PropertyDepositPolicy,
  PropertyPaymentConfiguration,
  PropertyPaymentConfigurationService,
  PropertyPaymentConfigurationUpdate,
  PropertyPaymentEnvironment,
  PropertyPaymentMethodCode,
  PropertyPaymentMethodReadiness,
  PropertyPaymentReadiness,
} from '../../../core/services/property-payment-configuration.service';
import {
  ActionCode,
  FunctionCode,
  PermissionService,
} from '../../../core/services/permission.service';

interface PaymentMethodDefinition {
  code: PropertyPaymentMethodCode;
  icon: string;
  provider: string;
  bankBased: boolean;
  merchantBased: boolean;
}

type PaymentMethodForm = FormGroup<{
  method: FormControl<PropertyPaymentMethodCode>;
  enabled: FormControl<boolean>;
  provider: FormControl<string>;
  merchantReference: FormControl<string>;
}>;

@Component({
  selector: 'app-property-payment-configuration',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './property-payment-configuration.component.html',
  styleUrls: ['./property-payment-configuration.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PropertyPaymentConfigurationComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly formBuilder = inject(FormBuilder);
  private readonly paymentConfiguration = inject(PropertyPaymentConfigurationService);
  private readonly permissionService = inject(PermissionService);
  private readonly destroyRef = inject(DestroyRef);

  readonly methodDefinitions: ReadonlyArray<PaymentMethodDefinition> = [
    { code: 'MANUAL_TRANSFER', icon: 'account_balance', provider: 'BANK', bankBased: true, merchantBased: false },
    { code: 'QR_TRANSFER', icon: 'qr_code_2', provider: 'VIETQR', bankBased: true, merchantBased: false },
    { code: 'VNPAY', icon: 'account_balance_wallet', provider: 'VNPAY', bankBased: false, merchantBased: true },
    { code: 'MOMO', icon: 'payments', provider: 'MOMO', bankBased: false, merchantBased: true },
    { code: 'ZALOPAY', icon: 'smartphone', provider: 'ZALOPAY', bankBased: false, merchantBased: true },
    { code: 'CASH', icon: 'point_of_sale', provider: 'CASH', bankBased: false, merchantBased: false },
    { code: 'CARD_TERMINAL', icon: 'credit_card', provider: 'CARD_TERMINAL', bankBased: false, merchantBased: false },
    { code: 'OTHER', icon: 'more_horiz', provider: 'OTHER', bankBased: false, merchantBased: false },
  ];

  readonly methodForms = new FormArray<PaymentMethodForm>(
    this.methodDefinitions.map((method) => new FormGroup({
      method: new FormControl(method.code, { nonNullable: true }),
      enabled: new FormControl(false, { nonNullable: true }),
      provider: new FormControl(method.provider, { nonNullable: true }),
      merchantReference: new FormControl('', { nonNullable: true }),
    })),
  );

  readonly form = this.formBuilder.nonNullable.group({
    enabled: false,
    environment: ['SIMULATOR' as PropertyPaymentEnvironment, Validators.required],
    bankName: '',
    bankCode: '',
    accountName: '',
    accountNumber: '',
    depositPolicyType: ['NONE' as PropertyDepositPolicy, Validators.required],
    depositValue: new FormControl<number | null>(null),
    paymentExpiryMinutes: [30, [Validators.required, Validators.min(1), Validators.max(10080)]],
    transferTemplate: ['BOOKING {paymentCode}', Validators.required],
    qrProvider: 'VIETQR',
    instructionsVi: ['', Validators.required],
    instructionsEn: ['', Validators.required],
    methods: this.methodForms,
  });

  readonly propertyId = signal<string | number | null>(null);
  readonly configuration = signal<PropertyPaymentConfiguration | null>(null);
  readonly readiness = signal<PropertyPaymentReadiness | null>(null);
  readonly accountNumberMasked = signal('');
  readonly merchantReferencesMasked = signal<Record<string, string>>({});
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly validating = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly validationBlockers = signal<string[]>([]);
  readonly canManage = this.permissionService.hasPermission(
    FunctionCode.PROPERTY_PAYMENT_CONFIG,
    ActionCode.UPDATE,
  );
  readonly busy = computed(() => this.loading() || this.saving() || this.validating());

  ngOnInit(): void {
    if (!this.canManage) this.form.disable({ emitEvent: false });

    this.route.queryParamMap
      .pipe(
        map((params) => this.parsePropertyId(params.get('propertyId'))),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((propertyId) => {
        this.propertyId.set(propertyId);
        this.configuration.set(null);
        this.readiness.set(null);
        this.errorMessage.set('');
        this.successMessage.set('');
        this.validationBlockers.set([]);
        if (propertyId) this.load(propertyId);
      });
  }

  load(propertyId = this.propertyId()): void {
    if (!propertyId) return;
    this.loading.set(true);
    this.errorMessage.set('');

    this.paymentConfiguration.get(propertyId)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (configuration) => this.applyConfiguration(configuration),
        error: (error: HttpErrorResponse) => this.captureError(error),
      });
  }

  save(): void {
    const propertyId = this.propertyId();
    if (!propertyId || !this.canManage || this.busy()) return;
    const blockers = this.localValidationBlockers();
    this.validationBlockers.set(blockers);
    this.successMessage.set('');
    if (blockers.length > 0) {
      this.form.markAllAsTouched();
      this.focusFirstInvalidControl();
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');
    this.paymentConfiguration.update(propertyId, this.buildRequest())
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (configuration) => {
          this.applyConfiguration(configuration);
          this.successMessage.set('PROPERTY_PAYMENT_CONFIG.MESSAGES.SAVED');
        },
        error: (error: HttpErrorResponse) => this.captureError(error),
      });
  }

  validateConfiguration(): void {
    const propertyId = this.propertyId();
    if (!propertyId || !this.canManage || this.busy()) return;
    const blockers = this.localValidationBlockers();
    this.validationBlockers.set(blockers);
    this.successMessage.set('');
    if (blockers.length > 0) {
      this.form.markAllAsTouched();
      this.focusFirstInvalidControl();
      return;
    }

    this.validating.set(true);
    this.errorMessage.set('');
    this.paymentConfiguration.validate(propertyId, this.buildRequest())
      .pipe(
        finalize(() => this.validating.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (readiness) => {
          this.readiness.set(readiness);
          this.validationBlockers.set(readiness.blockers);
          this.successMessage.set(
            readiness.ready
              ? 'PROPERTY_PAYMENT_CONFIG.MESSAGES.VALIDATION_READY'
              : 'PROPERTY_PAYMENT_CONFIG.MESSAGES.VALIDATION_BLOCKED',
          );
        },
        error: (error: HttpErrorResponse) => this.captureError(error),
      });
  }

  retry(): void {
    this.load();
  }

  methodDefinition(code: PropertyPaymentMethodCode): PaymentMethodDefinition {
    return this.methodDefinitions.find((method) => method.code === code) ?? this.methodDefinitions[7];
  }

  methodReadiness(code: PropertyPaymentMethodCode): PropertyPaymentMethodReadiness | undefined {
    return this.readiness()?.methods.find((method) => method.method === code);
  }

  methodLabelKey(code: PropertyPaymentMethodCode): string {
    return `PROPERTY_PAYMENT_CONFIG.METHODS.${code}`;
  }

  blockerLabelKey(blocker: string): string {
    const normalized = blocker.split('.').at(-1)?.toUpperCase() || 'UNKNOWN';
    return `PROPERTY_PAYMENT_CONFIG.BLOCKERS.${normalized}`;
  }

  environmentLabelKey(environment: PropertyPaymentEnvironment): string {
    return `PROPERTY_PAYMENT_CONFIG.ENVIRONMENTS.${environment}`;
  }

  environmentHelpKey(environment: PropertyPaymentEnvironment): string {
    return `PROPERTY_PAYMENT_CONFIG.ENVIRONMENT_HELP.${environment}`;
  }

  hasEnabledBankMethod(): boolean {
    return this.methodForms.controls.some((control) => {
      const definition = this.methodDefinition(control.controls.method.value);
      return control.controls.enabled.value && definition.bankBased;
    });
  }

  showDepositValue(): boolean {
    return this.form.controls.depositPolicyType.value !== 'NONE';
  }

  depositValueSuffixKey(): string {
    return this.form.controls.depositPolicyType.value === 'PERCENTAGE'
      ? 'PROPERTY_PAYMENT_CONFIG.FORM.PERCENT'
      : 'PROPERTY_PAYMENT_CONFIG.FORM.VND';
  }

  trackMethod(_: number, control: PaymentMethodForm): PropertyPaymentMethodCode {
    return control.controls.method.value;
  }

  private applyConfiguration(configuration: PropertyPaymentConfiguration): void {
    this.configuration.set(configuration);
    this.readiness.set(configuration.readiness);
    this.accountNumberMasked.set(configuration.accountNumberMasked || '');
    this.merchantReferencesMasked.set(Object.fromEntries(
      configuration.methods
        .filter((method) => method.merchantReferenceMasked)
        .map((method) => [method.method, method.merchantReferenceMasked as string]),
    ));

    this.form.patchValue({
      enabled: configuration.enabled,
      environment: configuration.environment,
      bankName: configuration.bankName || '',
      bankCode: configuration.bankCode || '',
      accountName: configuration.accountName || '',
      accountNumber: '',
      depositPolicyType: configuration.depositPolicyType,
      depositValue: configuration.depositValue ?? null,
      paymentExpiryMinutes: configuration.paymentExpiryMinutes,
      transferTemplate: configuration.transferTemplate || 'BOOKING {paymentCode}',
      qrProvider: configuration.qrProvider || 'VIETQR',
      instructionsVi: configuration.instructionsVi || '',
      instructionsEn: configuration.instructionsEn || '',
    }, { emitEvent: false });

    this.methodForms.controls.forEach((control) => {
      const code = control.controls.method.value;
      const method = configuration.methods.find((candidate) => candidate.method === code);
      const definition = this.methodDefinition(code);
      control.patchValue({
        enabled: method?.enabled ?? false,
        provider: method?.provider || definition.provider,
        merchantReference: '',
      }, { emitEvent: false });
    });
    this.form.markAsPristine();
    this.form.updateValueAndValidity({ emitEvent: false });
    this.validationBlockers.set(configuration.readiness.blockers);
  }

  private buildRequest(): PropertyPaymentConfigurationUpdate {
    const value = this.form.getRawValue();
    const maskedReferences = this.merchantReferencesMasked();
    const accountNumber = this.optional(value.accountNumber);
    const depositValue = value.depositPolicyType === 'NONE' || value.depositValue === null
      ? undefined
      : Number(value.depositValue);

    return {
      enabled: value.enabled,
      environment: value.environment,
      methods: value.methods.map((method) => ({
        method: method.method,
        enabled: method.enabled,
        provider: this.optional(method.provider) || this.methodDefinition(method.method).provider,
        merchantReference: this.optional(method.merchantReference) || maskedReferences[method.method],
      })),
      bankName: this.optional(value.bankName),
      bankCode: this.optional(value.bankCode),
      accountName: this.optional(value.accountName),
      accountNumber,
      depositPolicyType: value.depositPolicyType,
      depositValue,
      paymentExpiryMinutes: Number(value.paymentExpiryMinutes),
      transferTemplate: this.optional(value.transferTemplate),
      qrProvider: this.optional(value.qrProvider),
      instructionsVi: this.optional(value.instructionsVi),
      instructionsEn: this.optional(value.instructionsEn),
    };
  }

  private localValidationBlockers(): string[] {
    const value = this.form.getRawValue();
    const blockers: string[] = [];
    const enabledMethods = value.methods.filter((method) => method.enabled);

    if (!Number.isInteger(Number(value.paymentExpiryMinutes))
      || Number(value.paymentExpiryMinutes) < 1
      || Number(value.paymentExpiryMinutes) > 10080) {
      blockers.push('payment_expiry_invalid');
    }
    if (!this.optional(value.instructionsVi) || !this.optional(value.instructionsEn)) {
      blockers.push('bilingual_instructions_required');
    }
    if (!this.optional(value.transferTemplate)?.includes('{paymentCode}')) {
      blockers.push('payment_code_placeholder_required');
    }
    if (enabledMethods.length === 0) blockers.push('enabled_method_required');

    const depositValue = value.depositValue === null ? null : Number(value.depositValue);
    if (value.depositPolicyType === 'FIXED'
      && (!Number.isInteger(depositValue) || (depositValue ?? 0) <= 0)) {
      blockers.push('fixed_deposit_invalid');
    }
    if (value.depositPolicyType === 'PERCENTAGE'
      && (!Number.isInteger(depositValue) || (depositValue ?? 0) < 1 || (depositValue ?? 0) > 100)) {
      blockers.push('percentage_deposit_invalid');
    }

    const bankMethodEnabled = enabledMethods.some((method) => this.methodDefinition(method.method).bankBased);
    if (bankMethodEnabled && (!this.optional(value.bankName)
      || !this.optional(value.bankCode)
      || !this.optional(value.accountName)
      || (!this.optional(value.accountNumber) && !this.accountNumberMasked()))) {
      blockers.push('bank_receiver_incomplete');
    }

    if (value.environment !== 'SIMULATOR') {
      const maskedReferences = this.merchantReferencesMasked();
      enabledMethods
        .filter((method) => this.methodDefinition(method.method).merchantBased)
        .forEach((method) => {
          if (!this.optional(method.merchantReference) && !maskedReferences[method.method]) {
            blockers.push(`${method.method.toLowerCase()}.merchant_reference_required`);
          }
        });
    }

    return [...new Set(blockers)];
  }

  private captureError(error: HttpErrorResponse): void {
    const body = error.error as {
      message?: string;
      fieldErrors?: Record<string, string>;
      currentState?: string;
    } | null;
    const fieldErrors = body?.fieldErrors ? Object.values(body.fieldErrors) : [];
    this.validationBlockers.set(fieldErrors);
    this.errorMessage.set(body?.message || 'PROPERTY_PAYMENT_CONFIG.MESSAGES.REQUEST_FAILED');
  }

  private optional(value: string | null | undefined): string | undefined {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
  }

  private parsePropertyId(value: string | null): string | number | null {
    if (!value) return null;
    if (/^\d+$/.test(value)) return Number(value);
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
  }

  private focusFirstInvalidControl(): void {
    if (typeof document === 'undefined') return;
    globalThis.setTimeout(() => {
      const target = document.querySelector<HTMLElement>(
        'app-property-payment-configuration input.ng-invalid, '
        + 'app-property-payment-configuration select.ng-invalid, '
        + 'app-property-payment-configuration textarea.ng-invalid',
      );
      target?.focus();
    });
  }
}
