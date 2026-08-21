import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, map, of, Subject, switchMap, tap } from 'rxjs';

import { LocaleService, SupportedLocale } from '../../../../../core/i18n/locale.service';
import { PublicI18nService } from '../../../../../core/i18n/public-i18n.service';
import { ClientApiService, HomeSpotlight } from '../../../../../core/services/client-api.service';
import { ImageFallbackService } from '../../../../../core/services/image-fallback.service';

@Component({
  selector: 'app-partner-spotlight-carousel',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './partner-spotlight-carousel.component.html',
  styleUrl: './partner-spotlight-carousel.component.css',
})
export class PartnerSpotlightCarouselComponent {
  private readonly api = inject(ClientApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly imageFallback = inject(ImageFallbackService);
  private readonly localeService = inject(LocaleService);
  private readonly requests = new Subject<SupportedLocale>();
  private readonly track = viewChild<ElementRef<HTMLElement>>('track');

  readonly i18n = inject(PublicI18nService);
  readonly spotlights = signal<readonly HomeSpotlight[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);

  constructor() {
    this.requests.pipe(
      tap(() => {
        this.loading.set(true);
        this.failed.set(false);
      }),
      switchMap(locale => this.api.getHomeSpotlights(6, locale).pipe(
        map(items => ({ items, failed: false as const })),
        catchError(() => of({ items: [] as HomeSpotlight[], failed: true as const })),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(result => {
      this.spotlights.set(result.items);
      this.failed.set(result.failed);
      this.loading.set(false);
    });

    effect(() => {
      const locale = this.localeService.locale();
      untracked(() => this.requests.next(locale));
    });
  }

  retry(): void {
    this.requests.next(this.localeService.locale());
  }

  scroll(direction: -1 | 1): void {
    const element = this.track()?.nativeElement;
    if (!element) return;
    const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    element.scrollBy({
      left: direction * Math.max(element.clientWidth * 0.82, 280),
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }

  routerLink(spotlight: HomeSpotlight): string {
    return spotlight.target.type === 'PROPERTY' ? spotlight.target.route : '/search';
  }

  queryParams(spotlight: HomeSpotlight): Readonly<Record<string, string>> | null {
    return spotlight.target.type === 'SEARCH_COLLECTION' ? spotlight.target.query ?? {} : null;
  }

  disclosure(spotlight: HomeSpotlight): string {
    if (spotlight.disclosure?.trim()) return spotlight.disclosure;
    return this.i18n.text(spotlight.kind === 'SPONSORED'
      ? 'PUBLIC.HOME_SPOTLIGHTS.SPONSORED_LABEL'
      : 'PUBLIC.HOME_SPOTLIGHTS.EDITORIAL_LABEL');
  }

  actionLabel(spotlight: HomeSpotlight): string {
    return this.i18n.text(spotlight.target.type === 'PROPERTY'
      ? 'PUBLIC.HOME_SPOTLIGHTS.OPEN_PROPERTY'
      : 'PUBLIC.HOME_SPOTLIGHTS.OPEN_COLLECTION');
  }

  handleImageError(event: Event): void {
    this.imageFallback.replace(event, this.imageFallback.destination());
  }
}

