import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { AuthService, AuthState } from '../../core/services/auth';
import { ManagementApiService, ManagementContext } from '../../core/services/management-api.service';
import { PermissionService } from '../../core/services/permission.service';
import { ManagementLayout } from './management-layout';

describe('ManagementLayout', () => {
  it('renders the property selector after context loads', async () => {
    const context$ = new Subject<ManagementContext>();
    const user$ = new BehaviorSubject<AuthState>({
      isAuthenticated: true,
      username: 'manager1',
      fullName: 'Manager One',
      avatarUrl: '',
      roles: ['HOTEL_MANAGER'],
      permissions: [],
    });

    await TestBed.configureTestingModule({
      imports: [ManagementLayout],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser$: user$, logout: () => undefined } },
        { provide: ManagementApiService, useValue: { context: () => context$ } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ManagementLayout);
    fixture.detectChanges();

    context$.next({
      properties: [{ id: 1, code: 'HOTEL-1', name: 'Grand Palace Hotel', propertyType: 'HOTEL', address: 'Hà Nội', approvalStatus: 'APPROVED', operationStatus: 'ACTIVE', isDemo: false }],
      activePropertyId: 1,
      planCode: 'STANDARD',
      subscriptionStatus: 'ACTIVE',
      lifetime: false,
      limits: {},
      usage: {},
      upgradeRequired: false,
    });
    await fixture.whenStable();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).not.toContain('Đang tải...');
    expect(element.querySelector('#active-property')).not.toBeNull();
    expect(element.textContent).toContain('Grand Palace Hotel');
  });

  it('removes the closed mobile sidebar from keyboard navigation', async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn(() => ({
      matches: true,
      media: '(max-width: 991px)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    })) as typeof window.matchMedia;
    await TestBed.configureTestingModule({
      imports: [ManagementLayout],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            currentUser$: new BehaviorSubject<AuthState>({
              isAuthenticated: true,
              username: 'owner',
              fullName: 'Owner',
              avatarUrl: '',
              roles: ['PROPERTY_OWNER'],
              permissions: [],
            }),
            logout: () => undefined,
          },
        },
        { provide: ManagementApiService, useValue: { context: () => new Subject<ManagementContext>() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ManagementLayout);
    fixture.detectChanges();

    const sidebar = fixture.nativeElement.querySelector('#management-navigation') as HTMLElement;
    expect(sidebar.getAttribute('aria-hidden')).toBe('true');
    expect(sidebar.inert).toBe(true);

    fixture.componentInstance.toggleSidebar();
    fixture.detectChanges();
    expect(fixture.componentInstance.sidebarExpanded).toBe(true);
    window.matchMedia = originalMatchMedia;
  });

  it('shows the payment configuration menu only with its dedicated view permission', async () => {
    let allowed = false;
    const context$ = new Subject<ManagementContext>();
    await TestBed.configureTestingModule({
      imports: [ManagementLayout],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            currentUser$: new BehaviorSubject<AuthState>({
              isAuthenticated: true,
              username: 'owner',
              fullName: 'Owner',
              avatarUrl: '',
              roles: ['PROPERTY_OWNER'],
              permissions: [],
            }),
            logout: () => undefined,
          },
        },
        { provide: ManagementApiService, useValue: { context: () => context$ } },
        {
          provide: PermissionService,
          useValue: {
            hasPermission: vi.fn(() => allowed),
            isSuperAdmin: vi.fn(() => false),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ManagementLayout);
    fixture.detectChanges();
    const hasPaymentLink = () => Array.from(fixture.nativeElement.querySelectorAll('a') as NodeListOf<HTMLAnchorElement>)
      .some((link) => link.textContent?.includes('Cấu hình thanh toán'));
    expect(hasPaymentLink()).toBe(false);
    const deniedHeadings = Array.from(fixture.nativeElement.querySelectorAll('.nav-group h2') as NodeListOf<HTMLElement>)
      .map((heading) => heading.textContent?.trim());
    expect(deniedHeadings).not.toContain('Báo cáo');
    expect(deniedHeadings).not.toContain('Dọn phòng');

    allowed = true;
    fixture.destroy();
    const allowedFixture = TestBed.createComponent(ManagementLayout);
    allowedFixture.detectChanges();
    context$.next({
      properties: [{ id: 1, code: 'HOTEL-1', nameVi: 'LuxeStay Hà Nội', propertyType: 'HOTEL', address: 'Hà Nội', approvalStatus: 'APPROVED', operationStatus: 'ACTIVE', operational: true, isDemo: false }],
      activePropertyId: 1,
      activePropertyOperational: true,
      planCode: 'STANDARD',
      subscriptionStatus: 'ACTIVE',
      lifetime: false,
      limits: {},
      usage: {},
      upgradeRequired: false,
    });
    await allowedFixture.whenStable();
    allowedFixture.detectChanges();
    const allowedLinks = Array.from(allowedFixture.nativeElement.querySelectorAll('a') as NodeListOf<HTMLAnchorElement>);
    expect(allowedLinks.some((link) => link.textContent?.includes('Cấu hình thanh toán'))).toBe(true);
  });

  it('keeps setup and billing visible but hides operational links for a pending property', async () => {
    const context$ = new Subject<ManagementContext>();
    await TestBed.configureTestingModule({
      imports: [ManagementLayout],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            currentUser$: new BehaviorSubject<AuthState>({
              isAuthenticated: true,
              username: 'owner',
              fullName: 'Owner',
              avatarUrl: '',
              roles: ['PROPERTY_OWNER'],
              permissions: [],
            }),
            logout: () => undefined,
          },
        },
        { provide: ManagementApiService, useValue: { context: () => context$ } },
        {
          provide: PermissionService,
          useValue: {
            hasPermission: vi.fn(() => true),
            isSuperAdmin: vi.fn(() => false),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ManagementLayout);
    fixture.detectChanges();
    context$.next({
      properties: [{
        id: 7,
        code: 'PENDING-7',
        nameVi: 'Khách sạn đang chờ duyệt',
        propertyType: 'HOTEL',
        address: 'Đà Nẵng',
        approvalStatus: 'PENDING_APPROVAL',
        operationStatus: 'INACTIVE',
        operational: false,
        isDemo: false,
      }],
      activePropertyId: 7,
      activePropertyOperational: false,
      planCode: 'NO_PLAN',
      subscriptionStatus: 'NONE',
      lifetime: false,
      limits: {},
      usage: { properties: 1 },
      upgradeRequired: true,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent || '';
    expect(text).toContain('Cơ sở lưu trú');
    expect(text).toContain('Gói phần mềm');
    expect(text).toContain('Chưa thể vận hành');
    expect(text).not.toContain('Loại phòng');
    expect(text).not.toContain('Danh sách phòng');
    expect(text).not.toContain('Cấu hình thanh toán');
    expect(text).not.toContain('Doanh thu cơ sở');
  });

  it('keeps the housekeeping screen accessible to admin without an operational property', async () => {
    await TestBed.configureTestingModule({
      imports: [ManagementLayout],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            currentUser$: new BehaviorSubject<AuthState>({
              isAuthenticated: true,
              username: 'admin',
              fullName: 'Administrator',
              avatarUrl: '',
              roles: ['ADMIN'],
              permissions: [],
            }),
            logout: () => undefined,
          },
        },
        { provide: ManagementApiService, useValue: { context: () => new Subject<ManagementContext>() } },
        {
          provide: PermissionService,
          useValue: {
            hasPermission: vi.fn(() => true),
            isSuperAdmin: vi.fn(() => true),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ManagementLayout);
    fixture.detectChanges();

    const housekeepingLink = Array.from(
      fixture.nativeElement.querySelectorAll('a') as NodeListOf<HTMLAnchorElement>,
    ).find((link) => link.textContent?.includes('Hàng đợi dọn phòng'));

    expect(housekeepingLink).toBeDefined();
    expect(housekeepingLink?.getAttribute('href')).toContain('/management/housekeeping');
  });
});
