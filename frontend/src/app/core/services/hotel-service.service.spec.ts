import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { HotelServiceService } from './hotel-service.service';

describe('HotelServiceService', () => {
  let service: HotelServiceService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [HotelServiceService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(HotelServiceService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends the selected property outside the mutable service payload', () => {
    service.getServicesForHotel(10).subscribe();
    const list = http.expectOne(`${environment.apiUrl}/services?hotelId=10`);
    expect(list.request.method).toBe('GET');
    list.flush([]);

    service.createService({
      code: 'BREAKFAST',
      nameVi: 'Breakfast',
      nameEn: 'Breakfast',
      price: 100000,
      status: 'ACTIVE',
    }, 10).subscribe();
    const create = http.expectOne(`${environment.apiUrl}/services?hotelId=10`);
    expect(create.request.method).toBe('POST');
    expect(create.request.body.hotelId).toBeUndefined();
    create.flush({});
  });

  it('fails locally instead of issuing an ambiguous catalog request', () => {
    expect(() => service.getServicesForHotel(0)).toThrowError(/hotelId/);
    http.expectNone(`${environment.apiUrl}/services`);
  });
});
