import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  FacebookLoginProvider,
  GoogleLoginProvider,
  GoogleSigninButtonModule,
  SOCIAL_AUTH_CONFIG,
  SocialAuthService,
  SocialAuthServiceConfig,
  SocialUser,
} from '@abacritt/angularx-social-login';
import { MessageService } from 'primeng/api';
import { Subscription, finalize } from 'rxjs';

import { AuthService, SocialIdentity, SocialProvider } from '../../../core/services/auth';
import { environment } from '../../../../environments/environment';

const configuredSocialAuth = (environment as typeof environment & {
  socialAuth?: { googleClientId?: string; facebookAppId?: string };
}).socialAuth ?? {};

const socialAuthConfig: SocialAuthServiceConfig = {
  autoLogin: false,
  lang: 'vi',
  providers: [
    ...(configuredSocialAuth.googleClientId
      ? [{ id: GoogleLoginProvider.PROVIDER_ID, provider: new GoogleLoginProvider(configuredSocialAuth.googleClientId) }]
      : []),
    ...(configuredSocialAuth.facebookAppId
      ? [{ id: FacebookLoginProvider.PROVIDER_ID, provider: new FacebookLoginProvider(configuredSocialAuth.facebookAppId, {
          scope: 'email,public_profile',
          locale: 'vi_VN',
          fields: 'name,email,picture',
          version: 'v26.0',
        }) }]
      : []),
  ],
};

