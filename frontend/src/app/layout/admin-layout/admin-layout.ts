import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Sidebar } from '../sidebar/sidebar';
import { AuthService } from '../../core/services/auth';
import { AiAssistant } from '../../features/ai-assistant/ai-assistant';
import {
  NotificationService,
  AppNotification,
  NotificationHistoryPage,
  NotificationConnectionState,
} from '../../core/services/notification.service';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { Subscription } from 'rxjs';
import { UserService } from '../../core/services/user';
import { environment } from '../../../environments/environment';
import { ActionCode, FunctionCode, PermissionService } from '../../core/services/permission.service';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterOutlet, Sidebar, AiAssistant, ToastModule],
  providers: [MessageService],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.css'
})
export class AdminLayout implements OnInit, OnDestroy {
  isSidebarCollapsed = false;
  isMobileSidebarOpen = false;
  isNotificationOpen = false;
  isUserMenuOpen = false;
  globalSearchTerm = '';
  pageTitle = 'Bảng điều khiển';
  currentUserName = 'Admin';
  currentAvatarUrl = '';
  currentRoleLabel = 'Quản trị hệ thống';
  notificationsLoading = true;
  notificationsLoadingMore = false;
  notificationsError = '';
  notificationActionError = '';
  notificationMarkingAll = false;
  notificationPage = 0;
  readonly notificationPageSize = 20;
  notificationTotalElements = 0;
  notificationHasMore = false;
  notificationRetentionDays = 90;
  readonly notificationMarkingIds = new Set<string | number>();
  notificationConnectionState: NotificationConnectionState = 'idle';
  notificationConnectionMessage = '';
  canUseAiAssistant = false;

  readonly quickLinks = [
    { label: 'Bảng điều khiển', url: '/admin/dashboard' },
    { label: 'Đặt phòng', url: '/admin/reservations' },
    { label: 'Phòng', url: '/admin/rooms' },
    { label: 'Loại phòng', url: '/admin/room-types' },
    { label: 'Khách hàng', url: '/admin/customers' },
    { label: 'Nhân sự', url: '/admin/users' },
    { label: 'Hóa đơn', url: '/admin/invoices' },
    { label: 'Dọn phòng', url: '/admin/housekeeping' },
    { label: 'Doanh thu cơ sở', url: '/admin/property-revenue' },
    { label: 'Phân quyền', url: '/admin/role-permissions' },
    { label: 'Cơ sở lưu trú', url: '/admin/properties' },
    { label: 'Khiếu nại cơ sở', url: '/admin/property-claims' },
    { label: 'Gói dịch vụ', url: '/admin/plans' },
    { label: 'Platform merchant', url: '/admin/platform-payment-configuration' },
    { label: 'Doanh thu nền tảng', url: '/admin/platform-revenue' },
    { label: 'Vai trò', url: '/admin/roles' },
    { label: 'Dịch vụ', url: '/admin/services' },
  ];

  notifications: AppNotification[] = [];
  unreadCount = 0;
  private notifSub?: Subscription;
  private notificationConnectionSub?: Subscription;
  private notificationConnectionErrorSub?: Subscription;
  private authSub?: Subscription;
  private routerSub?: Subscription;
  private apiOrigin = environment.apiUrl.replace(/\/api\/?$/, '');
  private cdr: ChangeDetectorRef;

