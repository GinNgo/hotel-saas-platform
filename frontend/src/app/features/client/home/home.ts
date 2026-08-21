import { AfterViewInit, ChangeDetectorRef, Component, OnInit, OnDestroy, inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ClientApiService } from '../../../core/services/client-api.service';
import { LayoutStateService } from '../../../core/services/layout-state.service';
import { HeroSearchComponent } from './components/hero-search/hero-search.component';
import { StickySearchBarComponent } from './components/sticky-search-bar/sticky-search-bar.component';
import { PopularDestinationsComponent } from './components/popular-destinations/popular-destinations.component';
import { FeaturedPropertiesComponent } from './components/featured-properties/featured-properties.component';
import { HomeSearchStateService } from './services/home-search-state.service';
import { canonicalRoles } from '../../../core/auth/portal-access.resolver';
import { AuthService } from '../../../core/services/auth';
import { Hotel, LocationSuggestion, PublicPromotion, PromotionQuote, UserContext } from '../../../core/services/client-api.service';
import { TranslatePipe } from '@ngx-translate/core';
import { EditorialSlideshowComponent } from './components/editorial-slideshow/editorial-slideshow.component';
import { DestinationRecommendationsComponent } from './components/destination-recommendations/destination-recommendations.component';
import { PartnerSpotlightCarouselComponent } from './components/partner-spotlight-carousel/partner-spotlight-carousel.component';
import { PromotionsComponent } from './components/promotions/promotions.component';
import { LocaleService } from '../../../core/i18n/locale.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    HeroSearchComponent,
    StickySearchBarComponent,
    PopularDestinationsComponent,
    FeaturedPropertiesComponent,
    EditorialSlideshowComponent,
    PartnerSpotlightCarouselComponent,
    DestinationRecommendationsComponent,
    PromotionsComponent,
    TranslatePipe,
    RouterModule
  ],
  templateUrl: './home.html',
  styleUrls: ['./home.css']
})
export class HomeComponent implements OnInit, OnDestroy, AfterViewInit {
  private router = inject(Router);
  private clientApi = inject(ClientApiService);
  private layoutState = inject(LayoutStateService);
  private searchState = inject(HomeSearchStateService);
  private authService = inject(AuthService);
  private changeDetector = inject(ChangeDetectorRef);
  private localeService = inject(LocaleService);
  private revealObserver?: IntersectionObserver;
  
  destinations: LocationSuggestion[] = [];
  featuredProperties: Hotel[] = [];
  memberProfile: UserContext | null = null;
  isAuthenticated = false;
  memberLoading = false;
  memberError = false;
  memberTier: PromotionQuote['memberBenefit'] | null = null;
  promotions: PublicPromotion[] = [];
  promotionsLoading = true;
  promotionsError = false;
  isLoadingDestinations = true;
  isLoadingFeatured = true;
  destinationsError = false;
  featuredError = false;

  @ViewChild('heroSearchRef', { static: true }) heroSearchRef!: ElementRef;

  showStickySearch = false;
  private observer!: IntersectionObserver;
  private readonly destroy$ = new Subject<void>();

  ngOnInit() {
    this.loadPopularDestinations();
    this.loadFeaturedProperties();
    this.loadPromotions();
    this.authService.currentUser$.pipe(takeUntil(this.destroy$)).subscribe((state) => {
      const becameAuthenticated = state.isAuthenticated && !this.isAuthenticated;
      this.isAuthenticated = state.isAuthenticated;
      if (becameAuthenticated) this.loadMemberProfile();
      if (!this.isAuthenticated) {
        this.memberProfile = null;
        this.memberTier = null;
        this.memberLoading = false;
        this.memberError = false;
      }
    });

    // IntersectionObserver to show sticky search when hero search is out of view
    this.observer = new IntersectionObserver(
      ([entry]) => {
        const shouldShow = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        if (this.showStickySearch !== shouldShow) {
          this.showStickySearch = shouldShow;
          this.layoutState.hideMainHeader.set(shouldShow);
        }
      },
      { threshold: 0, rootMargin: '-80px 0px 0px 0px' }
    );
    if (this.heroSearchRef) {
      this.observer.observe(this.heroSearchRef.nativeElement);
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.observer) {
      this.observer.disconnect();
    }
    this.revealObserver?.disconnect();
    this.layoutState.hideMainHeader.set(false);
  }

