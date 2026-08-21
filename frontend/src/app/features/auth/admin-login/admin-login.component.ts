import { Component, ChangeDetectionStrategy, inject, ChangeDetectorRef, OnInit } from '@angular/core';
import { SharedModule } from '@app/shared/shared.module';
import { AuthService } from '@app/core/services/auth';
import { AuthLegalCopyService } from '../legal-support/auth-legal-copy.service';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ActionCode, FunctionCode } from '@app/core/services/permission.service';
import {
  ACCOUNT_DISABLED_CODE,
  ACCOUNT_DISABLED_MESSAGE,
  authenticationErrorMessage,
} from '@app/core/auth/account-status-error';
import { hasPortalPermission, isAllowedReturnUrl, resolvePortal } from '@app/core/auth/portal-access.resolver';

@Component({
  standalone: true,
  imports: [SharedModule, RouterModule],
  selector: 'app-admin-login',
  templateUrl: './admin-login.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./admin-login.component.css'],
})
export class AdminLoginComponent implements OnInit {
  private static readonly DEFAULT_PORTAL_URL = '/admin/dashboard';

  readonly i18n = inject(AuthLegalCopyService);
  loginObj = {
    username: '',
    password: ''
  };
  errorMessage = '';
  isLoading = false;

  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);
  private returnUrl = AdminLoginComponent.DEFAULT_PORTAL_URL;

  ngOnInit(): void {
    this.returnUrl = this.resolvePortalReturnUrl(this.route.snapshot.queryParams['returnUrl']);
    if (this.route.snapshot.queryParams['reason'] === ACCOUNT_DISABLED_CODE) {
      this.errorMessage = ACCOUNT_DISABLED_MESSAGE;
    }
    if (this.authService.isLoggedIn()) {
      this.redirectToPortal();
    }
  }

  onSubmit(): void {
    if (!this.loginObj.username || !this.loginObj.password) {
      this.errorMessage = 'Vui lòng nhập tài khoản và mật khẩu.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    this.authService.login(this.loginObj).subscribe({
      next: (res) => {
        if (res && res.accessToken) {
          const roles: string[] = Array.isArray(res.roles) ? res.roles : [];
          this.authService.setSession(res.accessToken, {
            id: res.userId ?? res.id,
            username: res.username,
            roles,
            permissions: Array.isArray(res.permissions) ? res.permissions : [],
            assignedProperties: res.assignedProperties,
            defaultPortal: res.defaultPortal,
            defaultRoute: res.defaultRoute,
            activePropertyId: res.activePropertyId
          });

          this.redirectToPortal();
        }
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.errorMessage = authenticationErrorMessage(err, 'Sai tài khoản hoặc mật khẩu.');
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  private redirectToPortal(): void {
    const authState = this.authService.getAuthState();
    const resolution = resolvePortal({ roles: authState.roles, permissions: authState.permissions, username: authState.username });
    if (resolution.portal !== 'admin') {
      void this.router.navigateByUrl(resolution.defaultRoute);
      return;
    }
    const path = this.returnUrl.split(/[?#]/, 1)[0];
    const functionCode = path.includes('/services') ? FunctionCode.HOTEL_SERVICE
      : path.includes('/room-types') ? FunctionCode.ROOM_TYPE
      : path.includes('/rooms') ? FunctionCode.ROOM
      : path.includes('/invoices') ? FunctionCode.INVOICE
      : path.includes('/customers') ? FunctionCode.CUSTOMER
      : path.includes('/reservations') ? FunctionCode.RESERVATION
      : FunctionCode.REPORT;
    const actionCode = path.includes('/create') ? ActionCode.CREATE : ActionCode.VIEW;
    const allowed = isAllowedReturnUrl(this.returnUrl, 'admin') && (path === '/admin/dashboard' || hasPortalPermission(authState, functionCode, actionCode));
    void this.router.navigateByUrl(allowed ? this.returnUrl : resolution.defaultRoute);
  }

  private resolvePortalReturnUrl(value: unknown): string {
    if (typeof value !== 'string' || !value.startsWith('/')) {
      return AdminLoginComponent.DEFAULT_PORTAL_URL;
    }

    const path = value.split(/[?#]/, 1)[0];
    const isPortalRoute = path === '/admin'
      || path.startsWith('/admin/')
      || path === '/management'
      || path.startsWith('/management/');
    const isLoginRoute = path === '/admin/login';

    return isPortalRoute && !isLoginRoute
      ? value
      : AdminLoginComponent.DEFAULT_PORTAL_URL;
  }
}