  constructor(
    private authService: AuthService,
    private userService: UserService,
    private router: Router,
    private notificationService: NotificationService,
    private messageService: MessageService,
    cdr: ChangeDetectorRef,
    private permissionService: PermissionService = new PermissionService()
  ) {
    this.cdr = cdr;
    const authState = this.authService.getAuthState();
    this.currentUserName = authState.username || 'Admin';
    this.currentRoleLabel = this.toRoleLabel(authState.roles[0]);
    this.canUseAiAssistant = this.permissionService.hasPermission(FunctionCode.AI_CHAT, ActionCode.CREATE);
    this.updatePageTitle(this.router.url);

    this.routerSub = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.updatePageTitle(event.urlAfterRedirects);
        this.closeOverlays();
      });
  }

  ngOnInit() {
    this.authSub = this.authService.currentUser$.subscribe((authState) => {
      this.currentUserName = authState.fullName || authState.username || 'Admin';
      this.currentAvatarUrl = authState.avatarUrl;
      this.currentRoleLabel = this.toRoleLabel(authState.roles[0]);
      this.cdr.markForCheck();
    });

    this.userService.getProfile().subscribe({
      next: (profile) => this.authService.updateCurrentUser(profile),
      error: () => this.cdr.markForCheck()
    });

    this.notificationConnectionSub = this.notificationService.connectionState$.subscribe((state) => {
      this.notificationConnectionState = state;
      this.cdr.markForCheck();
    });
    this.notificationConnectionErrorSub = this.notificationService.connectionError$.subscribe((message) => {
      this.notificationConnectionMessage = message;
      this.cdr.markForCheck();
    });
    this.notificationService.connect();
    
    // Tải thông báo cũ
    this.loadNotifications();

    // Lắng nghe thông báo mới realtime
    this.notifSub = this.notificationService.notifications$.subscribe((notif) => {
      const existingIndex = this.notifications.findIndex(item => item.id === notif.id);
      if (existingIndex >= 0) {
        this.notifications[existingIndex] = notif;
      } else {
        this.notifications.unshift(notif);
        this.notificationTotalElements += 1;
        if (!notif.isRead) this.unreadCount += 1;
      }
      
      // Hiển thị Toast
      this.messageService.add({
        severity: 'info',
        summary: notif.title,
        detail: notif.message,
        life: 5000
      });
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy() {
    this.notifSub?.unsubscribe();
    this.notificationConnectionSub?.unsubscribe();
    this.notificationConnectionErrorSub?.unsubscribe();
    this.authSub?.unsubscribe();
    this.routerSub?.unsubscribe();
    this.notificationService.disconnect();
  }

  get currentAvatarSrc(): string {
    if (this.currentAvatarUrl.startsWith('data:')) return this.currentAvatarUrl;
    if (this.currentAvatarUrl.startsWith('/')) {
      return `${this.apiOrigin}${this.currentAvatarUrl}`;
    }
    return '';
  }

  get currentUserInitials(): string {
    return (this.currentUserName || 'Admin')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase() || '')
      .join('');
  }

  loadNotifications(): void {
    this.notificationPage = 0;
    this.notificationsLoading = true;
    this.notificationsLoadingMore = false;
    this.notificationsError = '';
    this.notificationActionError = '';
    this.notificationService.getAdminNotifications(0, this.notificationPageSize).subscribe({
      next: (page) => {
        this.notifications = page.content;
        this.applyNotificationPage(page);
        this.notificationsLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.notificationsLoading = false;
        this.notificationsError = 'Không thể tải thông báo.';
        this.cdr.markForCheck();
      }
    });
  }

  loadMoreNotifications(): void {
    if (!this.notificationHasMore || this.notificationsLoading || this.notificationsLoadingMore) return;

    this.notificationsLoadingMore = true;
    this.notificationsError = '';
    this.notificationActionError = '';
    const nextPage = this.notificationPage + 1;
    this.notificationService.getAdminNotifications(nextPage, this.notificationPageSize).subscribe({
      next: (page) => {
        const knownIds = new Set(this.notifications.map(item => item.id));
        this.notifications = [
          ...this.notifications,
          ...page.content.filter(item => !knownIds.has(item.id)),
        ];
        this.applyNotificationPage(page);
        this.notificationsLoadingMore = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.notificationsLoadingMore = false;
        this.notificationActionError = 'Không thể tải thêm thông báo. Vui lòng thử lại.';
        this.cdr.markForCheck();
      },
    });
  }

  markAsRead(notif: AppNotification): void {
    if (!notif.isRead && !this.notificationMarkingIds.has(notif.id)) {
      this.notificationActionError = '';
      this.notificationMarkingIds.add(notif.id);
      this.notificationService.markAsRead(notif.id).subscribe({
        next: () => {
          notif.isRead = true;
          this.unreadCount = Math.max(0, this.unreadCount - 1);
          this.notificationMarkingIds.delete(notif.id);
          this.cdr.markForCheck();
        },
        error: (error: { error?: { code?: string } }) => {
          this.notificationMarkingIds.delete(notif.id);
          this.notificationActionError = error.error?.code === 'NOT_FOUND'
            ? 'Thông báo này không còn khả dụng trong lịch sử.'
            : 'Không thể đánh dấu thông báo đã đọc. Vui lòng thử lại.';
          this.cdr.markForCheck();
        },
      });
    }
  }

  markAllNotificationsAsRead(): void {
    if (this.unreadCount === 0 || this.notificationMarkingAll) return;
    this.notificationMarkingAll = true;
    this.notificationActionError = '';
    this.notificationService.markAllAsRead().subscribe({
      next: () => {
        this.notifications.forEach(item => item.isRead = true);
        this.unreadCount = 0;
        this.notificationMarkingAll = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.notificationMarkingAll = false;
        this.notificationActionError = 'Không thể đánh dấu tất cả thông báo. Vui lòng thử lại.';
        this.cdr.markForCheck();
      }
    });
  }

  openNotification(notif: AppNotification): void {
    const navigate = () => this.navigateToNotificationResource(notif);
    if (notif.isRead) { navigate(); return; }
    if (this.notificationMarkingIds.has(notif.id)) return;
    this.notificationMarkingIds.add(notif.id);
    this.notificationService.markAsRead(notif.id).subscribe({
      next: () => {
        notif.isRead = true;
        this.unreadCount = Math.max(0, this.unreadCount - 1);
        this.notificationMarkingIds.delete(notif.id);
        navigate();
      },
      error: () => {
        this.notificationMarkingIds.delete(notif.id);
        this.notificationActionError = 'Không thể mở thông báo. Vui lòng thử lại.';
        this.cdr.markForCheck();
      }
    });
  }

  private navigateToNotificationResource(notif: AppNotification): void {
    this.isNotificationOpen = false;
    if (notif.resourceType === 'SUPPORT_CONVERSATION' && notif.resourceId) {
      void this.router.navigate(['/admin/chat'], { queryParams: { conversationId: notif.resourceId } });
    }
  }

  private applyNotificationPage(page: NotificationHistoryPage): void {
    this.notificationPage = page.number;
    this.notificationTotalElements = page.totalElements;
    this.notificationHasMore = !page.last;
    this.notificationRetentionDays = page.retentionDays;
    this.unreadCount = page.unreadCount;
  }

  toggleSidebar(): void {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 991px)').matches) {
      this.isMobileSidebarOpen = !this.isMobileSidebarOpen;
      return;
    }
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
  }

  closeMobileNavigation(): void {
    this.isMobileSidebarOpen = false;
  }

  toggleNotifications(): void {
    this.isNotificationOpen = !this.isNotificationOpen;
    this.isUserMenuOpen = false;
  }

  toggleUserMenu(): void {
    this.isUserMenuOpen = !this.isUserMenuOpen;
    this.isNotificationOpen = false;
  }

  executeGlobalSearch(): void {
    const term = this.globalSearchTerm.trim().toLowerCase();
    if (!term) return;

    const match = this.quickLinks.find((link) => link.label.toLowerCase().includes(term));
    if (match) {
      this.router.navigate([match.url]);
      this.globalSearchTerm = '';
    }
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/admin/login']);
  }

  retryNotificationConnection(): void {
    this.notificationService.reconnect();
  }

  get notificationConnectionLabel(): string {
    switch (this.notificationConnectionState) {
      case 'connected': return 'Thông báo thời gian thực đã kết nối';
      case 'connecting': return 'Đang kết nối thông báo thời gian thực';
      case 'reconnecting': return 'Đang kết nối lại thông báo thời gian thực';
      case 'offline': return 'Thông báo thời gian thực đang ngoại tuyến';
      case 'error': return 'Kết nối thông báo thời gian thực gặp lỗi';
      default: return 'Thông báo thời gian thực chưa kết nối';
    }
  }

  viewProfile(): void {
    this.isUserMenuOpen = false;
    this.router.navigate(['/admin/profile']);
  }

  @HostListener('document:keydown.escape')
  closeOverlays(): void {
    this.isMobileSidebarOpen = false;
    this.isNotificationOpen = false;
    this.isUserMenuOpen = false;
  }

  private updatePageTitle(url: string): void {
    const normalizedUrl = url.split('?')[0];
    const match = [...this.quickLinks]
      .sort((left, right) => right.url.length - left.url.length)
      .find((link) => normalizedUrl.startsWith(link.url));
    this.pageTitle = match?.label || 'Bảng điều khiển';
  }

  private toRoleLabel(role?: string): string {
    const roleMap: Record<string, string> = {
      SUPER_ADMIN: 'Quản trị hệ thống',
      ADMIN: 'Quản trị viên',
      HOTEL_MANAGER: 'Quản lý khách sạn',
      RECEPTIONIST: 'Lễ tân',
      CUSTOMER: 'Khách hàng',
    };
    return role ? roleMap[role] || role : 'Quản trị hệ thống';
  }
}
