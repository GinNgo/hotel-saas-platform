import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { isApiError } from '../../shared/financial/financial.models';
import { AuthService } from '../services/auth';
import { ClientObservabilityService } from '../services/client-observability.service';
import { ACCOUNT_DISABLED_CODE } from '../auth/account-status-error';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const authService = inject(AuthService);
  const observability = inject(ClientObservabilityService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const correlationId = isApiError(error.error)
        ? error.error.correlationId
        : error.headers.get('X-Correlation-ID');
      observability.recordHttpFailure(req.method, error.status, correlationId);
      const currentUrl = router.url || '';
      const isAdminArea = currentUrl.startsWith('/admin') || currentUrl.startsWith('/management');
      const isProtectedClientArea = ['/booking', '/profile', '/booking-history', '/my-invoices', '/settings']
        .some(path => currentUrl.startsWith(path));
      const errorCode = isApiError(error.error) ? error.error.code : undefined;
      const accountDisabled = errorCode === ACCOUNT_DISABLED_CODE;
      const isAuthRequest = req.url.includes('/api/auth/');

      const isReadRequest = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';

      if (error.status === 403 && errorCode === 'FORBIDDEN_PERMISSION'
          && !isAuthRequest && authService.canRefreshSession()) {
        // Refresh presentation state only; the rejected request is never replayed automatically.
        authService.refreshAccessToken().subscribe({ error: () => undefined });
      }

      if (error.status === 403 && !isAuthRequest && isReadRequest) {
        const errCode = isApiError(error.error) ? error.error.code : 'ACCESS_DENIED';
        if (!currentUrl.includes('/403')) {
          router.navigate(['/403'], { queryParams: { reason: errCode } });
        }
      } else if (error.status === 401) {
        if (accountDisabled || !isAuthRequest) {
          authService.logout();
          localStorage.removeItem('permissions');
          if (accountDisabled) {
            if (isAdminArea && !currentUrl.includes('/admin/login')) {
              router.navigate(['/admin/login'], { queryParams: { reason: ACCOUNT_DISABLED_CODE } });
            } else if (!currentUrl.includes('/login')) {
              router.navigate(['/login'], {
                queryParams: { returnUrl: currentUrl, reason: ACCOUNT_DISABLED_CODE },
              });
            }
            return throwError(() => error);
          }
          // A stale token from another portal must not replace a public page with Login/403.
          if (isAdminArea && !currentUrl.includes('/admin/login')) {
            router.navigate(['/admin/login']);
          } else if (isProtectedClientArea && !currentUrl.includes('/login')) {
            router.navigate(['/login'], { queryParams: { returnUrl: currentUrl } });
          }
        }
      }
      return throwError(() => error);
    })
  );
};
