import { CommonModule } from '@angular/common';
import { Component, HostListener, Input, inject } from '@angular/core';

import { PublicI18nService } from '../../../../../core/i18n/public-i18n.service';
import { HomeSearchStateService } from '../../services/home-search-state.service';
import { DateRangeSelectorComponent } from '../date-range-selector/date-range-selector.component';
import { GuestRoomSelectorComponent } from '../guest-room-selector/guest-room-selector.component';
import { LocationAutocompleteComponent } from '../location-autocomplete/location-autocomplete.component';

@Component({
  selector: 'app-sticky-search-bar',
  standalone: true,
  imports: [CommonModule, LocationAutocompleteComponent, DateRangeSelectorComponent, GuestRoomSelectorComponent],
  template: `
    <section class="search-shell" [class.embedded]="embedded" [class.is-visible]="isVisible" [attr.aria-label]="i18n.text('PUBLIC.SEARCH.REGION_ARIA')">
      <div class="search-inner">
        <button
          type="button"
          class="mobile-summary"
          (click)="openMobileSheet()"
          [attr.aria-label]="i18n.text('PUBLIC.SEARCH.OPEN')">
          <i class="pi pi-search" aria-hidden="true"></i>
          <span>
            <strong>{{ stateService.state().locationDisplayName || i18n.text('PUBLIC.SEARCH.LOCATION_PLACEHOLDER') }}</strong>
            <small>{{ dateSummary }} · {{ stateService.guestSummary() }}</small>
          </span>
          <i class="pi pi-sliders-h" aria-hidden="true"></i>
        </button>

        <div class="desktop-fields">
          <div class="field location"><app-location-autocomplete></app-location-autocomplete></div>
          <div class="field dates"><app-date-range-selector></app-date-range-selector></div>
          <div class="field guests"><app-guest-room-selector></app-guest-room-selector></div>
          <button type="button" class="search-button" (click)="search()">
            <i class="pi pi-search" aria-hidden="true"></i><span>{{ i18n.text('PUBLIC.SEARCH.SHORT_SUBMIT') }}</span>
          </button>
        </div>
        <p *ngIf="searchError && !mobileOpen" class="inline-error" role="alert">{{ searchError }}</p>
      </div>

      <div *ngIf="mobileOpen" class="mobile-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-search-title">
        <header>
          <span><small>LuxeStay</small><h2 id="mobile-search-title">{{ i18n.text('PUBLIC.SEARCH.CHANGE_SEARCH') }}</h2></span>
          <button type="button" (click)="closeMobileSheet()" [attr.aria-label]="i18n.text('PUBLIC.SEARCH.CLOSE_SEARCH')"><i class="pi pi-times" aria-hidden="true"></i></button>
        </header>
        <div class="mobile-fields">
          <div class="field"><app-location-autocomplete></app-location-autocomplete></div>
          <div class="field"><app-date-range-selector></app-date-range-selector></div>
          <div class="field"><app-guest-room-selector></app-guest-room-selector></div>
        </div>
        <p *ngIf="searchError" class="sheet-error" role="alert">{{ searchError }}</p>
        <button type="button" class="search-button mobile-submit" (click)="submitMobileSearch()">{{ i18n.text('PUBLIC.SEARCH.SUBMIT') }}</button>
      </div>
    </section>
  `,
  styles: [`
    .search-shell{position:fixed;inset:0 0 auto;z-index:60;background:rgb(255 255 255 / .98);border-bottom:1px solid #dbe4ef;box-shadow:0 .35rem 1.25rem rgb(15 23 42 / .1);backdrop-filter:blur(12px);transform:translateY(-100%);opacity:0;pointer-events:none;transition:transform 250ms ease-out,opacity 200ms ease-out}.search-shell.is-visible{transform:translateY(0);opacity:1;pointer-events:auto}.search-shell.embedded{position:sticky;top:0;transform:none;opacity:1;pointer-events:auto}.search-inner{max-width:80rem;margin:auto;padding:.65rem 1.25rem}.desktop-fields{display:grid;grid-template-columns:minmax(15rem,1.45fr) minmax(19rem,1.2fr) minmax(12rem,.85fr) 7.25rem;gap:.5rem;align-items:stretch}.field{height:3.75rem;min-width:0;background:#fff;border:1px solid #dbe4ef;border-radius:.7rem}.field:focus-within{border-color:#1769e0;box-shadow:0 0 0 3px rgb(23 105 224 / .12)}.search-button{display:flex;align-items:center;justify-content:center;gap:.45rem;color:#fff;background:linear-gradient(135deg,#0f766e,#1769e0);border:0;border-radius:.7rem;font:inherit;font-size:.9rem;font-weight:850;cursor:pointer;transition:filter 180ms ease}.search-button:hover{filter:saturate(1.08)}.search-button:focus-visible,.mobile-summary:focus-visible,.mobile-sheet header button:focus-visible{outline:3px solid rgb(23 105 224 / .25);outline-offset:2px}.mobile-summary,.mobile-sheet{display:none}.inline-error{margin:.45rem 0 0;color:#b42318;font-size:.75rem;font-weight:700}
    @media(max-width:53.75rem){.search-inner{padding:.55rem .85rem}.desktop-fields{display:none}.mobile-summary{display:grid;width:100%;min-height:3.7rem;grid-template-columns:1.6rem minmax(0,1fr) 1.4rem;align-items:center;gap:.65rem;padding:.5rem .75rem;color:#172033;background:#fff;border:1px solid #dbe4ef;border-radius:.85rem;text-align:left}.mobile-summary>i:first-child{color:#1769e0}.mobile-summary>i:last-child{color:#64748b}.mobile-summary span{display:flex;min-width:0;flex-direction:column}.mobile-summary strong,.mobile-summary small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mobile-summary strong{font-size:.85rem}.mobile-summary small{margin-top:.2rem;color:#64748b;font-size:.7rem}.mobile-sheet{display:flex;position:fixed;inset:0;z-index:160;flex-direction:column;padding:max(1rem,env(safe-area-inset-top)) 1rem max(1rem,env(safe-area-inset-bottom));overflow:auto;background:linear-gradient(180deg,#f8fafc,#eef4f7)}.mobile-sheet header{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:1rem}.mobile-sheet header span{display:flex;flex-direction:column}.mobile-sheet header small{color:#0f766e;font-size:.68rem;font-weight:850;letter-spacing:.1em;text-transform:uppercase}.mobile-sheet h2{margin:.15rem 0 0;color:#172033;font-size:1.35rem}.mobile-sheet header button{display:grid;width:2.75rem;height:2.75rem;place-items:center;color:#475569;background:#fff;border:1px solid #dbe4ef;border-radius:50%}.mobile-fields{display:grid;gap:.75rem}.mobile-fields .field{height:4.25rem;box-shadow:0 .4rem 1rem rgb(15 23 42 / .05)}.sheet-error{margin:.75rem 0 0;color:#b42318;font-size:.78rem;font-weight:700}.mobile-submit{width:100%;min-height:3.5rem;margin-top:1rem;flex:0 0 auto}}
    @media(prefers-reduced-motion:reduce){.search-button,.mobile-summary{transition:none}}
  `]
})
export class StickySearchBarComponent {
  @Input() isVisible = false;
  @Input() embedded = false;

  mobileOpen = false;
  searchError = '';
  readonly stateService = inject(HomeSearchStateService);
  readonly i18n = inject(PublicI18nService);

  get dateSummary(): string {
    const state = this.stateService.state();
    if (state.stayType === 'DAY_USE') return this.shortDate(state.checkInDate);
    return `${this.shortDate(state.checkInDate)} - ${this.shortDate(state.checkOutDate)}`;
  }

  openMobileSheet(): void {
    this.searchError = '';
    this.mobileOpen = true;
  }

  closeMobileSheet(): void {
    this.mobileOpen = false;
    this.searchError = '';
  }

  search(): boolean {
    this.searchError = '';
    if (this.stateService.submitSearch()) return true;
    this.searchError = this.stateService.dateValidationError() || this.i18n.text('PUBLIC.SEARCH.FALLBACK_ERROR');
    return false;
  }

  submitMobileSearch(): void {
    if (this.search()) this.mobileOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.mobileOpen) this.closeMobileSheet();
  }

  private shortDate(value: Date | null): string {
    return value
      ? new Intl.DateTimeFormat(this.i18n.dateLocale(), { day: '2-digit', month: '2-digit' }).format(value)
      : '--/--';
  }
}
