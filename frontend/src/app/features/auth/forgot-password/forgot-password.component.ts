import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';

import { AuthService } from '@app/core/services/auth';
import { SharedModule } from '@app/shared/shared.module';

@Component({
  standalone: true,
  imports: [SharedModule, RouterModule],
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordComponent {
  private readonly authService = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);

  email = '';
  errorMessage = '';
  successMessage = '';
  isLoading = false;

  submit(): void {
    const email = this.email.trim().toLowerCase();
    if (!email) {
      this.errorMessage = 'Enter the email address used for your LuxeStay account.';
      this.successMessage = '';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.authService.requestPasswordReset(email).subscribe({
      next: (response) => {
        this.isLoading = false;
        this.successMessage = response?.message
          || 'If the account exists, a password reset link will be sent shortly.';
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error?.error?.message || 'Unable to send the reset request. Please try again.';
        this.cdr.markForCheck();
      },
    });
  }
}
