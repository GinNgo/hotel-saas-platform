import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { ReservationService } from './reservation.service';

describe('ReservationService lifecycle commands', () => {
  let service: ReservationService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ReservationService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uses dedicated endpoints for check-in, operational cancellation and no-show', () => {
    service.checkIn(41).subscribe();
    const checkIn = http.expectOne(`${environment.apiUrl}/reservations/41/check-in`);
    expect(checkIn.request.method).toBe('POST');
    expect(checkIn.request.body).toEqual({});
    checkIn.flush({ id: 41 });

    service.cancelOperational(42).subscribe();
    const cancel = http.expectOne(`${environment.apiUrl}/reservations/42/cancel-operational`);
    expect(cancel.request.method).toBe('POST');
    cancel.flush({ id: 42 });

    service.markNoShow(43).subscribe();
    const noShow = http.expectOne(`${environment.apiUrl}/reservations/43/no-show`);
    expect(noShow.request.method).toBe('POST');
    noShow.flush({ id: 43 });
  });

  it('does not expose the retired legacy service-charge mutation', () => {
    expect('addExtraService' in service).toBe(false);
  });
});
