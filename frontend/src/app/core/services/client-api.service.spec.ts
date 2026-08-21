import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { ClientApiService, PromotionQuote } from './client-api.service';

describe('ClientApiService home recommendation fallback', () => {
  it('preserves stay dates, occupancy, room count, quote and discounted pricing', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const service = TestBed.inject(ClientApiService);
    const http = TestBed.inject(HttpTestingController);
    let response: any;
    const quote: PromotionQuote = {
      quoteId: 'quote-1', expiresAt: '2027-04-30T10:00:00Z', propertyId: 'property-1', roomTypeId: 'room-type-1',
      nightlyPrice: 1_000_000, numberOfNights: 2, roomQuantity: 2, baseSubtotal: 4_000_000,
      taxAmount: 0, feeAmount: 0, taxesAndFees: 0, appliedPromotions: [],
      memberBenefit: { eligible: false }, totalDiscount: 400_000, finalTotal: 3_600_000, currency: 'VND',
    };

    service.getHomeRecommendations({
      provinceId: 48, checkInDate: '2027-04-30', checkOutDate: '2027-05-02',
      stayType: 'OVERNIGHT', adultCount: 3, childCount: 1, roomCount: 2, limit: 6,
    }).subscribe(value => response = value);

    http.expectOne(request => request.url === `${environment.apiUrl}/public/home/recommendations`).flush({}, { status: 503, statusText: 'Unavailable' });
    const fallback = http.expectOne(request => request.url === `${environment.apiUrl}/public/properties/search`);
    expect(fallback.request.params.get('checkInDate')).toBe('2027-04-30');
    expect(fallback.request.params.get('checkOutDate')).toBe('2027-05-02');
    expect(fallback.request.params.get('adultCount')).toBe('3');
    expect(fallback.request.params.get('childCount')).toBe('1');
    expect(fallback.request.params.get('roomCount')).toBe('2');
    fallback.flush({
      content: [{
        id: 'property-1', name: 'Fallback Hotel', addressLine: 'Da Nang', starRating: 5,
        latitude: 0, longitude: 0, propertyType: 'HOTEL', provinceName: 'Đà Nẵng', availableRoomCount: 2,
        startingPrice: 900_000,
        pricing: { nightlyPrice: 1_000_000, discountedNightlyPrice: 900_000, discountedPrice: 900_000, numberOfNights: 2, roomQuantity: 2, subtotal: 4_000_000, taxAmount: 0, feeAmount: 0, totalAmount: 3_600_000, currency: 'VND' },
        quote,
      }], totalElements: 1, totalPages: 1, number: 0, size: 6,
    });

    expect(response.items[0].pricing).toEqual({ nightlyPrice: 1_000_000, finalNightlyPrice: 900_000, totalDiscount: 400_000, currency: 'VND' });
    expect(response.items[0].quote).toEqual(quote);
    http.verify();
  });
});
