import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { RevenueReportResult, RevenueReportService } from '../../../core/services/revenue-report.service';
import { PlatformRevenueComponent } from './platform-revenue.component';

const reportFixture: RevenueReportResult = {
  context: 'PLATFORM_BILLING',
  basis: 'NET',
  filters: {
    context: 'PLATFORM_BILLING',
    basis: 'NET',
    fromInclusive: '2026-07-01T00:00:00Z',
    toExclusive: '2026-08-01T00:00:00Z',
    zoneId: 'Asia/Ho_Chi_Minh',
    planCode: 'PRO',
  },
  totals: {
    grossRevenue: 3000000,
    refunds: 200000,
    credits: 100000,
    netRevenue: 2700000,
    cashCollected: 3000000,
    invoicedRevenue: 3000000,
    unpaidBalance: 0,
    heldDeposits: 0,
    successfulTransactionCount: 3,
    failedTransactionCount: 1,
    unreconciledTransactionCount: 0,
  },
  breakdowns: [{
    dimension: 'PLAN',
    code: 'PRO',
    label: 'PRO',
    transactionCount: 3,
    grossRevenue: 3000000,
    refunds: 200000,
    credits: 100000,
    netRevenue: 2700000,
    recurringEligible: true,
  }],
  rows: [{
    context: 'PLATFORM_BILLING',
    publicId: 'PLAT-1',
    occurredAt: '2026-07-20T10:00:00Z',
    transactionType: 'PURCHASE',
    sourceType: 'PLATFORM_TRANSACTION',
    sourceId: 'PLAT-1',
    method: 'EWALLET',
    provider: 'MOMO',
    grossAmount: 3000000,
    refundAmount: 200000,
    creditAmount: 100000,
    netAmount: 2700000,
    dimensions: { PLAN_CODE: 'PRO' },
    reconciliationStatus: 'RECONCILED',
  }],
  reconciliationIssues: [],
  totalRowCount: 1,
  sourceWatermark: 'PLATFORM:2026-07-20T10:00:00Z',
  generatedAt: '2026-07-20T10:00:00Z',
};

describe('PlatformRevenueComponent', () => {
  it('renders system-scoped platform totals and export controls', async () => {
    await TestBed.configureTestingModule({
      imports: [PlatformRevenueComponent],
      providers: [{
        provide: RevenueReportService,
        useValue: {
          getPlatformRevenue: () => of(reportFixture),
          exportPlatformRevenue: () => throwError(() => new HttpErrorResponse({ status: 404, error: { message: 'Export unavailable' } })),
        },
      }],
    }).compileComponents();

    const fixture = TestBed.createComponent(PlatformRevenueComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    const text = (fixture.nativeElement as HTMLElement).textContent || '';
    expect(text).toContain('Doanh thu nền tảng');
    expect(text).toContain('Phạm vi hệ thống');
    expect(text).toContain('PLAT-1');
    expect(text).toContain('CSV');

    component.export('PDF');
    await fixture.whenStable();
    expect(component.exportState()).toBe('error');
    expect(component.exportMessage()).toBe('Export unavailable');
  });
});
