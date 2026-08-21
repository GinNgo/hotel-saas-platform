import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';

import { PublicI18nService } from '../../../../core/i18n/public-i18n.service';
import { Hotel } from '../../../../core/services/client-api.service';
import { ImageFallbackService } from '../../../../core/services/image-fallback.service';
import { FavoriteButtonComponent } from '../../../client/favorites/favorite-button.component';

@Component({
  selector: 'app-property-result-card', standalone: true, imports: [CommonModule, FavoriteButtonComponent],
  template: `
    <article class="result-card">
      <button type="button" class="media" (click)="view()" [attr.aria-label]="i18n.text('PUBLIC.RESULTS.VIEW_PROPERTY', { name: property.name })">
        <img [src]="imageUrl" [alt]="property.imageAltText || property.name" loading="lazy" (error)="handleImageError($event)">
        <span class="type-badge">{{ propertyTypeLabel(property.propertyType) }}</span>
        <span *ngIf="property.imageCount && property.imageCount > 1" class="image-count"><i class="pi pi-images"></i> {{ property.imageCount }}</span>
      </button>

      <div class="property-info">
        <div class="title-row">
          <div><p class="property-type">{{ propertyTypeLabel(property.propertyType) }}</p><h2><button type="button" (click)="view()">{{ property.name }}</button></h2></div>
          <div *ngIf="property.starRating" class="star-rating" [attr.aria-label]="i18n.count('PUBLIC.RESULTS.STAR_LABEL', property.starRating)"><span *ngFor="let _ of stars(property.starRating)">★</span></div>
        </div>
        <p class="address"><i class="pi pi-map-marker"></i><span>{{ locationLine }}</span><small *ngIf="property.distanceText">{{ property.distanceText }}</small></p>
        <div *ngIf="property.lowestRoomType" class="room-fact">
          <i class="pi pi-bed"></i><span><strong>{{ property.lowestRoomType.name }}</strong> · {{ i18n.count('PUBLIC.RESULTS.MAX_GUESTS', property.lowestRoomType.maxGuests) }}</span>
        </div>
        <div class="amenities" *ngIf="property.amenities?.length"><span *ngFor="let amenity of property.amenities.slice(0, 4)">{{ amenity }}</span></div>
        <div class="booking-signals">
          <p *ngIf="hasPromotion" class="deal-signal"><i class="pi pi-bolt"></i> {{ i18n.text('PUBLIC.RESULTS.PROMOTION_APPLIED', { amount: formatVnd(property.quote?.totalDiscount || 0) }) }}</p>
          <p *ngIf="property.availableRoomCount" class="availability" [class.urgent]="property.availableRoomCount <= 3"><i [class]="property.availableRoomCount <= 3 ? 'pi pi-clock' : 'pi pi-check-circle'"></i> {{ i18n.count('PUBLIC.RESULTS.AVAILABLE_ROOMS', property.availableRoomCount) }}</p>
        </div>
      </div>

       <div class="commercial">
         <div class="favorite-control"><app-favorite-button [hotelId]="property.id"></app-favorite-button></div>
         <span *ngIf="property.sponsoredPlacement" class="placement-disclosure sponsored-placement" data-sponsored="true" [attr.aria-label]="sponsoredDisclosure()">
           <i class="pi pi-megaphone" aria-hidden="true"></i> {{ sponsoredDisclosure() }}
         </span>
        <div class="review" *ngIf="property.reviewScore; else unrated">
          <span><strong>{{ reviewLabel(property.reviewScore) }}</strong><small>{{ i18n.count('PUBLIC.RESULTS.REVIEW_COUNT', property.reviewCount || 0) }}</small></span>
          <b>{{ property.reviewScore | number:'1.1-1' }}</b>
        </div>
        <ng-template #unrated><p class="unrated">{{ i18n.text('PUBLIC.RESULTS.NO_REVIEWS') }}</p></ng-template>

        <div *ngIf="property.pricing; else unavailable" class="price-block">
           <p class="nightly-price-label">{{ i18n.text('PUBLIC.RESULTS.FROM') }}
             <del *ngIf="hasPromotion" [attr.aria-label]="i18n.text('PUBLIC.RESULTS.ORIGINAL_PRICE')">{{ formatVnd(originalNightlyPrice) }}</del>
             <strong>{{ formatVnd(effectiveNightlyPrice) }}</strong><span>{{ i18n.text('PUBLIC.RESULTS.PER_NIGHT') }}</span>
           </p>
           <small *ngIf="hasPromotion" class="promotion-proof">
             {{ i18n.text('PUBLIC.RESULTS.PROMOTION_APPLIED', { amount: formatVnd(property.quote?.totalDiscount || 0) }) }}
             <span *ngIf="memberTierLabel"> · {{ i18n.text('PUBLIC.RESULTS.MEMBER_PRICE', { tier: memberTierLabel }) }}</span>
           </small>
          <small>{{ i18n.count('PUBLIC.RESULTS.ROOM_COUNT', property.pricing.roomQuantity || 1) }} · {{ i18n.count('PUBLIC.RESULTS.NIGHT_COUNT', property.pricing.numberOfNights) }}</small>
          <div class="total">{{ i18n.text('PUBLIC.RESULTS.TOTAL') }} <b>{{ formatVnd(property.pricing.totalAmount) }}</b></div>
          <small>{{ i18n.text('PUBLIC.RESULTS.TAX_FEES', { amount: formatVnd(taxAndFees) }) }}</small>
          <button type="button" class="view-button" (click)="view()">{{ i18n.text('PUBLIC.RESULTS.VIEW_ROOMS') }} <i class="pi pi-arrow-right"></i></button>
        </div>
        <ng-template #unavailable><div class="price-block"><p class="unavailable">{{ i18n.text('PUBLIC.RESULTS.UNAVAILABLE') }}</p></div></ng-template>
      </div>
    </article>
  `,
  styles: [`
    .result-card{display:grid;grid-template-columns:245px minmax(0,1fr) 220px;background:#fff;border:1px solid #dedbd7;border-radius:14px;overflow:hidden;margin-bottom:16px;box-shadow:0 5px 18px rgba(28,25,23,.055);transition:border-color .2s,box-shadow .2s,transform .2s}.result-card:hover{border-color:#c6b996;box-shadow:0 14px 32px rgba(28,25,23,.1);transform:translateY(-2px)}
    .media{position:relative;border:0;padding:0;background:#eef2f6;cursor:pointer;min-height:224px}.media img{width:100%;height:100%;object-fit:cover;display:block}.type-badge,.image-count{position:absolute;background:rgba(15,23,42,.82);color:#fff;border-radius:4px;font-size:11px;padding:5px 8px}.type-badge{left:10px;top:10px}.image-count{right:10px;bottom:10px}
    .property-info{padding:20px;min-width:0}.title-row{display:flex;justify-content:space-between;gap:12px}.property-type{margin:0 0 4px;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase}.title-row h2{font-size:20px;line-height:1.25;margin:0}.title-row h2 button{border:0;padding:0;background:none;text-align:left;color:#12213a;font:inherit;font-weight:800;cursor:pointer}.title-row h2 button:hover{color:#1769e0}.star-rating{color:#d79a00;font-size:12px;white-space:nowrap}
    .address{display:flex;align-items:flex-start;gap:7px;color:#0f766e;font-size:13px;margin:12px 0}.address small{color:#64748b;border-left:1px solid #cbd5e1;padding-left:8px}.room-fact{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#f7f7f6;border-radius:8px;color:#334155;font-size:13px}.amenities{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}.amenities span{background:#edf7f2;color:#14734b;padding:4px 8px;border-radius:999px;font-size:11px}.booking-signals{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:13px}.availability,.deal-signal{display:inline-flex;align-items:center;gap:5px;margin:0;padding:5px 8px;border-radius:6px;font-size:11px;font-weight:750}.availability{color:#14734b;background:#edf8f2}.availability.urgent{color:#b42318;background:#fff0ed}.deal-signal{color:#8a5800;background:#fff7dc}
    .commercial{border-left:1px solid #edf1f5;padding:18px;display:flex;flex-direction:column;text-align:right}.placement-disclosure{display:inline-flex;align-items:center;justify-content:flex-end;gap:5px;margin-bottom:10px;color:#9a5b05;font-size:11px;font-weight:800}.review{display:flex;justify-content:flex-end;gap:9px;align-items:center}.review span{display:flex;flex-direction:column;font-size:12px}.review small,.unrated{font-size:11px;color:#64748b}.review b{background:#174f9b;color:#fff;padding:8px;border-radius:5px;font-size:14px}.unrated{margin:0}.price-block{margin-top:auto}.price-block p{margin:12px 0 2px;font-size:13px;color:#475569}.nightly-price-label{display:flex;align-items:baseline;justify-content:flex-end;gap:6px;flex-wrap:wrap}.nightly-price-label del{color:#64748b;font-size:13px}.price-block p strong{display:block;color:#12213a;font-size:23px}.price-block p span{font-size:12px}.price-block small{color:#64748b;font-size:11px}.promotion-proof{color:#9a5b05!important;font-weight:700}.total{margin-top:10px;font-size:13px}.total b{font-size:16px}.view-button{width:100%;min-height:44px;margin-top:13px;border:0;border-radius:8px;background:#0f766e;color:#fff;font-weight:800;cursor:pointer;transition:background .18s,box-shadow .18s}.view-button:hover{background:#115e59;box-shadow:0 8px 18px rgb(15 118 110 / .22)}.unavailable{color:#b42318!important;font-weight:700}
    @media(max-width:760px){.result-card{grid-template-columns:1fr}.result-card:hover{transform:none}.media{height:210px;min-height:0}.commercial{border-left:0;border-top:1px solid #edf1f5;text-align:left}.review{justify-content:flex-start}.price-block p strong{display:inline;margin-left:5px}.address{flex-wrap:wrap}}
    .type-badge,.image-count,.amenities span,.availability,.deal-signal,.placement-disclosure,.review small,.unrated,.price-block small{font-size:12px}
    @media(prefers-reduced-motion:reduce){.result-card,.view-button{transition:none}.result-card:hover{transform:none}}
  `]
})
export class PropertyResultCardComponent {
  @Input({ required: true }) property!: Hotel;
  @Output() viewDetails = new EventEmitter<string | number>();
  readonly i18n = inject(PublicI18nService);
  private readonly fallback = inject(ImageFallbackService);

