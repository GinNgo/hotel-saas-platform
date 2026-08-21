import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PublicI18nService } from '../../../../../core/i18n/public-i18n.service';
import { HomeSearchStateService, StayType } from '../../services/home-search-state.service';

@Component({
  selector: 'app-stay-type-selector',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex gap-4 px-2 py-3 bg-white/95 rounded-t-xl w-fit">
      <label class="flex items-center gap-2 cursor-pointer group">
        <div class="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors"
             [class.border-primary]="isOvernight"
             [class.border-gray-300]="!isOvernight">
          <div class="w-2.5 h-2.5 rounded-full bg-primary transition-transform scale-0 group-hover:scale-50"
               [class.scale-100]="isOvernight"
               [class.group-hover:scale-100]="isOvernight"></div>
        </div>
        <span class="text-[14px] font-semibold" [class.text-gray-900]="isOvernight" [class.text-gray-600]="!isOvernight">{{ i18n.text('PUBLIC.STAY_TYPE.OVERNIGHT') }}</span>
        <input type="radio" name="stayType" value="OVERNIGHT" class="hidden" [checked]="isOvernight" (change)="selectType('OVERNIGHT')">
      </label>

      <label class="flex items-center gap-2 cursor-not-allowed group relative opacity-50" [title]="i18n.text('PUBLIC.STAY_TYPE.UNAVAILABLE_TITLE')">
        <div class="w-5 h-5 rounded-full border-2 border-gray-300 flex items-center justify-center">
        </div>
        <span class="text-[14px] font-semibold text-gray-600">{{ i18n.text('PUBLIC.STAY_TYPE.DAY_USE') }}</span>
        <div class="absolute -top-3 -right-6 bg-gray-200 text-gray-600 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase">
          {{ i18n.text('PUBLIC.STAY_TYPE.COMING_SOON') }}
        </div>
        <!-- Disable day-use for now as backend doesn't support hourly booking yet -->
        <input type="radio" name="stayType" value="DAY_USE" class="hidden" disabled>
      </label>
    </div>
  `
})
export class StayTypeSelectorComponent {
  private stateService = inject(HomeSearchStateService);
  readonly i18n = inject(PublicI18nService);

  get isOvernight(): boolean {
    return this.stateService.state().stayType === 'OVERNIGHT';
  }

  selectType(type: StayType) {
    this.stateService.updateStayType(type);
  }
}
