import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CheckboxModule } from 'primeng/checkbox';
import { SliderModule } from 'primeng/slider';

import { PublicI18nService } from '../../../../core/i18n/public-i18n.service';

interface I18nFacade {
  text(key: string, params?: Record<string, string | number | boolean | null | undefined>): string;
  count(key: string, count: number, params?: Record<string, string | number | boolean | null | undefined>): string;
  dateLocale(): string;
}

export interface FilterState {
  minPrice: number;
  maxPrice: number;
  propertyTypes: string[];
  starRatings: number[];
  minReviewScore: number | null;
  amenityCodes: string[];
}

@Component({
  selector: 'app-search-filter-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule, SliderModule, CheckboxModule],
  template: `
    <aside class="filter-panel" [attr.aria-label]="i18n.text('PUBLIC.RESULTS.FILTER_ARIA')">
      <header class="filter-header">
        <div><span class="eyebrow">{{ i18n.text('PUBLIC.RESULTS.REFINE') }}</span><h2>{{ i18n.text('PUBLIC.RESULTS.FILTER') }}</h2></div>
        <button type="button" class="text-action" (click)="clearAll()">{{ i18n.text('PUBLIC.RESULTS.CLEAR_ALL') }}</button>
      </header>

      <section class="filter-group">
        <div class="group-heading"><h3>{{ i18n.text('PUBLIC.RESULTS.PRICE_PER_NIGHT') }}</h3><span>VND</span></div>
        <p-slider [(ngModel)]="priceRange" [range]="true" [min]="0" [max]="10000000" [step]="100000" [attr.aria-label]="i18n.text('PUBLIC.RESULTS.PRICE_ARIA')"></p-slider>
        <div class="price-values">
          <span>{{ formatVnd(priceRange[0]) }}</span>
          <span>{{ priceRange[1] >= 10000000 ? i18n.text('PUBLIC.RESULTS.PRICE_UPPER', { amount: formatVnd(10000000) }) : formatVnd(priceRange[1]) }}</span>
        </div>
      </section>

      <section class="filter-group">
        <h3>{{ i18n.text('PUBLIC.RESULTS.PROPERTY_TYPE') }}</h3>
        <label *ngFor="let type of propertyTypeOptions()" class="check-row" [for]="'type-' + type.value">
          <p-checkbox [value]="type.value" [(ngModel)]="selectedPropertyTypes" [inputId]="'type-' + type.value"></p-checkbox>
          <span>{{ type.label }}</span>
        </label>
      </section>

      <section class="filter-group">
        <h3>{{ i18n.text('PUBLIC.RESULTS.STAR_RATING') }}</h3>
        <label *ngFor="let star of [5,4,3,2,1]" class="check-row" [for]="'star-' + star">
          <p-checkbox [value]="star" [(ngModel)]="selectedStars" [inputId]="'star-' + star"></p-checkbox>
          <span>{{ i18n.count('PUBLIC.RESULTS.STAR_LABEL', star) }}</span><span class="stars" aria-hidden="true">★</span>
        </label>
      </section>

      <section class="filter-group">
        <h3>{{ i18n.text('PUBLIC.RESULTS.REVIEW_SCORE') }}</h3>
        <label *ngFor="let score of reviewOptions()" class="radio-row">
          <input type="radio" name="review-score" [value]="score.value" [(ngModel)]="selectedReviewScore">
          <span><strong>{{ score.value }}+</strong> {{ score.label }}</span>
        </label>
        <button *ngIf="selectedReviewScore" type="button" class="text-action compact" (click)="selectedReviewScore = null">{{ i18n.text('PUBLIC.RESULTS.CLEAR_REVIEW') }}</button>
      </section>

      <section class="filter-group">
        <h3>Tiện nghi</h3>
        <label *ngFor="let amenity of amenityOptions" class="check-row" [for]="'amenity-' + amenity.value">
          <p-checkbox [value]="amenity.value" [(ngModel)]="selectedAmenities" [inputId]="'amenity-' + amenity.value"></p-checkbox>
          <span>{{ amenity.label }}</span>
        </label>
      </section>

      <div class="filter-actions"><button type="button" class="apply-button" (click)="applyFilters()">{{ i18n.text('PUBLIC.RESULTS.APPLY_FILTERS') }}</button></div>
    </aside>
  `,
  styles: [`
    .filter-panel{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:20px;box-shadow:0 4px 18px rgba(15,23,42,.05)}
    .filter-header,.group-heading,.price-values{display:flex;align-items:center;justify-content:space-between;gap:12px}
    .filter-header{padding-bottom:18px}.filter-header h2{font-size:20px;margin:2px 0 0;color:#0f172a}.eyebrow{font-size:12px;text-transform:uppercase;color:#57534e;font-weight:700}
    .filter-group{padding:19px 0;border-top:1px solid #edf2f7}.filter-group h3{font-size:15px;margin:0 0 14px;color:#172033}.group-heading h3{margin:0}.group-heading span{font-size:12px;color:#57534e}
    .price-values{font-size:12px;color:#475569;margin-top:12px}.check-row,.radio-row{display:flex;align-items:center;gap:10px;min-height:44px;font-size:14px;color:#334155;cursor:pointer}.stars{color:#a16207;margin-left:auto}
    .radio-row input{width:20px;height:20px;accent-color:#0f766e}.text-action{min-height:44px;border:0;background:transparent;color:#0f766e;font-weight:700;cursor:pointer;padding:4px 8px}.text-action.compact{font-size:12px;margin-top:8px;padding-left:0}
    .filter-actions{position:sticky;bottom:0;background:#fff;padding-top:12px;border-top:1px solid #edf2f7}.apply-button{width:100%;height:44px;border:0;border-radius:6px;background:#1769e0;color:#fff;font-weight:700;cursor:pointer}.apply-button:hover{background:#0f58c7}
    :host ::ng-deep .p-slider{margin:20px 7px 0}:host ::ng-deep .p-slider-range{background:#0f766e}:host ::ng-deep .p-slider-handle{width:24px;height:24px;margin-top:-11px;border-color:#0f766e}:host ::ng-deep .p-checkbox-box{width:22px;height:22px}
  `]
})
export class SearchFilterSidebarComponent implements OnChanges {
  @Input() initialState: Partial<FilterState> = {};
  @Output() filtersChanged = new EventEmitter<FilterState>();

