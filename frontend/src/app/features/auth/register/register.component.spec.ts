import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { AuthService } from '@app/core/services/auth';
import { RegisterComponent } from './register.component';

describe('RegisterComponent', () => {
  let fixture: ComponentFixture<RegisterComponent>;
  let component: RegisterComponent;
  let register: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    register = vi.fn(() => of({ message: 'User registered successfully!', welcomeEmailSent: false }));

    await TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [
        { provide: AuthService, useValue: { register } },
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: {}, queryParams: of({}) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('toggles both password controls without changing the entered values', () => {
    component.registerObj.password = 'secret123';
    component.registerObj.confirmPassword = 'secret123';

    component.togglePasswordVisibility('password');
    component.togglePasswordVisibility('confirmPassword');
    fixture.detectChanges();

    const password = fixture.nativeElement.querySelector('#password') as HTMLInputElement;
    const confirmation = fixture.nativeElement.querySelector('#confirmPassword') as HTMLInputElement;
    expect(password.type).toBe('text');
    expect(confirmation.type).toBe('text');
    expect(component.registerObj.password).toBe('secret123');
  });

  it('reports successful registration without falsely claiming an email was delivered', () => {
    component.registerObj = {
      fullName: 'Guest Test',
      email: 'guest@example.com',
      password: 'secret123',
      confirmPassword: 'secret123',
      countryCode: '+84',
      phone: '901234567',
      terms: true,
    };

    component.onSubmit();

    expect(register).toHaveBeenCalledOnce();
    expect(component.successMessage).toContain('gửi lại liên kết xác minh');
  });

  it('uses real keyboard-reachable terms, privacy, cookie, contact, and support routes', () => {
    const anchors = [...fixture.nativeElement.querySelectorAll('a')] as HTMLAnchorElement[];
    const destinations = anchors.map(anchor => anchor.getAttribute('href'));

    expect(destinations).toEqual(expect.arrayContaining([
      '/terms',
      '/privacy',
      '/cookies',
      '/contact',
      '/support',
    ]));
    expect(destinations).not.toContain('#');
    expect(fixture.nativeElement.querySelector('#terms').getAttribute('aria-describedby')).toBe('terms-consent-copy');
  });

  it('renders legal content in a viewport modal instead of the registration layout flow', () => {
    component.openLegal(new Event('click'), 'TERMS');
    fixture.detectChanges();

    const backdrop = fixture.nativeElement.querySelector('.legal-modal-backdrop') as HTMLElement;
    expect(backdrop).not.toBeNull();
    expect(getComputedStyle(backdrop).position).toBe('fixed');
    expect(fixture.nativeElement.querySelector('.register-page-shell .legal-modal-backdrop')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="dialog"]').getAttribute('aria-labelledby')).toBe('legal-modal-title');
  });
});
