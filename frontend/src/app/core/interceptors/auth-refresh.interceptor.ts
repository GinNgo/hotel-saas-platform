import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth';

export const authRefreshInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const isAuthRequest = req.url.includes('/api/auth/');

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401 || isAuthRequest || !authService.canRefreshSession()) {
        return throwError(() => error);
      }

      return authService.refreshAccessToken().pipe(
        switchMap(() => {
          const token = authService.getAccessToken();
          if (!token) return throwError(() => error);
          return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
        }),
        catchError(refreshError => throwError(() => refreshError)),
      );
    }),
  );
};
