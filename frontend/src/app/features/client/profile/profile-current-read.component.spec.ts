import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';

import { AuthService } from '@app/core/services/auth';
import { ClientApiService, UserContext } from '@app/core/services/client-api.service';
import { EmailVerificationService } from '@app/core/services/email-verification.service';
import { ReservationService } from '@app/core/services/reservation.service';
import { UserService } from '@app/core/services/user';
import { ProfileComponent } from './profile.component';

describe('ProfileComponent current profile read states', () => {
  let fixture: ComponentFixture<ProfileComponent>;
  let getProfile: ReturnType<typeof vi.fn>;

  const profile: UserContext = {
    id: 31,
    username: 'guest@example.com',
    email: 'guest@example.com',
    fullName: 'Guest Test',
    roles: ['CUSTOMER'],
  };

  beforeEach(async () => {
    getProfile = vi.fn();
    await TestBed.configureTestingModule({
      imports: [ProfileComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { data: {} }, queryParams: of({}) } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: AuthService, useValue: { updateCurrentUser: vi.fn(), logout: vi.fn() } },
        {
          provide: ClientApiService,
          useValue: { getProfile, getMyBookings: vi.fn(() => of([])) },
        },
        {
          provide: UserService,
          useValue: { updateProfile: vi.fn(), uploadAvatar: vi.fn() },
        },
        {
          provide: EmailVerificationService,
          useValue: { requestEmailChange: vi.fn(), resend: vi.fn() },
        },
        { provide: ReservationService, useValue: { cancelMyReservation: vi.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ProfileComponent);
  });

  it('shows loading until the current profile response arrives', () => {
    const response = new Subject<UserContext>();
    getProfile.mockReturnValue(response);

    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.message')).toBeTruthy();

    response.next(profile);
    response.complete();
    fixture.detectChanges();

    expect(fixture.componentInstance.user?.id).toBe(profile.id);
    expect(fixture.nativeElement.querySelector('.content-panel')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Guest Test');
  });

  it('shows a retry action after an API error and recovers on retry', () => {
    getProfile
      .mockReturnValueOnce(throwError(() => new Error('offline')))
      .mockReturnValueOnce(of(profile));

    fixture.detectChanges();
    const retryButton = fixture.nativeElement.querySelector('.profile-retry') as HTMLButtonElement;
    expect(retryButton).toBeTruthy();
    expect(fixture.componentInstance.profileLoadFailed).toBe(true);

    retryButton.click();
    fixture.detectChanges();

    expect(getProfile).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.profileLoadFailed).toBe(false);
    expect(fixture.componentInstance.user?.id).toBe(profile.id);
  });

  it('shows a non-destructive empty state when the API returns no profile body', () => {
    getProfile.mockReturnValue(of(null as unknown as UserContext));

    fixture.detectChanges();

    expect(fixture.componentInstance.profileEmpty).toBe(true);
    expect(fixture.componentInstance.user).toBeNull();
    expect(fixture.nativeElement.querySelector('.profile-empty')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.profile-empty .profile-retry')).toBeTruthy();
  });
});
