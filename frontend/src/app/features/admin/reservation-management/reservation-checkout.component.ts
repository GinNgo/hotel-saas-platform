import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import {
  CheckoutPreview,
  CheckoutResult,
  FolioLine,
  NegativeAdjustmentType,
  PropertyCheckoutService,
  ServiceChargeType,
  SurchargeType,
} from '../../../core/services/property-checkout.service';
import {
  HotelServiceDTO,
  HotelServiceService,
} from '../../../core/services/hotel-service.service';
import { finalize, timeout } from 'rxjs/operators';
import { ActionCode, FunctionCode, PermissionService } from '../../../core/services/permission.service';

type AdjustmentMode = 'SURCHARGE' | 'NEGATIVE_ADJUSTMENT';
type BusyAction = 'PREVIEW' | 'SERVICE' | 'ADJUSTMENT' | 'OVERRIDE' | 'CHECKOUT' | null;

@Component({
  selector: 'app-reservation-checkout',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ButtonModule, InputNumberModule, SelectModule],
  templateUrl: './reservation-checkout.component.html',
  styleUrl: './reservation-checkout.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReservationCheckoutComponent implements OnChanges {
  private readonly checkoutService = inject(PropertyCheckoutService);
  private readonly hotelService = inject(HotelServiceService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly permissionService = inject(PermissionService);
  readonly canCreateFinanceCharge = this.permissionService.hasPermission(FunctionCode.FINANCE, ActionCode.CREATE);
  readonly canApproveCheckout = this.permissionService.hasPermission(FunctionCode.CHECKOUT, ActionCode.APPROVE);
  readonly canExecuteCheckout = this.permissionService.hasPermission(FunctionCode.CHECKOUT, ActionCode.TASK_EXECUTE);
  private readonly servicesState = signal<HotelServiceDTO[]>([]);
  private serviceMutation: { fingerprint: string; idempotencyKey: string } | null = null;
  private adjustmentMutation: { fingerprint: string; idempotencyKey: string } | null = null;

  @Input({ required: true }) reservationId!: string | number;
  @Input() bookingCode = '';
  @Output() completed = new EventEmitter<CheckoutResult>();
  @Output() closed = new EventEmitter<void>();

  readonly preview = signal<CheckoutPreview | null>(null);
  readonly busyAction = signal<BusyAction>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly checkoutOverrideId = signal<string | number | null>(null);
  readonly catalogHotelId = signal<string | number | null>(null);
  readonly catalogLoading = signal(false);
  readonly catalogError = signal<string | null>(null);
  readonly adjustmentHistory = computed<FolioLine[]>(() =>
    (this.preview()?.folio.lines ?? []).filter((line) =>
      ['SURCHARGE', 'DISCOUNT', 'ADJUSTMENT'].includes(line.category),
    ),
  );

  readonly serviceForm = this.formBuilder.nonNullable.group({
    serviceId: ['' as string | number, Validators.required],
    chargeType: ['SERVICE' as ServiceChargeType, Validators.required],
    quantity: [1, [Validators.required, Validators.min(0.01)]],
  });

  readonly adjustmentForm = this.formBuilder.nonNullable.group({
    mode: ['SURCHARGE' as AdjustmentMode, Validators.required],
    surchargeType: ['OTHER' as SurchargeType, Validators.required],
    negativeType: ['SERVICE_RECOVERY' as NegativeAdjustmentType, Validators.required],
    description: ['', [Validators.required, Validators.maxLength(500)]],
    amount: [0, [Validators.required, Validators.min(1)]],
  });

  readonly overrideForm = this.formBuilder.nonNullable.group({
    reason: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(500)]],
  });

  readonly serviceOptions = computed(() =>
    this.servicesState()
      .filter((service) => service.id && service.status === 'ACTIVE')
      .map((service) => ({
        label: `${service.nameVi} - ${this.formatVnd(service.price)}`,
        value: service.id as string | number,
      })),
  );

  readonly canCheckout = computed(() => {
    const current = this.preview();
    return Boolean(current?.checkoutAllowed || (
      current?.settlementState === 'OUTSTANDING' && this.checkoutOverrideId()
    ));
  });

  readonly hasOutstandingBalance = computed(
    () => this.preview()?.settlementState === 'OUTSTANDING',
  );

  readonly isOverpaid = computed(() => this.preview()?.settlementState === 'OVERPAID');
  readonly needsDebtOverride = computed(() =>
    this.preview()?.settlementState === 'OUTSTANDING' && !this.checkoutOverrideId(),
  );

  readonly surchargeTypes: Array<{ label: string; value: SurchargeType }> = [
    { label: 'Nhận phòng sớm', value: 'EARLY_CHECK_IN' },
    { label: 'Trả phòng muộn', value: 'LATE_CHECK_OUT' },
    { label: 'Thêm khách', value: 'EXTRA_GUEST' },
    { label: 'Hư hỏng', value: 'DAMAGE' },
    { label: 'Vệ sinh đặc biệt', value: 'CLEANING' },
    { label: 'Mất chìa khóa', value: 'LOST_KEY' },
    { label: 'Khác', value: 'OTHER' },
  ];

  readonly negativeAdjustmentTypes: Array<{ label: string; value: NegativeAdjustmentType }> = [
    { label: 'Khắc phục dịch vụ', value: 'SERVICE_RECOVERY' },
    { label: 'Hỗ trợ thiện chí', value: 'GOODWILL' },
    { label: 'Điều chỉnh giá', value: 'PRICE_CORRECTION' },
    { label: 'Giảm giá thủ công', value: 'MANUAL_DISCOUNT' },
    { label: 'Khác', value: 'OTHER' },
  ];

  readonly adjustmentModes: Array<{ label: string; value: AdjustmentMode }> = [
    { label: 'Phụ thu', value: 'SURCHARGE' },
    { label: 'Điều chỉnh giảm', value: 'NEGATIVE_ADJUSTMENT' },
  ];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['reservationId'] && this.reservationId) {
      this.servicesState.set([]);
      this.catalogHotelId.set(null);
      this.catalogError.set(null);
      this.serviceMutation = null;
      this.adjustmentMutation = null;
      this.checkoutOverrideId.set(null);
      this.overrideForm.reset({ reason: '' });
      this.loadPreview();
    }
  }

  loadPreview(): void {
    if (!this.reservationId || this.busyAction()) return;
    this.checkoutOverrideId.set(null);
    this.beginAction('PREVIEW');
    this.checkoutService.preview(this.reservationId).subscribe({
      next: (preview) => {
        this.preview.set(preview);
        this.finishAction();
        this.loadCatalogForProperty(preview.hotelId);
      },
      error: (error: unknown) => this.failAction(error, 'Không thể tải quyết toán hiện tại.'),
    });
  }

  addService(): void {
    if (!this.canCreateFinanceCharge || this.serviceForm.invalid || this.busyAction()) {
      this.serviceForm.markAllAsTouched();
      return;
    }
    const request = this.serviceForm.getRawValue();
    const mutation = this.serviceMutationFor(request);
    this.beginAction('SERVICE');
    this.checkoutService.addServiceCharge(
      this.reservationId,
      request,
      { idempotencyKey: mutation.idempotencyKey },
    ).subscribe({
      next: () => {
        this.serviceMutation = null;
        this.successMessage.set('Đã thêm dịch vụ theo giá cấu hình của hệ thống.');
        this.serviceForm.patchValue({ serviceId: '', quantity: 1 });
        this.refreshAfterMutation();
      },
      error: (error: unknown) => this.failAction(error, 'Không thể thêm dịch vụ.'),
    });
  }

  selectChargeType(chargeType: ServiceChargeType): void {
    this.serviceForm.controls.chargeType.setValue(chargeType);
  }

  retryCatalog(): void {
    const hotelId = this.catalogHotelId();
    if (hotelId) this.loadCatalogForProperty(hotelId, true);
  }

  addAdjustment(): void {
    if (!this.canCreateFinanceCharge || this.adjustmentForm.invalid || this.busyAction()) {
      this.adjustmentForm.markAllAsTouched();
      return;
    }
    const value = this.adjustmentForm.getRawValue();
    this.beginAction('ADJUSTMENT');
    const mutation = this.adjustmentMutationFor(value);
    const request$ = value.mode === 'NEGATIVE_ADJUSTMENT'
      ? this.checkoutService.addNegativeAdjustment(this.reservationId, {
          type: value.negativeType,
          description: value.description,
          amount: value.amount,
        }, mutation)
      : this.checkoutService.addSurcharge(this.reservationId, {
          type: value.surchargeType,
          description: value.description,
          amount: value.amount,
        }, mutation);

    request$.subscribe({
      next: () => {
        this.adjustmentMutation = null;
        this.successMessage.set(
          value.mode === 'NEGATIVE_ADJUSTMENT'
            ? 'Đã ghi nhận điều chỉnh giảm có kiểm soát.'
            : 'Đã thêm phụ thu vào folio.',
        );
        this.adjustmentForm.patchValue({ description: '', amount: 0 });
        this.refreshAfterMutation();
      },
      error: (error: unknown) => this.failAction(error, 'Không thể cập nhật phụ thu.'),
    });
  }

  authorizeDebtOverride(): void {
    if (!this.canApproveCheckout || this.overrideForm.invalid || this.busyAction() || !this.needsDebtOverride()) {
      this.overrideForm.markAllAsTouched();
      return;
    }
    const reason = this.overrideForm.controls.reason.value.trim();
    this.beginAction('OVERRIDE');
    this.checkoutService.authorizeDebtOverride(this.reservationId, reason).subscribe({
      next: result => {
        if (!result.debtOverrideApplied || !result.overrideId) {
          this.failAction(null, 'Máy chủ không cấp quyền ghi nợ cho lần checkout này.');
          return;
        }
        this.checkoutOverrideId.set(result.overrideId);
        this.preview.set(result.preview);
        this.successMessage.set('Đã phê duyệt ghi nợ có kiểm soát cho lần checkout này.');
        this.finishAction();
      },
      error: (error: unknown) => this.failAction(error, 'Không thể phê duyệt ghi nợ.'),
    });
  }

  checkout(): void {
    if (!this.canExecuteCheckout || !this.canCheckout() || this.busyAction()) return;
    this.beginAction('CHECKOUT');
    this.checkoutService
      .checkout(this.reservationId, this.checkoutOverrideId() ?? undefined)
      .subscribe({
        next: (result) => {
          this.successMessage.set(`Đã chốt hóa đơn ${result.invoiceNumber}.`);
          this.finishAction();
          this.completed.emit(result);
        },
        error: (error: unknown) => this.failAction(error, 'Không thể hoàn tất trả phòng.'),
      });
  }

  close(): void {
    if (!this.busyAction()) this.closed.emit();
  }

  trackLine(index: number, line: { sourceType: string; sourceId: string | number | null }): string {
    return `${line.sourceType}-${line.sourceId ?? index}`;
  }

  sumAmounts(first: number | string, second: number | string): number {
    return Number(first) + Number(second);
  }

  isNegative(value: number | string): boolean {
    return Number(value) < 0;
  }

  formatVnd(value: number | string): string {
    const amount = typeof value === 'number' ? value : Number(value);
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 0,
    }).format(Number.isFinite(amount) ? amount : 0);
  }

  private refreshAfterMutation(): void {
    this.busyAction.set(null);
    this.loadPreview();
  }

  private loadCatalogForProperty(hotelId: string | number, force = false): void {
    if (!force && this.catalogHotelId() === hotelId && this.servicesState().length > 0) return;
    this.catalogHotelId.set(hotelId);
    this.catalogLoading.set(true);
    this.catalogError.set(null);
    this.servicesState.set([]);
    this.hotelService.getServicesForHotel(hotelId).pipe(
      timeout(15000),
      finalize(() => this.catalogLoading.set(false)),
    ).subscribe({
      next: (services) => {
        this.servicesState.set(services);
      },
      error: (error: unknown) => {
        this.catalogError.set(
          this.extractErrorMessage(error) || 'Không thể tải danh mục dịch vụ của khách sạn này.',
        );
      },
    });
  }

  private serviceMutationFor(request: {
    serviceId: string | number;
    chargeType: ServiceChargeType;
    quantity: number;
  }): { fingerprint: string; idempotencyKey: string } {
    const fingerprint = JSON.stringify(request);
    if (this.serviceMutation?.fingerprint === fingerprint) return this.serviceMutation;
    const randomId = globalThis.crypto?.randomUUID?.()
      ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.serviceMutation = {
      fingerprint,
      idempotencyKey: `reservation-${this.reservationId}-service-${randomId}`,
    };
    return this.serviceMutation;
  }

  private adjustmentMutationFor(request: {
    mode: AdjustmentMode;
    surchargeType: SurchargeType;
    negativeType: NegativeAdjustmentType;
    description: string;
    amount: number;
  }): { fingerprint: string; idempotencyKey: string } {
    const fingerprint = JSON.stringify(request);
    if (this.adjustmentMutation?.fingerprint === fingerprint) return this.adjustmentMutation;
    const randomId = globalThis.crypto?.randomUUID?.()
      ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.adjustmentMutation = {
      fingerprint,
      idempotencyKey: `reservation-${this.reservationId}-adjustment-${randomId}`,
    };
    return this.adjustmentMutation;
  }

  private beginAction(action: Exclude<BusyAction, null>): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.busyAction.set(action);
  }

  private finishAction(): void {
    this.busyAction.set(null);
  }

  private failAction(error: unknown, fallback: string): void {
    this.errorMessage.set(this.extractErrorMessage(error) || fallback);
    this.busyAction.set(null);
  }

  private extractErrorMessage(error: unknown): string | null {
    if (!error || typeof error !== 'object') return null;
    const candidate = error as { error?: { message?: unknown }; message?: unknown };
    if (typeof candidate.error?.message === 'string') return candidate.error.message;
    return typeof candidate.message === 'string' ? candidate.message : null;
  }
}
