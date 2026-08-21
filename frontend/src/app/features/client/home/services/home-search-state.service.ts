import { Injectable, computed, signal } from '@angular/core';
import { Router } from '@angular/router';

export type StayType = 'OVERNIGHT' | 'DAY_USE';
export type SuggestionType = 'PROVINCE' | 'WARD' | 'PROPERTY' | 'LANDMARK';
export type LocationId = string | number;

export interface HomeSearchState {
  keyword: string;
  locationDisplayName: string;
  selectedSuggestionType: SuggestionType | null;
  provinceId: LocationId | null;
  wardId: LocationId | null;
  propertyId: LocationId | null;
  landmarkId: LocationId | null;
  radiusKm: number | null;
  propertyTypes: string[];
  stayType: StayType;
  checkInDate: Date | null;
  checkOutDate: Date | null;
  adultCount: number;
  childCount: number;
  roomCount: number;
  latitude: number | null;
  longitude: number | null;
}

export interface RecentSearch {
  displayLocation: string;
  keyword: string;
  provinceId: LocationId | null;
  wardId: LocationId | null;
  propertyId: LocationId | null;
  landmarkId?: LocationId | null;
  selectedSuggestionType: SuggestionType | null;
  stayType?: StayType;
  propertyTypes?: string[];
  checkInDate: string | null;
  checkOutDate: string | null;
  adultCount: number;
  childCount: number;
  roomCount: number;
  latitude?: number | null;
  longitude?: number | null;
  radiusKm?: number | null;
  createdAt: string;
}

export interface SearchSelection {
  type: SuggestionType;
  id: LocationId;
  displayName: string;
  name?: string;
  provinceId?: LocationId;
  provinceName?: string;
  wardId?: LocationId;
  latitude?: number;
  longitude?: number;
  defaultRadiusKm?: number;
  category?: string;
}

export interface RestoredLocationContext {
  keyword: string;
  displayName: string;
  selectedSuggestionType: SuggestionType | null;
  provinceId: LocationId | null;
  wardId: LocationId | null;
  propertyId?: LocationId | null;
  landmarkId?: LocationId | null;
  radiusKm?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}

@Injectable({ providedIn: 'root' })
export class HomeSearchStateService {
  readonly state = signal<HomeSearchState>(this.createDefaultState());
  readonly recentSearches = signal<RecentSearch[]>(this.readRecentSearches());

  readonly guestSummary = computed(() => {
    const state = this.state();
    let summary = `${state.adultCount} người lớn`;
    if (state.childCount > 0) summary += `, ${state.childCount} trẻ em`;
    return `${summary} · ${state.roomCount} phòng`;
  });

  readonly isDayUse = computed(() => this.state().stayType === 'DAY_USE');

  readonly dateValidationError = computed(() => {
    const state = this.state();
    const checkIn = state.checkInDate ? this.startOfDay(state.checkInDate) : null;
    const checkOut = state.checkOutDate ? this.startOfDay(state.checkOutDate) : null;
    if (!checkIn) return 'Vui lòng chọn ngày nhận phòng.';
    if (checkIn < this.startOfToday()) return 'Ngày nhận phòng không thể ở trong quá khứ.';
    if (state.stayType === 'DAY_USE') return '';
    if (!checkOut) return 'Vui lòng chọn ngày trả phòng.';
    if (checkOut <= checkIn) return 'Ngày trả phòng phải sau ngày nhận phòng.';
    return '';
  });

  constructor(private router: Router) {}

  updateKeyword(value: string): void {
    this.state.update(state => ({
      ...state,
      keyword: value,
      locationDisplayName: value,
      selectedSuggestionType: null,
      provinceId: null,
      wardId: null,
      propertyId: null,
      landmarkId: null,
      radiusKm: null,
      latitude: null,
      longitude: null
    }));
  }

  updateLocation(keyword: string, displayName: string, provinceId: LocationId | null, wardId: LocationId | null): void {
    this.state.update(state => ({
      ...state,
      keyword,
      locationDisplayName: displayName,
      selectedSuggestionType: wardId ? 'WARD' : provinceId ? 'PROVINCE' : null,
      provinceId,
      wardId,
      propertyId: null,
      landmarkId: null,
      radiusKm: null,
      latitude: null,
      longitude: null
    }));
  }

  restoreLocation(context: RestoredLocationContext): void {
    this.state.update(state => ({
      ...state,
      keyword: context.keyword,
      locationDisplayName: context.displayName,
      selectedSuggestionType: context.selectedSuggestionType,
      provinceId: context.provinceId,
      wardId: context.wardId,
      propertyId: context.propertyId ?? null,
      landmarkId: context.landmarkId ?? null,
      radiusKm: context.radiusKm ?? null,
      latitude: context.latitude ?? null,
      longitude: context.longitude ?? null
    }));
  }

