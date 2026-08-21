import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { Subscription, timer } from 'rxjs';
import { finalize, switchMap } from 'rxjs/operators';
import { LocaleService, SupportedLocale } from '../../../core/i18n/locale.service';
import {
  PropertyPaymentAttempt,
  PropertyPaymentService,
} from '../../../core/services/property-payment.service';
import { financialStateLabel, formatVnd } from '../../../shared/financial/financial.models';

interface PaymentPanelCopy {
  eyebrow: string;
  title: string;
  environment: string;
  amount: string;
  expires: string;
  expired: string;
  status: string;
  checking: string;
  receiver: string;
  account: string;
  bank: string;
  transferContent: string;
  copy: string;
  copied: string;
  qrLabel: string;
  manualNote: string;
  onlineNote: string;
  statusUnavailable: string;
  retryStatus: string;
  retryPayment: string;
  authorityNote: string;
  simulator: string;
  sandbox: string;
  production: string;
  confirmSimulator: string;
  confirmingSimulator: string;
}

const COPY: Record<SupportedLocale, PaymentPanelCopy> = {
  vi: {
    eyebrow: 'Thanh toán bảo mật',
    title: 'Hoàn tất khoản đặt cọc',
    environment: 'Môi trường',
    amount: 'Số tiền do máy chủ xác định',
    expires: 'Thời gian còn lại',
    expired: 'Đã hết thời hạn, đang đồng bộ trạng thái',
    status: 'Trạng thái',
    checking: 'Đang kiểm tra',
    receiver: 'Thông tin nhận tiền',
    account: 'Tài khoản',
    bank: 'Ngân hàng',
    transferContent: 'Nội dung chuyển khoản bắt buộc',
    copy: 'Sao chép',
    copied: 'Đã sao chép',
    qrLabel: 'Dữ liệu QR thanh toán',
    manualNote: 'Chuyển đúng số tiền và nội dung. Nhân viên có thẩm quyền sẽ xác nhận giao dịch.',
    onlineNote: 'Hệ thống đang chờ xác nhận từ nhà cung cấp. Không tải lại hoặc tạo thêm giao dịch khi trạng thái còn đang chờ.',
    statusUnavailable: 'Tạm thời chưa đọc được trạng thái mới từ máy chủ.',
    retryStatus: 'Kiểm tra lại trạng thái',
    retryPayment: 'Tạo yêu cầu thanh toán mới',
    authorityNote: 'Số tiền, người nhận và trạng thái đều lấy từ dữ liệu máy chủ; trình duyệt không thể tự thay đổi.',
    simulator: 'Mô phỏng - không dùng tiền thật',
    sandbox: 'Sandbox nhà cung cấp',
    production: 'Sản xuất',
    confirmSimulator: 'Xác nhận thanh toán mô phỏng',
    confirmingSimulator: 'Đang xác nhận...',
  },
  en: {
    eyebrow: 'Secure payment',
    title: 'Complete the deposit',
    environment: 'Environment',
    amount: 'Server-authoritative amount',
    expires: 'Time remaining',
    expired: 'Expired; synchronizing the server status',
    status: 'Status',
    checking: 'Checking',
    receiver: 'Receiver details',
    account: 'Account',
    bank: 'Bank',
    transferContent: 'Required transfer content',
    copy: 'Copy',
    copied: 'Copied',
    qrLabel: 'Payment QR data',
    manualNote: 'Transfer the exact amount and content. An authorized property user will verify the transaction.',
    onlineNote: 'The system is waiting for provider confirmation. Do not reload or create another transaction while this one is pending.',
    statusUnavailable: 'The latest server status is temporarily unavailable.',
    retryStatus: 'Check status again',
    retryPayment: 'Create a new payment request',
    authorityNote: 'Amount, receiver and status come from server data and cannot be changed by the browser.',
    simulator: 'Simulator - no real money',
    sandbox: 'Provider sandbox',
    production: 'Production',
    confirmSimulator: 'Confirm simulated payment',
    confirmingSimulator: 'Confirming...',
  },
};

