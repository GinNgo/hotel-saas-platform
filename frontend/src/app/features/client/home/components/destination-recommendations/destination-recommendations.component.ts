import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, map, of, Subject, switchMap, tap } from 'rxjs';

import { LocaleService, SupportedLocale } from '../../../../../core/i18n/locale.service';
import { PublicI18nService } from '../../../../../core/i18n/public-i18n.service';
import {
  ClientApiService,
  HomeRecommendationDestination,
  HomeRecommendationItem,
  HomeRecommendationQuery,
} from '../../../../../core/services/client-api.service';
import { ImageFallbackService } from '../../../../../core/services/image-fallback.service';
import { HomeSearchState, HomeSearchStateService, LocationId } from '../../services/home-search-state.service';

interface DestinationLoadRequest {
  preferredProvinceId?: LocationId;
  locale: SupportedLocale;
}

interface RecommendationLoadRequest {
  query: HomeRecommendationQuery;
}

@Component({
  selector: 'app-destination-recommendations',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './destination-recommendations.component.html',
  styleUrl: './destination-recommendations.component.css',
})
export class DestinationRecommendationsComponent {
  private readonly api = inject(ClientApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly imageFallback = inject(ImageFallbackService);
  private readonly localeService = inject(LocaleService);
  private readonly searchState = inject(HomeSearchStateService);

  readonly i18n = inject(PublicI18nService);
  readonly destinations = signal<readonly HomeRecommendationDestination[]>([]);
  readonly recommendations = signal<readonly HomeRecommendationItem[]>([]);
  readonly selectedProvinceId = signal<LocationId | null>(null);
  readonly destinationsLoading = signal(true);
  readonly recommendationsLoading = signal(false);
  readonly destinationsError = signal(false);
  readonly recommendationsError = signal(false);

  private readonly destinationRequests = new Subject<DestinationLoadRequest>();
  private readonly recommendationRequests = new Subject<RecommendationLoadRequest>();
  private readonly preferredProvinceId = computed(() => this.searchState.state().provinceId);

  readonly selectedDestination = computed(() =>
    this.destinations().find(item => item.id === this.selectedProvinceId()) ?? null,
  );
  readonly propertyQueryParams = computed(() => this.searchState.bookingQueryParams());
  readonly searchQueryParams = computed<Record<string, string | number>>(() => {
    const destination = this.selectedDestination();
    const state = this.searchState.state();
    const query: Record<string, string | number> = {
      ...this.searchState.bookingQueryParams(),
      stayType: state.stayType,
    };
    if (destination) {
      query['provinceId'] = destination.id;
      query['displayLocation'] = destination.displayName;
    }
    return query;
  });

  constructor() {
    this.destinationRequests.pipe(
      tap(() => {
        this.destinationsLoading.set(true);
        this.destinationsError.set(false);
      }),
      switchMap(request => this.api.getHomeRecommendationDestinations(
        request.preferredProvinceId,
        5,
        request.locale,
      ).pipe(
        map(data => ({ data, failed: false as const })),
        catchError(() => of({ data: [] as HomeRecommendationDestination[], failed: true as const })),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(result => {
      this.destinations.set(result.data);
      this.destinationsLoading.set(false);
      this.destinationsError.set(result.failed);

      const currentSelection = this.selectedProvinceId();
      const selected = result.data.find(item => item.id === currentSelection)
        ?? result.data.find(item => item.selectedByDefault)
        ?? result.data[0]
        ?? null;
      this.selectedProvinceId.set(selected?.id ?? null);
      if (!selected) this.recommendations.set([]);
    });

    this.recommendationRequests.pipe(
      tap(() => {
        this.recommendationsLoading.set(true);
        this.recommendationsError.set(false);
      }),
      switchMap(request => this.api.getHomeRecommendations(request.query).pipe(
        map(response => ({ response, failed: false as const })),
        catchError(() => of({ response: null, failed: true as const })),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(result => {
      this.recommendations.set(result.response?.items ?? []);
      this.recommendationsLoading.set(false);
      this.recommendationsError.set(result.failed);
    });

    effect(() => {
      const locale = this.localeService.locale();
      const preferredProvinceId = this.preferredProvinceId() ?? undefined;
      untracked(() => this.destinationRequests.next({ preferredProvinceId, locale }));
    });

    effect(() => {
      const provinceId = this.selectedProvinceId();
      const locale = this.localeService.locale();
      const state = this.searchState.state();
      if (provinceId === null) {
        untracked(() => {
          this.recommendations.set([]);
          this.recommendationsLoading.set(false);
        });
        return;
      }
      const query = this.buildRecommendationQuery(provinceId, locale, state);
      untracked(() => this.recommendationRequests.next({ query }));
    });
  }

  selectDestination(provinceId: LocationId): void {
    if (provinceId !== this.selectedProvinceId()) this.selectedProvinceId.set(provinceId);
  }

  retryDestinations(): void {
    this.destinationRequests.next({
      preferredProvinceId: this.preferredProvinceId() ?? undefined,
      locale: this.localeService.locale(),
    });
  }

  retryRecommendations(): void {
    const provinceId = this.selectedProvinceId();
    if (provinceId === null) return;
    this.recommendationRequests.next({
      query: this.buildRecommendationQuery(provinceId, this.localeService.locale(), this.searchState.state()),
    });
  }

  propertyTypeLabel(type?: string | null): string {
    const keys: Record<string, string> = {
      HOTEL: 'PUBLIC.HOME_CARDS.TYPE_HOTEL',
      MOTEL: 'PUBLIC.HOME_CARDS.TYPE_MOTEL',
      HOMESTAY: 'PUBLIC.HOME_CARDS.TYPE_HOMESTAY',
      HOSTEL: 'PUBLIC.HOME_CARDS.TYPE_HOSTEL',
      APARTMENT: 'PUBLIC.HOME_CARDS.TYPE_APARTMENT',
      VILLA: 'PUBLIC.HOME_CARDS.TYPE_VILLA',
      RESORT: 'PUBLIC.HOME_CARDS.TYPE_RESORT',
      GUEST_HOUSE: 'PUBLIC.HOME_CARDS.TYPE_GUEST_HOUSE',
    };
    return this.i18n.text(type ? keys[type] ?? 'PUBLIC.HOME_CARDS.TYPE_DEFAULT' : 'PUBLIC.HOME_CARDS.TYPE_DEFAULT');
  }

  displayImage(property: HomeRecommendationItem): string {
    return property.imageUrl || this.imageFallback.property(property.propertyType);
  }

  handleImageError(event: Event, propertyType?: string): void {
    this.imageFallback.replace(event, this.imageFallback.property(propertyType));
  }

  formatVnd(value: number): string {
    return new Intl.NumberFormat(this.localeService.locale() === 'en' ? 'en-US' : 'vi-VN', {
      maximumFractionDigits: 0,
    }).format(value || 0) + (this.localeService.locale() === 'en' ? ' VND' : ' ₫');
  }

  memberTierLabel(property: HomeRecommendationItem): string {
    const benefit = property.quote?.memberBenefit;
    if (!benefit?.eligible) return '';
    return this.localeService.locale() === 'en'
      ? (benefit.tierNameEn || benefit.tierNameVi || '')
      : (benefit.tierNameVi || benefit.tierNameEn || '');
  }

  private buildRecommendationQuery(
    provinceId: LocationId,
    locale: SupportedLocale,
    state: HomeSearchState,
  ): HomeRecommendationQuery {
    const booking = this.searchState.bookingQueryParams();
    const includeDates = state.stayType === 'OVERNIGHT';
    return {
      provinceId,
      checkInDate: includeDates ? this.stringParam(booking, 'checkInDate') : undefined,
      checkOutDate: includeDates ? this.stringParam(booking, 'checkOutDate') : undefined,
      stayType: state.stayType,
      adultCount: state.adultCount,
      childCount: state.childCount,
      roomCount: state.roomCount,
      limit: 8,
      locale,
    };
  }

  private stringParam(params: Record<string, string | number>, key: string): string | undefined {
    const value = params[key];
    return typeof value === 'string' ? value : undefined;
  }
}
