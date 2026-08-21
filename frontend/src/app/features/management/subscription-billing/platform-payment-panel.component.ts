import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  PlatformBillingService,
  PlatformOrder,
  PlatformOrderDetails,
  PlatformPaymentAttempt,
} from '../../../core/services/platform-billing.service';
import { finalize, timeout } from 'rxjs/operators';
import { ActionCode, FunctionCode, PermissionService } from '../../../core/services/permission.service';

@Component({
  selector: 'app-platform-payment-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="payment-panel" *ngIf="order" aria-labelledby="platform-payment-title">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Ranh giới thanh toán</p>
          <h3 id="platform-payment-title">Trạng thái thanh toán gói</h3>
        </div>
        <span class="environment" [attr.data-mode]="attempt?.environment || 'SIMULATOR'">
          {{ attempt?.environment || 'SIMULATOR' }}
        </span>
      </div>

      <p class="panel-copy">Máy chủ tạo và xác minh lần thanh toán. Giao diện không thể tự kích hoạt gói.</p>
      <div class="provider-form" *ngIf="!attempt && canExecute">
        <label>Nhà cung cấp<select [(ngModel)]="provider"><option value="SIMULATOR">Mô phỏng nội bộ</option><option value="MOMO">MoMo sandbox</option><option value="VNPAY">VNPay sandbox</option><option value="ZALOPAY">ZaloPay sandbox</option></select></label>
        <label>Phương thức<select [(ngModel)]="method"><option [value]="provider">{{ provider }}</option></select></label>
        <button type="button" class="primary" [disabled]="busy" (click)="createAttempt()">{{ busy ? 'Đang tạo...' : 'Tạo lần thanh toán' }}</button>
      </div>

      <div class="attempt-card" *ngIf="attempt">
        <div class="status-line"><span class="status-dot" [attr.data-status]="attempt.status"></span><strong>{{ statusTitle(attempt.status) }}</strong><small>{{ statusMessage(attempt.status) }}</small></div>
        <dl>
          <div><dt>Số tiền cần thanh toán</dt><dd>{{ attempt.expectedAmount | number:'1.0-0' }} {{ attempt.currency }}</dd></div>
          <div><dt>Tài khoản nhận</dt><dd>{{ attempt.merchantReferenceMasked || 'Máy chủ đã che thông tin' }}</dd></div>
          <div><dt>Mã tham chiếu nhà cung cấp</dt><dd>{{ attempt.providerOrderReference }}</dd></div>
          <div><dt>Hết hạn</dt><dd>{{ attempt.expiresAt | date:'dd/MM/yyyy HH:mm:ss' }}</dd></div>
        </dl>
        <div class="actions">
          <button *ngIf="canExecute && attempt.environment === 'SIMULATOR' && (attempt.status === 'CREATED' || attempt.status === 'PENDING')" type="button" class="primary" [disabled]="busy" (click)="confirmSimulator()">
            {{ busy ? 'Đang xác nhận...' : 'Xác nhận thanh toán mô phỏng' }}
          </button>
          <button type="button" class="secondary" [disabled]="busy" (click)="refreshStatus()">{{ busy ? 'Đang cập nhật...' : 'Cập nhật trạng thái' }}</button>
        </div>
      </div>

      <p class="server-effect" *ngIf="orderStatus === 'APPLIED'">Gói đã được kích hoạt từ bằng chứng thanh toán do máy chủ xác minh.</p>
      <p class="error" *ngIf="error" role="alert">{{ error }}</p>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .payment-panel { margin: 1rem 0 2rem; padding: 1.25rem; border: 1px solid var(--hotel-border); border-radius: 1rem; background: #0f2f3a; color: #f8fafc; box-shadow: 0 16px 34px rgba(15,47,58,.18); }
    .panel-heading { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; }.eyebrow { margin: 0; color: #7dd3c7; font-size: .7rem; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; }.panel-heading h3 { margin: .25rem 0 0; font-size: 1.25rem; }.environment { padding: .3rem .6rem; border: 1px solid rgba(255,255,255,.2); border-radius: 999px; font-size: .7rem; font-weight: 800; }.environment[data-mode='PRODUCTION'] { color: #fecaca; border-color: #ef4444; }
    .panel-copy { color: rgba(248,250,252,.7); font-size: .85rem; }.provider-form { display: grid; grid-template-columns: 1fr 1fr auto; gap: .75rem; align-items: end; margin-top: 1rem; }.provider-form label { display: grid; gap: .35rem; color: #cbd5e1; font-size: .75rem; }.provider-form select { min-height: 2.55rem; padding: .5rem .65rem; border: 1px solid rgba(255,255,255,.2); border-radius: .6rem; background: #173f49; color: #fff; }.primary, .secondary { min-height: 2.55rem; padding: .5rem .8rem; border: 0; border-radius: .6rem; font: inherit; font-weight: 800; cursor: pointer; }.primary { color: #0f2f3a; background: #f0a35b; }.secondary { color: #d7f3e9; background: #176b68; }.primary:disabled, .secondary:disabled { opacity: .55; cursor: not-allowed; }
    .attempt-card { margin-top: 1rem; padding: 1rem; border: 1px solid rgba(255,255,255,.14); border-radius: .8rem; background: rgba(255,255,255,.06); }.status-line { display: grid; grid-template-columns: auto auto 1fr; gap: .55rem; align-items: center; }.status-line small { justify-self: end; color: #cbd5e1; }.status-dot { width: .65rem; height: .65rem; border-radius: 50%; background: #fbbf24; }.status-dot[data-status='SUCCESS'] { background: #34d399; box-shadow: 0 0 0 .25rem rgba(52,211,153,.13); }.status-dot[data-status='FAILED'], .status-dot[data-status='CANCELLED'], .status-dot[data-status='EXPIRED'] { background: #fb7185; }.attempt-card dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .65rem; margin: 1rem 0; }.attempt-card dl div { display: grid; gap: .2rem; padding: .65rem; border-radius: .6rem; background: rgba(15,47,58,.65); }.attempt-card dt { color: #94a3b8; font-size: .7rem; }.attempt-card dd { margin: 0; overflow-wrap: anywhere; font-size: .85rem; font-weight: 700; }.actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .6rem; }.server-effect { margin: 1rem 0 0; padding: .7rem; border-radius: .6rem; background: rgba(52,211,153,.12); color: #a7f3d0; font-size: .8rem; }.error { margin: 1rem 0 0; color: #fecdd3; }
    @media (max-width: 720px) { .provider-form { grid-template-columns: 1fr; }.attempt-card dl { grid-template-columns: 1fr; }.status-line { grid-template-columns: auto 1fr; }.status-line small { grid-column: 1 / -1; justify-self: start; }.actions .secondary { width: 100%; } }
  `],
})
export class PlatformPaymentPanelComponent {
  private readonly billing = inject(PlatformBillingService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly permissions = inject(PermissionService);
  readonly canExecute = this.permissions.hasPermission(FunctionCode.PLATFORM_BILLING, ActionCode.TASK_EXECUTE);

  @Input({ required: true }) order: PlatformOrder | null = null;
  @Output() orderChanged = new EventEmitter<PlatformOrderDetails>();

  provider = 'SIMULATOR';
  method = 'SIMULATOR';
  attempt: PlatformPaymentAttempt | null = null;
  orderStatus = '';
  busy = false;
  error = '';

  createAttempt(): void {
    if (!this.canExecute || !this.order || this.busy) return;
    this.busy = true;
    this.error = '';
    this.method = this.provider;
    this.billing.createPaymentAttempt(
      this.order.publicId,
      { provider: this.provider, method: this.method },
      this.idempotencyKey('platform-attempt'),
    ).pipe(
      timeout(15000),
      finalize(() => {
        this.busy = false;
        this.cdr.markForCheck();
      }),
    ).subscribe({
      next: (attempt) => {
        this.attempt = attempt;
        if (attempt.redirectUrl) window.location.assign(attempt.redirectUrl);
      },
      error: (err) => {
        this.error = err?.error?.message || 'Máy chủ không thể tạo lần thanh toán gói.';
      },
    });
  }

  refreshStatus(): void {
    if (!this.order || this.busy) return;
    this.busy = true;
    this.error = '';
    this.billing.getOrder(this.order.publicId).subscribe({
      next: (details) => {
        this.orderStatus = details.status;
        this.attempt = details.attempts.find((item) => item.publicId === this.attempt?.publicId)
          || details.attempts.at(-1)
          || this.attempt;
        this.busy = false;
        this.orderChanged.emit(details);
      },
      error: (err) => {
        this.error = err?.error?.message || 'Không thể cập nhật trạng thái từ máy chủ.';
        this.busy = false;
      },
    });
  }

  confirmSimulator(): void {
    if (!this.canExecute || !this.order || !this.attempt || this.busy || this.attempt.environment !== 'SIMULATOR') return;
    this.busy = true;
    this.error = '';
    this.billing.confirmSimulatorPayment(this.order.publicId, this.attempt.publicId).subscribe({
      next: () => {
        this.busy = false;
        this.refreshStatus();
      },
      error: (err) => {
        this.error = err?.error?.message || 'Không thể xác nhận thanh toán mô phỏng.';
        this.busy = false;
      },
    });
  }

  statusTitle(status: PlatformPaymentAttempt['status']): string {
    return ({ CREATED: 'Mới tạo', PENDING: 'Chờ nhà cung cấp', PROCESSING: 'Đang xác minh giao dịch', SUCCESS: 'Đã xác minh thanh toán', FAILED: 'Thanh toán thất bại', CANCELLED: 'Đã hủy lần thanh toán', EXPIRED: 'Lần thanh toán hết hạn' })[status];
  }

  statusMessage(status: PlatformPaymentAttempt['status']): string {
    return ({ CREATED: 'Chưa gửi thanh toán', PENDING: 'Gói chưa thay đổi', PROCESSING: 'Gói chưa thay đổi', SUCCESS: 'Máy chủ chỉ áp dụng gói một lần', FAILED: 'Không kích hoạt gói', CANCELLED: 'Không kích hoạt gói', EXPIRED: 'Hãy tạo đơn hoặc lần thanh toán mới' })[status];
  }

  private idempotencyKey(prefix: string): string {
    const randomUuid = globalThis.crypto?.randomUUID?.();
    return randomUuid ? `${prefix}-${randomUuid}` : `${prefix}-${Date.now()}`;
  }
}
