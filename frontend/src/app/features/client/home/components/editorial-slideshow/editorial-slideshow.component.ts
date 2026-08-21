import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, input, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

export interface EditorialSlide {
  imageUrl: string;
  eyebrowKey: string;
  titleKey: string;
  descriptionKey: string;
  altKey: string;
  ctaKey: string;
  queryParams: Record<string, string>;
}

const DEFAULT_SLIDES: readonly EditorialSlide[] = [
  {
    imageUrl: 'assets/destinations/destination-01.webp',
    eyebrowKey: 'HOME.SLIDES.CULTURE.EYEBROW',
    titleKey: 'HOME.SLIDES.CULTURE.TITLE',
    descriptionKey: 'HOME.SLIDES.CULTURE.DESCRIPTION',
    altKey: 'HOME.SLIDES.CULTURE.ALT',
    ctaKey: 'HOME.SLIDES.CTA',
    queryParams: { displayLocation: 'Hà Nội' }
  },
  {
    imageUrl: 'assets/destinations/destination-04.webp',
    eyebrowKey: 'HOME.SLIDES.COAST.EYEBROW',
    titleKey: 'HOME.SLIDES.COAST.TITLE',
    descriptionKey: 'HOME.SLIDES.COAST.DESCRIPTION',
    altKey: 'HOME.SLIDES.COAST.ALT',
    ctaKey: 'HOME.SLIDES.CTA',
    queryParams: { displayLocation: 'Đà Nẵng' }
  },
  {
    imageUrl: 'assets/destinations/destination-06.webp',
    eyebrowKey: 'HOME.SLIDES.ISLAND.EYEBROW',
    titleKey: 'HOME.SLIDES.ISLAND.TITLE',
    descriptionKey: 'HOME.SLIDES.ISLAND.DESCRIPTION',
    altKey: 'HOME.SLIDES.ISLAND.ALT',
    ctaKey: 'HOME.SLIDES.CTA',
    queryParams: { displayLocation: 'Phú Quốc' }
  }
];

@Component({
  selector: 'app-editorial-slideshow',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe],
  templateUrl: './editorial-slideshow.component.html',
  styleUrl: './editorial-slideshow.component.css'
})
export class EditorialSlideshowComponent implements OnDestroy {
  readonly slides = input<readonly EditorialSlide[]>(DEFAULT_SLIDES);
  readonly activeIndex = signal(0);
  readonly manuallyPaused = signal(false);
  readonly imageFailed = signal(false);
  readonly reducedMotion = signal(false);

  readonly activeSlide = computed(() => this.slides()[this.activeIndex()] ?? DEFAULT_SLIDES[0]);
  readonly isPaused = computed(() => this.manuallyPaused() || this.reducedMotion());

  private hovered = false;
  private focused = false;
  private documentHidden = false;
  private readonly timerId: ReturnType<typeof setInterval>;
  private readonly mediaQuery = typeof globalThis.matchMedia === 'function'
    ? globalThis.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

  constructor() {
    this.reducedMotion.set(this.mediaQuery?.matches ?? false);
    this.mediaQuery?.addEventListener('change', this.onMotionPreferenceChange);
    globalThis.document?.addEventListener('visibilitychange', this.onVisibilityChange);
    this.timerId = setInterval(() => {
      if (!this.shouldPauseAutoplay()) this.showNext();
    }, 6500);
  }

  showPrevious(): void {
    const count = this.slides().length;
    if (count < 2) return;
    this.setActiveIndex((this.activeIndex() - 1 + count) % count);
  }

  showNext(): void {
    const count = this.slides().length;
    if (count < 2) return;
    this.setActiveIndex((this.activeIndex() + 1) % count);
  }

  showSlide(index: number): void {
    if (index >= 0 && index < this.slides().length) this.setActiveIndex(index);
  }

  togglePause(): void {
    this.manuallyPaused.update(paused => !paused);
  }

  setHovered(hovered: boolean): void {
    this.hovered = hovered;
  }

  setFocused(focused: boolean): void {
    this.focused = focused;
  }

  handleImageError(): void {
    this.imageFailed.set(true);
  }

  ngOnDestroy(): void {
    clearInterval(this.timerId);
    this.mediaQuery?.removeEventListener('change', this.onMotionPreferenceChange);
    globalThis.document?.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private setActiveIndex(index: number): void {
    this.imageFailed.set(false);
    this.activeIndex.set(index);
  }

  private shouldPauseAutoplay(): boolean {
    return this.isPaused() || this.hovered || this.focused || this.documentHidden;
  }

  private readonly onVisibilityChange = (): void => {
    this.documentHidden = globalThis.document?.visibilityState === 'hidden';
  };

  private readonly onMotionPreferenceChange = (event: MediaQueryListEvent): void => {
    this.reducedMotion.set(event.matches);
  };
}
