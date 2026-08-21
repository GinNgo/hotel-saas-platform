import { ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, EMPTY, of, Subject, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';

import { AuthService } from '../../core/services/auth';
import {
  AppNotification,
  NotificationConnectionState,
  NotificationHistoryPage,
  NotificationService,
} from '../../core/services/notification.service';
import { UserService } from '../../core/services/user';
import { AdminLayout } from './admin-layout';

describe('AdminLayout notification history', () => {
  let notificationService: {
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    reconnect: ReturnType<typeof vi.fn>;
    getAdminNotifications: ReturnType<typeof vi.fn>;
    markAsRead: ReturnType<typeof vi.fn>;
    markAllAsRead: ReturnType<typeof vi.fn>;
    notifications$: Subject<AppNotification>;
    connectionState$: BehaviorSubject<NotificationConnectionState>;
    connectionError$: BehaviorSubject<string>;
  };
  let component: AdminLayout;

  beforeEach(() => {
    notificationService = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      reconnect: vi.fn(),
      getAdminNotifications: vi.fn().mockReturnValue(of(page([]))),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      notifications$: new Subject<AppNotification>(),
      connectionState$: new BehaviorSubject<NotificationConnectionState>('idle'),
      connectionError$: new BehaviorSubject<string>(''),
    };

    const authService = {
      getAuthState: () => ({ username: 'admin', fullName: 'Admin', avatarUrl: '', roles: ['ADMIN'] }),
      currentUser$: EMPTY,
      updateCurrentUser: vi.fn(),
      logout: vi.fn(),
    };
    const userService = { getProfile: () => EMPTY };
    const router = { url: '/admin/dashboard', events: EMPTY, navigate: vi.fn() };
    const messageService = { add: vi.fn() };
    const cdr = { markForCheck: vi.fn() };

    component = new AdminLayout(
      authService as unknown as AuthService,
      userService as unknown as UserService,
      router as unknown as Router,
      notificationService as unknown as NotificationService,
      messageService as unknown as MessageService,
      cdr as unknown as ChangeDetectorRef,
    );
  });

  it('loads the first retained page and uses the server unread count', () => {
    notificationService.getAdminNotifications.mockReturnValue(of(page([
      notification(3, false),
      notification(2, true),
    ], { unreadCount: 7, totalElements: 3, totalPages: 2, last: false })));

    component.loadNotifications();

    expect(notificationService.getAdminNotifications).toHaveBeenCalledWith(0, 20);
    expect(component.notifications.map(item => item.id)).toEqual([3, 2]);
    expect(component.unreadCount).toBe(7);
    expect(component.notificationHasMore).toBe(true);
    expect(component.notificationRetentionDays).toBe(90);
  });

  it('appends the next history page without duplicating realtime rows', () => {
    notificationService.getAdminNotifications
      .mockReturnValueOnce(of(page([notification(3, false), notification(2, true)], {
        totalElements: 3, totalPages: 2, last: false,
      })))
      .mockReturnValueOnce(of(page([notification(2, true), notification(1, false)], {
        number: 1, totalElements: 3, totalPages: 2, last: true,
      })));

    component.loadNotifications();
    component.loadMoreNotifications();

    expect(notificationService.getAdminNotifications).toHaveBeenLastCalledWith(1, 20);
    expect(component.notifications.map(item => item.id)).toEqual([3, 2, 1]);
    expect(component.notificationHasMore).toBe(false);
  });

  it('keeps unread state and exposes a recoverable error when mark-read fails', () => {
    const item = notification(9, false);
    component.notifications = [item];
    component.unreadCount = 1;
    notificationService.markAsRead.mockReturnValue(throwError(() => ({ error: { code: 'NOT_FOUND' } })));

    component.markAsRead(item);

    expect(item.isRead).toBe(false);
    expect(component.unreadCount).toBe(1);
    expect(component.notificationActionError).toContain('không còn khả dụng');
    expect(component.notificationMarkingIds.has(9)).toBe(false);
  });

  it('marks one row once and decrements the retained unread count', () => {
    const item = notification(9, false);
    component.notifications = [item];
    component.unreadCount = 4;
    notificationService.markAsRead.mockReturnValue(of(void 0));

    component.markAsRead(item);
    component.markAsRead(item);

    expect(notificationService.markAsRead).toHaveBeenCalledTimes(1);
    expect(item.isRead).toBe(true);
    expect(component.unreadCount).toBe(3);
  });

  it('marks every loaded notification as read through the bulk endpoint', () => {
    component.notifications = [notification(1, false), notification(2, false)];
    component.unreadCount = 2;
    notificationService.markAllAsRead.mockReturnValue(of(void 0));

    component.markAllNotificationsAsRead();

    expect(notificationService.markAllAsRead).toHaveBeenCalledOnce();
    expect(component.notifications.every(item => item.isRead)).toBe(true);
    expect(component.unreadCount).toBe(0);
  });

  it('opens a support notification at the authoritative conversation', () => {
    const item = { ...notification(4, true), resourceType: 'SUPPORT_CONVERSATION', resourceId: 'conversation-guid' };

    component.openNotification(item);

    expect((component as any).router.navigate).toHaveBeenCalledWith(['/admin/chat'], { queryParams: { conversationId: 'conversation-guid' } });
  });

  it('surfaces offline notification state and lets the admin retry the socket', () => {
    component.ngOnInit();
    notificationService.connectionState$.next('offline');
    notificationService.connectionError$.next('Mất kết nối mạng.');

    component.retryNotificationConnection();

    expect(component.notificationConnectionState).toBe('offline');
    expect(component.notificationConnectionMessage).toBe('Mất kết nối mạng.');
    expect(component.notificationConnectionLabel).toContain('ngoại tuyến');
    expect(notificationService.reconnect).toHaveBeenCalledOnce();
    component.ngOnDestroy();
  });
});

function notification(id: number, isRead: boolean): AppNotification {
  return {
    id,
    userId: 7,
    type: 'SYSTEM',
    title: `Notification ${id}`,
    message: `Message ${id}`,
    isRead,
    createdAt: `2026-08-04T10:0${id}:00`,
  };
}

function page(
  content: AppNotification[],
  overrides: Partial<NotificationHistoryPage> = {},
): NotificationHistoryPage {
  return {
    content,
    totalElements: content.length,
    totalPages: 1,
    number: 0,
    size: 20,
    first: true,
    last: true,
    unreadCount: content.filter(item => !item.isRead).length,
    retentionDays: 90,
    ...overrides,
  };
}
