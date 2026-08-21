import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type RevenueContext = 'PROPERTY_COMMERCE' | 'PLATFORM_BILLING';
export type RevenueBasis = 'CASH_COLLECTED' | 'INVOICED' | 'NET';
export type RevenueExportFormat = 'CSV' | 'EXCEL' | 'PDF';

export interface RevenueReportFilters {
  from: string;
  to: string;
  basis?: RevenueBasis;
  provider?: string;
  method?: string;
  transactionType?: string;
  zoneId?: string;
}

export interface PropertyRevenueReportFilters extends RevenueReportFilters {
  propertyId?: string | number;
  roomType?: string;
}

export interface PlatformRevenueReportFilters extends RevenueReportFilters {
  planCode?: string;
}

export interface RevenueReportTotals {
  grossRevenue: number;
  refunds: number;
  credits: number;
  netRevenue: number;
  cashCollected: number;
  invoicedRevenue: number;
  unpaidBalance: number;
  heldDeposits: number;
  successfulTransactionCount: number;
  failedTransactionCount: number;
  unreconciledTransactionCount: number;
}

export interface RevenueBreakdown {
  dimension: string;
  code: string;
  label?: string;
  transactionCount: number;
  grossRevenue: number;
  refunds: number;
  credits: number;
  netRevenue: number;
  recurringEligible: boolean;
}

export interface RevenueTransactionRow {
  context: RevenueContext;
  publicId: string;
  occurredAt: string;
  transactionType: string;
  sourceType: string;
  sourceId: string;
  propertyId?: number;
  method?: string;
  provider?: string;
  grossAmount: number;
  refundAmount: number;
  creditAmount: number;
  netAmount: number;
  dimensions: Record<string, string>;
  reconciliationStatus: 'RECONCILED' | 'UNRECONCILED' | 'MISMATCH';
}

export interface ReconciliationIssue {
  code: string;
  sourceType: string;
  sourceId: string;
  expectedAmount: number;
  actualAmount: number;
  deltaAmount: number;
  message: string;
}

export interface RevenueReportResult {
  context: RevenueContext;
  basis: RevenueBasis;
  filters: {
    context: RevenueContext;
    basis: RevenueBasis;
    fromInclusive: string;
    toExclusive: string;
    zoneId: string;
    propertyId?: string | number;
    provider?: string;
    method?: string;
    transactionType?: string;
    roomType?: string;
    planCode?: string;
  };
  totals: RevenueReportTotals;
  breakdowns: RevenueBreakdown[];
  rows: RevenueTransactionRow[];
  reconciliationIssues: ReconciliationIssue[];
  totalRowCount: number;
  sourceWatermark: string;
  checksum?: string;
  generatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class RevenueReportService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  getPropertyRevenue(filters: PropertyRevenueReportFilters): Observable<RevenueReportResult> {
    return this.http.get<RevenueReportResult>(
      `${this.apiUrl}/management/reports/property-revenue`,
      { params: this.toParams(filters) },
    );
  }

  getPlatformRevenue(filters: PlatformRevenueReportFilters): Observable<RevenueReportResult> {
    return this.http.get<RevenueReportResult>(
      `${this.apiUrl}/admin/reports/platform-revenue`,
      { params: this.toParams(filters) },
    );
  }

  exportPropertyRevenue(
    filters: PropertyRevenueReportFilters,
    format: RevenueExportFormat,
  ): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/management/reports/property-revenue/export`, {
      params: this.toParams({ ...filters, format }),
      responseType: 'blob',
    });
  }

  exportPlatformRevenue(
    filters: PlatformRevenueReportFilters,
    format: RevenueExportFormat,
  ): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/admin/reports/platform-revenue/export`, {
      params: this.toParams({ ...filters, format }),
      responseType: 'blob',
    });
  }

  private toParams(
    filters: RevenueReportFilters & { propertyId?: string | number; roomType?: string; planCode?: string; format?: string },
  ): HttpParams {
    const values: Record<string, string | number | undefined> = {
      from: filters.from,
      to: filters.to,
      basis: filters.basis,
      provider: filters.provider,
      method: filters.method,
      transactionType: filters.transactionType,
      zoneId: filters.zoneId,
      propertyId: filters.propertyId,
      roomType: filters.roomType,
      planCode: filters.planCode,
      format: filters.format,
    };
    return Object.entries(values).reduce((params, [key, value]) => {
      return value === undefined || value === null || value === ''
        ? params
        : params.set(key, String(value));
    }, new HttpParams());
  }
}
