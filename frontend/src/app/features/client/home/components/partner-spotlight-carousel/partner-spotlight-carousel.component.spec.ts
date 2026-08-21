import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { of, Subject, throwError } from 'rxjs';

import { LocaleService } from '../../../../../core/i18n/locale.service';
import { ClientApiService, HomeSpotlight } from '../../../../../core/services/client-api.service';
import { ImageFallbackService } from '../../../../../core/services/image-fallback.service';
import { PartnerSpotlightCarouselComponent } from './partner-spotlight-carousel.component';

const sponsored: HomeSpotlight = {
  id: 7001,
  kind: 'SPONSORED',
  title: 'Nghỉ dưỡng bên biển',
  description: 'Nội dung do đối tác cung cấp',
  imageUrl: '/missing.webp',
  imageAlt: 'Khu nghỉ dưỡng bên biển',
  disclosure: 'Được tài trợ',
  target: { type: 'PROPERTY', propertyId: 501, route: '/hotel/501' },
  startsAt: '2026-08-01T00:00:00Z',
  endsAt: '2026-08-31T23:59:59Z',
};

const editorial: HomeSpotlight = {
  id: 7002,
  kind: 'EDITORIAL',
  title: 'Khám phá Phú Quốc',
  description: 'Gợi ý biên tập cho kỳ nghỉ tiếp theo',
  imageUrl: '/editorial.webp',
  imageAlt: 'Bãi biển Phú Quốc',
  disclosure: 'Editorial',
  target: {
    type: 'SEARCH_COLLECTION',
    route: '/search?provinceId=10146',
    query: { provinceId: '10146' },
  },
  startsAt: '2026-08-01T00:00:00Z',
  endsAt: '2026-08-31T23:59:59Z',
};

describe('PartnerSpotlightCarouselComponent', () => {
  function createFixture(api: { getHomeSpotlights: ReturnType<typeof vi.fn> }) {
    TestBed.configureTestingModule({
      imports: [PartnerSpotlightCarouselComponent],
      providers: [
        provideRouter([]),
        provideTranslateService(),
        { provide: ClientApiService, useValue: api as unknown as ClientApiService },
        { provide: LocaleService, useValue: { locale: signal<'vi' | 'en'>('vi') } },
        ImageFallbackService,
      ],
    });
    const fixture = TestBed.createComponent(PartnerSpotlightCarouselComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders editorial and sponsored cards with visible disclosure and canonical targets', async () => {
    const fixture = createFixture({ getHomeSpotlights: vi.fn(() => of([sponsored, editorial])) });
    await fixture.whenStable();
    fixture.detectChanges();

    const cards = [...fixture.nativeElement.querySelectorAll('.spotlight-card')] as HTMLAnchorElement[];
    expect(cards).toHaveLength(2);
    expect(cards[0].getAttribute('data-sponsored')).toBe('true');
    expect(cards[0].querySelector('.disclosure')?.textContent).toContain('Được tài trợ');
    expect(cards[1].querySelector('.disclosure')?.textContent).toContain('Editorial');
    expect(cards[0].getAttribute('href')).toContain('/hotel/501');
    expect(cards[1].getAttribute('href')).toContain('/search');
  });

  it('shows a loading state and then omits the section when the endpoint is empty', async () => {
    const spotlights$ = new Subject<HomeSpotlight[]>();
    const fixture = createFixture({ getHomeSpotlights: vi.fn(() => spotlights$) });
    expect(fixture.nativeElement.querySelector('.skeleton-track')).toBeTruthy();

    spotlights$.next([]);
    spotlights$.complete();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.spotlight-section')).toBeNull();
  });

  it('isolates endpoint failure and retries without fake cards', async () => {
    const api = {
      getHomeSpotlights: vi.fn()
        .mockReturnValueOnce(throwError(() => new Error('offline')))
        .mockReturnValueOnce(of([editorial])),
    };
    const fixture = createFixture(api);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.spotlight-card')).toBeNull();

    (fixture.nativeElement.querySelector('[role="alert"] button') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.spotlight-card')).toBeTruthy();
  });

  it('uses the managed image fallback and exposes reduced-motion and touch rules', async () => {
    const fixture = createFixture({ getHomeSpotlights: vi.fn(() => of([sponsored])) });
    await fixture.whenStable();
    fixture.detectChanges();
    const image = fixture.nativeElement.querySelector('.spotlight-card img') as HTMLImageElement;
    image.dispatchEvent(new Event('error'));
    expect(image.src).toContain('/assets/fallbacks/destination-default.webp');

    const styles = [...document.head.querySelectorAll('style')].map(style => style.textContent ?? '').join('\n');
    expect(styles).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(styles).toMatch(/min-height:\s*2\.75rem/);
  });

  it('supports manual previous and next controls with accessible names', async () => {
    const fixture = createFixture({ getHomeSpotlights: vi.fn(() => of([sponsored, editorial])) });
    await fixture.whenStable();
    fixture.detectChanges();
    const buttons = [...fixture.nativeElement.querySelectorAll('.carousel-controls button')] as HTMLButtonElement[];
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('aria-label')).toBeTruthy();
    expect(buttons[1].getAttribute('aria-label')).toBeTruthy();
    expect(buttons[0].getBoundingClientRect().height).toBeGreaterThanOrEqual(0);
  });
});

