import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { AuthService } from './auth';
import { FavoriteProperty, FavoriteService } from './favorite.service';

describe('FavoriteService', () => {
  let service: FavoriteService;
  let http: HttpTestingController;
  const logout$ = new Subject<void>();
  const auth = { logout$, isLoggedIn: () => true };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    });
    service = TestBed.inject(FavoriteService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('coalesces concurrent list requests and caches the owner list', () => {
    const first = service.ensureLoaded();
    const second = service.ensureLoaded();
    first.subscribe();
    second.subscribe();
    expect(first).toBe(second);

    const request = http.expectOne(item => item.url.endsWith('/api/favorites'));
    expect(request.request.method).toBe('GET');
    const item = favorite(10);
    request.flush([item]);

    expect(service.favorites()).toEqual([item]);
    expect(service.loaded()).toBe(true);
    service.ensureLoaded().subscribe(items => expect(items).toEqual([item]));
    http.expectNone(item => item.url.endsWith('/api/favorites'));
  });

  it('adds and removes one favorite without duplicating local state', () => {
    const item = favorite(10);
    service.add(10).subscribe();
    const addRequest = http.expectOne(item => item.url.endsWith('/api/favorites/10'));
    expect(addRequest.request.method).toBe('POST');
    addRequest.flush(item);
    service.add(10).subscribe();
    const replayRequest = http.expectOne(item => item.url.endsWith('/api/favorites/10'));
    replayRequest.flush(item);
    expect(service.favorites()).toEqual([item]);

    service.remove(10).subscribe();
    const removeRequest = http.expectOne(item => item.url.endsWith('/api/favorites/10'));
    expect(removeRequest.request.method).toBe('DELETE');
    removeRequest.flush(null);
    expect(service.favorites()).toEqual([]);
  });

  it('clears owner state on logout', () => {
    service.favorites.set([favorite(10)]);
    service.loaded.set(true);
    logout$.next();
    expect(service.favorites()).toEqual([]);
    expect(service.loaded()).toBe(false);
  });

  function favorite(hotelId: number): FavoriteProperty {
    return {
      favoriteId: hotelId + 100,
      hotelId,
      name: `Hotel ${hotelId}`,
      favoritedAt: '2026-08-04T00:00:00',
    };
  }
});
