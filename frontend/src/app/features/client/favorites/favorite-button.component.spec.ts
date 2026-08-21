import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal, signal } from '@angular/core';
import { Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import { AuthService } from '../../../core/services/auth';
import { FavoriteProperty, FavoriteService } from '../../../core/services/favorite.service';
import { FavoriteButtonComponent } from './favorite-button.component';

describe('FavoriteButtonComponent', () => {
  let fixture: ComponentFixture<FavoriteButtonComponent>;
  let service: { favorites: WritableSignal<FavoriteProperty[]>; ensureLoaded: ReturnType<typeof vi.fn>; add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn>; isFavorite: (id: number) => boolean };
  let auth: { logout$: Subject<void>; isLoggedIn: ReturnType<typeof vi.fn> };
  let router: { url: string; navigate: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    const items = signal<FavoriteProperty[]>([]);
    service = {
      favorites: items,
      ensureLoaded: vi.fn(() => of(items())),
      add: vi.fn(() => of(favorite(12))),
      remove: vi.fn(() => of(void 0)),
      isFavorite: (id: number) => items().some(item => item.hotelId === id),
    };
    auth = { logout$: new Subject<void>(), isLoggedIn: vi.fn(() => false) };
    router = { url: '/hotel/12', navigate: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [FavoriteButtonComponent],
      providers: [
        { provide: FavoriteService, useValue: service },
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(FavoriteButtonComponent);
    fixture.componentRef.setInput('hotelId', 12);
    fixture.detectChanges();
  });

  it('redirects guests to login with the current property as return URL', () => {
    fixture.nativeElement.querySelector('button').click();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/hotel/12' } });
    expect(service.add).not.toHaveBeenCalled();
  });

  it('adds an authenticated favorite and updates the active state', () => {
    auth.isLoggedIn.mockReturnValue(true);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('button').click();
    expect(service.add).toHaveBeenCalledWith(12);
  });

  function favorite(hotelId: number): FavoriteProperty {
    return { favoriteId: 100 + hotelId, hotelId, name: 'Test hotel', favoritedAt: '2026-08-04T00:00:00' };
  }
});
