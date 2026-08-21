import { Component, ChangeDetectionStrategy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { ChangeDetectorRef, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '@app/core/services/auth';
import { isPasswordLengthValid, PASSWORD_POLICY } from '@app/core/auth/password-policy';
import { AuthLegalCopyService } from '../legal-support/auth-legal-copy.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RegisterComponent {
  legalModal: 'TERMS' | 'PRIVACY' | null = null;
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);
  readonly i18n = inject(AuthLegalCopyService);
  readonly passwordPolicy = PASSWORD_POLICY;
  registerObj = {
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    countryCode: '+84',
    phone: '',
    terms: false
  };

  errorMessage = '';
  successMessage = '';
  isLoading = false;
  passwordVisible = false;
  confirmPasswordVisible = false;
  readonly returnUrl = this.resolveClientReturnUrl(this.route.snapshot.queryParamMap?.get('returnUrl') || '/');

  openLegal(event: Event, kind: 'TERMS' | 'PRIVACY'): void {
    event.preventDefault();
    this.legalModal = kind;
  }

  closeLegal(): void {
    this.legalModal = null;
  }

  @HostListener('document:keydown.escape')
  closeLegalWithEscape(): void {
    if (this.legalModal) this.closeLegal();
  }

  togglePasswordVisibility(field: 'password' | 'confirmPassword'): void {
    if (field === 'password') {
      this.passwordVisible = !this.passwordVisible;
      return;
    }
    this.confirmPasswordVisible = !this.confirmPasswordVisible;
  }

  onSubmit(): void {
    if (!this.registerObj.fullName.trim() || !this.registerObj.email.trim() || !this.registerObj.password) {
      this.errorMessage = 'Vui lòng nhập đầy đủ họ tên, email và mật khẩu.';
      return;
    }

    if (!isPasswordLengthValid(this.registerObj.password)) {
      this.errorMessage = `Mật khẩu phải có từ ${PASSWORD_POLICY.minLength} đến ${PASSWORD_POLICY.maxLength} ký tự.`;
      return;
    }

    if (this.registerObj.password !== this.registerObj.confirmPassword) {
      this.errorMessage = 'Mật khẩu xác nhận không khớp.';
      return;
    }

    if (!this.registerObj.terms) {
      this.errorMessage = 'Vui lòng đồng ý với Điều khoản Dịch vụ.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const normalizedEmail = this.registerObj.email.trim().toLowerCase();
    const normalizedFullName = this.registerObj.fullName.trim().replace(/\s+/g, ' ');

    const payload = {
      username: normalizedEmail, // Registration identities are normalized server-side too.
      email: normalizedEmail,
      password: this.registerObj.password,
      fullName: normalizedFullName,
      phone: this.registerObj.countryCode + this.registerObj.phone,
      roles: ["CUSTOMER"]
    };

    this.authService.register(payload).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.successMessage = res?.verificationEmailSent
          ? 'Đăng ký thành công! Vui lòng kiểm tra hộp thư để xác minh email.'
          : 'Đăng ký thành công! Hãy đăng nhập để gửi lại liên kết xác minh email.';
        this.cdr.markForCheck();
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('postVerificationReturnUrl', this.returnUrl);
        }
        setTimeout(() => {
          this.router.navigate(['/login'], { queryParams: { returnUrl: this.returnUrl } });
        }, 2000);
      },
      error: (err) => {
        this.isLoading = false;
        const apiError = err?.error;
        this.errorMessage = apiError?.fieldErrors?.username
          || apiError?.fieldErrors?.email
          || apiError?.message
          || (typeof apiError === 'string' ? apiError : 'Đăng ký thất bại. Vui lòng thử lại.');
        this.cdr.markForCheck();
      }
    });
  }

  private resolveClientReturnUrl(returnUrl: string): string {
    if (!returnUrl.startsWith('/') || returnUrl.startsWith('//')) return '/';
    const blockedRoutes = ['/admin', '/management', '/403', '/login', '/register', '/verify-email'];
    return blockedRoutes.some(route => returnUrl === route || returnUrl.startsWith(`${route}/`) || returnUrl.startsWith(`${route}?`))
      ? '/'
      : returnUrl;
  }
}
