import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PermissionService, ActionCode } from '../services/permission.service';

export const permissionGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const permissionService = inject(PermissionService);

  const functionCode = route.data?.['functionCode'] as string;
  const actionCode = route.data?.['actionCode'] as number || ActionCode.VIEW;

  if (!functionCode) {
    return true; // No permission required
  }

  const hasPermission = permissionService.hasPermission(functionCode, actionCode);

  if (hasPermission) {
    return true;
  }

  return router.createUrlTree(['/403']);
};