  get imageUrl(): string { return this.property.thumbnailUrl || this.property.mainImageUrl || this.fallback.property(this.property.propertyType); }
  get locationLine(): string {
    const parts = [this.property.addressLine].filter(Boolean) as string[];
    const normalized = (this.property.addressLine || '').toLocaleLowerCase(this.i18n.dateLocale());
    if (this.property.wardName && !normalized.includes(this.property.wardName.toLocaleLowerCase(this.i18n.dateLocale()))) parts.push(this.property.wardName);
    if (this.property.provinceName && !normalized.includes(this.property.provinceName.toLocaleLowerCase(this.i18n.dateLocale()))) parts.push(this.property.provinceName);
    return parts.join(', ');
  }
  get originalNightlyPrice(): number { return this.property.pricing?.nightlyPrice ?? 0; }
  get effectiveNightlyPrice(): number { return this.property.pricing?.discountedNightlyPrice ?? this.property.pricing?.discountedPrice ?? this.originalNightlyPrice; }
  get hasPromotion(): boolean { return !!this.property.quote && (this.property.quote.totalDiscount || 0) > 0 && this.effectiveNightlyPrice < this.originalNightlyPrice; }
  get memberTierLabel(): string {
    if (!this.property.quote?.memberBenefit.eligible) return '';
    const benefit = this.property.quote.memberBenefit;
    return this.i18n.dateLocale() === 'en-US'
      ? (benefit.tierNameEn || benefit.tierNameVi || '')
      : (benefit.tierNameVi || benefit.tierNameEn || '');
  }
  get taxAndFees(): number { return (this.property.pricing?.taxAmount || 0) + (this.property.pricing?.feeAmount || 0); }
  view(): void { this.viewDetails.emit(this.property.id); }
  handleImageError(event: Event): void { this.fallback.replace(event, this.fallback.property(this.property.propertyType)); }
  stars(value: number): number[] { return Array.from({ length: Math.max(0, Math.min(5, value || 0)) }); }
  reviewLabel(score: number): string { return score >= 9 ? this.i18n.text('PUBLIC.RESULTS.REVIEW_EXCEPTIONAL') : score >= 8 ? this.i18n.text('PUBLIC.RESULTS.REVIEW_VERY_GOOD') : score >= 7 ? this.i18n.text('PUBLIC.RESULTS.REVIEW_GOOD') : this.i18n.text('PUBLIC.RESULTS.REVIEW_PLEASANT'); }
  formatVnd(value: number): string { return `${new Intl.NumberFormat(this.i18n.dateLocale(), { maximumFractionDigits: 0 }).format(value || 0)} ${this.i18n.dateLocale() === 'en-US' ? 'VND' : '₫'}`; }
  sponsoredDisclosure(): string { const placement = this.property.sponsoredPlacement; return placement ? (this.i18n.dateLocale() === 'en-US' ? placement.disclosureEn : placement.disclosureVi) : ''; }
  propertyTypeLabel(type?: string): string { const key = ({ HOTEL: 'TYPE_HOTEL', RESORT: 'TYPE_RESORT', VILLA: 'TYPE_VILLA', APARTMENT: 'TYPE_APARTMENT', HOMESTAY: 'TYPE_HOMESTAY', MOTEL: 'TYPE_MOTEL', GUEST_HOUSE: 'TYPE_GUEST_HOUSE', HOSTEL: 'TYPE_HOSTEL' } as Record<string, string>)[type || ''] || 'TYPE_DEFAULT'; return this.i18n.text(`PUBLIC.HOME_CARDS.${key}`); }
}