@Component({
  selector: 'app-property-payment-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="payment-panel" aria-labelledby="property-payment-title" [attr.aria-busy]="polling || confirmingSimulator">
      <header class="panel-header">
        <div>
          <p class="eyebrow">{{ copy.eyebrow }}</p>
          <h2 id="property-payment-title">{{ copy.title }}</h2>
        </div>
        <span class="environment-chip" [class.production]="attempt.environment === 'PRODUCTION'">
          <span class="environment-dot" aria-hidden="true"></span>
          {{ environmentLabel }}
        </span>
      </header>

      <div class="payment-summary">
        <div class="amount-block">
          <small>{{ copy.amount }}</small>
          <strong>{{ amountLabel }}</strong>
          <span>{{ attempt.method }} · {{ attempt.provider }}</span>
        </div>

        <div class="status-block" role="status" aria-live="polite">
          <small>{{ copy.status }}</small>
          <strong [attr.data-tone]="statusTone">{{ statusLabel }}</strong>
          <span *ngIf="polling" class="polling-label">
            <i class="pi pi-spin pi-spinner" aria-hidden="true"></i>
            {{ copy.checking }}
          </span>
        </div>

        <div class="expiry-block" [class.expiring]="expiresSoon">
          <small>{{ copy.expires }}</small>
          <strong>{{ expiryLabel }}</strong>
          <span>{{ attempt.expiresAt | date:'dd/MM/yyyy HH:mm' }}</span>
        </div>
      </div>

      <div *ngIf="isManual" class="instruction-grid">
        <article class="receiver-card">
          <div class="card-heading">
            <span class="icon-shell" aria-hidden="true"><i class="pi pi-building-columns"></i></span>
            <div>
              <small>{{ copy.receiver }}</small>
              <strong>{{ attempt.receiver.accountName || attempt.receiver.merchantReferenceMasked || '—' }}</strong>
            </div>
          </div>
          <dl>
            <div>
              <dt>{{ copy.bank }}</dt>
              <dd>{{ attempt.receiver.bankName || attempt.receiver.bankCode || '—' }}</dd>
            </div>
            <div>
              <dt>{{ copy.account }}</dt>
              <dd>{{ attempt.receiver.accountNumberMasked || '—' }}</dd>
            </div>
          </dl>
          <p>{{ localizedInstructions }}</p>
        </article>

        <article class="transfer-card">
          <small>{{ copy.transferContent }}</small>
          <div class="transfer-code">
            <code>{{ attempt.uniqueTransferContent || '—' }}</code>
            <button
              type="button"
              (click)="copyTransferContent()"
              [disabled]="!attempt.uniqueTransferContent"
              [attr.aria-label]="copy.transferContent">
              <i class="pi pi-copy" aria-hidden="true"></i>
              {{ copied ? copy.copied : copy.copy }}
            </button>
          </div>

          <div *ngIf="attempt.qrData" class="qr-data">
            <img *ngIf="qrImageUrl" [src]="qrImageUrl" [alt]="copy.qrLabel">
            <code *ngIf="!qrImageUrl">{{ attempt.qrData }}</code>
          </div>
          <p>{{ copy.manualNote }}</p>
        </article>
      </div>

      <article *ngIf="!isManual" class="provider-card">
        <span class="provider-orbit" aria-hidden="true"><i class="pi pi-shield"></i></span>
        <div>
          <strong>{{ attempt.provider }}</strong>
          <p>{{ copy.onlineNote }}</p>
        </div>
        <button *ngIf="canConfirmSimulator" type="button" class="simulator-confirm" [disabled]="confirmingSimulator" (click)="confirmSimulator()">
          <i [class]="confirmingSimulator ? 'pi pi-spin pi-spinner' : 'pi pi-check-circle'" aria-hidden="true"></i>
          {{ confirmingSimulator ? copy.confirmingSimulator : copy.confirmSimulator }}
        </button>
      </article>

      <div *ngIf="pollError" class="poll-error" role="alert">
        <i class="pi pi-wifi" aria-hidden="true"></i>
        <span>{{ copy.statusUnavailable }}</span>
        <button type="button" (click)="retryPolling()">{{ copy.retryStatus }}</button>
      </div>

      <footer class="panel-footer">
        <p><i class="pi pi-lock" aria-hidden="true"></i>{{ copy.authorityNote }}</p>
        <button *ngIf="canRetryPayment" type="button" class="retry-payment" (click)="retryRequested.emit()">
          <i class="pi pi-refresh" aria-hidden="true"></i>
          {{ copy.retryPayment }}
        </button>
      </footer>
    </section>
  `,
  styles: [`
    :host { display: block; width: 100%; }
    .payment-panel { position: relative; overflow: hidden; text-align: left; border: 1px solid #cbd5e1; border-radius: 24px; padding: clamp(18px, 3vw, 32px); color: #102a43; background: radial-gradient(circle at 88% 0%, rgba(14, 165, 164, .18), transparent 34%), linear-gradient(145deg, #f8fafc 0%, #eff9f7 52%, #eef5ff 100%); box-shadow: 0 24px 70px rgba(15, 55, 72, .14); }
    .payment-panel::before { content: ''; position: absolute; inset: 0; pointer-events: none; opacity: .25; background-image: linear-gradient(rgba(15, 118, 110, .12) 1px, transparent 1px), linear-gradient(90deg, rgba(15, 118, 110, .12) 1px, transparent 1px); background-size: 28px 28px; mask-image: linear-gradient(to bottom, black, transparent 65%); }
    .panel-header, .payment-summary, .instruction-grid, .provider-card, .poll-error, .panel-footer { position: relative; z-index: 1; }
    .panel-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
    .eyebrow { margin: 0 0 6px; color: #0f766e; font-size: 12px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
    h2 { margin: 0; color: #102a43; font-size: clamp(24px, 4vw, 36px); line-height: 1.08; letter-spacing: -.035em; }
    .environment-chip { display: inline-flex; align-items: center; gap: 8px; border: 1px solid #99f6e4; border-radius: 999px; padding: 8px 12px; color: #115e59; background: rgba(240, 253, 250, .88); font-size: 12px; font-weight: 800; white-space: nowrap; }
    .environment-chip.production { border-color: #fecaca; color: #991b1b; background: #fff1f2; }
    .environment-dot { width: 8px; height: 8px; border-radius: 50%; background: #14b8a6; box-shadow: 0 0 0 5px rgba(20, 184, 166, .12); }
    .production .environment-dot { background: #dc2626; box-shadow: 0 0 0 5px rgba(220, 38, 38, .12); }
    .payment-summary { display: grid; grid-template-columns: 1.35fr .9fr .9fr; gap: 12px; margin: 24px 0; }
    .payment-summary > div { min-width: 0; border: 1px solid rgba(148, 163, 184, .45); border-radius: 18px; padding: 16px; background: rgba(255, 255, 255, .78); backdrop-filter: blur(10px); }
    small { display: block; margin-bottom: 7px; color: #5f7185; font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .amount-block strong { display: block; color: #0f766e; font-size: clamp(25px, 4vw, 38px); line-height: 1; }
    .amount-block span, .expiry-block span { display: block; margin-top: 8px; color: #62748a; font-size: 12px; }
    .status-block strong, .expiry-block strong { display: block; font-size: 17px; }
    .status-block strong[data-tone='success'] { color: #047857; }
    .status-block strong[data-tone='danger'] { color: #b91c1c; }
    .status-block strong[data-tone='pending'] { color: #a16207; }
    .polling-label { display: inline-flex; align-items: center; gap: 6px; margin-top: 8px; color: #0f766e; font-size: 12px; }
    .expiry-block.expiring { border-color: #fbbf24 !important; background: #fffbeb !important; }
    .instruction-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .receiver-card, .transfer-card, .provider-card { border: 1px solid rgba(148, 163, 184, .5); border-radius: 20px; padding: 18px; background: rgba(255, 255, 255, .86); }
    .card-heading { display: flex; gap: 12px; align-items: center; }
    .card-heading strong { font-size: 16px; }
    .icon-shell, .provider-orbit { display: grid; place-items: center; flex: 0 0 auto; width: 42px; height: 42px; border-radius: 14px; color: #fff; background: linear-gradient(135deg, #0f766e, #0ea5a4); box-shadow: 0 10px 24px rgba(15, 118, 110, .24); }
    dl { display: grid; gap: 8px; margin: 16px 0; }
    dl div { display: flex; justify-content: space-between; gap: 16px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 8px; }
    dt { color: #64748b; font-size: 12px; }
    dd { margin: 0; color: #16324f; font-weight: 800; text-align: right; }
    article p { margin: 12px 0 0; color: #52667b; font-size: 13px; line-height: 1.65; }
    .transfer-code { display: flex; align-items: center; justify-content: space-between; gap: 10px; border: 1px solid #99f6e4; border-radius: 14px; padding: 10px 10px 10px 14px; background: #f0fdfa; }
    .transfer-code code { overflow-wrap: anywhere; color: #115e59; font-size: 14px; font-weight: 900; letter-spacing: .04em; }
    button { min-height: 42px; border: 0; border-radius: 12px; padding: 9px 13px; font: inherit; font-size: 12px; font-weight: 800; cursor: pointer; }
    button:focus-visible { outline: 3px solid rgba(14, 165, 164, .34); outline-offset: 3px; }
    button:disabled { cursor: not-allowed; opacity: .5; }
    .transfer-code button { display: inline-flex; align-items: center; gap: 6px; color: #fff; background: #0f766e; white-space: nowrap; }
    .qr-data { display: grid; place-items: center; margin-top: 14px; border: 1px dashed #94a3b8; border-radius: 14px; padding: 12px; background: #fff; }
    .qr-data img { width: min(210px, 100%); aspect-ratio: 1; object-fit: contain; }
    .qr-data code { max-width: 100%; overflow-wrap: anywhere; color: #334155; font-size: 11px; }
    .provider-card { display: flex; gap: 16px; align-items: center; }
    .provider-card > div:nth-child(2) { flex: 1; }
    .provider-card strong { font-size: 18px; }
    .simulator-confirm { display: inline-flex; align-items: center; justify-content: center; gap: 7px; color: #fff; background: #0f766e; }
    .poll-error { display: flex; align-items: center; gap: 10px; margin-top: 14px; border: 1px solid #fed7aa; border-radius: 14px; padding: 12px; color: #9a3412; background: #fff7ed; }
    .poll-error span { flex: 1; font-size: 13px; }
    .poll-error button { color: #9a3412; background: #ffedd5; }
    .panel-footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 18px; border-top: 1px solid rgba(148, 163, 184, .45); padding-top: 16px; }
    .panel-footer p { display: flex; align-items: flex-start; gap: 8px; margin: 0; max-width: 680px; color: #52667b; font-size: 12px; line-height: 1.55; }
    .retry-payment { display: inline-flex; align-items: center; gap: 7px; color: #fff; background: #0f766e; white-space: nowrap; }
    @media (max-width: 760px) { .panel-header, .panel-footer { align-items: stretch; flex-direction: column; } .environment-chip { align-self: flex-start; white-space: normal; } .payment-summary, .instruction-grid { grid-template-columns: 1fr; } .payment-summary { gap: 9px; } .payment-panel { border-radius: 18px; padding: 17px; } .transfer-code { align-items: stretch; flex-direction: column; } .transfer-code button, .retry-payment { justify-content: center; width: 100%; } }
    @media (prefers-reduced-motion: reduce) { .pi-spinner { animation: none !important; } }
  `],
})
export class PropertyPaymentPanelComponent implements OnInit, OnChanges, OnDestroy {
  private readonly payments = inject(PropertyPaymentService);
  private readonly localeService = inject(LocaleService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private pollSubscription?: Subscription;
  private clockSubscription?: Subscription;

  @Input({ required: true }) attempt!: PropertyPaymentAttempt;
  @Output() readonly attemptChange = new EventEmitter<PropertyPaymentAttempt>();
  @Output() readonly retryRequested = new EventEmitter<void>();

  now = Date.now();
  polling = false;
  pollError = false;
  copied = false;
  confirmingSimulator = false;

  ngOnInit(): void {
    this.clockSubscription = timer(0, 1000).subscribe(() => {
      this.now = Date.now();
      this.changeDetector.markForCheck();
    });
    this.startPolling();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['attempt'] && !changes['attempt'].firstChange) {
      this.startPolling();
    }
  }

  ngOnDestroy(): void {
    this.pollSubscription?.unsubscribe();
    this.clockSubscription?.unsubscribe();
  }

  get copy(): PaymentPanelCopy {
    return COPY[this.localeService.locale()];
  }

  get amountLabel(): string {
    return formatVnd(this.attempt.expectedAmount, this.localeService.locale() === 'en' ? 'en-US' : 'vi-VN');
  }

  get statusLabel(): string {
    return financialStateLabel(this.attempt.status, this.localeService.locale());
  }

  get statusTone(): 'success' | 'danger' | 'pending' {
    if (this.attempt.status === 'SUCCESS') return 'success';
    if (this.canRetryPayment) return 'danger';
    return 'pending';
  }

  get environmentLabel(): string {
    if (this.attempt.environment === 'SIMULATOR') return this.copy.simulator;
    if (this.attempt.environment === 'SANDBOX') return this.copy.sandbox;
    return this.copy.production;
  }

  get expiryLabel(): string {
    const seconds = this.remainingSeconds;
    if (seconds <= 0) return this.copy.expired;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    return [hours ? `${hours}h` : '', `${minutes}m`, `${remainder}s`].filter(Boolean).join(' ');
  }

  get expiresSoon(): boolean {
    return this.isActive && this.remainingSeconds <= 300;
  }

  get isManual(): boolean {
    return ['MANUAL_TRANSFER', 'QR_TRANSFER'].includes(this.attempt.method);
  }

  get localizedInstructions(): string {
    return this.localeService.locale() === 'en'
      ? this.attempt.receiver.instructionsEn || this.attempt.receiver.instructionsVi || this.copy.manualNote
      : this.attempt.receiver.instructionsVi || this.attempt.receiver.instructionsEn || this.copy.manualNote;
  }

  get qrImageUrl(): string | null {
    return this.attempt.qrData?.startsWith('data:image/') ? this.attempt.qrData : null;
  }

  get canRetryPayment(): boolean {
    return ['FAILED', 'EXPIRED', 'CANCELLED'].includes(this.attempt.status);
  }

  get canConfirmSimulator(): boolean {
    return this.attempt.environment === 'SIMULATOR'
      && this.attempt.provider === 'SIMULATOR'
      && ['PENDING', 'PENDING_VERIFICATION'].includes(this.attempt.status)
      && this.isActive;
  }

  confirmSimulator(): void {
    if (!this.canConfirmSimulator || this.confirmingSimulator) return;
    this.confirmingSimulator = true;
    this.pollSubscription?.unsubscribe();
    this.payments.confirmSimulator(this.attempt.attemptId).pipe(
      switchMap(() => this.payments.getAttempt(this.attempt.attemptId)),
      finalize(() => {
        this.confirmingSimulator = false;
        this.changeDetector.markForCheck();
      }),
    ).subscribe({
      next: (updated) => {
        this.attempt = updated;
        this.attemptChange.emit(updated);
        this.startPolling();
      },
      error: () => {
        this.pollError = true;
        this.polling = false;
        this.changeDetector.markForCheck();
      },
    });
  }

  retryPolling(): void {
    this.startPolling();
  }

  async copyTransferContent(): Promise<void> {
    if (!this.attempt.uniqueTransferContent || !globalThis.navigator?.clipboard) return;
    try {
      await globalThis.navigator.clipboard.writeText(this.attempt.uniqueTransferContent);
      this.copied = true;
      this.changeDetector.markForCheck();
      globalThis.setTimeout(() => {
        this.copied = false;
        this.changeDetector.markForCheck();
      }, 1800);
    } catch {
      this.copied = false;
      this.changeDetector.markForCheck();
    }
  }

  private get remainingSeconds(): number {
    const expiry = Date.parse(this.attempt.expiresAt);
    if (!Number.isFinite(expiry)) return 0;
    return Math.max(0, Math.floor((expiry - this.now) / 1000));
  }

  private get isActive(): boolean {
    return ['CREATED', 'PENDING', 'PENDING_VERIFICATION', 'PROCESSING'].includes(this.attempt.status);
  }

  private startPolling(): void {
    this.pollSubscription?.unsubscribe();
    this.pollError = false;
    if (!this.attempt?.attemptId || !this.isActive) {
      this.polling = false;
      return;
    }

    this.polling = true;
    this.pollSubscription = timer(0, 3000).pipe(
      switchMap(() => this.payments.getAttempt(this.attempt.attemptId)),
    ).subscribe({
      next: (updated) => {
        this.attempt = updated;
        this.pollError = false;
        this.attemptChange.emit(updated);
        if (!this.isActive) {
          this.polling = false;
          this.pollSubscription?.unsubscribe();
        }
        this.changeDetector.markForCheck();
      },
      error: () => {
        this.polling = false;
        this.pollError = true;
        this.changeDetector.markForCheck();
      },
    });
  }
}
