import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { LocaleService } from '../../../../../core/i18n/locale.service';
import { PublicPromotion } from '../../../../../core/services/client-api.service';

@Component({
  selector: 'app-promotions',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe],
  template: `
    <section class="promotion-section" aria-labelledby="promotion-title" [attr.aria-busy]="loading">
      <div class="promotion-heading">
        <div>
          <span class="eyebrow">{{ 'HOME.PROMOTION_KICKER' | translate }}</span>
          <h2 id="promotion-title">{{ 'HOME.PROMOTION_TITLE' | translate }}</h2>
        </div>
        <span *ngIf="promotions.length" class="promotion-source">
          <i class="pi pi-verified" aria-hidden="true"></i>
          {{ 'HOME.PROMOTION_LIVE' | translate }}
        </span>
      </div>

      <div *ngIf="loading" class="promotion-grid promotion-skeletons" role="status" [attr.aria-label]="'HOME.PROMOTION_LOADING' | translate">
        <span *ngFor="let item of [1, 2]" class="promotion-skeleton" aria-hidden="true"></span>
      </div>

      <div *ngIf="!loading && error" class="promotion-feedback promotion-error" role="alert">
        <span class="feedback-icon" aria-hidden="true"><i class="pi pi-wifi"></i></span>
        <div>
          <strong>{{ 'HOME.PROMOTION_ERROR_TITLE' | translate }}</strong>
          <p>{{ 'HOME.PROMOTION_ERROR_BODY' | translate }}</p>
        </div>
        <button type="button" (click)="retry.emit()">{{ 'HOME.PROMOTION_RETRY' | translate }}</button>
      </div>

      <div *ngIf="!loading && !error && !promotions.length" class="promotion-feedback" role="status">
        <span class="feedback-icon" aria-hidden="true"><i class="pi pi-ticket"></i></span>
        <div>
          <strong>{{ 'HOME.PROMOTION_EMPTY_TITLE' | translate }}</strong>
          <p>{{ 'HOME.PROMOTION_EMPTY_BODY' | translate }}</p>
        </div>
      </div>

      <div *ngIf="!loading && !error && promotions.length" class="promotion-grid">
        <article *ngFor="let promo of promotions; trackBy: trackById" class="promotion-item">
          <div class="promotion-icon" aria-hidden="true"><i class="pi pi-ticket"></i></div>
          <div class="promotion-copy">
            <div class="promotion-badges">
              <span class="promotion-badge">{{ discountLabel(promo) }}</span>
              <span *ngIf="promo.memberOnly" class="member-badge">{{ 'HOME.MEMBER_ONLY' | translate }}</span>
            </div>
            <h3>{{ title(promo) }}</h3>
            <p *ngIf="promo.requiredTierCodes.length">{{ 'HOME.MEMBER_TIER_REQUIRED' | translate:{ tier: promo.requiredTierCodes.join(', ') } }}</p>
            <p *ngIf="promo.maxDiscount">{{ 'HOME.PROMOTION_MAX_DISCOUNT' | translate:{ amount: formatVnd(promo.maxDiscount) } }}</p>
            <p>{{ 'HOME.PROMOTION_VALID_UNTIL' | translate:{ date: formatDate(promo.endsAt) } }}</p>
          </div>
          <div class="promotion-actions">
            <code *ngIf="promo.applicationType === 'COUPON'">{{ promo.code }}</code>
            <button *ngIf="promo.applicationType === 'COUPON'" type="button" class="copy-button" (click)="copyCode(promo.code)" [attr.aria-label]="copiedCode === promo.code ? ('HOME.PROMOTION_COPIED' | translate) : ('HOME.PROMOTION_COPY' | translate)">
              <i class="pi" [ngClass]="copiedCode === promo.code ? 'pi-check' : 'pi-copy'" aria-hidden="true"></i>
            </button>
            <a *ngIf="promo.propertyId" [routerLink]="['/hotel', promo.propertyId]" class="promotion-link">{{ 'HOME.PROMOTION_VIEW' | translate }} <i class="pi pi-arrow-up-right" aria-hidden="true"></i></a>
          </div>
        </article>
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .promotion-section { margin: var(--hotel-space-8) 0 var(--hotel-space-12); padding: clamp(1.2rem, 3vw, 2rem); background: linear-gradient(135deg, var(--hotel-primary-light), #fff7ed); border: 1px solid color-mix(in srgb, var(--hotel-primary) 28%, white); border-radius: 1.4rem; }
    .promotion-heading { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin-bottom: 1.2rem; }
    .promotion-heading h2 { margin: .25rem 0 0; color: var(--hotel-heading); font-family: var(--hotel-font-heading); font-size: clamp(1.6rem, 3vw, 2.2rem); }
    .promotion-source { display: inline-flex; align-items: center; gap: .35rem; color: var(--hotel-primary); font-size: .75rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
    .promotion-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
    .promotion-item { display: grid; grid-template-columns: auto 1fr; gap: .8rem; min-width: 0; padding: 1rem; background: var(--hotel-card-bg); border: 1px solid color-mix(in srgb, var(--hotel-primary) 20%, white); border-radius: var(--hotel-radius-lg); box-shadow: var(--hotel-shadow-sm); }
    .promotion-icon { display: grid; width: 2.8rem; height: 2.8rem; place-items: center; color: var(--hotel-gold); background: var(--hotel-gold-light); border-radius: .85rem; font-size: 1.2rem; }
    .promotion-copy { min-width: 0; }
    .promotion-badges { display: flex; flex-wrap: wrap; gap: .4rem; }
    .promotion-badge, .member-badge { display: inline-flex; align-items: center; min-height: 1.5rem; padding: .2rem .5rem; border-radius: 999px; font-size: .65rem; font-weight: 800; }
    .promotion-badge { color: var(--hotel-danger); background: var(--hotel-danger-light); }
    .member-badge { color: var(--hotel-gold-hover); background: var(--hotel-gold-light); }
    .promotion-copy h3 { margin: .45rem 0 .25rem; color: var(--hotel-heading); font-size: 1rem; line-height: 1.35; }
    .promotion-copy p { margin: .2rem 0 0; color: var(--hotel-text-muted); font-size: .75rem; }
    .promotion-actions { grid-column: 2; display: flex; align-items: center; flex-wrap: wrap; gap: .5rem; margin-top: .5rem; }
    .promotion-actions code { padding: .35rem .5rem; color: var(--hotel-text); background: var(--hotel-bg); border: 1px dashed var(--hotel-border-strong); border-radius: .45rem; font-size: .72rem; }
    .copy-button { display: grid; width: 2.75rem; height: 2.75rem; place-items: center; color: var(--hotel-primary); background: var(--hotel-primary-light); border: 1px solid color-mix(in srgb, var(--hotel-primary) 35%, white); border-radius: .55rem; cursor: pointer; transition: background var(--hotel-transition-fast), color var(--hotel-transition-fast); }
    .copy-button:hover { color: white; background: var(--hotel-primary); }
    .copy-button:focus-visible, .promotion-link:focus-visible, .promotion-feedback button:focus-visible { outline: 0; box-shadow: var(--hotel-focus-ring); }
    .promotion-link { min-height: 2.75rem; margin-left: auto; display: inline-flex; align-items: center; gap: .35rem; color: var(--hotel-primary); font-size: .75rem; font-weight: 800; text-decoration: none; }
    .promotion-feedback { min-height: 7.5rem; display: flex; align-items: center; gap: 1rem; padding: 1rem; color: var(--hotel-text); background: var(--hotel-card-bg); border: 1px solid var(--hotel-border); border-radius: var(--hotel-radius-lg); }
    .promotion-feedback div { flex: 1; }
    .promotion-feedback strong { color: var(--hotel-heading); }
    .promotion-feedback p { margin: .25rem 0 0; color: var(--hotel-text-muted); }
    .promotion-feedback button { min-height: 2.75rem; padding: 0 1rem; border: 1px solid var(--hotel-primary); border-radius: var(--hotel-radius-md); color: var(--hotel-primary); background: var(--hotel-card-bg); font: inherit; font-weight: 800; cursor: pointer; }
    .feedback-icon { display: grid; width: 2.75rem; height: 2.75rem; flex: 0 0 auto; place-items: center; color: var(--hotel-primary); background: var(--hotel-primary-light); border-radius: var(--hotel-radius-md); }
    .promotion-error .feedback-icon { color: var(--hotel-danger); background: var(--hotel-danger-light); }
    .promotion-skeleton { min-height: 9rem; border-radius: var(--hotel-radius-lg); background: linear-gradient(100deg, var(--hotel-card-bg) 20%, var(--hotel-surface-muted) 45%, var(--hotel-card-bg) 70%); background-size: 220% 100%; animation: promotion-shimmer 1.4s ease-in-out infinite; }
    @keyframes promotion-shimmer { to { background-position-x: -220%; } }
    @media (max-width: 44rem) { .promotion-grid { grid-template-columns: 1fr; } .promotion-heading { align-items: flex-start; flex-direction: column; } }
    @media (max-width: 32rem) { .promotion-feedback { align-items: flex-start; flex-wrap: wrap; } .promotion-feedback button { width: 100%; } .promotion-actions { grid-column: 1 / -1; } }
    @media (prefers-reduced-motion: reduce) { .copy-button { transition: none; } .promotion-skeleton { animation: none; } }
  `],
})
export class PromotionsComponent {
  @Input() promotions: PublicPromotion[] = [];
  @Input() loading = false;
  @Input() error = false;
  @Output() readonly retry = new EventEmitter<void>();
  readonly localeService = inject(LocaleService);
  copiedCode = '';

  trackById(_index: number, item: PublicPromotion): string | number { return item.id; }

  title(promo: PublicPromotion): string {
    return this.localeService.locale() === 'en' ? (promo.nameEn || promo.nameVi) : promo.nameVi;
  }

  discountLabel(promo: PublicPromotion): string {
    if (promo.discountType === 'PERCENT') return `-${promo.discountValue}%`;
    return `-${this.formatVnd(promo.discountValue)}`;
  }

  formatVnd(value: number): string {
    return `${new Intl.NumberFormat(this.numberLocale(), { maximumFractionDigits: 0 }).format(value)} VND`;
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat(this.numberLocale(), {
      day: '2-digit', month: '2-digit', year: 'numeric',
    }).format(new Date(value));
  }

  copyCode(code: string): void {
    if (!globalThis.navigator?.clipboard) return;
    globalThis.navigator.clipboard.writeText(code).then(() => {
      this.copiedCode = code;
      setTimeout(() => this.copiedCode = '', 2000);
    }).catch(() => undefined);
  }

  private numberLocale(): string {
    return this.localeService.locale() === 'en' ? 'en-US' : 'vi-VN';
  }
}
