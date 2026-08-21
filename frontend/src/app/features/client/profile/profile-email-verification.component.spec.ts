import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';

import { AuthService } from '@app/core/services/auth';
import { ClientApiService, UserContext } from '@app/core/services/client-api.service';
import { EmailVerificationService } from '@app/core/services/email-verification.service';
import { ReservationService } from '@app/core/services/reservation.service';
import { UserService } from '@app/core/services/user';
import { ProfileComponent } from './profile.component';

describe('ProfileComponent email verification', () => {
  let fixture: ComponentFixture<ProfileComponent>;
  let userService: { updateProfile: ReturnType<typeof vi.fn>; uploadAvatar: ReturnType<typeof vi.fn> };
  let verification: {
    requestEmailChange: ReturnType<typeof vi.fn>;
    resend: ReturnType<typeof vi.fn>;
  };

  const user: UserContext = {
    id: 7,
    username: 'customer@example.com',
    email: 'customer@example.com',
    emailVerified: true,
    fullName: 'Customer Test',
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

  it('keeps the current email until the requested address is verified', () => {
    const component = fixture.componentInstance;
    component.profileForm.patchValue({ email: 'new@example.com' });

    component.saveProfile();

    expect(userService.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ email: user.email }));
    expect(verification.requestEmailChange).toHaveBeenCalledWith('new@example.com');
    expect(component.user?.email).toBe(user.email);
    expect(component.user?.pendingEmail).toBe('new@example.com');
    expect(component.profileForm.controls.email.value).toBe(user.email);
  });

  it('resends verification for the active or pending email', () => {
    fixture.componentInstance.resendEmailVerification();

    expect(verification.resend).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.success).toContain('xác minh');
  });
});
