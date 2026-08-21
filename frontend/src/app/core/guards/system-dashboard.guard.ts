import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';

export const systemDashboardGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const isSystemAdministrator = authService.getRoles()
    .some(role => role === 'SUPER_ADMIN' || role === 'ADMIN');

  return isSystemAdministrator
    ? router.createUrlTree(['/admin/platform-revenue'])
    : true;
};
