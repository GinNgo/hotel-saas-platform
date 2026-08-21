import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { finalize } from 'rxjs';

import { PASSWORD_POLICY, passwordValidators } from '../../../core/auth/password-policy';
import { PublicI18nService } from '../../../core/i18n/public-i18n.service';
import { AuthService } from '../../../core/services/auth';
import { UserService } from '../../../core/services/user';
import { SocialAccountLinksComponent } from './social-account-links.component';

@Component({
  selector: 'app-account-settings', standalone: true, imports: [CommonModule, ReactiveFormsModule, RouterModule, SocialAccountLinksComponent],
  template: `
    <main class="settings-page">
      <header><a routerLink="/profile"><i class="pi pi-arrow-left"></i> {{ i18n.text('PUBLIC.ACCOUNT.SETTINGS_BACK') }}</a><h1>{{ i18n.text('PUBLIC.ACCOUNT.SETTINGS_TITLE') }}</h1><p>{{ i18n.text('PUBLIC.ACCOUNT.SETTINGS_HELP') }}</p></header>
      <section><form [formGroup]="form" (ngSubmit)="submit()">
        <label>{{ i18n.text('PUBLIC.ACCOUNT.CURRENT_PASSWORD') }}<input type="password" formControlName="currentPassword" autocomplete="current-password"></label>
        <label>{{ i18n.text('PUBLIC.ACCOUNT.NEW_PASSWORD') }}<input type="password" formControlName="newPassword" autocomplete="new-password" [attr.minlength]="passwordPolicy.minLength" [attr.maxlength]="passwordPolicy.maxLength"><small>{{ i18n.text('PUBLIC.ACCOUNT.MIN_PASSWORD') }}</small></label>
        <label>{{ i18n.text('PUBLIC.ACCOUNT.CONFIRM_PASSWORD') }}<input type="password" formControlName="confirmPassword" autocomplete="new-password" [attr.minlength]="passwordPolicy.minLength" [attr.maxlength]="passwordPolicy.maxLength"></label>
        <div *ngIf="error" class="alert error">{{ error }}</div><div *ngIf="success" class="alert success">{{ success }}</div>
        <button type="submit" [disabled]="form.invalid || saving">{{ saving ? i18n.text('PUBLIC.ACCOUNT.SAVING') : i18n.text('PUBLIC.ACCOUNT.CHANGE_PASSWORD') }}</button>
      </form></section><app-social-account-links></app-social-account-links>
    </main>`,
  styles: [`
    .settings-page{max-width:720px;margin:auto;padding:38px 18px 70px}header{margin-bottom:22px}header a{color:#1d4ed8;text-decoration:none;font-weight:700}h1{font-size:30px;margin:20px 0 6px;color:#0f172a}p{margin:0;color:#64748b}section{background:#fff;border:1px solid #e2e8f0;padding:28px}form{display:grid;gap:18px}label{display:flex;flex-direction:column;gap:7px;color:#334155;font-weight:700;font-size:13px}input{min-height:44px;border:1px solid #cbd5e1;padding:0 12px;font:inherit}small{color:#64748b;font-weight:400}button{justify-self:start;min-height:44px;padding:0 18px;border:0;background:#1d4ed8;color:#fff;font-weight:700;cursor:pointer}button:disabled{opacity:.55}.alert{padding:12px}.error{background:#fef2f2;color:#b91c1c}.success{background:#ecfdf5;color:#047857}
  `]
})
export class AccountSettingsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly users = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly i18n = inject(PublicI18nService);
  readonly passwordPolicy = PASSWORD_POLICY;
  saving = false;
  error = '';
  success = '';
  readonly form = this.fb.nonNullable.group({ currentPassword: ['', Validators.required], newPassword: ['', passwordValidators()], confirmPassword: ['', passwordValidators()] });

  submit(): void {
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    if (value.newPassword !== value.confirmPassword) { this.error = this.i18n.text('PUBLIC.ACCOUNT.PASSWORD_MISMATCH'); return; }
    this.saving = true; this.error = ''; this.success = '';
    this.users.changePassword({ currentPassword: value.currentPassword, newPassword: value.newPassword }).pipe(finalize(() => this.saving = false)).subscribe({
      next: () => {
        this.success = this.i18n.text('PUBLIC.ACCOUNT.PASSWORD_CHANGED');
        this.form.reset();
        this.auth.logout();
        void this.router.navigate(['/login'], { queryParams: { reason: 'PASSWORD_CHANGED' } });
        this.cdr.detectChanges();
      },
      error: () => { this.error = this.i18n.text('PUBLIC.ACCOUNT.PASSWORD_CHANGE_ERROR'); this.cdr.detectChanges(); }
    });
  }
}
