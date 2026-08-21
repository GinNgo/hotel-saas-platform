import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth';
import { normalizeRole } from '../auth/portal-access.resolver';

export const roleGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const requiredRoles = route.data?.['roles'] as string[];
  if (!requiredRoles || requiredRoles.length === 0) {
    return true;
  }

  const userRoles = authService.getRoles().map(normalizeRole);
  const hasRole = requiredRoles.map(normalizeRole).some((role) => userRoles.includes(role));

  if (hasRole) {
    return true;
  }

  return router.createUrlTree(['/403']);
};
