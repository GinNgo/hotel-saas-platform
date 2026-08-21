import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { ManagementApiService } from '../../../core/services/management-api.service';
import { RevenueReportResult, RevenueReportService } from '../../../core/services/revenue-report.service';
import { PropertyRevenueComponent } from './property-revenue.component';

const reportFixture: RevenueReportResult = {
  context: 'PROPERTY_COMMERCE',
  basis: 'NET',
  filters: {
    context: 'PROPERTY_COMMERCE',
    basis: 'NET',
    fromInclusive: '2026-07-01T00:00:00Z',
    toExclusive: '2026-08-01T00:00:00Z',
    zoneId: 'Asia/Ho_Chi_Minh',
    propertyId: 7,
  },
  totals: {
    grossRevenue: 1200000,
    refunds: 100000,
    credits: 0,
    netRevenue: 1100000,
    cashCollected: 1100000,
    invoicedRevenue: 1200000,
    unpaidBalance: 200000,
    heldDeposits: 50000,
    successfulTransactionCount: 2,
    failedTransactionCount: 0,
    unreconciledTransactionCount: 0,
  },
  breakdowns: [{
    dimension: 'ROOM_TYPE',
    code: 'DELUXE',
    label: 'Deluxe',
    transactionCount: 2,
    grossRevenue: 1200000,
    refunds: 100000,
    credits: 0,
    netRevenue: 1100000,
    recurringEligible: false,
  }],
  rows: [{
    context: 'PROPERTY_COMMERCE',
    publicId: 'TX-7',
    occurredAt: '2026-07-20T10:00:00Z',
    transactionType: 'BOOKING_DEPOSIT',
    sourceType: 'TRANSACTION',
    sourceId: 'TX-7',
    propertyId: 7,
    method: 'BANK_TRANSFER',
    provider: 'BANK',
    grossAmount: 1200000,
    refundAmount: 100000,
    creditAmount: 0,
    netAmount: 1100000,
    dimensions: {},
    reconciliationStatus: 'RECONCILED',
  }],
  reconciliationIssues: [],
  totalRowCount: 1,
  sourceWatermark: 'PROPERTY:7:2026-07-20T10:00:00Z',
  generatedAt: '2026-07-20T10:00:00Z',
};

describe('PropertyRevenueComponent', () => {
  it('renders reconciled totals and applies the active property scope', async () => {
    await TestBed.configureTestingModule({
      imports: [PropertyRevenueComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: of(new Map([['propertyId', '7']])) },
        },
        {
          provide: ManagementApiService,
          useValue: {
            context: () => of({
              properties: [{ id: 7, code: 'P7', nameVi: 'Bờ biển xanh', propertyType: 'HOTEL', address: 'Đà Nẵng', approvalStatus: 'APPROVED', operationStatus: 'ACTIVE', isDemo: false }],
              activePropertyId: 7,
              planCode: 'PRO',
              subscriptionStatus: 'ACTIVE',
              lifetime: false,
              limits: {},
              usage: {},
              upgradeRequired: false,
            }),
          },
        },
        { provide: RevenueReportService, useValue: { getPropertyRevenue: () => of(reportFixture) } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PropertyRevenueComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent || '';
    expect(text).toContain('Doanh thu ròng');
    expect(text).toContain('Bờ biển xanh');
    expect(text).toContain('Khớp dữ liệu');
    expect(text).toContain('TX-7');
  });
});
