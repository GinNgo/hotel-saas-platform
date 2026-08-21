import { CommonModule } from '@angular/common';
import { Component, ViewChild, inject } from '@angular/core';
import { Popover, PopoverModule } from 'primeng/popover';

import { PublicI18nService } from '../../../../../core/i18n/public-i18n.service';
import { HomeSearchStateService } from '../../services/home-search-state.service';

@Component({
  selector: 'app-guest-room-selector',
  standalone: true,
  imports: [CommonModule, PopoverModule],
  template: `
    <button
      type="button"
      class="guest-trigger"
      (click)="guestOp.toggle($event)"
      [attr.aria-expanded]="popoverOpen"
      aria-haspopup="dialog"
      [attr.aria-label]="guestSummaryAria">
      <i class="pi pi-users" aria-hidden="true"></i>
      <span>
        <strong>{{ i18n.count('PUBLIC.GUESTS.GUEST_COUNT', adults + children) }}</strong>
        <small>{{ i18n.count('PUBLIC.GUESTS.ROOM_COUNT', rooms) }}<span class="desktop-detail"> · {{ i18n.count('PUBLIC.GUESTS.ADULT_COUNT', adults) }}<span *ngIf="children">, {{ i18n.count('PUBLIC.GUESTS.CHILD_COUNT', children) }}</span></span></small>
      </span>
      <i class="pi pi-chevron-down chevron" aria-hidden="true"></i>
    </button>

    <p-popover
      #guestOp
      styleClass="guest-selector-popover"
      [baseZIndex]="140"
      (onShow)="popoverOpen = true"
      (onHide)="popoverOpen = false">
      <ng-template pTemplate="content">
        <section class="guest-panel" [attr.aria-label]="i18n.text('PUBLIC.GUESTS.PANEL_ARIA')">
          <header>
            <span><strong>{{ i18n.text('PUBLIC.GUESTS.TITLE') }}</strong><small>{{ i18n.text('PUBLIC.GUESTS.HELP') }}</small></span>
            <button type="button" class="panel-close" (click)="closePopover()" [attr.aria-label]="i18n.text('PUBLIC.GUESTS.CLOSE')">
              <i class="pi pi-times" aria-hidden="true"></i>
            </button>
          </header>
          <div class="counter-row">
            <span><strong>{{ i18n.text('PUBLIC.GUESTS.ROOMS') }}</strong><small>{{ i18n.text('PUBLIC.GUESTS.ROOMS_HELP') }}</small></span>
            <div class="counter">
              <button type="button" [disabled]="rooms <= 1" (click)="updateCount('rooms', -1, $event)" [attr.aria-label]="i18n.text('PUBLIC.GUESTS.DECREASE_ROOMS')"><i class="pi pi-minus" aria-hidden="true"></i></button>
              <b>{{ rooms }}</b>
              <button type="button" (click)="updateCount('rooms', 1, $event)" [attr.aria-label]="i18n.text('PUBLIC.GUESTS.INCREASE_ROOMS')"><i class="pi pi-plus" aria-hidden="true"></i></button>
            </div>
          </div>
          <div class="counter-row">
            <span><strong>{{ i18n.text('PUBLIC.GUESTS.ADULTS') }}</strong><small>{{ i18n.text('PUBLIC.GUESTS.ADULTS_HELP') }}</small></span>
            <div class="counter">
              <button type="button" [disabled]="adults <= 1" (click)="updateCount('adults', -1, $event)" [attr.aria-label]="i18n.text('PUBLIC.GUESTS.DECREASE_ADULTS')"><i class="pi pi-minus" aria-hidden="true"></i></button>
              <b>{{ adults }}</b>
              <button type="button" (click)="updateCount('adults', 1, $event)" [attr.aria-label]="i18n.text('PUBLIC.GUESTS.INCREASE_ADULTS')"><i class="pi pi-plus" aria-hidden="true"></i></button>
            </div>
          </div>
          <div class="counter-row">
            <span><strong>{{ i18n.text('PUBLIC.GUESTS.CHILDREN') }}</strong><small>{{ i18n.text('PUBLIC.GUESTS.CHILDREN_HELP') }}</small></span>
            <div class="counter">
              <button type="button" [disabled]="children <= 0" (click)="updateCount('children', -1, $event)" [attr.aria-label]="i18n.text('PUBLIC.GUESTS.DECREASE_CHILDREN')"><i class="pi pi-minus" aria-hidden="true"></i></button>
              <b>{{ children }}</b>
              <button type="button" (click)="updateCount('children', 1, $event)" [attr.aria-label]="i18n.text('PUBLIC.GUESTS.INCREASE_CHILDREN')"><i class="pi pi-plus" aria-hidden="true"></i></button>
            </div>
          </div>
        </section>
      </ng-template>
    </p-popover>
  `,
  styles: [`
    :host{position:relative;display:block;width:100%;height:100%;min-width:0}.guest-trigger{display:grid;width:100%;height:100%;min-height:44px;grid-template-columns:1.25rem minmax(0,1fr) 1rem;align-items:center;gap:.6rem;overflow:hidden;padding:.5rem .75rem;color:#172033;background:transparent;border:0;font:inherit;text-align:left;cursor:pointer}.guest-trigger:hover{background:#f8fafc}.guest-trigger:focus-visible{outline:3px solid rgb(37 99 235 / .22);outline-offset:-3px}.guest-trigger>i:first-child{color:#1769e0;font-size:1.05rem}.guest-trigger span{display:flex;min-width:0;overflow:hidden;flex-direction:column}.guest-trigger strong,.guest-trigger small{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2}.guest-trigger strong{font-size:.88rem}.guest-trigger small{margin-top:.18rem;color:#64748b;font-size:.7rem}.chevron{color:#94a3b8;font-size:.7rem}
    :host ::ng-deep .guest-selector-popover{width:min(21rem,calc(100vw - 1rem));max-width:calc(100vw - 1rem);max-height:calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 1rem);overflow:hidden;border:1px solid #dbe4ef;border-radius:1rem;box-shadow:0 1.5rem 3.5rem rgb(15 23 42 / .18)}:host ::ng-deep .guest-selector-popover .p-popover-content{max-height:calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 1rem);overflow-y:auto;overscroll-behavior:contain;padding:0 0 max(.25rem,env(safe-area-inset-bottom));-webkit-overflow-scrolling:touch}.guest-panel{min-width:0;background:#fff}.guest-panel>header{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.9rem 1rem;background:#fff;border-bottom:1px solid #e2e8f0}.guest-panel>header span,.counter-row>span{display:flex;min-width:0;flex-direction:column}.guest-panel strong,.counter-row strong{color:#172033;font-size:.88rem}.guest-panel small,.counter-row small{margin-top:.15rem;color:#64748b;font-size:.7rem}.panel-close{display:grid;width:2.75rem;height:2.75rem;flex:0 0 auto;place-items:center;color:#475569;background:#f1f5f9;border:0;border-radius:50%;cursor:pointer;touch-action:manipulation}.counter-row{display:flex;min-height:4.5rem;align-items:center;justify-content:space-between;gap:1rem;padding:.75rem 1rem}.counter-row+.counter-row{border-top:1px solid #edf2f7}.counter{display:grid;grid-template-columns:2.75rem 1.75rem 2.75rem;align-items:center;text-align:center}.counter button{display:grid;width:2.75rem;height:2.75rem;place-items:center;color:#1769e0;background:#fff;border:1px solid #93c5fd;border-radius:50%;cursor:pointer;touch-action:manipulation}.counter button:disabled{color:#94a3b8;background:#f8fafc;border-color:#e2e8f0;cursor:not-allowed}.counter button:focus-visible,.panel-close:focus-visible{outline:3px solid rgb(37 99 235 / .22);outline-offset:2px}.counter b{color:#172033;font-size:.9rem}
    @media(max-width:52rem){.desktop-detail{display:none}.guest-trigger{padding:.45rem .65rem}.guest-trigger strong{font-size:.82rem}}
    @media(max-height:25rem){:host ::ng-deep .guest-selector-popover,:host ::ng-deep .guest-selector-popover .p-popover-content{max-height:calc(100dvh - .5rem)}}
    @supports not (height:100dvh){:host ::ng-deep .guest-selector-popover,:host ::ng-deep .guest-selector-popover .p-popover-content{max-height:calc(100vh - 1rem)}}
  `]
})
export class GuestRoomSelectorComponent {
  @ViewChild('guestOp') private guestPopover?: Popover;

  private readonly stateService = inject(HomeSearchStateService);
  readonly i18n = inject(PublicI18nService);
  popoverOpen = false;

  get adults(): number { return this.stateService.state().adultCount; }
  get children(): number { return this.stateService.state().childCount; }
  get rooms(): number { return this.stateService.state().roomCount; }
  get guestSummaryAria(): string {
    return [
      this.i18n.count('PUBLIC.GUESTS.ADULT_COUNT', this.adults),
      this.i18n.count('PUBLIC.GUESTS.CHILD_COUNT', this.children),
      this.i18n.count('PUBLIC.GUESTS.ROOM_COUNT', this.rooms),
    ].join(', ');
  }

  closePopover(): void {
    this.guestPopover?.hide();
  }

  updateCount(type: 'adults' | 'children' | 'rooms', delta: number, event: Event): void {
    event.stopPropagation();
    let adults = this.adults;
    let children = this.children;
    let rooms = this.rooms;

    if (type === 'adults') adults += delta;
    if (type === 'children') children += delta;
    if (type === 'rooms') rooms += delta;

    this.stateService.updateGuests(adults, children, rooms);
  }
}
