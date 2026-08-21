import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';
import {
  PropertyRefundResult,
  RefundService,
  RefundStatus,
} from '@app/core/services/refund.service';

@Component({
  selector: 'app-refund-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './refund-history.component.html',
  styleUrls: ['./refund-history.component.css'],
})
export class RefundHistoryComponent implements OnInit {
  private readonly refundService = inject(RefundService);
  private readonly route = inject(ActivatedRoute);
  private readonly changeDetector = inject(ChangeDetectorRef);

  @Output() readonly refundRequested = new EventEmitter<PropertyRefundResult>();

  transactionPublicId = '';
  refunds: PropertyRefundResult[] = [];
  amount: number | null = null;
  reason = '';
  loading = false;
  refreshing = false;
  error = '';
  success = '';

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    this.transactionPublicId = params.get('transactionId') || '';
    const refundId = params.get('refundId');
    if (refundId) this.refresh(refundId);
  }

  requestRefund(): void {
    this.error = '';
    this.success = '';
    if (!this.transactionPublicId) {
      this.error = 'Chưa có mã giao dịch gốc để yêu cầu hoàn tiền / Original transaction is missing.';
      return;
    }
    if (!this.amount || this.amount <= 0 || !Number.isInteger(this.amount)) {
      this.error = 'Số tiền phải là số nguyên VND lớn hơn 0 / Amount must be a positive integer VND value.';
      return;
    }
    if (!this.reason.trim()) {
      this.error = 'Vui lòng nhập lý do / Please provide a reason.';
      return;
    }

    this.loading = true;
    this.refundService
      .requestPropertyRefund(
        this.transactionPublicId,
        { amount: this.amount, reason: this.reason.trim() },
        { idempotencyKey: this.requestId() },
      )
      .pipe(finalize(() => {
        this.loading = false;
        this.changeDetector.detectChanges();
      }))
      .subscribe({
        next: (refund) => {
          this.refunds = [refund, ...this.refunds.filter((item) => item.publicId !== refund.publicId)];
          this.success = refund.replayed
            ? 'Yêu cầu đã tồn tại và được trả lại an toàn / Existing request replayed safely.'
            : 'Đã gửi yêu cầu hoàn tiền / Refund request submitted.';
          this.amount = null;
          this.reason = '';
          this.refundRequested.emit(refund);
          this.changeDetector.detectChanges();
        },
        error: (error) => {
          this.error = error?.error?.message || 'Không thể gửi yêu cầu hoàn tiền / Refund request failed.';
          this.changeDetector.detectChanges();
        },
      });
  }

  refresh(refundId: string): void {
    this.refreshing = true;
    this.error = '';
    this.refundService
      .getPropertyRefund(refundId)
      .pipe(finalize(() => {
        this.refreshing = false;
        this.changeDetector.detectChanges();
      }))
      .subscribe({
        next: (refund) => {
          this.transactionPublicId ||= refund.originalTransactionPublicId;
          this.refunds = [refund, ...this.refunds.filter((item) => item.publicId !== refund.publicId)];
          this.changeDetector.detectChanges();
        },
        error: (error) => {
          this.error = error?.error?.message || 'Không thể tải trạng thái hoàn tiền / Refund status unavailable.';
          this.changeDetector.detectChanges();
        },
      });
  }

  statusLabel(status: RefundStatus): string {
    return {
      REQUESTED: 'Đã yêu cầu / Requested',
      PENDING_APPROVAL: 'Chờ duyệt / Pending approval',
      POLICY_BLOCKED: 'Bị chặn theo chính sách / Policy blocked',
      PENDING_PROVIDER: 'Đang xử lý / Processing',
      SUCCEEDED: 'Đã hoàn / Succeeded',
      FAILED: 'Thất bại / Failed',
      CANCELLED: 'Đã hủy / Cancelled',
    }[status] || status;
  }

  statusTone(status: RefundStatus): string {
    return {
      REQUESTED: 'info',
      PENDING_APPROVAL: 'warning',
      POLICY_BLOCKED: 'warning',
      PENDING_PROVIDER: 'warning',
      SUCCEEDED: 'success',
      FAILED: 'danger',
      CANCELLED: 'muted',
    }[status] || 'muted';
  }

  private requestId(): string {
    return globalThis.crypto?.randomUUID?.() || `refund-${Date.now()}`;
  }
}
