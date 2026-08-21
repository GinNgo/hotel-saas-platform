import { ChangeDetectorRef, Component, EventEmitter, OnInit, inject, Input, Output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth';

export interface AppFunctionDto {
  id: number;
  code: string;
  name: string;
  url: string;
  icon: string;
}

export interface AppModuleDto {
  id: number;
  code: string;
  name: string;
  functions: AppFunctionDto[];
}

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar implements OnInit {
  @Input() isCollapsed = false;
  @Output() navigated = new EventEmitter<void>();

  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);
  private authService = inject(AuthService);

  menuItems: AppModuleDto[] = [];
  isLoading = true;
  errorMessage = '';

  ngOnInit(): void {
    this.loadMenu();
  }

  loadMenu(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.http.get<AppModuleDto[]>(`${environment.apiUrl}/auth/my-menu`).subscribe({
      next: (res) => {
        this.menuItems = this.deduplicateMenu(this.filterForCurrentPortal(res));
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.menuItems = [];
        this.isLoading = false;
        this.errorMessage = 'Không thể tải menu theo quyền.';
        this.cdr.detectChanges();
      }
    });
  }

  private deduplicateMenu(modules: AppModuleDto[]): AppModuleDto[] {
    const seenCodes = new Set<string>();
    const seenRoutes = new Set<string>();
    const unsupportedRoutes = new Set(['/ai', '/admin/ai']);
    return modules.map(module => ({
      ...module,
      functions: (module.functions || []).filter(func => {
        if (!func.url || unsupportedRoutes.has(func.url) || seenCodes.has(func.code) || seenRoutes.has(func.url)) return false;
        seenCodes.add(func.code);
        seenRoutes.add(func.url);
        return true;
      })
    })).filter(module => module.functions.length > 0);
  }

  private filterForCurrentPortal(modules: AppModuleDto[]): AppModuleDto[] {
    const isSystemAdministrator = this.authService.getRoles()
      .some(role => role === 'SUPER_ADMIN' || role === 'ADMIN');
    if (!isSystemAdministrator) return modules;

    const tenantFunctionCodes = new Set([
      'CUSTOMER', 'ROOM_TYPE', 'ROOM', 'RESERVATION', 'RESERVATION_ASSIGNMENT',
      'CHECKIN', 'CHECKOUT', 'RESERVATION_CANCEL', 'RESERVATION_NO_SHOW',
      'HOTEL_SERVICE', 'HOUSEKEEPING', 'INVOICE', 'RESERVATION_PAYMENT',
      'PROPERTY_PAYMENT_CONFIG', 'PROPERTY_REFUND', 'PLATFORM_BILLING'
    ]);

    return modules
      .filter(module => module.code !== 'HOTEL')
      .map(module => ({
        ...module,
        functions: (module.functions || [])
          .filter(func => !tenantFunctionCodes.has(func.code) && !func.url?.startsWith('/management/'))
          .map(func => func.url === '/admin/dashboard'
            ? { ...func, code: 'PLATFORM_REVENUE_HOME', name: 'Doanh thu hệ thống', url: '/admin/platform-revenue', icon: 'pi pi-chart-line' }
            : func)
      }))
      .filter(module => module.functions.length > 0);
  }

  onNavigate(): void {
    this.navigated.emit();
  }
}
