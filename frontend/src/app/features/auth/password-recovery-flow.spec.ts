import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';

import { AuthService } from '@app/core/services/auth';
import { ForgotPasswordComponent } from './forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './reset-password/reset-password.component';

describe('Password recovery flow', () => {
  const requestPasswordReset = vi.fn(() => of({ message: 'If the account exists, a reset link will be sent shortly.' }));
  const resetPassword = vi.fn(() => of(void 0));

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [ForgotPasswordComponent, ResetPasswordComponent],
      providers: [
        { provide: AuthService, useValue: { requestPasswordReset, resetPassword } },
        { provide: Router, useValue: { navigate: vi.fn(), navigateByUrl: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: { get: (key: string) => key === 'token' ? 'raw-reset-token' : null },
            },
          },
        },
      ],
    }).compileComponents();
  });

  it('submits a normalized email and shows enumeration-safe confirmation', () => {
    const fixture: ComponentFixture<ForgotPasswordComponent> = TestBed.createComponent(ForgotPasswordComponent);
    const component = fixture.componentInstance;
    component.email = ' Guest@Example.com ';

    component.submit();
    fixture.detectChanges();

    expect(requestPasswordReset).toHaveBeenCalledWith('guest@example.com');
    expect(component.successMessage).toContain('If the account exists');
  });

  it('submits matching new passwords with the reset token', () => {
    const fixture: ComponentFixture<ResetPasswordComponent> = TestBed.createComponent(ResetPasswordComponent);
    const component = fixture.componentInstance;
    component.newPassword = 'new-password';
    component.confirmPassword = 'new-password';

    component.submit();

    expect(resetPassword).toHaveBeenCalledWith('raw-reset-token', 'new-password');
    expect(component.successMessage).toContain('Password updated');
  });

  it('rejects mismatched passwords before calling the API', () => {
    const fixture: ComponentFixture<ResetPasswordComponent> = TestBed.createComponent(ResetPasswordComponent);
    const component = fixture.componentInstance;
    component.newPassword = 'new-password';
    component.confirmPassword = 'different-password';

    component.submit();

    expect(resetPassword).not.toHaveBeenCalled();
    expect(component.errorMessage).toContain('do not match');
  });
});
