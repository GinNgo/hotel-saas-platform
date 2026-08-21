import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HousekeepingService } from './housekeeping.service';

describe('HousekeepingService', () => {
  let service: HousekeepingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(HousekeepingService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists active tasks with the selected property and status', () => {
    service.list(12, 'CLAIMED').subscribe();
    const request = http.expectOne(item => item.url.endsWith('/api/housekeeping/tasks'));
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('propertyId')).toBe('12');
    expect(request.request.params.get('status')).toBe('CLAIMED');
    request.flush([]);
  });

  it('sends optimistic version for claim, assign, start and complete', () => {
    service.claim(4, 2).subscribe();
    const claim = http.expectOne('/api/housekeeping/tasks/4/claim');
    expect(claim.request.body).toEqual({ expectedVersion: 2 });
    claim.flush({});

    service.assign(4, 8, 3).subscribe();
    const assign = http.expectOne('/api/housekeeping/tasks/4/assign');
    expect(assign.request.body).toEqual({ userId: 8, expectedVersion: 3 });
    assign.flush({});

    service.start(4, 4).subscribe();
    const start = http.expectOne('/api/housekeeping/tasks/4/start');
    expect(start.request.body).toEqual({ expectedVersion: 4 });
    start.flush({});

    service.complete(4, 5).subscribe();
    const complete = http.expectOne('/api/housekeeping/tasks/4/complete');
    expect(complete.request.method).toBe('POST');
    expect(complete.request.body).toEqual({ expectedVersion: 5 });
    complete.flush({});
  });
});
