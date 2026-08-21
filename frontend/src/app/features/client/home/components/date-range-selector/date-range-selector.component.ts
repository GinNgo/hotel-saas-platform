import { CommonModule } from '@angular/common';
import { Component, HostListener, ViewChild, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePickerModule } from 'primeng/datepicker';
import { Popover, PopoverModule } from 'primeng/popover';

import { PublicI18nService } from '../../../../../core/i18n/public-i18n.service';
import { HomeSearchStateService } from '../../services/home-search-state.service';

@Component({
  selector: 'app-date-range-selector',
  standalone: true,
  imports: [CommonModule, FormsModule, PopoverModule, DatePickerModule],
  template: `
    <div class="date-selector" [class.invalid]="selectionTouched && validationError">
      <button
        type="button"
        class="date-trigger"
        (click)="togglePopover($event)"
        [attr.aria-expanded]="popoverOpen"
        aria-haspopup="dialog"
        [attr.aria-label]="i18n.text('PUBLIC.DATES.CHECK_IN_ARIA', { date: formatAccessibleDate(checkInDate) })">
        <i class="pi pi-calendar" aria-hidden="true"></i>
        <span class="date-copy">
          <strong>{{ formatDisplayDate(checkInDate) }}</strong>
          <small>{{ formatDisplayDayOfWeek(checkInDate) }}</small>
        </span>
      </button>

      <button
        type="button"
        class="date-trigger"
        (click)="togglePopover($event)"
        [attr.aria-expanded]="popoverOpen"
        aria-haspopup="dialog"
        [attr.aria-label]="isOvernight
          ? i18n.text('PUBLIC.DATES.CHECK_OUT_ARIA', { date: formatAccessibleDate(checkOutDate) })
          : i18n.text('PUBLIC.DATES.DAY_USE_ARIA')">
        <i class="pi pi-calendar" [class.muted]="!isOvernight" aria-hidden="true"></i>
        <span class="date-copy" *ngIf="isOvernight; else dayUseCopy">
          <strong>{{ formatDisplayDate(checkOutDate) }}</strong>
          <small>{{ formatDisplayDayOfWeek(checkOutDate) }}</small>
        </span>
        <ng-template #dayUseCopy>
          <span class="date-copy">
            <strong>{{ i18n.text('PUBLIC.DATES.DAY_USE') }}</strong>
            <small>{{ i18n.text('PUBLIC.DATES.NO_CHECK_OUT') }}</small>
          </span>
        </ng-template>
      </button>
    </div>

    <p-popover
      #dateOp
      styleClass="date-range-popover"
      [baseZIndex]="180"
      (onShow)="popoverOpen = true"
      (onHide)="popoverOpen = false">
      <ng-template pTemplate="content">
        <section class="date-panel" [attr.aria-label]="i18n.text('PUBLIC.DATES.PANEL_ARIA')">
          <header>
            <span>
              <strong>{{ i18n.text(isOvernight ? 'PUBLIC.DATES.OVERNIGHT_TITLE' : 'PUBLIC.DATES.DAY_USE_TITLE') }}</strong>
              <small>{{ i18n.text(isOvernight ? 'PUBLIC.DATES.OVERNIGHT_HELP' : 'PUBLIC.DATES.DAY_USE_HELP') }}</small>
            </span>
            <button type="button" class="panel-close" (click)="closePopover()" [attr.aria-label]="i18n.text('PUBLIC.DATES.CLOSE')">
              <i class="pi pi-times" aria-hidden="true"></i>
            </button>
          </header>

          <p-datepicker
            [ngModel]="dateRange()"
            (ngModelChange)="onDateChange($event)"
            [selectionMode]="isOvernight ? 'range' : 'single'"
            [numberOfMonths]="numberOfMonths"
            [inline]="true"
            [minDate]="minDate"
            styleClass="date-calendar"
            dateFormat="dd/mm/yy">
          </p-datepicker>

          <p *ngIf="selectionTouched && validationError" class="date-error" role="alert">
            <i class="pi pi-exclamation-circle" aria-hidden="true"></i>
            {{ validationError }}
          </p>
        </section>
      </ng-template>
    </p-popover>
  `,
  styles: [`
    :host{position:relative;display:block;width:100%;height:100%}.date-selector{display:grid;width:100%;height:100%;grid-template-columns:1fr 1fr}.date-trigger{display:flex;min-width:0;min-height:44px;align-items:center;gap:.65rem;padding:.55rem .8rem;color:#172033;background:transparent;border:0;font:inherit;text-align:left;cursor:pointer}.date-trigger+ .date-trigger{border-left:1px solid #e2e8f0}.date-trigger:hover{background:#f8fafc}.date-trigger:focus-visible{position:relative;z-index:1;outline:3px solid rgb(37 99 235 / .22);outline-offset:-3px}.date-trigger .pi-calendar{flex:0 0 auto;color:#1769e0;font-size:1.05rem}.date-trigger .pi-calendar.muted{color:#94a3b8}.date-copy{display:flex;min-width:0;flex-direction:column}.date-copy strong,.date-copy small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.date-copy strong{font-size:.88rem;line-height:1.25}.date-copy small{margin-top:.2rem;color:#64748b;font-size:.72rem}.date-selector.invalid{box-shadow:inset 0 0 0 1px #dc2626;border-radius:.7rem}
    :host ::ng-deep .date-range-popover{width:min(47rem,calc(100vw - 1.5rem));max-width:calc(100vw - 1.5rem);max-height:calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 1rem);overflow:auto;border:1px solid #dbe4ef;border-radius:1rem;box-shadow:0 1.5rem 4rem rgb(15 23 42 / .2)}:host ::ng-deep .date-range-popover .p-popover-content{padding:0}:host ::ng-deep .date-calendar{width:100%;border:0}:host ::ng-deep .date-calendar .p-datepicker{width:100%;border:0}:host ::ng-deep .date-calendar .p-datepicker-group-container{gap:.75rem}:host ::ng-deep .date-calendar .p-datepicker-day{min-width:2.35rem;min-height:2.35rem}
    .date-panel{background:#fff}.date-panel>header{display:flex;min-height:4rem;align-items:center;justify-content:space-between;gap:1rem;padding:.8rem 1rem;border-bottom:1px solid #e2e8f0}.date-panel>header span{display:flex;min-width:0;flex-direction:column}.date-panel>header strong{color:#172033;font-size:.95rem}.date-panel>header small{margin-top:.15rem;color:#64748b;font-size:.75rem}.panel-close{display:grid;width:2.75rem;height:2.75rem;flex:0 0 auto;place-items:center;color:#475569;background:#f1f5f9;border:0;border-radius:50%;cursor:pointer}.panel-close:focus-visible{outline:3px solid rgb(37 99 235 / .25)}.date-error{display:flex;align-items:center;gap:.45rem;margin:0;padding:.75rem 1rem;color:#991b1b;background:#fef2f2;border-top:1px solid #fecaca;font-size:.78rem;font-weight:650}
    @media(max-width:48rem){.date-trigger{padding:.5rem .65rem}.date-copy strong{font-size:.82rem}:host ::ng-deep .date-range-popover{width:calc(100vw - 1rem);max-width:calc(100vw - 1rem)}:host ::ng-deep .date-calendar .p-datepicker-day{min-width:2.5rem;min-height:2.5rem}}
    @media(max-width:23rem){.date-trigger{gap:.45rem;padding:.45rem}.date-trigger .pi-calendar{font-size:.95rem}.date-copy strong{font-size:.76rem}.date-copy small{font-size:.66rem}}
    @media(prefers-reduced-motion:reduce){.date-trigger,.panel-close{transition:none}}
  `]
})
export class DateRangeSelectorComponent {
  @ViewChild('dateOp') private datePopover?: Popover;

