import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, ViewChild, effect, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Subject, merge, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, switchMap, takeUntil, tap } from 'rxjs/operators';
import {
  ClientApiService,
  LocationSuggestion,
  SearchSuggestionGroups
} from '../../../../../core/services/client-api.service';
import { PublicI18nService } from '../../../../../core/i18n/public-i18n.service';
import { SafeHighlightComponent } from '../../../../../shared/components/safe-highlight/safe-highlight.component';
import { HomeSearchStateService, RecentSearch } from '../../services/home-search-state.service';
import { ImageFallbackService } from '../../../../../core/services/image-fallback.service';

interface SuggestionGroup {
  type: LocationSuggestion['type'];
  label: string;
  icon: string;
  items: LocationSuggestion[];
}

@Component({
  selector: 'app-location-autocomplete',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SafeHighlightComponent],
  templateUrl: './location-autocomplete.component.html',
  styleUrls: ['./location-autocomplete.component.css']
})
export class LocationAutocompleteComponent implements OnDestroy {
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  private readonly stateService = inject(HomeSearchStateService);
  private readonly api = inject(ClientApiService);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();
  private readonly retry$ = new Subject<string>();
  private readonly imageFallback = inject(ImageFallbackService);
  readonly i18n = inject(PublicI18nService);

  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly skeletonRows = [1, 2, 3, 4];

  popupOpen = false;
  loading = false;
  loadError = false;
  popularLoading = false;
  popularDestinations: LocationSuggestion[] = [];
  resultGroups: SearchSuggestionGroups = this.emptyResults();
  activeIndex = -1;

  constructor() {
    effect(() => {
      const displayName = this.stateService.state().locationDisplayName || '';
      if (this.searchControl.value !== displayName) {
        this.searchControl.setValue(displayName, { emitEvent: false });
      }
    });

    const typedSearch$ = this.searchControl.valueChanges.pipe(
      map(value => value.trim()),
      tap(value => {
        this.stateService.updateKeyword(this.searchControl.value);
        this.activeIndex = -1;
        this.loadError = false;
        if (value.length < 2) {
          this.loading = false;
          this.resultGroups = this.emptyResults();
        }
      }),
      debounceTime(350),
      distinctUntilChanged()
    );

    merge(typedSearch$, this.retry$).pipe(
      switchMap(keyword => {
        if (keyword.length < 2) return of(null);
        this.loading = true;
        const state = this.stateService.state();
        return this.api.getSearchSuggestions(
          keyword,
          10,
          state.latitude ?? undefined,
          state.longitude ?? undefined,
          state.provinceId ?? undefined
        ).pipe(
          map(response => ({ response, failed: false })),
          catchError(() => of({ response: this.emptyResults(), failed: true }))
        );
      }),
      takeUntil(this.destroy$)
    ).subscribe(result => {
      if (!result) return;
      this.loading = false;
      this.loadError = result.failed;
      this.resultGroups = result.response;
      this.changeDetector.markForCheck();
    });
  }

  get keyword(): string {
    return this.searchControl.value.trim();
  }

  get recentSearches(): RecentSearch[] {
    return this.stateService.recentSearches();
  }

  get groupedResults(): SuggestionGroup[] {
    const groups: SuggestionGroup[] = [
      { type: 'PROVINCE', label: this.i18n.text('PUBLIC.SEARCH.GROUP_PROVINCES'), icon: 'pi pi-map-marker', items: this.withAvailableProperties(this.resultGroups.provinces) },
      { type: 'WARD', label: this.i18n.text('PUBLIC.SEARCH.GROUP_WARDS'), icon: 'pi pi-map', items: this.withAvailableProperties(this.resultGroups.wards) },
      { type: 'PROPERTY', label: this.i18n.text('PUBLIC.SEARCH.GROUP_PROPERTIES'), icon: 'pi pi-building', items: this.resultGroups.properties || [] },
      { type: 'LANDMARK', label: this.i18n.text('PUBLIC.SEARCH.GROUP_LANDMARKS'), icon: 'pi pi-compass', items: this.resultGroups.landmarks || [] }
    ];
    return groups.filter(group => group.items.length > 0);
  }

  private withAvailableProperties(items?: LocationSuggestion[]): LocationSuggestion[] {
    return (items || []).filter(item => Number(item.propertyCount) > 0);
  }

  get flatResults(): LocationSuggestion[] {
    return this.groupedResults.flatMap(group => group.items);
  }

  get activeResult(): LocationSuggestion | null {
    return this.flatResults[this.activeIndex] || null;
  }

