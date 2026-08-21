import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { PromotionService } from './promotion.service';

describe('PromotionService', () => {
  let service: PromotionService; let http: HttpTestingController;
  beforeEach(() => { TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }); service = TestBed.inject(PromotionService); http = TestBed.inject(HttpTestingController); });
  afterEach(() => http.verify());
  it('uses the tenant promotion CRUD contract', () => {
    const body = { code: 'FLASH10', title: 'Flash', discountPercent: 10, maxDiscountAmount: null, minBookingAmount: null, startDateUtc: '2026-09-01T00:00', endDateUtc: '2026-09-07T00:00', isActive: true, applicationType: 'AUTOMATIC' as const };
    service.list().subscribe(); const list = http.expectOne(`${environment.apiUrl}/promotions`); expect(list.request.method).toBe('GET'); list.flush([]);
    service.create(body).subscribe(); const create = http.expectOne(`${environment.apiUrl}/promotions`); expect(create.request.method).toBe('POST'); expect(create.request.body).toEqual(body); create.flush({});
    service.update('promo-1', body).subscribe(); const update = http.expectOne(`${environment.apiUrl}/promotions/promo-1`); expect(update.request.method).toBe('PUT'); update.flush({});
    service.deactivate('promo-1').subscribe(); const remove = http.expectOne(`${environment.apiUrl}/promotions/promo-1`); expect(remove.request.method).toBe('DELETE'); remove.flush(null);
  });
});