  readonly i18n: I18nFacade = this.resolveI18n();
  priceRange = [0, 10000000];
  selectedPropertyTypes: string[] = [];
  selectedStars: number[] = [];
  selectedReviewScore: number | null = null;
  selectedAmenities: string[] = [];
  readonly amenityOptions = [
    { value: 'WIFI', label: 'Wi-Fi miễn phí' }, { value: 'POOL', label: 'Hồ bơi' }, { value: 'PARKING', label: 'Bãi đỗ xe' },
    { value: 'BREAKFAST', label: 'Bữa sáng' }, { value: 'AIRPORT_SHUTTLE', label: 'Đưa đón sân bay' }, { value: 'GYM', label: 'Phòng gym' },
    { value: 'SPA', label: 'Spa' }, { value: 'RESTAURANT', label: 'Nhà hàng' }, { value: 'FAMILY_ROOMS', label: 'Phòng gia đình' },
    { value: 'PET_FRIENDLY', label: 'Cho phép thú cưng' }, { value: 'BEACH', label: 'Bãi biển' }, { value: 'EV_CHARGING', label: 'Trạm sạc xe điện' }
  ];

  readonly propertyTypeOptions = computed<Array<{ label: string; value: string }>>(() =>
    ['HOTEL', 'RESORT', 'APARTMENT', 'VILLA', 'HOMESTAY', 'MOTEL', 'GUEST_HOUSE', 'HOSTEL']
      .map(value => ({ label: this.propertyTypeLabel(value), value }))
  );
  readonly reviewOptions = computed<Array<{ value: number; label: string }>>(() => [
      { value: 9, label: this.i18n.text('PUBLIC.RESULTS.REVIEW_EXCEPTIONAL') },
      { value: 8, label: this.i18n.text('PUBLIC.RESULTS.REVIEW_VERY_GOOD') },
      { value: 7, label: this.i18n.text('PUBLIC.RESULTS.REVIEW_GOOD') },
      { value: 6, label: this.i18n.text('PUBLIC.RESULTS.REVIEW_PLEASANT') }
  ]);

  ngOnChanges(): void {
    this.priceRange = [this.initialState.minPrice ?? 0, this.initialState.maxPrice ?? 10000000];
    this.selectedPropertyTypes = [...(this.initialState.propertyTypes || [])];
    this.selectedStars = [...(this.initialState.starRatings || [])];
    this.selectedReviewScore = this.initialState.minReviewScore ?? null;
    this.selectedAmenities = [...(this.initialState.amenityCodes || [])];
  }
  applyFilters(): void {
    this.filtersChanged.emit({ minPrice: Math.max(0, Number(this.priceRange[0]) || 0), maxPrice: Math.max(this.priceRange[0], Number(this.priceRange[1]) || 10000000), propertyTypes: [...this.selectedPropertyTypes], starRatings: [...this.selectedStars], minReviewScore: this.selectedReviewScore, amenityCodes: [...this.selectedAmenities] });
  }
  clearAll(): void { this.priceRange = [0, 10000000]; this.selectedPropertyTypes = []; this.selectedStars = []; this.selectedReviewScore = null; this.selectedAmenities = []; this.applyFilters(); }
  formatVnd(value: number): string { return `${new Intl.NumberFormat(this.i18n.dateLocale(), { maximumFractionDigits: 0 }).format(value || 0)} ${this.i18n.dateLocale() === 'en-US' ? 'VND' : '₫'}`; }
  private propertyTypeLabel(type: string): string { const key = ({ HOTEL: 'TYPE_HOTEL', RESORT: 'TYPE_RESORT', APARTMENT: 'TYPE_APARTMENT', VILLA: 'TYPE_VILLA', HOMESTAY: 'TYPE_HOMESTAY', MOTEL: 'TYPE_MOTEL', GUEST_HOUSE: 'TYPE_GUEST_HOUSE', HOSTEL: 'TYPE_HOSTEL' } as Record<string, string>)[type]; return this.i18n.text(`PUBLIC.HOME_CARDS.${key}`); }
  private resolveI18n(): I18nFacade {
    try { return inject(PublicI18nService); }
    catch { return { text: (key: string) => key, count: (key: string) => key, dateLocale: () => 'vi-VN' }; }
  }
}
