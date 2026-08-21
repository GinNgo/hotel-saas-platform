import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { NEVER, of, throwError } from 'rxjs';

import { AuthService } from '@app/core/services/auth';
import { RegisterComponent } from './register.component';

describe('RegisterComponent credential contract', () => {
  let fixture: ComponentFixture<RegisterComponent>;
  let component: RegisterComponent;
  let register: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    register = vi.fn(() => NEVER);
    await TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [
        { provide: AuthService, useValue: { register } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: {}, queryParams: of({}) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('normalizes email and display name before registration', () => {
    component.registerObj = {
      fullName: '  Guest   Name  ',
      email: 'Guest.User@Example.com',
      password: 'secret123',
      confirmPassword: 'secret123',
      countryCode: '+84',
      phone: '901234567',
      terms: true,
    };

    component.onSubmit();

    expect(register).toHaveBeenCalledWith(expect.objectContaining({
      username: 'guest.user@example.com',
      email: 'guest.user@example.com',
      fullName: 'Guest Name',
    }));
  });

  it('shows a stable field-level duplicate message', () => {
    register.mockReturnValueOnce(throwError(() => ({
      error: {
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'An account with this email already exists.',
        fieldErrors: { email: 'Email is already registered.' },
      },
    })));
    component.registerObj = {
      fullName: 'Guest Name',
      email: 'guest@example.com',
      password: 'secret123',
      confirmPassword: 'secret123',
      countryCode: '+84',
      phone: '901234567',
      terms: true,
    };

    component.onSubmit();

    expect(component.errorMessage).toBe('Email is already registered.');
  });
});
