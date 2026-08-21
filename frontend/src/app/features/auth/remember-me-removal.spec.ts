import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';

import { AuthService } from '@app/core/services/auth';
import { AdminLoginComponent } from './admin-login/admin-login.component';
import { LoginComponent } from './login/login.component';

describe('Remember-me policy', () => {
  const authServiceMock = {
    isLoggedIn: vi.fn(() => false),
    getRoles: vi.fn(() => []),
    login: vi.fn(() => of(null)),
    googleLogin: vi.fn(),
    facebookLogin: vi.fn(),
    setSession: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [LoginComponent, AdminLoginComponent],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: Router, useValue: { navigate: vi.fn(), navigateByUrl: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParams: {} } } },
      ],
    }).compileComponents();
  });

  it('removes the unsupported public remember-me checkbox and request field', () => {
    const fixture: ComponentFixture<LoginComponent> = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    expect('rememberMe' in component.loginObj).toBe(false);
    expect(fixture.nativeElement.querySelector('input[name="rememberMe"]')).toBeNull();

    component.loginObj.username = 'customer@example.com';
    component.loginObj.password = 'secret';
    component.onSubmit();
    expect(authServiceMock.login).toHaveBeenCalledWith({
      username: 'customer@example.com',
      password: 'secret',
    });
  });

  it('removes the unsupported admin remember-me checkbox', () => {
    const fixture: ComponentFixture<AdminLoginComponent> = TestBed.createComponent(AdminLoginComponent);
    fixture.detectChanges();

    expect('rememberMe' in fixture.componentInstance.loginObj).toBe(false);
    expect(fixture.nativeElement.querySelector('input[name="rememberMe"]')).toBeNull();
  });
});
