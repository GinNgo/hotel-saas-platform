import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';

import { LocaleService } from '../../../../../core/i18n/locale.service';
import {
  ClientApiService,
  HomeRecommendationDestination,
  HomeRecommendationItem,
  HomeRecommendationResponse,
} from '../../../../../core/services/client-api.service';
import { ImageFallbackService } from '../../../../../core/services/image-fallback.service';
import { HomeSearchStateService } from '../../services/home-search-state.service';
import { DestinationRecommendationsComponent } from './destination-recommendations.component';

const destinationOne: HomeRecommendationDestination = {
  id: 101,
  name: 'Đà Nẵng',
  displayName: 'Thành phố Đà Nẵng',
  propertyCount: 12,
  selectedByDefault: true,
};

const destinationTwo: HomeRecommendationDestination = {
  id: 202,
  name: 'Hồ Chí Minh',
  displayName: 'Thành phố Hồ Chí Minh',
  propertyCount: 8,
  selectedByDefault: false,
};

const property: HomeRecommendationItem = {
  propertyId: 501,
  name: 'LuxeStay Riverside',
  propertyType: 'HOTEL',
  provinceId: 101,
  provinceName: 'Đà Nẵng',
  wardName: 'Hải Châu',
  imageUrl: '/missing.webp',
  imageAlt: 'LuxeStay Riverside',
  starRating: 4,
  reviewScore: 8.8,
  reviewCount: 30,
  availableRoomCount: 2,
  pricing: { nightlyPrice: 500000, currency: 'VND' },
  recommendationReason: 'TOP_RATED',
  sponsored: false,
};

function response(destination: HomeRecommendationDestination, item = property): HomeRecommendationResponse {
  return { destination, items: [item], totalAvailable: 1 };
}