  private readonly stateService = inject(HomeSearchStateService);
  readonly i18n = inject(PublicI18nService);

  minDate = this.startOfToday();
  numberOfMonths = this.resolveMonthCount();
  popoverOpen = false;
  selectionTouched = false;

  readonly dateRange = computed<Date | Date[] | null>(() => {
    if (!this.isOvernight) return this.checkInDate;
    if (this.checkInDate && this.checkOutDate) return [this.checkInDate, this.checkOutDate];
    if (this.checkInDate) return [this.checkInDate];
    return null;
  });

  get checkInDate(): Date | null {
    return this.stateService.state().checkInDate;
  }

  get checkOutDate(): Date | null {
    return this.stateService.state().checkOutDate;
  }

  get isOvernight(): boolean {
    return !this.stateService.isDayUse();
  }

  get validationError(): string {
    return this.stateService.dateValidationError();
  }

  @HostListener('window:resize')
  onViewportResize(): void {
    this.numberOfMonths = this.resolveMonthCount();
  }

  togglePopover(event: Event): void {
    this.datePopover?.toggle(event);
  }

  closePopover(): void {
    this.datePopover?.hide();
  }

  onDateChange(value: Date | Date[] | null): void {
    this.selectionTouched = true;
    if (this.isOvernight) {
      if (!Array.isArray(value)) return;
      const checkIn = value[0] || null;
      const checkOut = value[1] || null;
      this.stateService.updateDates(checkIn, checkOut);
      if (checkIn && checkOut && checkOut > checkIn) this.closePopover();
      return;
    }

    const date = value instanceof Date ? value : null;
    this.stateService.updateDates(date, null);
    if (date) this.closePopover();
  }

  formatDisplayDate(date: Date | null): string {
    if (!date) return this.i18n.text('PUBLIC.DATES.ADD_DATE');
    const options: Intl.DateTimeFormatOptions = this.numberOfMonths === 1
      ? { day: '2-digit', month: '2-digit' }
      : { day: '2-digit', month: '2-digit', year: 'numeric' };
    return new Intl.DateTimeFormat(this.i18n.dateLocale(), options).format(date);
  }

  formatDisplayDayOfWeek(date: Date | null): string {
    if (!date) return this.i18n.text('PUBLIC.DATES.NOT_SELECTED');
    return new Intl.DateTimeFormat(this.i18n.dateLocale(), { weekday: 'long' }).format(date);
  }

  formatAccessibleDate(date: Date | null): string {
    if (!date) return this.i18n.text('PUBLIC.DATES.NOT_SELECTED').toLocaleLowerCase(this.i18n.dateLocale());
    return new Intl.DateTimeFormat(this.i18n.dateLocale(), {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }).format(date);
  }

  private resolveMonthCount(): number {
    return typeof window !== 'undefined' && window.innerWidth < 768 ? 1 : 2;
  }

  private startOfToday(): Date {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }
}
