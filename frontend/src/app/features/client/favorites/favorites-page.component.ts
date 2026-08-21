import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { FavoriteButtonComponent } from './favorite-button.component';
import { FavoriteProperty, FavoriteService } from '../../../core/services/favorite.service';
import { ImageFallbackService } from '../../../core/services/image-fallback.service';
import { PublicI18nService } from '../../../core/i18n/public-i18n.service';

@Component({
  selector: 'app-favorites-page',
  standalone: true,
  imports: [CommonModule, RouterModule, FavoriteButtonComponent],
  template: `
    <main class="favorites-page">
      <div class="favorites-shell">
        <header class="favorites-heading">
          <div>
            <p class="eyebrow">{{ i18n.text('PUBLIC.FAVORITES.EYEBROW') }}</p>
            <h1>{{ i18n.text('PUBLIC.FAVORITES.TITLE') }}</h1>
            <p>{{ i18n.text('PUBLIC.FAVORITES.DESCRIPTION') }}</p>
          </div>
          <a routerLink="/search" class="browse-link">{{ i18n.text('PUBLIC.FAVORITES.BROWSE') }} <i class="pi pi-arrow-right" aria-hidden="true"></i></a>
        </header>

        <div *ngIf="favoriteService.loading()" class="state-panel" aria-busy="true" role="status">
          <i class="pi pi-spin pi-spinner" aria-hidden="true"></i><h2>{{ i18n.text('PUBLIC.FAVORITES.LOADING_TITLE') }}</h2><p>{{ i18n.text('PUBLIC.FAVORITES.LOADING_BODY') }}</p>
        </div>

        <div *ngIf="!favoriteService.loading() && favoriteService.error()" class="state-panel error-state" role="alert">
          <i class="pi pi-exclamation-circle" aria-hidden="true"></i><h2>{{ i18n.text('PUBLIC.FAVORITES.ERROR_TITLE') }}</h2><p>{{ favoriteService.error() }}</p>
          <button type="button" (click)="retry()">{{ i18n.text('PUBLIC.FAVORITES.RETRY') }}</button>
        </div>

        <div *ngIf="!favoriteService.loading() && !favoriteService.error() && !favoriteService.favorites().length" class="state-panel" data-empty-state>
          <i class="pi pi-heart" aria-hidden="true"></i><h2>{{ i18n.text('PUBLIC.FAVORITES.EMPTY_TITLE') }}</h2><p>{{ i18n.text('PUBLIC.FAVORITES.EMPTY_BODY') }}</p>
          <a routerLink="/search" class="primary-link">{{ i18n.text('PUBLIC.FAVORITES.FIND_STAY') }}</a>
        </div>

        <section *ngIf="!favoriteService.loading() && !favoriteService.error() && favoriteService.favorites().length" class="favorites-grid" aria-live="polite">
          <article *ngFor="let favorite of favoriteService.favorites(); trackBy: trackFavorite" class="favorite-card">
            <button type="button" class="favorite-media" (click)="open(favorite.hotelId)" [attr.aria-label]="i18n.text('PUBLIC.FAVORITES.VIEW_PROPERTY', { name: favorite.name })">
              <img [src]="favorite.imageUrl || fallback.property(favorite.propertyType)" [alt]="favorite.name" loading="lazy" (error)="handleImageError($event, favorite)">
            </button>
            <div class="favorite-copy">
              <div class="favorite-title"><h2>{{ favorite.name }}</h2><app-favorite-button [hotelId]="favorite.hotelId" [showLabel]="true"></app-favorite-button></div>
              <p class="address"><i class="pi pi-map-marker" aria-hidden="true"></i>{{ favorite.addressLine }}<span *ngIf="favorite.city">, {{ favorite.city }}</span></p>
              <p *ngIf="favorite.averageRating" class="rating"><i class="pi pi-star-fill" aria-hidden="true"></i>{{ favorite.averageRating | number:'1.1-1' }} <small>({{ i18n.text('PUBLIC.FAVORITES.REVIEWS', { count: favorite.reviewCount || 0 }) }})</small></p>
              <p *ngIf="favorite.minPrice" class="price">{{ i18n.text('PUBLIC.FAVORITES.FROM') }} <strong>{{ formatVnd(favorite.minPrice) }}</strong> {{ i18n.text('PUBLIC.FAVORITES.PER_NIGHT') }}</p>
              <button type="button" class="open-link" (click)="open(favorite.hotelId)">{{ i18n.text('PUBLIC.FAVORITES.VIEW_DETAILS') }} <i class="pi pi-arrow-right" aria-hidden="true"></i></button>
            </div>
          </article>
        </section>
      </div>
    </main>
  `,
  styles: [`
    .favorites-page{min-height:100vh;background:#f5f7fa;color:#172033;padding:28px 20px 68px}.favorites-shell{max-width:1120px;margin:auto}.favorites-heading{display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:24px}.eyebrow{margin:0 0 5px;color:#1769e0;font-size:11px;font-weight:800;text-transform:uppercase}.favorites-heading h1{margin:0;color:#12213a;font-size:32px}.favorites-heading p:last-child{margin:8px 0 0;color:#64748b}.browse-link,.primary-link,.open-link{color:#1769e0;font-weight:800;text-decoration:none}.browse-link{white-space:nowrap}.state-panel{min-height:350px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px;background:#fff;border:1px solid #e2e8f0;border-radius:12px}.state-panel>i{font-size:36px;color:#1769e0}.state-panel h2{margin:15px 0 6px}.state-panel p{max-width:480px;color:#64748b;margin:0 0 20px}.state-panel button,.primary-link{border:0;border-radius:7px;background:#1769e0;color:#fff;padding:11px 18px}.error-state>i{color:#c2413a}.favorites-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.favorite-card{display:grid;grid-template-columns:190px minmax(0,1fr);min-height:190px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden}.favorite-media{padding:0;border:0;background:#eef2f6;cursor:pointer}.favorite-media img{width:100%;height:100%;min-height:190px;object-fit:cover;display:block}.favorite-copy{padding:18px}.favorite-title{display:flex;align-items:start;justify-content:space-between;gap:8px}.favorite-title h2{margin:0;color:#12213a;font-size:18px;line-height:1.25}.favorite-title .favorite-button{flex:none}.address{display:flex;gap:6px;color:#64748b;font-size:12px;line-height:1.4}.rating{color:#a16207;font-size:13px}.rating small{color:#64748b}.price{color:#64748b;font-size:12px}.price strong{color:#12213a;font-size:17px}.open-link{border:0;background:transparent;padding:0;font:inherit;cursor:pointer}.open-link i,.browse-link i{margin-left:4px}@media(max-width:820px){.favorites-grid{grid-template-columns:1fr}}@media(max-width:600px){.favorites-page{padding:20px 14px 48px}.favorites-heading{align-items:start;flex-direction:column}.favorites-heading h1{font-size:27px}.favorite-card{grid-template-columns:1fr}.favorite-media{height:190px}.favorite-copy{padding:15px}}
  `],
})
export class FavoritesPageComponent implements OnInit {
  readonly favoriteService = inject(FavoriteService);
  readonly fallback = inject(ImageFallbackService);
  readonly i18n = inject(PublicI18nService);
  private readonly router = inject(Router);

  ngOnInit(): void { this.favoriteService.ensureLoaded().subscribe({ error: () => undefined }); }
  retry(): void { this.favoriteService.ensureLoaded(true).subscribe({ error: () => undefined }); }
  trackFavorite(_: number, favorite: FavoriteProperty): number { return favorite.favoriteId; }
  open(hotelId: string | number): void { this.router.navigate(['/hotel', hotelId]); }
  handleImageError(event: Event, favorite: FavoriteProperty): void { this.fallback.replace(event, this.fallback.property(favorite.propertyType)); }
  formatVnd(value?: number): string { return `${new Intl.NumberFormat(this.i18n.dateLocale(), { maximumFractionDigits: 0 }).format(value || 0)} đ`; }
}
