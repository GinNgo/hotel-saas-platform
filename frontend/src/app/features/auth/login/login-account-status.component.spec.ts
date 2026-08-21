import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AuthService } from '@app/core/services/auth';
import { LoginComponent } from './login.component';

describe('LoginComponent account status', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let component: LoginComponent;
  let authService: {
    isLoggedIn: ReturnType<typeof vi.fn>;
    getRoles: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
    googleLogin: ReturnType<typeof vi.fn>;
    facebookLogin: ReturnType<typeof vi.fn>;
    setSession: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    authService = {
      isLoggedIn: vi.fn(() => false),
      getRoles: vi.fn(() => []),
      login: vi.fn(() => of(null)),
      googleLogin: vi.fn(),
      facebookLogin: vi.fn(),
      setSession: vi.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: Router, useValue: { navigate: vi.fn(), navigateByUrl: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParams: {} } } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('shows the stable suspended-account message instead of a password error', () => {
    authService.login.mockReturnValue(throwError(() => ({
      error: {
        code: 'ACCOUNT_DISABLED',
        message: 'This account is not active.',
        retryable: false,
      },
    })));
    component.loginObj.username = 'suspended@example.com';
    component.loginObj.password = 'password';

    component.onSubmit();

    expect(component.errorMessage).toContain('Tài khoản đã bị tạm ngưng');
    expect(authService.setSession).not.toHaveBeenCalled();
  });
});
