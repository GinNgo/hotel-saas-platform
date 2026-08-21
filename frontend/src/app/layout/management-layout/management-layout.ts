import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterModule, RouterOutlet } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { AuthService } from '../../core/services/auth';
import {
  ManagedProperty,
  ManagementApiService,
} from '../../core/services/management-api.service';
import { ActionCode, FunctionCode, PermissionService } from '../../core/services/permission.service';

interface ManagementLink {
  label: string;
  url: string;
  icon: string;
  functionCode?: FunctionCode;
  actionCode?: ActionCode;
  operationalOnly?: boolean;
}

@Component({
  selector: 'app-management-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, RouterOutlet],
  templateUrl: './management-layout.html',
  styleUrls: ['./management-layout.css'],
})
export class ManagementLayout implements OnInit, OnDestroy {
  @ViewChild('managementNavigation') private managementNavigation?: ElementRef<HTMLElement>;
  @ViewChild('navigationToggle') private navigationToggle?: ElementRef<HTMLButtonElement>;
  private authService = inject(AuthService);
  private managementApi = inject(ManagementApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private permissionService = inject(PermissionService);

  readonly navigationGroups: ReadonlyArray<{
    label: string;
    links: ReadonlyArray<ManagementLink>;
  }> = [
    {
      label: 'Vận hành',
      links: [
        { label: 'Tổng quan', url: '/management/dashboard', icon: 'dashboard' },
        { label: 'Cơ sở lưu trú', url: '/management/properties', icon: 'domain' },
        { label: 'Loại phòng', url: '/management/room-types', icon: 'bed', functionCode: FunctionCode.ROOM_TYPE, actionCode: ActionCode.VIEW, operationalOnly: true },
        { label: 'Ưu đãi & chiến dịch', url: '/management/promotions', icon: 'sell', functionCode: FunctionCode.HOTEL, actionCode: ActionCode.VIEW, operationalOnly: true },
        { label: 'Danh sách phòng', url: '/management/rooms', icon: 'meeting_room', functionCode: FunctionCode.ROOM, actionCode: ActionCode.VIEW, operationalOnly: true },
        { label: 'Lễ tân & đặt phòng', url: '/management/front-desk', icon: 'concierge', functionCode: FunctionCode.RESERVATION, actionCode: ActionCode.VIEW, operationalOnly: true },
        {
          label: 'Tác vụ vận hành',
          url: '/management/tasks',
          icon: 'task_alt',
          functionCode: FunctionCode.OPERATIONAL_TASK,
          actionCode: ActionCode.VIEW,
          operationalOnly: true,
        },
        {
          label: 'Dịch vụ lưu trú',
          url: '/management/services',
          icon: 'room_service',
          functionCode: FunctionCode.HOTEL_SERVICE,
          actionCode: ActionCode.VIEW,
          operationalOnly: true,
        },
      ],
    },
    {
      label: 'Tài khoản',
      links: [
        {
          label: 'Nhân viên & phân quyền',
          url: '/admin/users',
          icon: 'group',
          functionCode: FunctionCode.USER,
          actionCode: ActionCode.VIEW,
        },
        {
          label: 'Cấu hình thanh toán',
          url: '/management/payment-configuration',
          icon: 'account_balance_wallet',
          functionCode: FunctionCode.PROPERTY_PAYMENT_CONFIG,
          actionCode: ActionCode.VIEW,
          operationalOnly: true,
        },
        {
          label: 'Hoàn tiền đặt phòng',
          url: '/management/refunds',
          icon: 'currency_exchange',
          functionCode: FunctionCode.PROPERTY_REFUND,
          actionCode: ActionCode.APPROVE,
          operationalOnly: true,
        },
        {
          label: 'Gói phần mềm',
          url: '/management/billing',
          icon: 'workspace_premium',
          functionCode: FunctionCode.PLATFORM_BILLING,
          actionCode: ActionCode.VIEW,
        },
      ],
    },
    {
      label: 'Báo cáo',
      links: [
        {
          label: 'Doanh thu cơ sở',
          url: '/management/property-revenue',
          icon: 'monitoring',
          functionCode: FunctionCode.REPORT,
          actionCode: ActionCode.VIEW,
          operationalOnly: true,
        },
        {
          label: 'Nhật ký vận hành',
          url: '/management/audit-log',
          icon: 'history',
          functionCode: FunctionCode.AUDIT_LOG,
          actionCode: ActionCode.VIEW,
        },
      ],
    },
    {
      label: 'Dọn phòng',
      links: [
        {
          label: 'Hàng đợi dọn phòng',
          url: '/management/housekeeping',
          icon: 'cleaning_services',
          functionCode: FunctionCode.HOUSEKEEPING,
          actionCode: ActionCode.VIEW,
          operationalOnly: true,
        },
      ],
    },
    {
      label: 'Hỗ trợ',
      links: [
        {
          label: 'Liên hệ quản trị hệ thống',
          url: '/management/support',
          icon: 'support_agent',
        },
      ],
    },
  ];

  username = 'Đối tác';
  pageTitle = 'Tổng quan';
  isSidebarCollapsed = false;
  isMobileViewport = false;
  isMobileSidebarOpen = false;
  isUserMenuOpen = false;
  contextLoading = true;
  contextError = '';
  properties: ManagedProperty[] = [];
  activePropertyId?: string | number;
  activePropertyOperational = false;

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.updateViewportState();
    this.subscriptions.add(
      this.authService.currentUser$.subscribe((user) => {
        this.username = user.fullName || user.username || 'Đối tác';
        this.cdr.markForCheck();
      }),
    );

    this.subscriptions.add(
      this.router.events
        .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
        .subscribe((event) => {
          this.updatePageTitle(event.urlAfterRedirects);
          this.closeOverlays();
          this.cdr.markForCheck();
        }),
    );

    this.updatePageTitle(this.router.url);
    this.loadContext(this.toPropertyId(this.route.snapshot.queryParamMap.get('propertyId')));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  loadContext(propertyId?: string | number, updateUrl = false): void {
    this.contextLoading = true;
    this.contextError = '';

    this.subscriptions.add(
      this.managementApi.context(propertyId).subscribe({
        next: (context) => {
          this.properties = context.properties;
          this.activePropertyId = context.activePropertyId;
          this.activePropertyOperational = context.activePropertyOperational
            ?? this.activeProperty?.operational
            ?? (this.activeProperty?.approvalStatus === 'APPROVED'
              && this.activeProperty?.operationStatus === 'ACTIVE');
          this.contextLoading = false;

          if (updateUrl && context.activePropertyId === propertyId) {
            void this.router.navigate([], {
              queryParams: { propertyId: context.activePropertyId },
              queryParamsHandling: 'merge',
            });
          }
          this.cdr.markForCheck();
        },
        error: () => {
          this.properties = [];
          this.activePropertyId = undefined;
          this.activePropertyOperational = false;
          this.contextLoading = false;
          this.contextError = 'Không thể tải danh sách cơ sở.';
          this.cdr.markForCheck();
        },
      }),
    );
  }

  selectProperty(rawValue: string): void {
    const requestedId = this.toPropertyId(rawValue);
    if (!requestedId) return;

    this.loadContext(requestedId, true);
  }

  private toPropertyId(rawValue: string | null): string | number | undefined {
    if (!rawValue) return undefined;
    return /^\d+$/.test(rawValue) ? Number(rawValue) : rawValue;
  }

  logout(): void {
    this.authService.logout();
    void this.router.navigate(['/login']);
  }

  toggleSidebar(): void {
    if (this.isMobileViewport) {
      this.isMobileSidebarOpen = !this.isMobileSidebarOpen;
      if (this.isMobileSidebarOpen) {
        setTimeout(() => this.managementNavigation?.nativeElement.querySelector<HTMLElement>('a')?.focus());
      }
      return;
    }
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
  }

  toggleUserMenu(): void {
    this.isUserMenuOpen = !this.isUserMenuOpen;
  }

  closeMobileNavigation(): void {
    this.isMobileSidebarOpen = false;
  }

  @HostListener('document:keydown.escape')
  closeOverlays(): void {
    const restoreNavigationFocus = this.isMobileSidebarOpen;
    this.isMobileSidebarOpen = false;
    this.isUserMenuOpen = false;
    if (restoreNavigationFocus) setTimeout(() => this.navigationToggle?.nativeElement.focus());
  }

  @HostListener('window:resize')
  updateViewportState(): void {
    this.isMobileViewport = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(max-width: 991px)').matches;
    if (!this.isMobileViewport) this.isMobileSidebarOpen = false;
  }

  get sidebarExpanded(): boolean {
    return this.isMobileViewport ? this.isMobileSidebarOpen : !this.isSidebarCollapsed;
  }

  get activeProperty(): ManagedProperty | undefined {
    return this.properties.find((property) => property.id === this.activePropertyId);
  }

  propertyName(property: ManagedProperty): string {
    return property.nameVi?.trim()
      || property.name?.trim()
      || property.nameEn?.trim()
      || `Cơ sở #${property.id}`;
  }

  statusLabel(status?: string): string {
    return ({
      ACTIVE: 'Đang hoạt động',
      INACTIVE: 'Không hoạt động',
      SUSPENDED: 'Tạm ngưng',
      DRAFT: 'Bản nháp',
      PENDING_APPROVAL: 'Chờ duyệt',
      APPROVED: 'Đã duyệt',
      REJECTED: 'Bị từ chối',
    } as Record<string, string>)[status || ''] || status || 'Chưa xác định';
  }

  canViewLink(link: ManagementLink): boolean {
    if (
      link.operationalOnly
      && !this.activePropertyOperational
      && !this.permissionService.isSuperAdmin()
    ) return false;
    return !link.functionCode || this.permissionService.hasPermission(
      link.functionCode,
      link.actionCode ?? ActionCode.VIEW,
    );
  }

  visibleLinks(links: ReadonlyArray<ManagementLink>): ReadonlyArray<ManagementLink> {
    return links.filter((link) => this.canViewLink(link));
  }

  private updatePageTitle(url: string): void {
    const normalizedUrl = url.split('?')[0];
    const links = this.navigationGroups.flatMap((group) => group.links);
    const match = [...links]
      .sort((left, right) => right.url.length - left.url.length)
      .find((link) => normalizedUrl.startsWith(link.url));
    this.pageTitle = match?.label || 'Quản lý đối tác';
  }
}
