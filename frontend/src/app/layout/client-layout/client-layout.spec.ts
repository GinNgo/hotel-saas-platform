import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { provideTranslateService } from '@ngx-translate/core';

import { AuthService, AuthState } from '../../core/services/auth';
import { ChatService } from '../../core/services/chat.service';
import { ClientApiService, UserContext } from '../../core/services/client-api.service';
import { ClientLayout } from './client-layout';

describe('ClientLayout', () => {
  let currentUser$: BehaviorSubject<AuthState>;
  const getProfile = vi.fn();

  beforeEach(async () => {
    localStorage.clear();
    getProfile.mockReset();
    currentUser$ = new BehaviorSubject<AuthState>({
      isAuthenticated: false,
      username: '',
      fullName: '',
      avatarUrl: '',
      roles: [],
      permissions: [],
    });

    await TestBed.configureTestingModule({
      imports: [ClientLayout],
      providers: [
        provideHttpClient(),
        provideRouter([]),
        provideTranslateService(),
        {
          provide: AuthService,
          useValue: {
            currentUser$,
            isLoggedIn: vi.fn(() => false),
            getCurrentUserId: vi.fn(() => null),
            getAccessToken: vi.fn(() => null),
            logout: vi.fn(),
            updateCurrentUser: vi.fn(),
          },
        },
        { provide: ClientApiService, useValue: { getProfile } },
        {
          provide: ChatService,
          useValue: {
            connect: vi.fn(),
            disconnect: vi.fn(),
            sendCustomerMessage: vi.fn(() => false),
            getMyHistory: vi.fn(() => of([])),
            message$: new Subject(),
            connectionState$: of('idle'),
            connectionError$: of(''),
            isConnected: vi.fn(() => false),
          },
        },
      ],
    }).compileComponents();
  });

  it('renders an accessible VI/EN control while keeping VND fixed', () => {
    const fixture = TestBed.createComponent(ClientLayout);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    const localeButton = element.querySelector('.locale-button') as HTMLButtonElement;

    expect(localeButton).not.toBeNull();
    expect(localeButton.textContent).toContain('VI');
    expect(localeButton.textContent).toContain('VND');

    localeButton.click();
    fixture.detectChanges();

    expect(localeButton.textContent).toContain('EN');
    expect(localStorage.getItem('luxestay.locale')).toBe('en');
  });

  it('renders grouped footer navigation and support-safe content structure', () => {
    const fixture = TestBed.createComponent(ClientLayout);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('.public-footer')).not.toBeNull();
    expect(element.querySelectorAll('.footer-column')).toHaveLength(3);
    expect(element.querySelector('.footer-column a[href="/support"]')).not.toBeNull();
    expect(element.querySelector('.footer-column a[href="/privacy"]')).not.toBeNull();
    expect(element.querySelector('.footer-column a[href="/terms"]')).not.toBeNull();
    expect(element.querySelector('a[href^="tel:"]')).not.toBeNull();
  });

  it('keeps partner acquisition out of the primary header actions', () => {
    const fixture = TestBed.createComponent(ClientLayout);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('.header-actions .partner-button')).toBeNull();
    expect(element.querySelector('.mobile-nav .mobile-partner-button')).toBeNull();
    expect(element.querySelector('.footer-column button')).not.toBeNull();
  });

  it('keeps rewards and account navigation available when an authenticated menu opens', () => {
    const context: UserContext = {
      id: 42,
      username: 'customer@example.test',
      email: 'customer@example.test',
      fullName: 'Nguyen Van An',
      points: 1250,
      roles: ['CUSTOMER'],
      partnerRegistrationStatus: 'NONE',
      pendingBookingCount: 2,
    };
    getProfile.mockReturnValue(of(context));

    const fixture = TestBed.createComponent(ClientLayout);
    fixture.detectChanges();
    currentUser$.next({
      isAuthenticated: true,
      username: context.username,
      fullName: context.fullName || context.username,
      avatarUrl: '',
      roles: ['CUSTOMER'],
      permissions: [],
    });
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector('.account-trigger') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    const menu = element.querySelector('.account-menu');
    expect(element.querySelector('.public-header')?.classList.contains('account-menu-open')).toBe(true);
    expect(menu).not.toBeNull();
    expect(menu?.querySelector('.account-rewards-value strong')?.textContent).toMatch(/1[,.]250/);
    expect(menu?.querySelectorAll('nav [role="menuitem"]').length).toBeGreaterThanOrEqual(7);
    expect(menu?.querySelector('.menu-close')?.getAttribute('aria-label')).toBeTruthy();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(element.querySelector('.account-menu')).toBeNull();
    expect(element.querySelector('.public-header')?.classList.contains('account-menu-open')).toBe(false);
  });

  it('hides decorative account-menu icons from assistive technology', () => {
    getProfile.mockReturnValue(of({ id: 42, username: 'customer@example.test', roles: ['CUSTOMER'] }));
    const fixture = TestBed.createComponent(ClientLayout);
    fixture.detectChanges();
    currentUser$.next({ isAuthenticated: true, username: 'customer@example.test', fullName: '', avatarUrl: '', roles: ['CUSTOMER'], permissions: [] });
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.account-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();

    const icons = fixture.nativeElement.querySelectorAll('.account-menu nav i');
    expect(icons.length).toBeGreaterThan(0);
    expect([...icons].every((icon: Element) => icon.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('loads the user context once when authenticated state details are refreshed', () => {
    const context: UserContext = {
      id: 42,
      username: 'customer@example.test',
      email: 'customer@example.test',
      fullName: 'Nguyen Van An',
      roles: ['CUSTOMER'],
    };
    getProfile.mockReturnValue(of(context));

    const fixture = TestBed.createComponent(ClientLayout);
    fixture.detectChanges();

    currentUser$.next({
      isAuthenticated: true,
      username: context.username,
      fullName: '',
      avatarUrl: '',
      roles: ['CUSTOMER'],
      permissions: [],
    });
    currentUser$.next({
      isAuthenticated: true,
      username: context.username,
      fullName: context.fullName || '',
      avatarUrl: '',
      roles: ['CUSTOMER'],
      permissions: [],
    });

    expect(getProfile).toHaveBeenCalledTimes(1);
  });
});
