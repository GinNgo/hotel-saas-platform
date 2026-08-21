import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { AuthService } from '@app/core/services/auth';
import { ClientApiService, UserContext } from '@app/core/services/client-api.service';
import { EmailVerificationService } from '@app/core/services/email-verification.service';
import { ReservationService } from '@app/core/services/reservation.service';
import { UserService } from '@app/core/services/user';
import { ProfileComponent } from './profile.component';

describe('ProfileComponent support destination', () => {
  it('links authenticated customers to the real support route', async () => {
    const user: UserContext = {
      id: 7,
      username: 'customer',
      email: 'customer@example.test',
      fullName: 'Customer Test',
      roles: ['CUSTOMER'],
    };

    await TestBed.configureTestingModule({
      imports: [ProfileComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data: {} }, queryParams: of({}) } },
        { provide: AuthService, useValue: { updateCurrentUser: vi.fn(), logout: vi.fn() } },
        { provide: ClientApiService, useValue: { getProfile: vi.fn(() => of(user)), getMyBookings: vi.fn(() => of([])) } },
        { provide: UserService, useValue: { updateProfile: vi.fn(() => of(user)), uploadAvatar: vi.fn() } },
        { provide: EmailVerificationService, useValue: { requestEmailChange: vi.fn(), resend: vi.fn() } },
        { provide: ReservationService, useValue: { cancelMyReservation: vi.fn() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ProfileComponent);
    fixture.detectChanges();
    const supportLink = fixture.nativeElement.querySelector('a[href="/support"]') as HTMLAnchorElement;

    expect(supportLink).not.toBeNull();
    expect(supportLink.textContent?.trim()).toBeTruthy();
  });
});
