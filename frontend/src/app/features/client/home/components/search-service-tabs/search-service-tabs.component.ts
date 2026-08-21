import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PublicI18nService } from '../../../../../core/i18n/public-i18n.service';
import { HomeSearchStateService } from '../../services/home-search-state.service';

interface SearchServiceTab {
  id: string;
  labelKey: string;
  icon: string;
  types: string[];
  disabled: boolean;
}

@Component({
  selector: 'app-search-service-tabs',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-wrap md:flex-nowrap gap-2 bg-white rounded-t-2xl px-4 py-2 border-b border-gray-100 shadow-sm w-fit mx-auto md:mx-0">
      <button *ngFor="let tab of tabs"
              type="button"
              (click)="selectTab(tab)"
              [attr.aria-pressed]="isActive(tab)"
              [class]="'flex min-h-[44px] items-center gap-2 px-4 py-2.5 font-semibold text-[14px] transition-colors rounded-lg relative group whitespace-nowrap border ' +
                       (isActive(tab) ? 'border-primary bg-blue-50 text-primary' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:border-gray-300') + 
                       (tab.disabled ? ' opacity-50 cursor-not-allowed' : ' cursor-pointer')"
              [disabled]="tab.disabled">
        
        <i [class]="tab.icon"></i>
        <span>{{ i18n.text(tab.labelKey) }}</span>

        <div *ngIf="tab.disabled" class="absolute -top-1 right-0 bg-orange-100 text-orange-600 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase">
          {{ i18n.text('PUBLIC.STAY_TYPE.COMING_SOON') }}
        </div>
      </button>
    </div>
  `
})
export class SearchServiceTabsComponent {
  private stateService = inject(HomeSearchStateService);
  readonly i18n = inject(PublicI18nService);
  readonly tabs: SearchServiceTab[] = [
    { id: 'all', labelKey: 'PUBLIC.SEARCH_TABS.ALL', icon: 'pi pi-home', types: [], disabled: false },
    { id: 'hotel', labelKey: 'PUBLIC.SEARCH_TABS.HOTEL', icon: 'pi pi-building', types: ['HOTEL'], disabled: false },
    { id: 'motel', labelKey: 'PUBLIC.SEARCH_TABS.MOTEL', icon: 'pi pi-home', types: ['MOTEL'], disabled: false },
    { id: 'homestay', labelKey: 'PUBLIC.SEARCH_TABS.HOMESTAY', icon: 'pi pi-star', types: ['HOMESTAY'], disabled: false },
    { id: 'apartment', labelKey: 'PUBLIC.SEARCH_TABS.APARTMENT_VILLA', icon: 'pi pi-key', types: ['APARTMENT', 'VILLA'], disabled: false },
    { id: 'flight', labelKey: 'PUBLIC.SEARCH_TABS.FLIGHT', icon: 'pi pi-send', types: [], disabled: true },
    { id: 'transfer', labelKey: 'PUBLIC.SEARCH_TABS.TRANSFER', icon: 'pi pi-car', types: [], disabled: true }
  ];
  readonly selectedTabId = signal(this.resolveTabId(this.stateService.state().propertyTypes));

  isActive(tab: SearchServiceTab): boolean {
    return this.selectedTabId() === tab.id;
  }

  selectTab(tab: SearchServiceTab): void {
    if (tab.disabled) return;
    this.selectedTabId.set(tab.id);
    this.stateService.updatePropertyTypes(tab.types);
  }

  private resolveTabId(propertyTypes: string[]): string {
    return this.tabs.find(tab =>
      tab.types.length === propertyTypes.length && tab.types.every(type => propertyTypes.includes(type))
    )?.id || 'all';
  }
}