  get hasResults(): boolean {
    return this.flatResults.length > 0;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  openPopup(): void {
    this.popupOpen = true;
    if (this.keyword.length < 2) this.loadPopularDestinations();
  }

  closePopup(): void {
    this.popupOpen = false;
    this.activeIndex = -1;
  }

  focusInput(): void {
    this.searchInput?.nativeElement.focus();
    this.openPopup();
  }

  onShellClick(event: MouseEvent): void {
    // Only clicks on the shell itself should focus the input; popup controls
    // handle their own selection and must not reopen the popup.
    if (event.target === event.currentTarget) this.focusInput();
  }

  clearInput(event: MouseEvent): void {
    event.stopPropagation();
    this.searchControl.setValue('');
    this.stateService.clearLocation();
    this.resultGroups = this.emptyResults();
    this.focusInput();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closePopup();
      return;
    }
    if (event.key === 'Tab') {
      this.closePopup();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!this.popupOpen) this.openPopup();
      if (!this.flatResults.length) return;
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      this.activeIndex = (this.activeIndex + direction + this.flatResults.length) % this.flatResults.length;
      this.scrollActiveIntoView();
      return;
    }
    if (event.key === 'Enter' && this.activeResult) {
      event.preventDefault();
      this.selectResult(this.activeResult);
    }
  }

  selectResult(result: LocationSuggestion): void {
    this.stateService.selectSuggestion({
      type: result.type,
      id: result.id,
      name: result.name,
      displayName: result.displayName || result.name,
      provinceId: result.provinceId,
      wardId: result.wardId,
      latitude: result.latitude,
      longitude: result.longitude,
      defaultRadiusKm: result.defaultRadiusKm,
      category: result.category
    });
    this.closePopup();
  }

  selectResultFromMouse(event: MouseEvent, result: LocationSuggestion): void {
    event.preventDefault();
    event.stopPropagation();
    this.selectResult(result);
  }

  selectRecent(recent: RecentSearch): void {
    this.stateService.applyRecentSearch(recent);
    this.closePopup();
  }

  removeRecent(event: MouseEvent, recent: RecentSearch): void {
    event.stopPropagation();
    this.stateService.removeRecentSearch(recent);
  }

  clearRecent(): void {
    this.stateService.clearRecentSearches();
  }

  retrySearch(): void {
    const keyword = this.searchControl.value.trim();
    if (keyword.length >= 2) this.retry$.next(keyword);
  }

  propertyTypeLabel(type?: string): string {
    const labels: Record<string, string> = {
      HOTEL: 'PUBLIC.HOME_CARDS.TYPE_HOTEL', MOTEL: 'PUBLIC.HOME_CARDS.TYPE_MOTEL',
      HOMESTAY: 'PUBLIC.HOME_CARDS.TYPE_HOMESTAY', HOSTEL: 'PUBLIC.HOME_CARDS.TYPE_HOSTEL',
      APARTMENT: 'PUBLIC.HOME_CARDS.TYPE_APARTMENT', VILLA: 'PUBLIC.HOME_CARDS.TYPE_VILLA',
      RESORT: 'PUBLIC.HOME_CARDS.TYPE_RESORT', GUEST_HOUSE: 'PUBLIC.HOME_CARDS.TYPE_GUEST_HOUSE'
    };
    return this.i18n.text(type ? labels[type] || 'PUBLIC.HOME_CARDS.TYPE_DEFAULT' : 'PUBLIC.HOME_CARDS.TYPE_DEFAULT');
  }

  displayImage(imageUrl?: string, propertyType?: string): string {
    return imageUrl || (propertyType ? this.imageFallback.property(propertyType) : this.imageFallback.destination());
  }

  handleImageError(event: Event, type?: string): void {
    this.imageFallback.replace(event, type ? this.imageFallback.property(type) : this.imageFallback.destination());
  }

  resultIndex(result: LocationSuggestion): number {
    return this.flatResults.indexOf(result);
  }

  @HostListener('document:mousedown', ['$event'])
  handleOutsideClick(event: MouseEvent): void {
    if (this.popupOpen && !this.host.nativeElement.contains(event.target as Node)) this.closePopup();
  }

  private loadPopularDestinations(): void {
    if (this.popularDestinations.length || this.popularLoading) return;
    this.popularLoading = true;
    this.api.getPopularDestinations(8).pipe(takeUntil(this.destroy$)).subscribe({
      next: destinations => {
        this.popularDestinations = destinations;
        this.popularLoading = false;
        this.changeDetector.markForCheck();
      },
      error: () => {
        this.popularDestinations = [];
        this.popularLoading = false;
        this.changeDetector.markForCheck();
      }
    });
  }

  private scrollActiveIntoView(): void {
    requestAnimationFrame(() => {
      this.host.nativeElement.querySelector<HTMLElement>(`#location-option-${this.activeIndex}`)
        ?.scrollIntoView({ block: 'nearest' });
    });
  }

  private emptyResults(): SearchSuggestionGroups {
    return { provinces: [], wards: [], properties: [], landmarks: [] };
  }
}
