import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ImageFallbackService {
  private readonly propertyFallbacks: Record<string, string> = {
    HOTEL: '/assets/fallbacks/hotel-default.webp',
    MOTEL: '/assets/fallbacks/motel-default.webp',
    HOMESTAY: '/assets/fallbacks/homestay-default.webp',
    HOSTEL: '/assets/fallbacks/hostel-default.webp',
    APARTMENT: '/assets/fallbacks/apartment-default.webp',
    VILLA: '/assets/fallbacks/villa-default.webp',
    RESORT: '/assets/fallbacks/resort-default.webp',
    GUEST_HOUSE: '/assets/fallbacks/guest-house-default.webp'
  };

  property(type?: string): string {
    return this.propertyFallbacks[type || 'HOTEL'] || this.propertyFallbacks['HOTEL'];
  }

  destination(): string { return '/assets/fallbacks/destination-default.webp'; }

  room(code?: string): string {
    const normalized = (code || '').toUpperCase();
    if (normalized.includes('SINGLE')) return '/assets/fallbacks/single-room-default.webp';
    if (normalized.includes('TWIN')) return '/assets/fallbacks/twin-room-default.webp';
    if (normalized.includes('FAMILY')) return '/assets/fallbacks/family-room-default.webp';
    if (normalized.includes('SUITE')) return '/assets/fallbacks/suite-default.webp';
    return '/assets/fallbacks/double-room-default.webp';
  }

  replace(event: Event, fallback: string): void {
    const image = event.target as HTMLImageElement;
    if (!image.src.endsWith(fallback)) image.src = fallback;
  }
}
