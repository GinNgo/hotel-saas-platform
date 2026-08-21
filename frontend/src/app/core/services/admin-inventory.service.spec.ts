import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { environment } from '../../../environments/environment';
import { AdminInventoryService } from './admin-inventory.service';

describe('AdminInventoryService', () => {
  let service: AdminInventoryService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AdminInventoryService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminInventoryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the complete tenant-scoped property catalog for inventory management', () => {
    service.getProperties().subscribe();
    const request = http.expectOne(`${environment.apiUrl}/v1/hotels`);
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('uses dedicated start and complete maintenance commands', () => {
    service.startRoomMaintenance(12, 'Điều hòa hỏng').subscribe();
    const start = http.expectOne(`${environment.apiUrl}/rooms/12/maintenance/start`);
    expect(start.request.method).toBe('POST');
    expect(start.request.body).toEqual({ reason: 'Điều hòa hỏng' });
    start.flush({});

    service.completeRoomMaintenance(12).subscribe();
    const complete = http.expectOne(`${environment.apiUrl}/rooms/12/maintenance/complete`);
    expect(complete.request.method).toBe('POST');
    complete.flush({});
  });

  it('requests physical-room availability for the selected stay dates', () => {
    service.getAvailableRooms('2026-08-20', '2026-08-22', 'hotel-1').subscribe();
    const request = http.expectOne(item => item.url === `${environment.apiUrl}/rooms/available`);
    expect(request.request.params.get('checkIn')).toBe('2026-08-20');
    expect(request.request.params.get('checkOut')).toBe('2026-08-22');
    expect(request.request.params.get('hotelId')).toBe('hotel-1');
    request.flush([]);
  });
});