@Component({
  selector: 'app-social-account-links',
  standalone: true,
  imports: [CommonModule, FormsModule, GoogleSigninButtonModule],
  providers: [
    SocialAuthService,
    { provide: SOCIAL_AUTH_CONFIG, useValue: socialAuthConfig },
  ],
  template: `
    <section class="social-links" aria-labelledby="social-links-title">
      <div class="section-heading">
        <div><p class="eyebrow">{{ english ? 'ACCOUNT SECURITY' : 'BẢO MẬT TÀI KHOẢN' }}</p>
          <h2 id="social-links-title">{{ english ? 'Linked accounts' : 'Tài khoản liên kết' }}</h2>
          <p>{{ english ? 'Connect Google or Facebook for faster sign-in without merging accounts by email.' : 'Liên kết Google hoặc Facebook để đăng nhập nhanh, không tự ghép tài khoản theo email.' }}</p>
        </div>
        <button type="button" class="refresh" [disabled]="loading" (click)="load()" [attr.aria-label]="english ? 'Refresh linked accounts' : 'Tải lại tài khoản liên kết'">↻</button>
      </div>

      <div *ngIf="loading" class="state" aria-live="polite">{{ english ? 'Loading…' : 'Đang tải…' }}</div>
      <div *ngIf="error" class="state error" role="alert">{{ error }}</div>

      <div *ngIf="!loading" class="identity-list">
        <article *ngFor="let identity of identities" class="identity-row">
          <div class="provider-mark" [class.facebook]="identity.provider === 'FACEBOOK'">{{ identity.provider === 'GOOGLE' ? 'G' : 'f' }}</div>
          <div class="identity-copy"><strong>{{ identity.provider }}</strong><span>{{ identity.providerEmail }}</span></div>
          <button type="button" class="unlink" [disabled]="saving" (click)="unlink(identity)">{{ english ? 'Unlink' : 'Hủy liên kết' }}</button>
        </article>
        <p *ngIf="!identities.length" class="empty">{{ english ? 'No provider is linked yet.' : 'Chưa có nền tảng nào được liên kết.' }}</p>
      </div>

      <div class="link-actions">
        <div *ngIf="googleConfigured" class="google-action" (click)="prepareLink('GOOGLE')">
          <asl-google-signin-button type="standard" size="large" text="continue_with" shape="rectangular" theme="outline" logo_alignment="left" [width]="260" locale="vi"></asl-google-signin-button>
        </div>
        <button *ngIf="facebookConfigured" type="button" class="facebook-action" [disabled]="saving" (click)="prepareLink('FACEBOOK'); signIn('FACEBOOK')">f <span>{{ english ? 'Link Facebook' : 'Liên kết Facebook' }}</span></button>
      </div>

      <label *ngIf="identities.length === 1" class="password-field">
        {{ english ? 'Current password (required to remove the last link)' : 'Mật khẩu hiện tại (bắt buộc khi hủy liên kết cuối)' }}
        <input [(ngModel)]="currentPassword" type="password" autocomplete="current-password">
      </label>
    </section>
  `,
  styles: [`
    :host{display:block}.social-links{display:grid;gap:18px;margin-top:24px;padding:24px;border:1px solid #dbe5e2;border-radius:20px;background:linear-gradient(145deg,#fff,#f6fbf9)}.section-heading{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.eyebrow{margin:0 0 5px;color:#0f766e;font-size:11px;font-weight:800;letter-spacing:.14em}.section-heading h2{margin:0;color:#17332d;font-size:22px}.section-heading p:not(.eyebrow){margin:6px 0 0;color:#647875;font-size:13px;line-height:1.5}.refresh{border:1px solid #cfe1dc;border-radius:10px;background:#fff;color:#0f766e;font-size:20px;width:44px;height:44px;cursor:pointer}.identity-list{display:grid;gap:10px}.identity-row{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid #e0ebe7;border-radius:14px;background:#fff}.provider-mark{display:grid;place-items:center;width:36px;height:36px;border-radius:11px;background:#f3f4f6;color:#4285f4;font-weight:900;font-size:20px}.provider-mark.facebook{background:#e8f0ff;color:#1877f2}.identity-copy{display:grid;gap:3px;flex:1}.identity-copy strong{font-size:13px;color:#17332d}.identity-copy span{font-size:12px;color:#71837f}.unlink{min-height:44px;padding:0 8px;border:0;background:transparent;color:#b42318;font-weight:800;cursor:pointer}.link-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.google-action{min-height:44px;cursor:pointer}.facebook-action{display:inline-flex;align-items:center;gap:9px;min-height:44px;padding:0 16px;border:1px solid #bfd0ee;border-radius:8px;background:#fff;color:#1757a6;font-weight:800;cursor:pointer}.facebook-action:disabled,.unlink:disabled,.refresh:disabled{opacity:.55;cursor:not-allowed}.password-field{display:grid;gap:7px;color:#425852;font-weight:700;font-size:12px}.password-field input{min-height:40px;border:1px solid #cbdad5;border-radius:9px;padding:0 11px;font:inherit}.state{padding:10px 12px;border-radius:10px;background:#eef7f4;color:#315e54;font-size:13px}.state.error{background:#fff1f0;color:#b42318}.empty{margin:0;color:#71837f;font-size:13px}.identity-row+.empty{margin-top:0}@media(max-width:560px){.social-links{padding:18px;border-radius:16px}.section-heading h2{font-size:19px}.identity-row{align-items:flex-start}.unlink{font-size:12px;padding:6px 0}.link-actions{display:grid}.google-action,.facebook-action{width:100%}.facebook-action{justify-content:center}}
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SocialAccountLinksComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly socialAuth = inject(SocialAuthService);
  private readonly messages = inject(MessageService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly subscription = new Subscription();

  readonly googleConfigured = Boolean(configuredSocialAuth.googleClientId);
  readonly facebookConfigured = Boolean(configuredSocialAuth.facebookAppId);
  readonly english = typeof document !== 'undefined' && document.documentElement.lang.toLowerCase().startsWith('en');
  identities: SocialIdentity[] = [];
  loading = true;
  saving = false;
  error = '';
  currentPassword = '';
  private pendingProvider: SocialProvider | null = null;

  ngOnInit(): void {
    this.subscription.add(this.socialAuth.authState.subscribe(user => this.completeLink(user)));
    this.load();
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  load(): void {
    this.loading = true;
    this.auth.listSocialIdentities().pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); })).subscribe({
      next: identities => { this.identities = identities; this.error = ''; },
      error: error => { this.error = this.messageFor(error); },
    });
  }

  prepareLink(provider: SocialProvider): void {
    this.pendingProvider = provider;
    this.error = '';
  }

  signIn(provider: SocialProvider): void {
    this.prepareLink(provider);
    void this.socialAuth.signIn(provider === 'GOOGLE' ? GoogleLoginProvider.PROVIDER_ID : FacebookLoginProvider.PROVIDER_ID);
  }

  unlink(identity: SocialIdentity): void {
    this.saving = true;
    this.error = '';
    this.auth.unlinkSocialIdentity(identity.provider, this.currentPassword).pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); })).subscribe({
      next: () => {
        this.currentPassword = '';
        this.messages.add({
          severity: 'success',
          summary: this.english ? 'Unlinked successfully' : 'Hủy liên kết thành công',
          detail: this.english
            ? `${this.providerName(identity.provider)} is no longer linked to your account.`
            : `Tài khoản ${this.providerName(identity.provider)} đã được hủy liên kết.`,
          life: 3500,
        });
        this.load();
      },
      error: error => { this.error = this.messageFor(error); },
    });
  }

  private completeLink(user: SocialUser): void {
    if (!this.pendingProvider || !user) return;
    const provider: SocialProvider = user.provider === GoogleLoginProvider.PROVIDER_ID ? 'GOOGLE' : 'FACEBOOK';
    if (provider !== this.pendingProvider) return;
    const credential = provider === 'GOOGLE' ? user.idToken : user.authToken;
    this.pendingProvider = null;
    if (!credential) { this.error = this.english ? 'The provider did not return a credential.' : 'Nền tảng không trả về thông tin xác thực.'; this.cdr.markForCheck(); return; }
    this.saving = true;
    this.auth.linkSocialIdentity(provider, credential).pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); })).subscribe({
      next: () => {
        this.messages.add({
          severity: 'success',
          summary: this.english ? 'Linked successfully' : 'Liên kết thành công',
          detail: this.english
            ? `${this.providerName(provider)} is now linked to your account.`
            : `Tài khoản ${this.providerName(provider)} đã được liên kết.`,
          life: 3500,
        });
        this.load();
      },
      error: error => { this.error = this.messageFor(error); },
    });
  }

  private providerName(provider: SocialProvider): string {
    return provider === 'GOOGLE' ? 'Google' : 'Facebook';
  }

  private messageFor(error: any): string {
    return error?.error?.message || (this.english ? 'The linked-account request failed.' : 'Thao tác tài khoản liên kết chưa thành công.');
  }
}
