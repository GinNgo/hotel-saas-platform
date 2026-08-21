import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { PublicI18nService } from '../../../../../core/i18n/public-i18n.service';
import { HomeSearchStateService } from '../../services/home-search-state.service';
import { DateRangeSelectorComponent } from '../date-range-selector/date-range-selector.component';
import { GuestRoomSelectorComponent } from '../guest-room-selector/guest-room-selector.component';
import { LocationAutocompleteComponent } from '../location-autocomplete/location-autocomplete.component';
import { SearchServiceTabsComponent } from '../search-service-tabs/search-service-tabs.component';
import { StayTypeSelectorComponent } from '../stay-type-selector/stay-type-selector.component';

@Component({
  selector: 'app-hero-search',
  standalone: true,
  imports: [
    CommonModule,
    SearchServiceTabsComponent,
    StayTypeSelectorComponent,
    LocationAutocompleteComponent,
    DateRangeSelectorComponent,
    GuestRoomSelectorComponent,
  ],
  template: `
    <section class="hero-search" [attr.aria-label]="i18n.text('PUBLIC.SEARCH.REGION_ARIA')">
      <app-search-service-tabs></app-search-service-tabs>

      <div class="search-panel">
        <div class="search-heading">
          <div>
            <span class="search-kicker">{{ i18n.text('PUBLIC.SEARCH.PLAN_KICKER') }}</span>
            <strong>{{ i18n.text('PUBLIC.SEARCH.PLAN_TITLE') }}</strong>
          </div>
          <app-stay-type-selector></app-stay-type-selector>
        </div>

        <div class="search-fields">
          <div class="search-field location-field">
            <app-location-autocomplete></app-location-autocomplete>
          </div>

          <div class="search-field date-field">
            <app-date-range-selector></app-date-range-selector>
          </div>

          <div class="search-field guest-field">
            <app-guest-room-selector></app-guest-room-selector>
          </div>

          <button type="button" class="search-submit" (click)="search()">
            <i class="pi pi-search" aria-hidden="true"></i>
            <span>{{ i18n.text('PUBLIC.SEARCH.SUBMIT') }}</span>
          </button>
        </div>

        <p *ngIf="searchError" class="search-error" role="alert">
          <i class="pi pi-exclamation-circle" aria-hidden="true"></i>
          {{ searchError }}
        </p>
      </div>
    </section>
  `,
  styles: [`
    :host{display:block}.hero-search{width:100%}.search-panel{padding:1.25rem;background:rgb(255 255 255 / .98);border:1px solid #dbe4ef;border-radius:0 1.25rem 1.25rem 1.25rem;box-shadow:0 1.5rem 4rem rgb(15 23 42 / .18);backdrop-filter:blur(12px)}.search-heading{display:flex;align-items:center;justify-content:space-between;gap:1.25rem;margin-bottom:1rem}.search-heading>div{display:flex;min-width:0;flex-direction:column}.search-kicker{color:#a16207;font-size:.68rem;font-weight:850;letter-spacing:.1em;text-transform:uppercase}.search-heading strong{margin-top:.2rem;color:#172033;font-size:1rem}.search-fields{display:grid;grid-template-columns:minmax(15rem,1.45fr) minmax(19rem,1.45fr) minmax(12rem,.85fr) minmax(9.5rem,.55fr);gap:.65rem;padding:.7rem;background:linear-gradient(135deg,#f8fafc,#f1f5f9);border:1px solid #e2e8f0;border-radius:1rem}.search-field{height:4.25rem;min-width:0;overflow:visible;background:#fff;border:1px solid #dbe4ef;border-radius:.75rem;box-shadow:0 .25rem .75rem rgb(15 23 42 / .04)}.search-field:focus-within{border-color:#1769e0;box-shadow:0 0 0 3px rgb(23 105 224 / .12)}.search-submit{display:flex;min-height:4.25rem;align-items:center;justify-content:center;gap:.55rem;padding:0 1rem;color:#fff;background:linear-gradient(135deg,#0f766e,#1769e0);border:0;border-radius:.75rem;box-shadow:0 .65rem 1.25rem rgb(23 105 224 / .22);font:inherit;font-size:.92rem;font-weight:850;cursor:pointer;transition:transform 180ms ease,box-shadow 180ms ease,filter 180ms ease}.search-submit:hover{box-shadow:0 .85rem 1.5rem rgb(23 105 224 / .28);filter:saturate(1.08);transform:translateY(-1px)}.search-submit:focus-visible{outline:3px solid rgb(23 105 224 / .28);outline-offset:3px}.search-error{display:flex;align-items:center;gap:.45rem;margin:.75rem 0 0;padding:0 .25rem;color:#b42318;font-size:.78rem;font-weight:700}
    @media(max-width:67.5rem){.search-fields{grid-template-columns:minmax(0,1.2fr) minmax(0,1fr)}.location-field,.date-field{grid-column:auto}.guest-field{grid-column:1}.search-submit{grid-column:2}.search-heading{align-items:flex-end}}
    @media(max-width:43.75rem){.search-panel{padding:.75rem;border-radius:0 1rem 1rem 1rem}.search-heading{align-items:stretch;flex-direction:column;gap:.75rem;margin-bottom:.75rem}.search-heading>div{padding:0 .2rem}.search-heading strong{font-size:.9rem}.search-fields{grid-template-columns:1fr;gap:.55rem;padding:.55rem}.location-field,.date-field,.guest-field,.search-submit{grid-column:1}.search-field{height:4rem}.search-submit{min-height:3.5rem}.search-error{padding:0 .55rem .15rem}}
    @media(max-width:23rem){.search-panel{padding:.5rem}.search-fields{padding:.4rem}.search-heading strong{font-size:.84rem}}
    @media(prefers-reduced-motion:reduce){.search-submit{transition:none}.search-submit:hover{transform:none}}
  `]
})
export class HeroSearchComponent {
  private readonly stateService = inject(HomeSearchStateService);
  readonly i18n = inject(PublicI18nService);
  searchError = '';

  search(): void {
    this.searchError = '';
    if (!this.stateService.submitSearch()) {
      this.searchError = this.stateService.dateValidationError() || this.i18n.text('PUBLIC.SEARCH.FALLBACK_ERROR');
    }
  }
}
