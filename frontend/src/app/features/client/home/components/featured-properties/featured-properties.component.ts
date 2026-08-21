import { CommonModule } from '@angular/common';
import { Component, Input, inject } from '@angular/core';
import { Router } from '@angular/router';

import { PublicI18nService } from '../../../../../core/i18n/public-i18n.service';
import { Hotel } from '../../../../../core/services/client-api.service';
import { ImageFallbackService } from '../../../../../core/services/image-fallback.service';
import { HomeSearchStateService } from '../../services/home-search-state.service';

@Component({
  selector: 'app-featured-properties',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="featured-section">
      <header class="section-intro">
        <div>
          <span class="eyebrow">{{ i18n.text('PUBLIC.HOME_CARDS.PROPERTY_KICKER') }}</span>
          <h2 id="featured-title">{{ i18n.text('PUBLIC.HOME_CARDS.PROPERTY_TITLE') }}</h2>
        </div>
        <button type="button" class="view-all" (click)="viewAll()">
          <span>{{ i18n.text('PUBLIC.HOME_CARDS.VIEW_ALL') }}</span><i class="pi pi-arrow-right" aria-hidden="true"></i>
        </button>
      </header>

      <div *ngIf="loading" class="property-grid" [attr.aria-label]="i18n.text('PUBLIC.HOME_CARDS.PROPERTY_LOADING')" aria-busy="true">
        <div *ngFor="let item of [1,2,3,4]" class="property-skeleton"><span></span><b></b><i></i></div>
      </div>

      <div *ngIf="!loading && properties.length" class="property-grid">
        <button
          *ngFor="let property of properties; trackBy: trackByProperty"
          type="button"
          class="property-card"
          (click)="openProperty(property.id)">
          <span class="property-image">
            <img
              [src]="displayImage(property)"
              [alt]="property.name"
              loading="lazy"
              (error)="handleImageError($event, property.propertyType)">
            <span class="property-type">{{ propertyTypeLabel(property.propertyType) }}</span>
          </span>
          <span class="property-body">
            <span class="property-title-row">
              <strong class="property-name">{{ property.name }}</strong>
              <b *ngIf="property.reviewScore && property.reviewCount">{{ property.reviewScore | number:'1.1-1' }}</b>
            </span>
            <span class="property-location"><i class="pi pi-map-marker" aria-hidden="true"></i>{{ property.wardName || property.provinceName || property.addressLine }}</span>
            <span class="property-meta">
              <span *ngIf="property.reviewCount; else noReview">{{ i18n.text('PUBLIC.HOME_CARDS.REVIEW_COUNT', { count: property.reviewCount }) }}</span>
              <ng-template #noReview><span>{{ i18n.text('PUBLIC.HOME_CARDS.NO_REVIEWS') }}</span></ng-template>
              <span *ngIf="property.availableRoomCount !== undefined">{{ i18n.text('PUBLIC.HOME_CARDS.AVAILABLE_ROOMS', { count: property.availableRoomCount }) }}</span>
            </span>
            <span class="property-price" *ngIf="property.pricing; else unavailablePrice">
              <small>{{ i18n.text('PUBLIC.HOME_CARDS.FROM') }}</small><strong>{{ property.pricing.nightlyPrice | currency:'VND':'symbol':'1.0-0' }}</strong><small>{{ i18n.text('PUBLIC.HOME_CARDS.PER_NIGHT') }}</small>
            </span>
            <ng-template #unavailablePrice><span class="unavailable-price">{{ i18n.text('PUBLIC.HOME_CARDS.SOLD_OUT') }}</span></ng-template>
          </span>
        </button>
      </div>

      <div *ngIf="!loading && !properties.length" class="empty-state" [class.error-state]="error" [attr.role]="error ? 'alert' : 'status'">
        <span class="empty-icon" aria-hidden="true"><i class="pi" [ngClass]="error ? 'pi-wifi' : 'pi-building'"></i></span>
        <div>
          <strong>{{ i18n.text(error ? 'PUBLIC.HOME_CARDS.PROPERTY_ERROR_TITLE' : 'PUBLIC.HOME_CARDS.PROPERTY_EMPTY_TITLE') }}</strong>
          <p>{{ i18n.text(error ? 'PUBLIC.HOME_CARDS.PROPERTY_ERROR_BODY' : 'PUBLIC.HOME_CARDS.PROPERTY_EMPTY_BODY') }}</p>
        </div>
        <button type="button" (click)="viewAll()">{{ i18n.text('PUBLIC.HOME_CARDS.OPEN_SEARCH') }}</button>
      </div>
    </div>
  `,
  styles: [`
    .featured-section{padding-top:2.4rem}.section-intro{display:flex;align-items:end;justify-content:space-between;gap:1.25rem;margin-bottom:1.25rem}.eyebrow{display:block;color:#9a5b05;font-size:.75rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.section-intro h2{margin:.3rem 0 0;color:#122039;font-size:clamp(1.8rem,3vw,2.35rem);line-height:1}.view-all{display:inline-flex;min-height:2.75rem;align-items:center;gap:.5rem;padding:0 1rem;color:#0f766e;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:999px;font:inherit;font-size:.82rem;font-weight:800;cursor:pointer;transition:background-color 180ms ease,transform 180ms ease}.view-all:hover{background:#d1fae5;transform:translateX(2px)}.property-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1rem}.property-card{min-width:0;padding:0;overflow:hidden;color:#172033;background:#fff;border:1px solid #dbe4ef;border-radius:1rem;box-shadow:0 .45rem 1.35rem rgb(15 23 42 / .06);font:inherit;text-align:left;cursor:pointer;transition:box-shadow 180ms ease,border-color 180ms ease,transform 180ms ease}.property-card:hover,.property-card:focus-visible{border-color:#72a3a0;box-shadow:0 1rem 2.25rem rgb(15 23 42 / .13);transform:translateY(-3px)}.property-image{position:relative;display:block;aspect-ratio:4/3;overflow:hidden;background:#eef2f6}.property-image::after{position:absolute;inset:auto 0 0;height:42%;content:'';background:linear-gradient(transparent,rgb(15 23 42 / .28))}.property-image img{width:100%;height:100%;object-fit:cover;transition:transform 420ms ease}.property-card:hover img{transform:scale(1.045)}.property-type{position:absolute;top:.7rem;left:.7rem;z-index:1;padding:.32rem .55rem;color:#fff;background:rgb(15 23 42 / .82);border:1px solid rgb(255 255 255 / .18);border-radius:999px;font-size:.66rem;font-weight:750}.property-body{display:flex;min-height:11.5rem;flex-direction:column;padding:1rem}.property-title-row{display:flex;align-items:flex-start;gap:.6rem}.property-name{min-width:0;flex:1;overflow:hidden;color:#172033;font-family:var(--hotel-font-heading);font-size:1.18rem;line-height:1.15;text-overflow:ellipsis;white-space:nowrap}.property-title-row>b{padding:.3rem .4rem;color:#fff;background:#0f766e;border-radius:.35rem .35rem .35rem 0;font-size:.7rem}.property-location{display:flex;min-width:0;align-items:center;gap:.35rem;margin-top:.55rem;overflow:hidden;color:#64748b;font-size:.74rem;text-overflow:ellipsis;white-space:nowrap}.property-location i{color:#a16207}.property-meta{display:flex;flex-wrap:wrap;gap:.3rem .75rem;min-height:1.1rem;margin-top:.55rem;color:#64748b;font-size:.68rem}.property-price{display:flex;align-items:baseline;justify-content:flex-end;gap:.25rem;margin-top:auto;padding-top:.9rem;border-top:1px solid #edf2f7}.property-price small{color:#64748b;font-size:.68rem}.property-price strong{color:#b42318;font-size:1.08rem}.unavailable-price{margin-top:auto;padding-top:.9rem;color:#b42318;border-top:1px solid #edf2f7;font-size:.75rem;font-weight:750}.property-skeleton{height:20rem;overflow:hidden;background:#fff;border:1px solid #e5e7eb;border-radius:1rem}.property-skeleton span{display:block;height:58%}.property-skeleton b,.property-skeleton i{display:block;height:.75rem;margin:1rem;border-radius:999px}.property-skeleton i{width:55%;margin-top:-.25rem}.property-skeleton span,.property-skeleton b,.property-skeleton i{background:linear-gradient(90deg,#e9eef4 25%,#f8fafc 50%,#e9eef4 75%);background-size:200% 100%;animation:shimmer 1.2s infinite}.empty-state{display:flex;min-height:9rem;align-items:center;gap:1rem;padding:1.25rem 1.4rem;color:#475569;background:linear-gradient(135deg,#fff,#f4f8f9);border:1px dashed #9fb7b6;border-radius:1rem}.empty-state.error-state{background:linear-gradient(135deg,#fff,#fff7ed);border-color:#fdba74}.empty-state.error-state .empty-icon{color:#b45309;background:#fef3c7}.empty-icon{display:grid;width:3rem;height:3rem;flex:0 0 auto;place-items:center;color:#0f766e;background:#ccfbf1;border-radius:50%;font-size:1.2rem}.empty-state div{min-width:0;flex:1}.empty-state strong{color:#172033}.empty-state p{margin:.15rem 0 0;font-size:.82rem}.empty-state button{min-height:2.75rem;padding:0 1rem;color:#fff;background:#0f766e;border:0;border-radius:999px;font:inherit;font-size:.82rem;font-weight:750;cursor:pointer}@keyframes shimmer{to{background-position:-200% 0}}@media(max-width:64rem){.property-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:48rem){.featured-section{padding-top:2rem}.property-grid{display:flex;overflow-x:auto;padding:.2rem 0 .65rem;scroll-snap-type:x mandatory}.property-card,.property-skeleton{min-width:min(78vw,20rem);scroll-snap-align:start}.empty-state{align-items:flex-start;flex-wrap:wrap}.empty-state button{width:100%}}@media(max-width:36rem){.section-intro{align-items:flex-start}.section-intro h2{font-size:1.9rem}.view-all{min-width:2.75rem;padding:0 .75rem}.view-all span{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}}@media(prefers-reduced-motion:reduce){.view-all,.property-card,.property-image img{transition:none}.view-all:hover,.property-card:hover,.property-card:focus-visible,.property-card:hover img{transform:none}.property-skeleton span,.property-skeleton b,.property-skeleton i{animation:none}}
  `]
})
export class FeaturedPropertiesComponent {
  @Input() properties: Hotel[] = [];
  @Input() loading = false;
  @Input() error = false;

  private readonly router = inject(Router);
  private readonly stateService = inject(HomeSearchStateService);
  private readonly imageFallback = inject(ImageFallbackService);
  readonly i18n = inject(PublicI18nService);

  openProperty(id: string | number): void {
    this.router.navigate(['/hotel', id], { queryParams: this.stateService.bookingQueryParams() });
  }

  viewAll(): void {
    // "Xem tất cả" must not inherit the previous location or stay-type tab.
    this.stateService.clearLocation();
    this.stateService.updatePropertyTypes([]);
    this.stateService.submitSearch();
  }

  propertyTypeLabel(type?: string): string {
    const labels: Record<string, string> = {
      HOTEL: 'PUBLIC.HOME_CARDS.TYPE_HOTEL',
      MOTEL: 'PUBLIC.HOME_CARDS.TYPE_MOTEL',
      HOMESTAY: 'PUBLIC.HOME_CARDS.TYPE_HOMESTAY',
      HOSTEL: 'PUBLIC.HOME_CARDS.TYPE_HOSTEL',
      APARTMENT: 'PUBLIC.HOME_CARDS.TYPE_APARTMENT',
      VILLA: 'PUBLIC.HOME_CARDS.TYPE_VILLA',
      RESORT: 'PUBLIC.HOME_CARDS.TYPE_RESORT',
      GUEST_HOUSE: 'PUBLIC.HOME_CARDS.TYPE_GUEST_HOUSE'
    };
    return this.i18n.text(type ? labels[type] || 'PUBLIC.HOME_CARDS.TYPE_DEFAULT' : 'PUBLIC.HOME_CARDS.TYPE_DEFAULT');
  }

  fallbackImage(type?: string): string {
    return this.imageFallback.property(type);
  }

  displayImage(property: Hotel): string {
    return property.thumbnailUrl || property.mainImageUrl || property.mainImage || this.fallbackImage(property.propertyType);
  }

  handleImageError(event: Event, type?: string): void {
    this.imageFallback.replace(event, this.fallbackImage(type));
  }

  trackByProperty(_index: number, property: Hotel): string | number {
    return property.id;
  }
}