  ngAfterViewInit(): void {
    if (!('IntersectionObserver' in globalThis)) return;
    this.revealObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        this.revealObserver?.unobserve(entry.target);
      }
    }, { threshold: 0.12 });
    globalThis.document.querySelectorAll<HTMLElement>('.reveal-on-scroll').forEach(element => {
      this.revealObserver?.observe(element);
    });
  }

  get memberPoints(): number {
    return Math.max(0, this.memberProfile?.points ?? 0);
  }

  get memberTierLabel(): string {
    if (!this.memberTier?.eligible) return '';
    return this.localeService.locale() === 'en'
      ? (this.memberTier.tierNameEn || this.memberTier.tierNameVi || '')
      : (this.memberTier.tierNameVi || this.memberTier.tierNameEn || '');
  }

  get promotionSummaryKey(): string {
    if (this.promotionsLoading) return 'HOME.PROMOTION_LOADING';
    if (this.promotionsError) return 'HOME.PROMOTION_ERROR';
    return this.promotions.length ? 'HOME.PROMOTION_ACTIVE_COUNT' : 'HOME.PROMOTION_EMPTY';
  }

  openLogin(): void {
    this.router.navigate(['/login'], { queryParams: { returnUrl: '/' } });
  }

  private loadMemberProfile(): void {
    this.memberLoading = true;
    this.memberError = false;
    this.clientApi.getProfile().pipe(takeUntil(this.destroy$)).subscribe({
      next: (profile) => {
        this.memberProfile = profile;
        this.memberLoading = false;
        this.changeDetector.detectChanges();
        this.clientApi.getMyMembership().pipe(takeUntil(this.destroy$)).subscribe({
          next: membership => {
            this.memberTier = membership;
            this.memberError = false;
            this.changeDetector.detectChanges();
          },
          error: () => {
            this.memberTier = null;
            this.memberError = true;
            this.changeDetector.detectChanges();
          },
        });
      },
      error: () => {
        this.memberProfile = null;
        this.memberLoading = false;
        this.memberError = true;
        this.changeDetector.detectChanges();
      }
    });
  }

  loadPromotions(): void {
    this.promotionsLoading = true;
    this.promotionsError = false;
    this.clientApi.getPublicPromotions(6).pipe(takeUntil(this.destroy$)).subscribe({
      next: promotions => {
        this.promotions = promotions;
        this.promotionsLoading = false;
        this.changeDetector.detectChanges();
      },
      error: () => {
        this.promotions = [];
        this.promotionsLoading = false;
        this.promotionsError = true;
        this.changeDetector.detectChanges();
      },
    });
  }

  private loadPopularDestinations() {
    this.isLoadingDestinations = true;
    this.destinationsError = false;
    this.clientApi.getPopularDestinations(8).pipe(takeUntil(this.destroy$)).subscribe({
      next: (provinces) => {
        this.destinations = provinces;
        this.isLoadingDestinations = false;
        this.destinationsError = false;
        this.changeDetector.detectChanges();
      },
      error: () => {
        this.destinations = [];
        this.isLoadingDestinations = false;
        this.destinationsError = true;
        this.changeDetector.detectChanges();
      }
    });
  }

  private loadFeaturedProperties() {
    this.isLoadingFeatured = true;
    this.featuredError = false;
    this.clientApi.searchHotels({
      ...this.searchState.bookingQueryParams(),
      // The public API uses one-based pages.
      pageNumber: 1,
      pageSize: 8,
      sortBy: 'RATING'
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: response => {
        this.featuredProperties = response.content;
        this.isLoadingFeatured = false;
        this.featuredError = false;
        this.changeDetector.detectChanges();
      },
      error: () => {
        this.featuredProperties = [];
        this.isLoadingFeatured = false;
        this.featuredError = true;
        this.changeDetector.detectChanges();
      }
    });
  }

  openOwnerPortal(): void {
    const auth = this.authService.getAuthState();
    if (!auth.isAuthenticated) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: '/partner/register' } });
    } else {
      this.clientApi.getProfile().pipe(takeUntil(this.destroy$)).subscribe({
        next: context => {
          const roles = canonicalRoles((context.roles || []).map(role => typeof role === 'string' ? role : role.code));
          if (roles.includes('PROPERTY_OWNER') || context.assignedProperties?.length) this.router.navigate(['/management/dashboard']);
          else if (context.partnerRegistrationStatus === 'PENDING') this.router.navigate(['/partner/registration-status']);
          else this.router.navigate(['/partner/register']);
        },
        error: () => this.router.navigate(['/partner/register'])
      });
    }
  }
}
