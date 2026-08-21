import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { SelectModule } from 'primeng/select';
import { PaginatorModule } from 'primeng/paginator';
import { SkeletonModule } from 'primeng/skeleton';
import { Subject, catchError, of, switchMap, takeUntil, tap } from 'rxjs';

import { PublicI18nService } from '../../../../core/i18n/public-i18n.service';
import { ClientApiService, Hotel } from '../../../../core/services/client-api.service';
import { StickySearchBarComponent } from '../../../client/home/components/sticky-search-bar/sticky-search-bar.component';
import { HomeSearchStateService } from '../../../client/home/services/home-search-state.service';
import { PropertyResultCardComponent } from '../../components/property-result-card/property-result-card';
import { FilterState, SearchFilterSidebarComponent } from '../../components/search-filter-sidebar/search-filter-sidebar';
import { PropertyResultsMapComponent } from '../../components/property-results-map/property-results-map.component';

interface PaginatorEvent { page?: number; rows?: number; }

@Component({
  selector: 'app-property-search-page',
  standalone: true,
  imports: [CommonModule, FormsModule, SelectModule, PaginatorModule, SkeletonModule, StickySearchBarComponent, SearchFilterSidebarComponent, PropertyResultCardComponent, PropertyResultsMapComponent],
  template: `
    <main class="search-page">
      <app-sticky-search-bar [isVisible]="true" [embedded]="true"></app-sticky-search-bar>
      <div class="page-container">
        <header class="results-heading">
          <div>
            <p class="eyebrow">{{ i18n.text('PUBLIC.RESULTS.EYEBROW') }}</p>
            <h1>{{ displayLocation() || i18n.text('PUBLIC.RESULTS.ALL_STAYS') }}</h1>
            <p>{{ totalItems() }} · {{ guestSummary }} · {{ staySummary }}</p>
            <div *ngIf="isLandmarkSearch" class="landmark-context" role="status">
              <i class="pi pi-compass"></i>
              <span>{{ i18n.text('PUBLIC.RESULTS.LANDMARK_RADIUS', { radius: landmarkRadius }) }}</span>
              <button type="button" (click)="expandLandmarkRadius()" [disabled]="landmarkRadius >= 50">{{ i18n.text('PUBLIC.RESULTS.EXPAND') }}</button>
            </div>
          </div>
          <button type="button" class="mobile-filter" (click)="openMobileFilters()" [attr.aria-expanded]="mobileFilterVisible" aria-controls="mobile-filter-drawer">
            <i class="pi pi-filter"></i> {{ i18n.text('PUBLIC.RESULTS.FILTER') }} <b *ngIf="activeFilterCount">{{ activeFilterCount }}</b>
          </button>
        </header>

        <nav class="quick-filters" [attr.aria-label]="i18n.text('PUBLIC.RESULTS.FILTER_ARIA')">
          <button type="button" [class.active]="currentFilterState.minReviewScore === 9" (click)="toggleQuickReview()">
            <i class="pi pi-sparkles" aria-hidden="true"></i>
            {{ i18n.text('PUBLIC.RESULTS.REVIEW_EXCEPTIONAL') }} 9+
          </button>
          <button type="button" [class.active]="currentFilterState.starRatings.includes(5)" (click)="toggleQuickFiveStar()">
            <i class="pi pi-star-fill" aria-hidden="true"></i>
            {{ i18n.count('PUBLIC.RESULTS.STAR_LABEL', 5) }}
          </button>
          <button type="button" [class.active]="currentFilterState.maxPrice === 2000000" (click)="toggleQuickPrice()">
            <i class="pi pi-wallet" aria-hidden="true"></i>
            {{ i18n.text('PUBLIC.RESULTS.PRICE_UPPER', { amount: vnd(2000000) }) }}
          </button>
          <button type="button" [class.active]="selectedSort === 'PRICE_ASC'" (click)="toggleQuickPriceSort()">
            <i class="pi pi-sort-amount-down" aria-hidden="true"></i>
            {{ i18n.text('PUBLIC.RESULTS.SORT_PRICE_LOW') }}
          </button>
        </nav>

        <div class="content-grid">
          <div class="sidebar"><app-search-filter-sidebar [initialState]="currentFilterState" (filtersChanged)="onFiltersChanged($event)"></app-search-filter-sidebar></div>
          <section class="results" [attr.aria-busy]="isLoading()">
            <div class="result-tools">
              <div class="chips">
                <button *ngFor="let type of currentFilterState.propertyTypes" type="button" (click)="removePropertyType(type)">{{ propertyTypeLabel(type) }} <i class="pi pi-times"></i></button>
                <button *ngIf="currentFilterState.starRatings.length" type="button" (click)="removeStarRatings()">{{ currentFilterState.starRatings.join(', ') }} sao <i class="pi pi-times"></i></button>
                <button *ngIf="currentFilterState.minReviewScore" type="button" (click)="removeReviewScore()">{{ currentFilterState.minReviewScore }}+ <span aria-hidden="true">★</span> <i class="pi pi-times"></i></button>
                <button *ngFor="let amenity of currentFilterState.amenityCodes" type="button" (click)="removeAmenity(amenity)">{{ amenityLabel(amenity) }} <i class="pi pi-times"></i></button>
                <button *ngIf="hasPriceFilter" type="button" (click)="removePriceFilter()">{{ priceChip }} <i class="pi pi-times"></i></button>
                <button *ngIf="activeFilterCount" type="button" class="clear-chip" (click)="clearAllFilters()">{{ i18n.text('PUBLIC.RESULTS.CLEAR_ALL') }}</button>
              </div>
              <label class="sort"><span>{{ i18n.text('PUBLIC.RESULTS.SORT') }}</span><p-select [options]="sortOptions()" [(ngModel)]="selectedSort" optionLabel="label" optionValue="value" (onChange)="onSortChange()"></p-select></label>
              <div class="view-switch" role="group" aria-label="Kiểu hiển thị kết quả">
                <button type="button" [class.active]="viewMode === 'LIST'" [attr.aria-pressed]="viewMode === 'LIST'" (click)="viewMode = 'LIST'"><i class="pi pi-list"></i> Danh sách</button>
                <button type="button" [class.active]="viewMode === 'MAP'" [attr.aria-pressed]="viewMode === 'MAP'" (click)="viewMode = 'MAP'"><i class="pi pi-map"></i> Bản đồ</button>
              </div>
            </div>

            <div *ngIf="isLoading()" class="skeleton-list">
              <div *ngFor="let _ of [1,2,3,4]" class="skeleton-card"><p-skeleton width="245px" height="224px"></p-skeleton><div><p-skeleton width="65%" height="24px"></p-skeleton><p-skeleton width="90%" height="16px"></p-skeleton><p-skeleton width="55%" height="42px"></p-skeleton></div></div>
            </div>

            <div *ngIf="!isLoading() && errorMessage()" class="state-panel error-state">
              <i class="pi pi-exclamation-circle"></i><h2>{{ i18n.text('PUBLIC.RESULTS.LOAD_ERROR_TITLE') }}</h2><p>{{ errorMessage() }}</p><button type="button" (click)="retry()">{{ i18n.text('PUBLIC.RESULTS.RETRY') }}</button>
            </div>

            <ng-container *ngIf="!isLoading() && !errorMessage() && properties().length && viewMode === 'LIST'">
              <app-property-result-card *ngFor="let property of properties(); trackBy: trackProperty" [property]="property" (viewDetails)="goToDetails($event)"></app-property-result-card>
              <div class="pagination"><p-paginator [first]="(pageNumber()-1)*pageSize()" [rows]="pageSize()" [totalRecords]="totalItems()" [rowsPerPageOptions]="[10,20,50]" (onPageChange)="onPageChange($event)"></p-paginator></div>
            </ng-container>
            <app-property-results-map *ngIf="!isLoading() && !errorMessage() && properties().length && viewMode === 'MAP'" [properties]="properties()" (viewDetails)="goToDetails($event)"></app-property-results-map>

            <div *ngIf="!isLoading() && !errorMessage() && !properties().length" class="state-panel">
              <i class="pi pi-search"></i><h2>{{ i18n.text('PUBLIC.RESULTS.EMPTY_TITLE') }}</h2>
              <p *ngIf="isLandmarkSearch; else genericEmpty">{{ i18n.text('PUBLIC.RESULTS.LANDMARK_EMPTY') }}</p>
              <ng-template #genericEmpty><p>{{ i18n.text('PUBLIC.RESULTS.GENERIC_EMPTY') }}</p></ng-template>
              <div class="empty-actions">
                <button *ngIf="isLandmarkSearch" type="button" (click)="expandLandmarkRadius()" [disabled]="landmarkRadius >= 50">{{ i18n.text('PUBLIC.RESULTS.EXPAND_RADIUS') }}</button>
                <button *ngIf="isLandmarkSearch" type="button" class="secondary-action" (click)="searchLandmarkProvince()">{{ i18n.text('PUBLIC.RESULTS.SEARCH_PROVINCE') }}</button>
                <button *ngIf="!isLandmarkSearch" type="button" (click)="clearAllFilters()">{{ i18n.text('PUBLIC.RESULTS.CLEAR_FILTERS') }}</button>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div *ngIf="mobileFilterVisible" id="mobile-filter-drawer" class="filter-drawer" role="dialog" aria-modal="true" [attr.aria-label]="i18n.text('PUBLIC.RESULTS.FILTER_DIALOG')">
        <header><h2>{{ i18n.text('PUBLIC.RESULTS.FILTER') }}</h2><button type="button" (click)="closeMobileFilters()" [attr.aria-label]="i18n.text('PUBLIC.RESULTS.CLOSE')"><i class="pi pi-times" aria-hidden="true"></i></button></header>
        <app-search-filter-sidebar [initialState]="currentFilterState" (filtersChanged)="onFiltersChanged($event); closeMobileFilters()"></app-search-filter-sidebar>
      </div>
    </main>
  `,
  styles: [`
    .search-page{min-height:100vh;background:radial-gradient(circle at 85% 8%,rgb(15 118 110 / .08),transparent 26rem),#f6f7f8;color:#172033}.page-container{max-width:1280px;margin:auto;padding:30px 20px 64px}.results-heading{display:flex;align-items:end;justify-content:space-between;gap:20px;margin-bottom:18px}.eyebrow{text-transform:uppercase;font-size:11px;letter-spacing:.1em;font-weight:850;color:#0f766e;margin:0 0 5px}.results-heading h1{font-size:clamp(27px,3vw,38px);line-height:1.08;margin:0;color:#1c1917}.results-heading p:last-child{font-size:13px;color:#64748b;margin:9px 0 0}.quick-filters{display:flex;gap:9px;overflow-x:auto;padding:2px 2px 18px;scrollbar-width:none}.quick-filters::-webkit-scrollbar{display:none}.quick-filters button{display:inline-flex;min-height:42px;flex:0 0 auto;align-items:center;gap:7px;padding:0 14px;color:#44403c;background:rgb(255 255 255 / .9);border:1px solid #d6d3d1;border-radius:999px;box-shadow:0 4px 14px rgb(28 25 23 / .05);font:inherit;font-size:12px;font-weight:750;cursor:pointer;transition:border-color 180ms ease,background 180ms ease,transform 180ms ease}.quick-filters button:hover{border-color:#a16207;transform:translateY(-1px)}.quick-filters button.active{color:#fff;background:#1c1917;border-color:#1c1917}.quick-filters i{color:#a16207}.quick-filters .active i{color:#fbbf24}.content-grid{display:grid;grid-template-columns:282px minmax(0,1fr);gap:24px;align-items:start}.sidebar{position:sticky;top:96px;margin-top:66px;max-height:calc(100vh - 112px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#b8c9de transparent}.sidebar::-webkit-scrollbar{width:6px}.sidebar::-webkit-scrollbar-thumb{background:#b8c9de;border-radius:999px}.result-tools{min-height:52px;display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px}.chips{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.chips button{border:1px solid #b8d8d1;background:#edf8f5;color:#115e59;border-radius:18px;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer}.chips .clear-chip{background:transparent;border-color:transparent;color:#0f766e}.sort{display:flex;align-items:center;gap:9px;font-size:12px;color:#64748b;white-space:nowrap}.sort ::ng-deep .p-select{min-width:190px;border-radius:9px}.skeleton-card{height:226px;display:grid;grid-template-columns:245px 1fr;gap:20px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;margin-bottom:16px}.skeleton-card>div{padding:24px;display:grid;align-content:start;gap:20px}.pagination{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:4px}.state-panel{min-height:360px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:30px}.state-panel>i{font-size:34px;color:#7592b6}.state-panel h2{font-size:21px;margin:15px 0 5px}.state-panel p{color:#64748b;margin:0 0 20px}.state-panel button{border:0;border-radius:8px;background:#0f766e;color:#fff;padding:11px 18px;font-weight:700}.error-state>i{color:#c2413a}.mobile-filter{display:none}.filter-drawer{display:none}
    .landmark-context{display:flex;align-items:center;gap:8px;margin-top:10px;color:#175cd3;font-size:12px;font-weight:700}.landmark-context i{font-size:14px}.landmark-context button{border:0;background:transparent;color:#1769e0;font-size:12px;font-weight:800;cursor:pointer}.landmark-context button:disabled{color:#98a2b3;cursor:not-allowed}.empty-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}.empty-actions .secondary-action{background:#fff;color:#1769e0;border:1px solid #1769e0}.empty-actions button:disabled{background:#e2e8f0;color:#94a3b8;cursor:not-allowed}.view-switch{display:flex;flex:0 0 auto;padding:3px;background:#e7e5e4;border-radius:9px}.view-switch button{min-height:38px;padding:0 11px;border:0;border-radius:7px;background:transparent;color:#57534e;font:inherit;font-size:12px;font-weight:750;cursor:pointer}.view-switch button.active{color:#fff;background:#1c1917;box-shadow:0 3px 8px rgb(28 25 23 / .18)}.view-switch i{margin-right:5px}
    @media(max-width:900px){.page-container{padding:20px 14px}.content-grid{grid-template-columns:1fr}.sidebar{display:none}.mobile-filter{display:flex;min-height:44px;align-items:center;gap:7px;border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:10px 14px;font-weight:700}.mobile-filter b{background:#0f766e;color:#fff;border-radius:10px;padding:2px 6px}.result-tools{flex-direction:column-reverse}.sort{width:100%;justify-content:space-between}.sort ::ng-deep .p-select{flex:1}.filter-drawer{display:block;position:fixed;inset:0;z-index:110;background:#f7f9fc;padding:16px;overflow:auto}.filter-drawer header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.filter-drawer header h2{margin:0}.filter-drawer header button{border:0;width:44px;height:44px;border-radius:50%}.filter-drawer app-search-filter-sidebar{display:block;max-width:520px;margin:auto}}
    .eyebrow{font-size:12px}.quick-filters button{min-height:44px}.chips button{min-height:44px}.state-panel button{min-height:44px}.filter-drawer{padding-bottom:calc(16px + env(safe-area-inset-bottom))}
    @media(max-width:600px){.results-heading{align-items:flex-start}.results-heading h1{font-size:22px}.skeleton-card{grid-template-columns:1fr;height:auto}.skeleton-card p-skeleton:first-child{display:none}}
  `]
})
export class PropertySearchPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ClientApiService);
  readonly i18n = inject(PublicI18nService);
  readonly stateService = inject(HomeSearchStateService);
  private readonly destroy$ = new Subject<void>();
  private lastParams: Params = {};

  properties = signal<Hotel[]>([]);
  totalItems = signal(0);
  isLoading = signal(true);
  errorMessage = signal('');
  pageNumber = signal(1);
  pageSize = signal(20);
  displayLocation = signal('');
  mobileFilterVisible = false;
  viewMode: 'LIST' | 'MAP' = 'LIST';
  currentFilterState: FilterState = { minPrice: 0, maxPrice: 10000000, propertyTypes: [], starRatings: [], minReviewScore: null, amenityCodes: [] };
  selectedSort = 'POPULAR';

  readonly sortOptions = computed<Array<{ label: string; value: string }>>(() => [
      { label: this.i18n.text('PUBLIC.RESULTS.SORT_POPULAR'), value: 'POPULAR' },
      { label: this.i18n.text('PUBLIC.RESULTS.SORT_PRICE_LOW'), value: 'PRICE_ASC' },
      { label: this.i18n.text('PUBLIC.RESULTS.SORT_PRICE_HIGH'), value: 'PRICE_DESC' },
      { label: this.i18n.text('PUBLIC.RESULTS.SORT_RATING'), value: 'RATING' },
      { label: this.i18n.text('PUBLIC.RESULTS.SORT_NEAREST'), value: 'NEAREST' }
  ]);

  get isLandmarkSearch(): boolean { return Boolean(this.lastParams['landmarkId']); }
  get landmarkRadius(): number { return Number(this.lastParams['radiusKm']) || 5; }
  get guestSummary(): string {
    const state = this.stateService.state();
    const children = state.childCount ? `, ${this.i18n.count('PUBLIC.GUESTS.CHILD_COUNT', state.childCount)}` : '';
    return `${this.i18n.count('PUBLIC.GUESTS.ADULT_COUNT', state.adultCount)}${children}, ${this.i18n.count('PUBLIC.GUESTS.ROOM_COUNT', state.roomCount)}`;
  }
  get staySummary(): string { const state = this.stateService.state(); return `${this.formatDateDisplay(state.checkInDate)} - ${this.formatDateDisplay(state.checkOutDate)}`; }
  get activeFilterCount(): number { return this.currentFilterState.propertyTypes.length + this.currentFilterState.starRatings.length + this.currentFilterState.amenityCodes.length + (this.currentFilterState.minReviewScore ? 1 : 0) + (this.hasPriceFilter ? 1 : 0); }
  get hasPriceFilter(): boolean { return this.currentFilterState.minPrice > 0 || this.currentFilterState.maxPrice < 10000000; }
  get priceChip(): string { return `${this.vnd(this.currentFilterState.minPrice)} - ${this.currentFilterState.maxPrice >= 10000000 ? '10,000,000 VND+' : this.vnd(this.currentFilterState.maxPrice)}`; }

  openMobileFilters(): void { this.mobileFilterVisible = true; }
  closeMobileFilters(): void { this.mobileFilterVisible = false; }

  @HostListener('document:keydown.escape')
  closeMobileFiltersOnEscape(): void {
    if (this.mobileFilterVisible) this.closeMobileFilters();
  }

  ngOnInit(): void {
    this.route.queryParams.pipe(
      takeUntil(this.destroy$),
      tap(params => { this.lastParams = params; this.syncFromUrl(params); this.isLoading.set(true); this.errorMessage.set(''); }),
      switchMap(params => this.api.searchHotels(this.request(params)).pipe(catchError(() => {
        this.errorMessage.set(this.i18n.text('PUBLIC.SEARCH.FALLBACK_ERROR'));
        return of({ content: [], totalElements: 0, totalPages: 0, number: 0, size: this.pageSize() });
      })))
    ).subscribe(res => { this.properties.set(res.content || []); this.totalItems.set(res.totalElements || 0); this.isLoading.set(false); });
  }

  onFiltersChanged(filters: FilterState): void { this.updateRoute({ minPrice: filters.minPrice > 0 ? filters.minPrice : null, maxPrice: filters.maxPrice < 10000000 ? filters.maxPrice : null, propertyTypes: filters.propertyTypes.length ? filters.propertyTypes.join(',') : null, starRatings: filters.starRatings.length ? filters.starRatings.join(',') : null, amenityCodes: filters.amenityCodes.length ? filters.amenityCodes.join(',') : null, minReviewScore: filters.minReviewScore, pageNumber: 1 }); }
  onSortChange(): void { this.updateRoute({ sortBy: this.selectedSort, pageNumber: 1 }); }
  onPageChange(event: PaginatorEvent): void { this.updateRoute({ pageNumber: (event.page ?? 0) + 1, pageSize: event.rows ?? this.pageSize() }); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  removePropertyType(type: string): void { const values = this.currentFilterState.propertyTypes.filter(item => item !== type); this.updateRoute({ propertyTypes: values.length ? values.join(',') : null, pageNumber: 1 }); }
  removeStarRatings(): void { this.updateRoute({ starRatings: null, pageNumber: 1 }); }
  removeReviewScore(): void { this.updateRoute({ minReviewScore: null, pageNumber: 1 }); }
  removeAmenity(code: string): void { const values = this.currentFilterState.amenityCodes.filter(item => item !== code); this.updateRoute({ amenityCodes: values.length ? values.join(',') : null, pageNumber: 1 }); }
  removePriceFilter(): void { this.updateRoute({ minPrice: null, maxPrice: null, pageNumber: 1 }); }
  toggleQuickReview(): void { this.updateRoute({ minReviewScore: this.currentFilterState.minReviewScore === 9 ? null : 9, pageNumber: 1 }); }
  toggleQuickFiveStar(): void {
    const active = this.currentFilterState.starRatings.includes(5);
    const starRatings = active ? this.currentFilterState.starRatings.filter(star => star !== 5) : [5];
    this.updateRoute({ starRatings: starRatings.length ? starRatings.join(',') : null, pageNumber: 1 });
  }
  toggleQuickPrice(): void { this.updateRoute({ maxPrice: this.currentFilterState.maxPrice === 2000000 ? null : 2000000, pageNumber: 1 }); }
  toggleQuickPriceSort(): void { this.updateRoute({ sortBy: this.selectedSort === 'PRICE_ASC' ? 'POPULAR' : 'PRICE_ASC', pageNumber: 1 }); }
  clearAllFilters(): void { this.updateRoute({ minPrice: null, maxPrice: null, propertyTypes: null, starRatings: null, minReviewScore: null, amenityCodes: null, pageNumber: 1 }); }
  retry(): void { this.updateRoute({ _retry: Date.now() }); }
  goToDetails(id: string | number): void { this.router.navigate(['/hotel', id], { queryParams: { ...this.stateService.bookingQueryParams() }, fragment: 'rooms' }); }
  trackProperty(_: number, property: Hotel): string | number { return property.id; }
  propertyTypeLabel(type: string): string { const key = ({ HOTEL: 'TYPE_HOTEL', RESORT: 'TYPE_RESORT', APARTMENT: 'TYPE_APARTMENT', VILLA: 'TYPE_VILLA', HOMESTAY: 'TYPE_HOMESTAY', MOTEL: 'TYPE_MOTEL', GUEST_HOUSE: 'TYPE_GUEST_HOUSE', HOSTEL: 'TYPE_HOSTEL' } as Record<string, string>)[type]; return key ? this.i18n.text(`PUBLIC.HOME_CARDS.${key}`) : type; }
  amenityLabel(code: string): string { return ({ WIFI: 'Wi-Fi miễn phí', POOL: 'Hồ bơi', PARKING: 'Bãi đỗ xe', BREAKFAST: 'Bữa sáng', AIRPORT_SHUTTLE: 'Đưa đón sân bay', GYM: 'Phòng gym', SPA: 'Spa', RESTAURANT: 'Nhà hàng', PET_FRIENDLY: 'Cho phép thú cưng', FAMILY_ROOMS: 'Phòng gia đình', BEACH: 'Bãi biển', EV_CHARGING: 'Trạm sạc xe điện' } as Record<string, string>)[code] || code; }

  private syncFromUrl(params: Params): void {
    // Keep the default location empty so translated fallback text updates when the locale changes.
    const name = params['displayLocation'] || params['keyword'] || '';
    const landmarkId = this.locationId(params['landmarkId']);
    const provinceId = this.locationId(params['provinceId']);
    const wardId = this.locationId(params['wardId']);
    this.displayLocation.set(name);
    this.stateService.restoreLocation({ keyword: params['keyword'] || '', displayName: name, selectedSuggestionType: landmarkId ? 'LANDMARK' : wardId ? 'WARD' : provinceId ? 'PROVINCE' : null, provinceId, wardId, landmarkId, radiusKm: params['radiusKm'] ? Number(params['radiusKm']) : null, latitude: params['latitude'] ? Number(params['latitude']) : null, longitude: params['longitude'] ? Number(params['longitude']) : null });
    if (params['checkInDate']) this.stateService.updateDates(new Date(`${params['checkInDate']}T00:00:00`), params['checkOutDate'] ? new Date(`${params['checkOutDate']}T00:00:00`) : null);
    if (params['adultCount'] || params['roomCount']) this.stateService.updateGuests(Number(params['adultCount']) || 1, Number(params['childCount']) || 0, Number(params['roomCount']) || 1);
    this.pageNumber.set(Number(params['pageNumber']) || 1);
    this.pageSize.set(Number(params['pageSize']) || 20);
    this.selectedSort = params['sortBy'] || (landmarkId ? 'NEAREST' : 'POPULAR');
    this.currentFilterState = { minPrice: Number(params['minPrice']) || 0, maxPrice: params['maxPrice'] ? Number(params['maxPrice']) : 10000000, propertyTypes: this.list(params['propertyTypes']), starRatings: this.list(params['starRatings']).map(Number), minReviewScore: params['minReviewScore'] ? Number(params['minReviewScore']) : null, amenityCodes: this.list(params['amenityCodes']) };
  }

  private request(params: Params): Params {
    const request: Params = { ...params, pageNumber: this.pageNumber(), pageSize: this.pageSize(), sortBy: this.selectedSort, propertyTypes: this.currentFilterState.propertyTypes, starRatings: this.currentFilterState.starRatings, amenityCodes: this.currentFilterState.amenityCodes, minReviewScore: this.currentFilterState.minReviewScore, minPrice: this.currentFilterState.minPrice || null, maxPrice: this.currentFilterState.maxPrice < 10000000 ? this.currentFilterState.maxPrice : null };
    delete request['_retry'];
    if (!(request['propertyTypes'] as string[]).length) delete request['propertyTypes'];
    if (!(request['starRatings'] as number[]).length) delete request['starRatings'];
    if (!(request['amenityCodes'] as string[]).length) delete request['amenityCodes'];
    return request;
  }

  private locationId(value: unknown): string | number | null {
    const raw = String(value ?? '').trim();
    return !raw ? null : /^\d+$/.test(raw) ? Number(raw) : raw;
  }

  expandLandmarkRadius(): void { const current = this.landmarkRadius; const next = current < 10 ? 10 : current < 25 ? 25 : current < 50 ? 50 : 50; if (next > current) this.updateRoute({ radiusKm: next, pageNumber: 1 }); }
  searchLandmarkProvince(): void { this.updateRoute({ landmarkId: null, radiusKm: null, latitude: null, longitude: null, displayLocation: null, sortBy: 'POPULAR', pageNumber: 1 }); }
  private updateRoute(queryParams: Params): void { this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge' }); }
  private list(value: unknown): string[] { return value ? String(value).split(',').filter(Boolean) : []; }
  vnd(value: number): string { return `${new Intl.NumberFormat(this.i18n.dateLocale()).format(value)} ${this.i18n.dateLocale() === 'en-US' ? 'VND' : '₫'}`; }
  private formatDateDisplay(value: Date | null): string { return value ? new Intl.DateTimeFormat(this.i18n.dateLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' }).format(value) : this.i18n.text('PUBLIC.DATES.NOT_SELECTED'); }
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }
}
