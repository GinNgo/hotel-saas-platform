import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';

import { AuthService } from '@app/core/services/auth';
import { AdminLoginComponent } from './admin-login.component';

describe('AdminLoginComponent', () => {
  let fixture: ComponentFixture<AdminLoginComponent>;
  let component: AdminLoginComponent;
  let router: Router;
  let authServiceMock: {
    isLoggedIn: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
    setSession: ReturnType<typeof vi.fn>;
    getAuthState: ReturnType<typeof vi.fn>;
  };
  let queryParams: Record<string, string>;

  beforeEach(async () => {
    queryParams = {};
    authServiceMock = {
      isLoggedIn: vi.fn(() => false),
      login: vi.fn(),
      setSession: vi.fn(),
      getAuthState: vi.fn(() => ({ roles: [], permissions: [] })),
    };

    await TestBed.configureTestingModule({
      imports: [AdminLoginComponent],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParams } } },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(AdminLoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('redirects a management staff login to the management dashboard by default', () => {
    authServiceMock.login.mockReturnValue(of({
      accessToken: 'access-token',
      username: 'hotel-manager',
      roles: ['HOTEL_MANAGER'],
      permissions: [{ function: 'REPORT', actionMask: 1 }],
    }));
    authServiceMock.getAuthState.mockReturnValue({
      roles: ['HOTEL_MANAGER'],
      permissions: [{ function: 'REPORT', actionMask: 1 }],
    });
    component.loginObj.username = 'hotel-manager';
    component.loginObj.password = 'password';

    component.onSubmit();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/management/dashboard');
  });

  it('honors an internal admin returnUrl after login', () => {
    queryParams['returnUrl'] = '/admin/rooms?status=AVAILABLE';
    fixture.destroy();
    fixture = TestBed.createComponent(AdminLoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    authServiceMock.login.mockReturnValue(of({
      accessToken: 'access-token',
      username: 'receptionist',
      roles: ['RECEPTIONIST'],
      permissions: [{ function: 'ROOM', actionMask: 1 }],
    }));
    authServiceMock.getAuthState.mockReturnValue({
      roles: ['RECEPTIONIST'],
      permissions: [{ function: 'ROOM', actionMask: 1 }],
    });
    component.loginObj.username = 'receptionist';
    component.loginObj.password = 'password';

    component.onSubmit();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/management/dashboard');
  });

  it('redirects a receptionist away from an unauthorized returnUrl', () => {
    queryParams['returnUrl'] = '/admin/services';
    fixture.destroy();
    fixture = TestBed.createComponent(AdminLoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    authServiceMock.login.mockReturnValue(of({
      accessToken: 'access-token',
      username: 'receptionist1',
      roles: ['RECEPTIONIST'],
      permissions: [
        { function: 'REPORT', actionMask: 1 },
        { function: 'RESERVATION', actionMask: 7 },
      ],
    }));
    authServiceMock.getAuthState.mockReturnValue({
      roles: ['RECEPTIONIST'],
      permissions: [
        { function: 'REPORT', actionMask: 1 },
        { function: 'RESERVATION', actionMask: 7 },
      ],
    });
    component.loginObj.username = 'receptionist1';
    component.loginObj.password = 'password';

    component.onSubmit();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/management/dashboard');
  });

  it('ignores a non-portal returnUrl', () => {
    queryParams['returnUrl'] = 'https://example.com';
    fixture.destroy();
    fixture = TestBed.createComponent(AdminLoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    authServiceMock.login.mockReturnValue(of({
      accessToken: 'access-token',
      username: 'admin',
      roles: ['ADMIN'],
      permissions: [],
    }));
    authServiceMock.getAuthState.mockReturnValue({ roles: ['ADMIN'], permissions: [] });
    component.loginObj.username = 'admin';
    component.loginObj.password = 'password';

    component.onSubmit();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/admin/dashboard');
  });

  it('replaces unsupported footer notices with real contact, support, and privacy routes', () => {
    const anchors = [...fixture.nativeElement.querySelectorAll('.login-footer a')] as HTMLAnchorElement[];
    const destinations = anchors.map(anchor => anchor.getAttribute('href'));

    expect(destinations).toEqual(expect.arrayContaining(['/contact', '/support', '/privacy']));
    expect(fixture.nativeElement.textContent).not.toContain('chưa tích hợp');
  });
});
