import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, finalize, of, shareReplay, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth';

export interface FavoriteProperty {
  favoriteId: number;
  hotelId: string | number;
  name: string;
  slug?: string;
  addressLine?: string;
  city?: string;
  imageUrl?: string;
  propertyType?: string;
  averageRating?: number;
  reviewCount?: number;
  minPrice?: number;
  favoritedAt: string;
}

@Injectable({ providedIn: 'root' })
export class FavoriteService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private request$?: Observable<FavoriteProperty[]>;

  readonly favorites = signal<FavoriteProperty[]>([]);
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly error = signal('');

  constructor() {
    this.auth.logout$.subscribe(() => this.reset());
  }

  ensureLoaded(force = false): Observable<FavoriteProperty[]> {
    if (!force && this.loaded()) return of(this.favorites());
    if (!force && this.request$) return this.request$;

    this.loading.set(true);
    this.error.set('');
    this.request$ = this.http.get<FavoriteProperty[]>(`${environment.apiUrl}/favorites`).pipe(
      tap(items => {
        this.favorites.set(items || []);
        this.loaded.set(true);
      }),
      catchError(error => {
        this.error.set(error?.status === 401 ? 'Please sign in to view saved stays.' : 'Saved stays could not be loaded.');
        return throwError(() => error);
      }),
      finalize(() => {
        this.loading.set(false);
        this.request$ = undefined;
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.request$;
  }

  isFavorite(hotelId: string | number): boolean {
    return this.favorites().some(item => item.hotelId === hotelId);
  }

  add(hotelId: string | number): Observable<FavoriteProperty> {
    return this.http.post<FavoriteProperty>(`${environment.apiUrl}/favorites/${hotelId}`, {}).pipe(
      tap(item => {
        const withoutDuplicate = this.favorites().filter(existing => existing.hotelId !== item.hotelId);
        this.favorites.set([item, ...withoutDuplicate]);
      }),
    );
  }

  remove(hotelId: string | number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/favorites/${hotelId}`).pipe(
      tap(() => this.favorites.update(items => items.filter(item => item.hotelId !== hotelId))),
    );
  }

  reset(): void {
    this.favorites.set([]);
    this.loaded.set(false);
    this.error.set('');
    this.loading.set(false);
    this.request$ = undefined;
  }
}
