import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { finalize, switchMap } from 'rxjs';
import { PropertyRefundResult, RefundService, RefundStatus, RefundListFilters } from '@app/core/services/refund.service';
import { ManagedProperty, ManagementApiService } from '@app/core/services/management-api.service';
import { ActionCode, FunctionCode, PermissionService } from '@app/core/services/permission.service';

@Component({
  selector: 'app-refund-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './refund-management.component.html',
  styleUrls: ['./refund-management.component.css'],
})
export class RefundManagementComponent implements OnInit {
  private readonly refundService = inject(RefundService);
  private readonly managementApi = inject(ManagementApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly permissions = inject(PermissionService);

  @Input() refunds: PropertyRefundResult[] = [];
  @Output() readonly refundUpdated = new EventEmitter<PropertyRefundResult>();

  approvingId: string | null = null;
  dispatchingId: string | null = null;
  retryingId: string | null = null;
  properties: ManagedProperty[] = [];
  selectedPropertyId: string | number | null = null;
  loading = false;
  error = '';
  success = '';
  statusFilter: RefundStatus | '' = '';
  providerFilter = '';
  sortDirection: 'ASC' | 'DESC' = 'DESC';
  fromDate = '';
  toDate = '';
  minAmount: number | null = null;
  maxAmount: number | null = null;

  ngOnInit(): void {
    const propertyParam = this.route.snapshot.queryParamMap.get('propertyId');
    const requestedPropertyId = propertyParam
      ? (/^\d+$/.test(propertyParam) ? Number(propertyParam) : propertyParam)
      : undefined;
    this.loading = true;
    this.managementApi.context(requestedPropertyId).subscribe({
      next: (context) => {
        this.properties = context.properties ?? [];
        this.selectedPropertyId = context.activePropertyId ?? this.properties[0]?.id ?? null;
        this.loadRefunds();
      },
      error: (error) => {
        this.loading = false;
        this.error = error?.error?.message || 'Không thể tải danh sách cơ sở.';
        this.changeDetector.detectChanges();
      },
    });
  }

  loadRefunds(): void {
    if (!this.selectedPropertyId) {
      this.loading = false;
      this.refunds = [];
      this.error = 'Hãy chọn cơ sở để xem yêu cầu hoàn tiền.';
      return;
    }
    this.loading = true;
    this.error = '';
    const filters: RefundListFilters = { status: this.statusFilter || undefined, provider: this.providerFilter.trim() || undefined, from: this.fromDate || undefined, to: this.toDate || undefined, minAmount: this.minAmount ?? undefined, maxAmount: this.maxAmount ?? undefined, sortDirection: this.sortDirection };
    this.refundService.listPropertyRefunds(this.selectedPropertyId, filters)
      .pipe(finalize(() => {
        this.loading = false;
        this.changeDetector.detectChanges();
      }))
      .subscribe({
        next: (refunds) => { this.refunds = refunds; },
        error: (error) => {
          this.error = error?.error?.message || 'Không thể tải yêu cầu hoàn tiền.';
        },
      });
  }

  approve(refund: PropertyRefundResult): void {
    if (this.approvingId || !refund.publicId || !this.canApprove(refund.status)) return;
    this.approvingId = refund.publicId;
    this.error = '';
    this.success = '';
    this.refundService
      .approvePropertyRefund(refund.publicId)
      .pipe(finalize(() => {
        this.approvingId = null;
        this.changeDetector.detectChanges();
      }))
      .subscribe({
        next: (updated) => {
          this.refunds = this.refunds.map((item) => item.publicId === updated.publicId ? updated : item);
          this.success = 'Đã duyệt yêu cầu. Hãy gửi sang cổng thanh toán để tiếp tục.';
          this.refundUpdated.emit(updated);
          this.changeDetector.detectChanges();
        },
        error: (error) => {
          this.error = error?.error?.message || 'Không thể duyệt yêu cầu hoàn tiền.';
          this.changeDetector.detectChanges();
        },
      });
  }

  dispatch(refund: PropertyRefundResult): void {
    if (this.dispatchingId || this.retryingId || !this.canDispatch(refund.status)) return;
    const provider = refund.provider || 'SIMULATOR';
    const environment = refund.environment || 'SIMULATOR';
    this.dispatchingId = refund.publicId;
    this.error = '';
    this.success = '';
    this.refundService.createPropertyRefundAttempt(refund.publicId, { provider, environment })
      .pipe(switchMap((attempt) => environment === 'SIMULATOR'
        ? this.refundService.confirmPropertySimulatorRefund(refund.publicId)
        : [attempt]))
      .pipe(finalize(() => {
        this.dispatchingId = null;
        this.changeDetector.detectChanges();
      }))
      .subscribe({
        next: () => {
          this.success = provider === 'SIMULATOR'
            ? 'Đã hoàn tiền mô phỏng và ghi nhận callback có chữ ký.'
            : `Đã gửi yêu cầu sang ${provider}; đang chờ callback xác nhận.`;
          this.loadRefunds();
        },
        error: (error) => {
          this.error = error?.error?.message
            || `Chưa thể gửi hoàn tiền sang ${provider}. Kiểm tra adapter và tài khoản sandbox.`;
        },
      });
  }

  canApprove(status: RefundStatus): boolean {
    return this.permissions.hasPermission(FunctionCode.PROPERTY_REFUND, ActionCode.APPROVE)
      && (status === 'REQUESTED' || status === 'PENDING_APPROVAL');
  }

  retry(refund: PropertyRefundResult): void {
    if (this.retryingId || this.dispatchingId || !this.canRetry(refund.status)) return;
    this.retryingId = refund.publicId;
    this.error = '';
    this.success = '';
    this.refundService.retryPropertyRefund(refund.publicId)
      .pipe(finalize(() => {
        this.retryingId = null;
        this.changeDetector.detectChanges();
      }))
      .subscribe({
        next: (updated) => {
          this.refunds = this.refunds.map((item) => item.publicId === updated.publicId ? updated : item);
          this.success = 'Đã đưa yêu cầu thất bại về hàng đợi gửi lại.';
          this.refundUpdated.emit(updated);
        },
        error: (error) => { this.error = error?.error?.message || 'Không thể thử lại yêu cầu hoàn tiền.'; },
      });
  }

  canDispatch(status: RefundStatus): boolean {
    return this.permissions.hasPermission(FunctionCode.PROPERTY_REFUND, ActionCode.TASK_EXECUTE)
      && status === 'PENDING_PROVIDER';
  }

  canRetry(status: RefundStatus): boolean {
    return this.permissions.hasPermission(FunctionCode.PROPERTY_REFUND, ActionCode.TASK_EXECUTE)
      && status === 'FAILED';
  }

  statusLabel(status: RefundStatus): string {
    return {
      REQUESTED: 'Chờ duyệt',
      PENDING_APPROVAL: 'Chờ duyệt',
      POLICY_BLOCKED: 'Bị chặn theo chính sách',
      PENDING_PROVIDER: 'Đang chờ cổng thanh toán',
      SUCCEEDED: 'Đã hoàn tiền',
      FAILED: 'Thất bại',
      CANCELLED: 'Đã hủy',
    }[status] || status;
  }

  statusTone(status: RefundStatus): string {
    return status === 'SUCCEEDED' ? 'success' : status === 'FAILED' ? 'danger' : status === 'REQUESTED' || status === 'PENDING_APPROVAL' || status === 'PENDING_PROVIDER' || status === 'POLICY_BLOCKED' ? 'warning' : 'muted';
  }
}
