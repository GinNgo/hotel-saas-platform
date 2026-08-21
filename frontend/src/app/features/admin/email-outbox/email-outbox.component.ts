import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActionCode, FunctionCode, PermissionService } from '../../../core/services/permission.service';
import {
  EmailDeliveryAttempt,
  EmailOutboxFailure,
  EmailOutboxService,
} from '../../../core/services/email-outbox.service';

@Component({
  selector: 'app-email-outbox',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './email-outbox.component.html',
  styleUrl: './email-outbox.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmailOutboxComponent implements OnInit {
  private readonly service = inject(EmailOutboxService);
  private readonly permissions = inject(PermissionService);
  private readonly changeDetector = inject(ChangeDetectorRef);

  readonly canRetry = this.permissions.hasPermission(FunctionCode.AUDIT_LOG, ActionCode.TASK_EXECUTE);
  failures: EmailOutboxFailure[] = [];
  attemptsById = new Map<string | number, EmailDeliveryAttempt[]>();
  loading = true;
  error = '';
  retryingId: string | number | null = null;
  expandedId: string | number | null = null;
  page = 0;
  size = 25;
  totalPages = 0;
  totalElements = 0;

  ngOnInit(): void {
    this.load();
  }

  load(page = this.page): void {
    this.loading = true;
    this.error = '';
    this.page = page;
    this.service.failures(page, this.size).subscribe({
      next: response => {
        this.failures = response.content;
        this.totalPages = response.totalPages;
        this.totalElements = response.totalElements;
        this.loading = false;
        this.changeDetector.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.error = 'Không thể tải hàng đợi email. Vui lòng kiểm tra quyền hoặc thử lại.';
        this.changeDetector.markForCheck();
      },
    });
  }

  toggleAttempts(item: EmailOutboxFailure): void {
    if (this.expandedId === item.id) {
      this.expandedId = null;
      return;
    }
    this.expandedId = item.id;
    if (this.attemptsById.has(item.id)) return;
    this.service.attempts(item.id).subscribe({
      next: attempts => {
        this.attemptsById.set(item.id, attempts);
        this.changeDetector.markForCheck();
      },
      error: () => {
        this.error = 'Không thể tải lịch sử gửi email.';
        this.changeDetector.markForCheck();
      },
    });
  }

  retry(item: EmailOutboxFailure): void {
    if (!this.canRetry || this.retryingId !== null) return;
    this.retryingId = item.id;
    this.service.retry(item.id).subscribe({
      next: updated => {
        if (updated.status === 'SENT') {
          this.failures = this.failures.filter(candidate => candidate.id !== updated.id);
          this.totalElements = Math.max(0, this.totalElements - 1);
        } else {
          this.failures = this.failures.map(candidate => candidate.id === updated.id ? updated : candidate);
          this.error = updated.lastErrorCode === 'EMAIL_PROVIDER_NOT_CONFIGURED'
            ? 'Email provider chưa được cấu hình; bản tin vẫn được giữ trong hàng đợi.'
            : 'Email vẫn chưa gửi thành công; trạng thái mới nhất đã được cập nhật.';
        }
        this.attemptsById.delete(updated.id);
        this.retryingId = null;
        this.changeDetector.markForCheck();
      },
      error: () => {
        this.retryingId = null;
        this.error = 'Không thể đưa email vào hàng đợi retry.';
        this.changeDetector.markForCheck();
      },
    });
  }

  previousPage(): void {
    if (this.page > 0) this.load(this.page - 1);
  }

  nextPage(): void {
    if (this.page + 1 < this.totalPages) this.load(this.page + 1);
  }

  trackById(_: number, item: EmailOutboxFailure): string | number {
    return item.id;
  }
}
