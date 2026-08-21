import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AuthService } from '@app/core/services/auth';
import { ClientApiService, UserContext } from '@app/core/services/client-api.service';
import { EmailVerificationService } from '@app/core/services/email-verification.service';
import { ReservationService } from '@app/core/services/reservation.service';
import { UserService } from '@app/core/services/user';
import { ProfileComponent } from './profile.component';

describe('ProfileComponent profile update', () => {
  let fixture: ComponentFixture<ProfileComponent>;
  let userService: { updateProfile: ReturnType<typeof vi.fn>; uploadAvatar: ReturnType<typeof vi.fn> };
  let verification: {
    requestEmailChange: ReturnType<typeof vi.fn>;
    resend: ReturnType<typeof vi.fn>;
  };

  const user: UserContext = {
    id: 24,
    username: 'profile@example.com',
    email: 'profile@example.com',
    emailVerified: true,
    fullName: 'Profile Owner',
    phone: '+84 901 000 000',
    roles: ['CUSTOMER'],
  };

  beforeEach(async () => {
    userService = {
      updateProfile: vi.fn((profile) => of({ ...user, ...profile, email: user.email })),
      uploadAvatar: vi.fn(),
    };
    verification = {
      requestEmailChange: vi.fn(() => of({
        message: 'Sent', emailSent: true, alreadyVerified: false, pendingEmail: 'new@example.com',
      })),
      resend: vi.fn(() => of({ message: 'Sent', emailSent: true, alreadyVerified: false })),
    };

    await TestBed.configureTestingModule({
      imports: [ProfileComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { data: {} }, queryParams: of({}) } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: AuthService, useValue: { updateCurrentUser: vi.fn(), logout: vi.fn() } },
        { provide: ClientApiService, useValue: { getProfile: vi.fn(() => of(user)), getMyBookings: vi.fn(() => of([])) } },
        { provide: UserService, useValue: userService },
        { provide: EmailVerificationService, useValue: verification },
        { provide: ReservationService, useValue: { cancelMyReservation: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfileComponent);
    fixture.detectChanges();
  });

  it('blocks invalid phone input before submitting the profile', () => {
    const component = fixture.componentInstance;
    component.profileForm.patchValue({ phone: 'call me maybe' });

    component.saveProfile();

    expect(component.profileForm.controls.phone.invalid).toBe(true);
    expect(userService.updateProfile).not.toHaveBeenCalled();
  });

  it('keeps the active identity unchanged when the requested email is already used', () => {
    verification.requestEmailChange.mockReturnValue(throwError(() => ({
      error: { code: 'EMAIL_IDENTITY_CONFLICT', message: 'This email cannot be used.' },
    })));
    const component = fixture.componentInstance;
    component.profileForm.patchValue({ email: 'taken@example.com' });

    component.saveProfile();

    expect(userService.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ email: user.email }));
    expect(verification.requestEmailChange).toHaveBeenCalledWith('taken@example.com');
    expect(component.user?.email).toBe(user.email);
    expect(component.user?.username).toBe(user.username);
    expect(component.user?.pendingEmail).toBeUndefined();
    expect(component.error).toBeTruthy();
    expect(component.saving).toBe(false);
  });
});
