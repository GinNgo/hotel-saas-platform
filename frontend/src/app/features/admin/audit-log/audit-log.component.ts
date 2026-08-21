import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OperationalAuditEvent, OperationalAuditFilters, OperationalAuditService } from '../../../core/services/operational-audit.service';
import { AuthService } from '../../../core/services/auth';

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './audit-log.component.html',
  styleUrl: './audit-log.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditLogComponent implements OnInit {
  private readonly auditService = inject(OperationalAuditService);
  private readonly authService = inject(AuthService);
  private readonly changeDetector = inject(ChangeDetectorRef);

  readonly domains = ['STAFF', 'ROLE', 'PROPERTY', 'ROOM', 'MAINTENANCE', 'RESERVATION'];
  readonly pageSizes = [25, 50, 100];
  events: OperationalAuditEvent[] = [];
  loading = true;
  exporting = false;
  error = '';
  page = 0;
  size = 25;
  totalElements = 0;
  totalPages = 0;
  filters: OperationalAuditFilters = {};
  expandedId?: string;

  get isSystemAdmin(): boolean {
    return this.authService.getRoles().some(role => role === 'SUPER_ADMIN' || role === 'ROLE_SUPER_ADMIN');
  }

  ngOnInit(): void {
    this.load();
  }

  load(page = this.page): void {
    this.loading = true;
    this.error = '';
    this.page = page;
    this.auditService.search({ ...this.filters, page, size: this.size }).subscribe({
      next: response => {
        this.events = response.content;
        this.totalElements = response.totalElements;
        this.totalPages = response.totalPages;
        this.loading = false;
        this.changeDetector.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.changeDetector.markForCheck();
        this.error = 'Không thể tải nhật ký. Vui lòng kiểm tra quyền hoặc thử lại.';
      },
    });
  }

  applyFilters(): void {
    this.load(0);
  }

  clearFilters(): void {
    this.filters = {};
    this.load(0);
  }

  toggle(event: OperationalAuditEvent): void {
    this.expandedId = this.expandedId === event.id ? undefined : event.id;
  }

  state(value?: string | null): string {
    if (!value) return '—';
    try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
  }

  exportCsv(): void {
    this.exporting = true;
    const { page: _page, size: _size, ...filters } = this.filters;
    this.auditService.export(filters).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'operational-audit.csv';
        anchor.click();
        URL.revokeObjectURL(url);
        this.exporting = false;
        this.changeDetector.markForCheck();
      },
      error: () => {
        this.exporting = false;
        this.changeDetector.markForCheck();
        this.error = 'Không thể xuất nhật ký.';
      },
    });
  }

  previousPage(): void { if (this.page > 0) this.load(this.page - 1); }
  nextPage(): void { if (this.page + 1 < this.totalPages) this.load(this.page + 1); }
  trackById(_: number, event: OperationalAuditEvent): string { return event.id; }
}