  selectSuggestion(selection: SearchSelection): void {
    const provinceId = selection.type === 'PROVINCE' ? selection.id : selection.provinceId ?? null;
    const wardId = selection.type === 'WARD' ? selection.id : selection.wardId ?? null;
    const landmarkId = selection.type === 'LANDMARK' ? selection.id : null;
    this.state.update(state => ({
      ...state,
      keyword: selection.type === 'PROPERTY' ? selection.name || selection.displayName : '',
      locationDisplayName: selection.displayName,
      selectedSuggestionType: selection.type,
      provinceId,
      wardId: selection.type === 'PROVINCE' ? null : wardId,
      propertyId: selection.type === 'PROPERTY' ? selection.id : null,
      landmarkId,
      radiusKm: landmarkId ? selection.defaultRadiusKm ?? 5 : null,
      latitude: landmarkId ? selection.latitude ?? null : null,
      longitude: landmarkId ? selection.longitude ?? null : null
    }));

    if (selection.type === 'PROPERTY') {
      this.saveRecentSearch(this.state());
      this.router.navigate(['/hotel', selection.id], { queryParams: this.bookingQueryParams() });
    }
  }

  clearLocation(): void {
    this.state.update(state => ({
      ...state,
      keyword: '',
      locationDisplayName: '',
      selectedSuggestionType: null,
      provinceId: null,
      wardId: null,
      propertyId: null,
      landmarkId: null,
      radiusKm: null,
      latitude: null,
      longitude: null
    }));
  }

  updateStayType(stayType: StayType): void {
    this.state.update(state => {
      const next = { ...state, stayType };
      if (stayType === 'DAY_USE') {
        next.checkOutDate = null;
      } else if (next.checkInDate &&
          (!next.checkOutDate || next.checkOutDate <= next.checkInDate)) {
        next.checkOutDate = this.addDays(next.checkInDate, 1);
      }
      return next;
    });
  }

  updatePropertyTypes(propertyTypes: string[]): void {
    this.state.update(state => ({ ...state, propertyTypes }));
  }

  updateDates(checkInDate: Date | null, checkOutDate: Date | null): void {
    this.state.update(state => ({
      ...state,
      checkInDate: checkInDate ? this.startOfDay(checkInDate) : null,
      checkOutDate: state.stayType === 'DAY_USE'
        ? null
        : checkOutDate ? this.startOfDay(checkOutDate) : null
    }));
  }

  updateGuests(adultCount: number, childCount: number, roomCount: number): void {
    this.state.update(state => ({
      ...state,
      adultCount: Math.max(1, adultCount),
      childCount: Math.max(0, childCount),
      roomCount: Math.max(1, roomCount)
    }));
  }

  applyRecentSearch(recent: RecentSearch): void {
    const today = this.startOfToday();
    const stayType = recent.stayType || 'OVERNIGHT';
    let checkIn = recent.checkInDate ? new Date(`${recent.checkInDate}T00:00:00`) : today;
    let checkOut = stayType === 'DAY_USE'
      ? null
      : recent.checkOutDate ? new Date(`${recent.checkOutDate}T00:00:00`) : this.addDays(today, 1);
    if (checkIn < today) {
      checkIn = today;
      checkOut = stayType === 'DAY_USE' ? null : this.addDays(today, 1);
    } else if (stayType === 'OVERNIGHT' && checkOut && checkOut <= checkIn) {
      checkOut = this.addDays(checkIn, 1);
    }
    this.state.update(state => ({
      ...state,
      keyword: recent.keyword,
      locationDisplayName: recent.displayLocation,
      selectedSuggestionType: recent.selectedSuggestionType,
      provinceId: recent.provinceId,
      wardId: recent.wardId,
      propertyId: recent.propertyId,
      landmarkId: recent.landmarkId ?? null,
      radiusKm: recent.radiusKm ?? null,
      latitude: recent.latitude ?? null,
      longitude: recent.longitude ?? null,
      stayType,
      propertyTypes: [...(recent.propertyTypes || [])],
      checkInDate: checkIn,
      checkOutDate: checkOut,
      adultCount: recent.adultCount || 1,
      childCount: recent.childCount || 0,
      roomCount: recent.roomCount || 1
    }));
  }

  removeRecentSearch(recent: RecentSearch): void {
    const remaining = this.recentSearches().filter(item => this.recentKey(item) !== this.recentKey(recent));
    this.persistRecent(remaining);
  }

  clearRecentSearches(): void {
    this.persistRecent([]);
  }

