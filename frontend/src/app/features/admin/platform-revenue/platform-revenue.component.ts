import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import {
  PlatformRevenueReportFilters,
  RevenueBasis,
  RevenueBreakdown,
  RevenueExportFormat,
  RevenueReportResult,
  RevenueReportService,
  RevenueTransactionRow,
} from '../../../core/services/revenue-report.service';
import { FeedbackStateComponent } from '../../../shared/components/feedback-state/feedback-state.component';
import { AnalyticsService, PlatformOverview } from '../../../core/services/analytics';

type ExportState = 'idle' | 'loading' | 'success' | 'error';

@Component({
  selector: 'app-platform-revenue',
  standalone: true,
  imports: [CommonModule, FormsModule, FeedbackStateComponent],
  templateUrl: './platform-revenue.component.html',
  styleUrls: ['./platform-revenue.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformRevenueComponent implements OnInit {
  private readonly reportService = inject(RevenueReportService);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly report = signal<RevenueReportResult | null>(null);
  readonly platformOverview = signal<PlatformOverview | null>(null);
  readonly overviewError = signal('');
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly exportState = signal<ExportState>('idle');
  readonly exportMessage = signal('');

  fromDate = this.monthStart();
  toDate = this.inputDate(new Date());
  basis: RevenueBasis = 'NET';
  provider = '';
  method = '';
  transactionType = '';
  planCode = '';

  ngOnInit(): void {
    this.loadPlatformOverview();
    this.loadReport();
  }

  applyFilters(): void {
    this.errorMessage.set('');
    if (!this.fromDate || !this.toDate || this.fromDate > this.toDate) {
      this.errorMessage.set('Ngày bắt đầu phải nằm trước hoặc trùng ngày kết thúc.');
      return;
    }
    this.loadReport();
  }

  resetFilters(): void {
    this.fromDate = this.monthStart();
    this.toDate = this.inputDate(new Date());
    this.basis = 'NET';
    this.provider = '';
    this.method = '';
    this.transactionType = '';
    this.planCode = '';
    this.applyFilters();
  }

  breakdownsForChart(): RevenueBreakdown[] {
    const breakdowns = this.report()?.breakdowns ?? [];
    const plans = breakdowns.filter((item) => item.dimension === 'PLAN');
    return (plans.length
      ? plans
      : breakdowns.filter((item) => item.dimension === 'TRANSACTION_TYPE'))
      .slice(0, 8);
  }

  chartValue(item: RevenueBreakdown): number {
    return this.basis === 'CASH_COLLECTED'
      ? item.grossRevenue - item.refunds
      : item.netRevenue;
  }

  chartWidth(item: RevenueBreakdown): number {
    const values = this.breakdownsForChart().map((entry) => Math.max(this.chartValue(entry), 0));
    const max = Math.max(...values, 1);
    return Math.max(Math.min((Math.max(this.chartValue(item), 0) / max) * 100, 100), 4);
  }

  providerOptions(): string[] { return this.unique(this.report()?.rows.map((row) => row.provider)); }
  methodOptions(): string[] { return this.unique(this.report()?.rows.map((row) => row.method)); }
  transactionTypeOptions(): string[] { return this.unique(this.report()?.rows.map((row) => row.transactionType)); }
  planOptions(): string[] {
    return this.unique(this.report()?.breakdowns.filter((item) => item.dimension === 'PLAN').map((item) => item.code));
  }

  visibleRows(): RevenueTransactionRow[] { return (this.report()?.rows ?? []).slice(0, 100); }

  formatMoney(value: number): string {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
  }

  formatDateTime(value: string): string {
    return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  }

  statusLabel(status: RevenueTransactionRow['reconciliationStatus']): string {
    return status === 'RECONCILED' ? 'Đã đối soát' : status === 'MISMATCH' ? 'Sai lệch' : 'Chưa đối soát';
  }

  trackBreakdown(_: number, item: RevenueBreakdown): string { return `${item.dimension}-${item.code}`; }
  trackRow(_: number, row: RevenueTransactionRow): string { return row.publicId; }

  export(format: RevenueExportFormat): void {
    if (!this.report() || this.exportState() === 'loading') return;
    this.exportState.set('loading');
    this.exportMessage.set(`Đang tạo tệp ${format}...`);
    this.reportService.exportPlatformRevenue(this.filters(), format)
      .pipe(
        finalize(() => this.exportState.set(this.exportState() === 'loading' ? 'idle' : this.exportState())),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (blob) => {
          this.download(blob, format);
          this.exportState.set('success');
          this.exportMessage.set(`Đã tải tệp ${format}.`);
        },
        error: (error: HttpErrorResponse) => {
          this.exportState.set('error');
          this.exportMessage.set((error.error as { message?: string } | null)?.message || 'Không thể tạo tệp xuất.');
        },
      });
  }

  private loadReport(): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.reportService.getPlatformRevenue(this.filters())
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (report) => this.report.set(report),
        error: (error: HttpErrorResponse) => {
          this.report.set(null);
          this.errorMessage.set((error.error as { message?: string } | null)?.message || 'Không thể tải báo cáo Platform Billing.');
        },
      });
  }

  retryPlatformOverview(): void { this.loadPlatformOverview(); }

  private loadPlatformOverview(): void {
    this.overviewError.set('');
    this.analyticsService.getPlatformOverview().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: overview => this.platformOverview.set(overview),
      error: () => {
        this.platformOverview.set(null);
        this.overviewError.set('Không thể tải tổng quan toàn sàn.');
      },
    });
  }

  private filters(): PlatformRevenueReportFilters {
    return {
      from: this.fromDate,
      to: this.toDate,
      basis: this.basis,
      provider: this.provider || undefined,
      method: this.method || undefined,
      transactionType: this.transactionType || undefined,
      planCode: this.planCode || undefined,
    };
  }

  private download(blob: Blob, format: RevenueExportFormat): void {
    if (typeof document === 'undefined') return;
    const extension = format === 'EXCEL' ? 'xlsx' : format.toLowerCase();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `luxestay-platform-revenue.${extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private monthStart(): string {
    const date = new Date();
    return this.inputDate(new Date(date.getFullYear(), date.getMonth(), 1));
  }

  private inputDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private unique(values: Array<string | undefined> | undefined): string[] {
    return [...new Set((values ?? []).filter((value): value is string => Boolean(value)))].sort();
  }
}
