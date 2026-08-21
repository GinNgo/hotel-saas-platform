import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AccessTokenSessionStore } from '../auth/access-token-session.store';

export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AccessTokenSessionStore).getValidToken();
  if (token) {
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }
  return next(req);
};
