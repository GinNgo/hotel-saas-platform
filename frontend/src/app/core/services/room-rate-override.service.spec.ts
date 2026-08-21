import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { RoomRateOverrideService, SaveRoomRateOverrideRequest } from './room-rate-override.service';

describe('RoomRateOverrideService', () => {
  let service: RoomRateOverrideService;
  let http: HttpTestingController;
  const request: SaveRoomRateOverrideRequest = {
    roomTypeId: '11111111-1111-1111-1111-111111111111',
    startDate: '2026-09-01',
    endDate: '2026-09-03',
    nightlyPrice: 1450000,
    priority: 10,
    isActive: true,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(RoomRateOverrideService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists overrides for a room type', () => {
    service.list(request.roomTypeId).subscribe();
    const call = http.expectOne(item => item.url === `${environment.apiUrl}/room-rate-overrides`);
    expect(call.request.method).toBe('GET');
    expect(call.request.params.get('roomTypeId')).toBe(request.roomTypeId);
    call.flush([]);
  });

  it('creates, updates and deletes an override with the backend contract', () => {
    service.create(request).subscribe();
    const create = http.expectOne(`${environment.apiUrl}/room-rate-overrides`);
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual(request);
    create.flush({ id: 'rate-1', ...request });

    service.update('rate-1', request).subscribe();
    const update = http.expectOne(`${environment.apiUrl}/room-rate-overrides/rate-1`);
    expect(update.request.method).toBe('PUT');
    expect(update.request.body).toEqual(request);
    update.flush({ id: 'rate-1', ...request });

    service.delete('rate-1').subscribe();
    const remove = http.expectOne(`${environment.apiUrl}/room-rate-overrides/rate-1`);
    expect(remove.request.method).toBe('DELETE');
    remove.flush(null);
  });
});
