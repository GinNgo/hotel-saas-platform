import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../core/services/auth';
import { ClientApiService, UserContext } from '../../core/services/client-api.service';
import { LayoutStateService } from '../../core/services/layout-state.service';
import { ChatWidgetComponent } from '../../features/client/chat-widget/chat-widget';
import { TranslatePipe } from '@ngx-translate/core';
import { LocaleService } from '../../core/i18n/locale.service';
import { PublicI18nService } from '../../core/i18n/public-i18n.service';

@Component({
  selector: 'app-client-layout', standalone: true,
  imports: [CommonModule, RouterModule, ChatWidgetComponent, TranslatePipe],
  templateUrl: './client-layout.html',
  styleUrls: ['./client-layout.css', './client-layout.mobile.css']
})
export class ClientLayout implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly api = inject(ClientApiService);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();
  readonly layoutState = inject(LayoutStateService);
  readonly localeService = inject(LocaleService);
  private readonly publicI18n = inject(PublicI18nService);

  isLoggedIn = false;
  isMobileMenuOpen = false;
  accountMenuOpen = false;
  contextLoading = false;
  username = '';
  fullName = '';
  avatarUrl = '';
  userContext: UserContext | null = null;
  showScrollTop = false;

  ngOnInit(): void {
    this.authService.currentUser$.pipe(takeUntil(this.destroy$)).subscribe(state => {
      const becameAuthenticated = state.isAuthenticated && !this.isLoggedIn;
      this.isLoggedIn = state.isAuthenticated;
      this.username = state.username;
      this.fullName = state.fullName || state.username;
      this.avatarUrl = state.avatarUrl || '';
      if (becameAuthenticated) this.loadUserContext();
      else if (!state.isAuthenticated) this.userContext = null;
    });
  }

  get initials(): string {
    return (this.fullName || this.username || 'U').trim().split(/\s+/).slice(-2)
      .map(part => part[0]).join('').toUpperCase();
  }

  get roleCodes(): string[] {
    return (this.userContext?.roles || []).map(role => typeof role === 'string' ? role : role.code);
  }

  get isPropertyOwner(): boolean {
    return this.roleCodes.includes('PROPERTY_OWNER') || Boolean(this.userContext?.assignedProperties?.length);
  }

  get isAdmin(): boolean {
    return this.roleCodes.some(role => ['ADMIN', 'SUPER_ADMIN'].includes(role));
  }

  get partnerLabel(): string {
    if (this.userContext?.status && ['LOCKED', 'BLOCKED', 'INACTIVE'].includes(this.userContext.status)) return this.publicI18n.text('LAYOUT.ACCOUNT_LOCKED');
    if (!this.isLoggedIn) return this.publicI18n.text('LAYOUT.LIST_PROPERTY');
    if (this.isPropertyOwner || this.userContext?.partnerRegistrationStatus === 'APPROVED') return this.publicI18n.text('LAYOUT.MANAGE_PROPERTY');
    if (this.userContext?.partnerRegistrationStatus === 'PENDING') return this.publicI18n.text('LAYOUT.APPLICATION_PENDING');
    return this.publicI18n.text('LAYOUT.LIST_PROPERTY');
  }

  toggleAccountMenu(event: Event): void { event.stopPropagation(); this.accountMenuOpen = !this.accountMenuOpen; }
  closeAccountMenu(): void { this.accountMenuOpen = false; }
  toggleMobileMenu(): void { this.isMobileMenuOpen = !this.isMobileMenuOpen; }
  closeMobileMenu(): void { this.isMobileMenuOpen = false; }
  toggleLocale(): void { this.localeService.toggle(); }
  handleAvatarError(): void { this.avatarUrl = ''; }

  @HostListener('window:scroll')
  onWindowScroll(): void { this.showScrollTop = window.scrollY > 420; }

  scrollToTop(): void { window.scrollTo({ top: 0, behavior: 'smooth' }); }

  navigatePartner(): void {
    this.closeAccountMenu();
    if (this.userContext?.status && ['LOCKED', 'BLOCKED', 'INACTIVE'].includes(this.userContext.status)) return;
    if (!this.isLoggedIn) this.router.navigate(['/login'], { queryParams: { returnUrl: '/partner/register' } });
    else if (this.isPropertyOwner || this.userContext?.partnerRegistrationStatus === 'APPROVED') this.router.navigate(['/management/dashboard']);
    else if (this.userContext?.partnerRegistrationStatus === 'PENDING') this.router.navigate(['/partner/registration-status']);
    else this.router.navigate(['/partner/register']);
  }

  logout(): void {
    this.authService.logout();
    this.accountMenuOpen = false;
    this.isMobileMenuOpen = false;
    this.router.navigate(['/']);
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const area = this.elementRef.nativeElement.querySelector('.account-area');
    if (this.accountMenuOpen && !area?.contains(event.target as Node)) this.accountMenuOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.accountMenuOpen = false; this.isMobileMenuOpen = false; }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  private loadUserContext(): void {
    this.contextLoading = true;
    this.api.getProfile().pipe(takeUntil(this.destroy$)).subscribe({
      next: context => {
        this.userContext = context;
        this.fullName = context.fullName || this.fullName;
        this.avatarUrl = context.avatarUrl || this.avatarUrl;
        this.authService.updateCurrentUser(context);
        this.contextLoading = false;
        this.changeDetector.detectChanges();
      },
      error: () => { this.contextLoading = false; this.changeDetector.detectChanges(); }
    });
  }
}
