import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { WritableSignal, signal } from '@angular/core';
import { of, Subject } from 'rxjs';
import { AuthService } from '../../../core/services/auth';
import { FavoriteProperty, FavoriteService } from '../../../core/services/favorite.service';
import { ImageFallbackService } from '../../../core/services/image-fallback.service';
import { FavoritesPageComponent } from './favorites-page.component';

describe('FavoritesPageComponent', () => {
  let fixture: ComponentFixture<FavoritesPageComponent>;
  let state: { loading: WritableSignal<boolean>; error: WritableSignal<string>; favorites: WritableSignal<FavoriteProperty[]> };

  beforeEach(async () => {
    state = { loading: signal(false), error: signal(''), favorites: signal<FavoriteProperty[]>([]) };
    const service = {
      ...state,
      ensureLoaded: vi.fn(() => of([])),
      isFavorite: () => false,
      add: vi.fn(),
      remove: vi.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [FavoritesPageComponent],
      providers: [
        { provide: FavoriteService, useValue: service },
        { provide: AuthService, useValue: { logout$: new Subject<void>(), isLoggedIn: () => true } },
        provideRouter([]),
        { provide: ImageFallbackService, useValue: { property: () => 'fallback.jpg', replace: vi.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(FavoritesPageComponent);
  });

  it('renders the empty state when the owner has no favorites', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-empty-state]')).toBeTruthy();
  });

  it('renders loading state accessibly', () => {
    state.loading.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Đang tải danh sách yêu thích');
  });
});
