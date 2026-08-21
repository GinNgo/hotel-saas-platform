import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { of } from 'rxjs';

import { PASSWORD_POLICY, isPasswordLengthValid } from '../../../core/auth/password-policy';
import { PublicI18nService } from '../../../core/i18n/public-i18n.service';
import { AuthService } from '../../../core/services/auth';
import { UserService } from '../../../core/services/user';
import { AccountSettingsComponent } from './account-settings.component';

describe('Authenticated password change', () => {
  const changePassword = vi.fn(() => of(void 0));
  const logout = vi.fn();
  const navigate = vi.fn(() => Promise.resolve(true));

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [AccountSettingsComponent],
      providers: [
        { provide: UserService, useValue: { changePassword } },
        { provide: AuthService, useValue: { logout, listSocialIdentities: () => of([]) } },
        { provide: Router, useValue: { navigate } },
        { provide: ActivatedRoute, useValue: { snapshot: {} } },
        { provide: PublicI18nService, useValue: { text: (key: string) => key } },
        { provide: MessageService, useValue: { add: vi.fn() } },
      ],
    }).compileComponents();
  });

  it('uses the shared 8-256 character policy', () => {
    expect(PASSWORD_POLICY).toEqual({ minLength: 8, maxLength: 256 });
    expect(isPasswordLengthValid('1234567')).toBe(false);
    expect(isPasswordLengthValid('12345678')).toBe(true);
    expect(isPasswordLengthValid('x'.repeat(256))).toBe(true);
    expect(isPasswordLengthValid('x'.repeat(257))).toBe(false);
  });

  it('submits a valid change then clears the revoked client session', () => {
    const component = TestBed.createComponent(AccountSettingsComponent).componentInstance;
    component.form.setValue({
      currentPassword: 'Current@123',
      newPassword: 'Changed@123',
      confirmPassword: 'Changed@123',
    });

    component.submit();

    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: 'Current@123',
      newPassword: 'Changed@123',
    });
    expect(logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { reason: 'PASSWORD_CHANGED' } });
  });

  it('rejects mismatched confirmation before the API call', () => {
    const component = TestBed.createComponent(AccountSettingsComponent).componentInstance;
    component.form.setValue({
      currentPassword: 'Current@123',
      newPassword: 'Changed@123',
      confirmPassword: 'Different@123',
    });

    component.submit();

    expect(changePassword).not.toHaveBeenCalled();
    expect(component.error).toBeTruthy();
  });
});
