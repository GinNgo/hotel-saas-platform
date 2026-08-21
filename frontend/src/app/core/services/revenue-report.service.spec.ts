import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { RevenueReportService } from './revenue-report.service';

describe('RevenueReportService', () => {
  let service: RevenueReportService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RevenueReportService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('requests typed property reports with property-only filters', () => {
    service.getPropertyRevenue({
      from: '2026-07-01',
      to: '2026-07-31',
      basis: 'NET',
      propertyId: 42,
      roomType: 'DELUXE',
      provider: 'MOMO',
      method: 'QR',
    }).subscribe();

    const request = http.expectOne((item) =>
      item.url === `${environment.apiUrl}/management/reports/property-revenue`);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('propertyId')).toBe('42');
    expect(request.request.params.get('roomType')).toBe('DELUXE');
    expect(request.request.params.get('provider')).toBe('MOMO');
    expect(request.request.params.get('planCode')).toBeNull();
    request.flush({});
  });

  it('requests platform reports without property tenant parameters', () => {
    service.getPlatformRevenue({
      from: '2026-07-01',
      to: '2026-07-31',
      basis: 'CASH_COLLECTED',
      planCode: 'PRO',
      provider: 'MOMO',
    }).subscribe();

    const request = http.expectOne((item) =>
      item.url === `${environment.apiUrl}/admin/reports/platform-revenue`);
    expect(request.request.params.get('planCode')).toBe('PRO');
    expect(request.request.params.get('propertyId')).toBeNull();
    expect(request.request.params.get('roomType')).toBeNull();
    request.flush({});
  });

  it('uses the same typed filters and format for blob exports', () => {
    service.exportPlatformRevenue({
      from: '2026-07-01',
      to: '2026-07-31',
      planCode: 'PRO',
    }, 'EXCEL').subscribe();

    const request = http.expectOne((item) =>
      item.url === `${environment.apiUrl}/admin/reports/platform-revenue/export`);
    expect(request.request.responseType).toBe('blob');
    expect(request.request.params.get('format')).toBe('EXCEL');
    expect(request.request.params.get('planCode')).toBe('PRO');
    request.flush(new Blob(['xlsx']));
  });
});