describe('DestinationRecommendationsComponent', () => {
  function createFixture(api: {
    getHomeRecommendationDestinations: ReturnType<typeof vi.fn>;
    getHomeRecommendations: ReturnType<typeof vi.fn>;
  }) {
    const state = signal({
      keyword: '', locationDisplayName: '', selectedSuggestionType: null,
      provinceId: null, wardId: null, propertyId: null, propertyTypes: [],
      landmarkId: null, radiusKm: null, stayType: 'OVERNIGHT' as const,
      checkInDate: new Date('2026-08-05T00:00:00'),
      checkOutDate: new Date('2026-08-06T00:00:00'),
      adultCount: 2, childCount: 0, roomCount: 1, latitude: null, longitude: null,
    });
    const apiValue = api as unknown as ClientApiService;
    TestBed.configureTestingModule({
      imports: [DestinationRecommendationsComponent],
      providers: [
        provideRouter([]),
        { provide: ClientApiService, useValue: apiValue },
        { provide: HomeSearchStateService, useValue: {
          state,
          bookingQueryParams: vi.fn(() => ({
            checkInDate: '2026-08-05', checkOutDate: '2026-08-06',
            adultCount: 2, childCount: 0, roomCount: 1,
          })),
        } },
        { provide: LocaleService, useValue: { locale: signal<'vi' | 'en'>('vi') } },
        ImageFallbackService,
      ],
    });
    const fixture = TestBed.createComponent(DestinationRecommendationsComponent);
    fixture.detectChanges();
    return { fixture, state };
  }

  it('renders real destination tabs, accessible selection, and organic cards without discount markup', async () => {
    const api = {
      getHomeRecommendationDestinations: vi.fn(() => of([destinationOne, destinationTwo])),
      getHomeRecommendations: vi.fn(() => of(response(destinationOne))),
    };
    const { fixture } = createFixture(api);
    await fixture.whenStable();
    fixture.detectChanges();

    const tabs = [...fixture.nativeElement.querySelectorAll('[role="tab"]')] as HTMLButtonElement[];
    expect(tabs).toHaveLength(2);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
    expect(fixture.nativeElement.querySelector('.property-card')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('del')).toBeNull();
    expect(fixture.nativeElement.querySelector('.sponsored-label')).toBeNull();
    expect(api.getHomeRecommendations).toHaveBeenCalledWith(expect.objectContaining({ provinceId: 101 }));
  });

  it('renders only canonical quote pricing and the locale-aware member tier', async () => {
    const discountedProperty: HomeRecommendationItem = {
      ...property,
      pricing: {
        nightlyPrice: 500000,
        finalNightlyPrice: 450000,
        totalDiscount: 50000,
        currency: 'VND',
      },
      quote: {
        quoteId: 'quote-501',
        expiresAt: '2026-08-05T00:15:00Z',
        propertyId: 501,
        roomTypeId: 901,
        nightlyPrice: 500000,
        numberOfNights: 1,
        roomQuantity: 1,
        baseSubtotal: 500000,
        taxAmount: 60000,
        feeAmount: 15000,
        taxesAndFees: 75000,
        appliedPromotions: [{
          campaignId: 71,
          code: 'MEMBER10',
          applicationType: 'AUTOMATIC',
          nameVi: 'Gi\u00e1 th\u00e0nh vi\u00ean',
          nameEn: 'Member price',
          discountAmount: 50000,
        }],
        memberBenefit: {
          eligible: true,
          tierCode: 'GOLD',
          tierNameVi: 'V\u00e0ng',
          tierNameEn: 'Gold',
        },
        totalDiscount: 50000,
        finalTotal: 525000,
        currency: 'VND',
      },
    };
    const api = {
      getHomeRecommendationDestinations: vi.fn(() => of([destinationOne])),
      getHomeRecommendations: vi.fn(() => of(response(destinationOne, discountedProperty))),
    };
    const { fixture } = createFixture(api);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.price-line del')).toBeTruthy();
    const proof = fixture.nativeElement.querySelector('.promotion-proof') as HTMLElement;
    expect(proof).toBeTruthy();
    expect(proof.textContent).toContain('50.000');
    expect(proof.textContent).toContain('V\u00e0ng');
  });

  it('keeps the last selected destination when tabs are switched rapidly', async () => {
    const api = {
      getHomeRecommendationDestinations: vi.fn(() => of([destinationOne, destinationTwo])),
      getHomeRecommendations: vi.fn((query: { provinceId: number }) => of(
        response(query.provinceId === 202 ? destinationTwo : destinationOne),
      )),
    };
    const { fixture } = createFixture(api);
    await fixture.whenStable();
    const component = fixture.componentInstance;

    component.selectDestination(202);
    component.selectDestination(101);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.selectedProvinceId()).toBe(101);
    expect(api.getHomeRecommendations).toHaveBeenLastCalledWith(expect.objectContaining({ provinceId: 101 }));
  });

  it('shows a recoverable destination error and retries without fake content', async () => {
    const api = {
      getHomeRecommendationDestinations: vi.fn()
        .mockReturnValueOnce(throwError(() => new Error('offline')))
        .mockReturnValueOnce(of([destinationOne])),
      getHomeRecommendations: vi.fn(() => of(response(destinationOne))),
    };
    const { fixture } = createFixture(api);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.property-card')).toBeNull();

    fixture.nativeElement.querySelector('[role="alert"] button').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="tab"]')).toBeTruthy();
  });

  it('uses the property fallback when the managed image fails', async () => {
    const api = {
      getHomeRecommendationDestinations: vi.fn(() => of([destinationOne])),
      getHomeRecommendations: vi.fn(() => of(response(destinationOne))),
    };
    const { fixture } = createFixture(api);
    await fixture.whenStable();
    fixture.detectChanges();

    const image = fixture.nativeElement.querySelector('.property-card img') as HTMLImageElement;
    image.dispatchEvent(new Event('error'));

    expect(image.src).toContain('/assets/fallbacks/hotel-default.webp');
  });

  it('announces loading and then renders a meaningful empty destination state', async () => {
    const destinations$ = new Subject<HomeRecommendationDestination[]>();
    const api = {
      getHomeRecommendationDestinations: vi.fn(() => destinations$),
      getHomeRecommendations: vi.fn(() => of(response(destinationOne))),
    };
    const { fixture } = createFixture(api);

    expect(fixture.nativeElement.querySelector('.tab-skeletons')?.getAttribute('aria-busy')).toBe('true');
    destinations$.next([]);
    destinations$.complete();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.feedback-state[role="status"]')).toBeTruthy();
    expect(api.getHomeRecommendations).not.toHaveBeenCalled();
  });

  it('ships reduced-motion coverage and touch targets of at least 44 pixels', async () => {
    const api = {
      getHomeRecommendationDestinations: vi.fn(() => of([destinationOne])),
      getHomeRecommendations: vi.fn(() => of(response(destinationOne))),
    };
    const { fixture } = createFixture(api);
    await fixture.whenStable();
    fixture.detectChanges();

    const componentStyles = [...document.head.querySelectorAll('style')]
      .map(style => style.textContent ?? '')
      .join('\n');
    expect(componentStyles).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(componentStyles).toMatch(/min-height:\s*2\.75rem/);
    expect(componentStyles).toMatch(/min-height:\s*3rem/);
  });
});