  submitSearch(): boolean {
    const state = this.state();
    if (this.dateValidationError() || !state.checkInDate) return false;
    if (state.propertyId) {
      this.saveRecentSearch(state);
      this.router.navigate(['/hotel', state.propertyId], { queryParams: this.bookingQueryParams() });
      return true;
    }

    const queryParams: Record<string, string | number> = {
      stayType: state.stayType,
      checkInDate: this.formatDate(state.checkInDate),
      adultCount: state.adultCount,
      childCount: state.childCount,
      roomCount: state.roomCount
    };
    if (state.checkOutDate) queryParams['checkOutDate'] = this.formatDate(state.checkOutDate);
    if (state.keyword && !state.provinceId && !state.wardId) queryParams['keyword'] = state.keyword.trim();
    if (state.locationDisplayName) queryParams['displayLocation'] = state.locationDisplayName;
    if (state.provinceId) queryParams['provinceId'] = state.provinceId;
    if (state.wardId) queryParams['wardId'] = state.wardId;
    if (state.landmarkId) queryParams['landmarkId'] = state.landmarkId;
    if (state.radiusKm !== null) queryParams['radiusKm'] = state.radiusKm;
    if (state.landmarkId) queryParams['sortBy'] = 'NEAREST';
    if (state.propertyTypes.length) queryParams['propertyTypes'] = state.propertyTypes.join(',');
    if (state.latitude !== null) queryParams['latitude'] = state.latitude;
    if (state.longitude !== null) queryParams['longitude'] = state.longitude;

    this.saveRecentSearch(state);
    this.router.navigate(['/search'], { queryParams });
    return true;
  }

  bookingQueryParams(): Record<string, string | number> {
    const state = this.state();
    const params: Record<string, string | number> = {
      adultCount: state.adultCount,
      childCount: state.childCount,
      roomCount: state.roomCount
    };
    if (state.checkInDate) params['checkInDate'] = this.formatDate(state.checkInDate);
    if (state.checkOutDate) params['checkOutDate'] = this.formatDate(state.checkOutDate);
    return params;
  }

  private createDefaultState(): HomeSearchState {
    const checkInDate = this.startOfToday();
    return {
      keyword: '', locationDisplayName: '', selectedSuggestionType: null,
      provinceId: null, wardId: null, propertyId: null, propertyTypes: [],
      landmarkId: null, radiusKm: null,
      stayType: 'OVERNIGHT', checkInDate, checkOutDate: this.addDays(checkInDate, 1),
      adultCount: 2, childCount: 0, roomCount: 1, latitude: null, longitude: null
    };
  }

  private saveRecentSearch(state: HomeSearchState): void {
    if (!state.locationDisplayName.trim()) return;
    const entry: RecentSearch = {
      displayLocation: state.locationDisplayName,
      keyword: state.keyword,
      provinceId: state.provinceId,
      wardId: state.wardId,
      propertyId: state.propertyId,
      landmarkId: state.landmarkId,
      selectedSuggestionType: state.selectedSuggestionType,
      stayType: state.stayType,
      propertyTypes: [...state.propertyTypes],
      checkInDate: state.checkInDate ? this.formatDate(state.checkInDate) : null,
      checkOutDate: state.checkOutDate ? this.formatDate(state.checkOutDate) : null,
      adultCount: state.adultCount,
      childCount: state.childCount,
      roomCount: state.roomCount,
      latitude: state.latitude,
      longitude: state.longitude,
      radiusKm: state.radiusKm,
      createdAt: new Date().toISOString()
    };
    const unique = this.recentSearches().filter(item => this.recentKey(item) !== this.recentKey(entry));
    this.persistRecent([entry, ...unique].slice(0, 8));
  }

  private readRecentSearches(): RecentSearch[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const parsed = JSON.parse(localStorage.getItem('luxestay.recent-searches') ||
        localStorage.getItem('recentSearches') || '[]');
      return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
    } catch {
      return [];
    }
  }

  private persistRecent(items: RecentSearch[]): void {
    this.recentSearches.set(items);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('luxestay.recent-searches', JSON.stringify(items));
      localStorage.removeItem('recentSearches');
    }
  }

  private recentKey(item: RecentSearch): string {
    const propertyTypes = [...(item.propertyTypes || [])].sort().join(',');
    return `${item.selectedSuggestionType || ''}:${item.propertyId || item.landmarkId || item.wardId || item.provinceId || item.displayLocation}:${item.stayType || 'OVERNIGHT'}:${propertyTypes}`;
  }

  private startOfToday(): Date {
    return this.startOfDay(new Date());
  }

  private startOfDay(value: Date): Date {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
