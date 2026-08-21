import { Injectable, inject } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { SubscriptionService } from '../services/subscription.service';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { MessageService } from 'primeng/api';

@Injectable({
  providedIn: 'root'
})
export class FeatureGuard implements CanActivate {
  private subscriptionService = inject(SubscriptionService);
  private router = inject(Router);
  private messageService = inject(MessageService);

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> | Promise<boolean> | boolean {
    const requiredFeature = route.data['requiredFeature'] as string;
    
    if (!requiredFeature) {
      return true; // No feature required
    }

    return this.subscriptionService.getMyFeatures().pipe(
      map(features => {
        if (features && features.hasOwnProperty(requiredFeature)) {
          return true;
        }
        
        this.messageService.add({
          severity: 'error',
          summary: 'Nâng cấp dịch vụ',
          detail: `Bạn cần nâng cấp gói để sử dụng chức năng này (${requiredFeature})`
        });
        
        this.router.navigate(['/admin/plans']);
        return false;
      }),
      catchError(() => {
        this.router.navigate(['/auth/login']);
        return of(false);
      })
    );
  }
}
