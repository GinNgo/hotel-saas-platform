import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Inject, Injectable, NgZone, OnDestroy, PLATFORM_ID } from '@angular/core';
import { BehaviorSubject, fromEvent, Observable, Subject, Subscription } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from './auth';

export interface AppNotification {
  id: string | number;
  userId: string | number | null;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  resourceType?: string;
  resourceId?: string | number;
}

export interface NotificationHistoryPage {
  content: AppNotification[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
  first: boolean;
  last: boolean;
  unreadCount: number;
  retentionDays: number;
}

export type NotificationConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'error';

@Injectable({ providedIn: 'root' })
export class NotificationService implements OnDestroy {
  private readonly apiUrl = `${environment.apiUrl}/notifications`;
  private readonly notificationSubject = new Subject<AppNotification>();
  private readonly connectionStateSubject = new BehaviorSubject<NotificationConnectionState>('idle');
  private readonly connectionErrorSubject = new BehaviorSubject('');
  private readonly subscriptions = new Subscription();
  private readonly knownNotificationIds = new Set<string | number>();
  private readonly browserPlatform: boolean;
  private pollingId?: ReturnType<typeof setInterval>;
  private reconnectRequested = false;

  readonly notifications$ = this.notificationSubject.asObservable();
  readonly connectionState$ = this.connectionStateSubject.asObservable();
  readonly connectionError$ = this.connectionErrorSubject.asObservable();

  constructor(
    private readonly http: HttpClient,
    private readonly ngZone: NgZone,
    private readonly authService: AuthService,
    @Inject(PLATFORM_ID) platformId: object,
  ) {
    this.browserPlatform = isPlatformBrowser(platformId);
    this.subscriptions.add(this.authService.logout$.subscribe(() => this.disconnect()));
    if (this.browserPlatform) {
      this.subscriptions.add(fromEvent(window, 'offline').subscribe(() => {
        if (this.reconnectRequested) this.setState('offline', 'Mất kết nối mạng. Thông báo sẽ đồng bộ lại khi có mạng.');
      }));
      this.subscriptions.add(fromEvent(window, 'online').subscribe(() => {
        if (this.reconnectRequested) this.reconnect();
      }));
    }
  }

  connect(): void {
    this.reconnectRequested = true;
    if (!this.isOnline()) {
      this.setState('offline', 'Mất kết nối mạng. Thông báo sẽ đồng bộ lại khi có mạng.');
      return;
    }
    if (!this.authService.getAccessToken()) {
      this.setState('error', 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }
    if (this.pollingId !== undefined) return;
    this.setState('connecting', 'Đang đồng bộ thông báo...');
    this.poll(false);
    this.pollingId = setInterval(() => {
      if (globalThis.document?.visibilityState !== 'hidden' && this.isOnline()) this.poll(true);
    }, 15_000);
  }

  reconnect(): void {
    const shouldReconnect = this.reconnectRequested;
    this.stopPolling();
    this.reconnectRequested = shouldReconnect;
    if (shouldReconnect) this.connect();
  }

  disconnect(): void {
    this.reconnectRequested = false;
    this.stopPolling();
    this.knownNotificationIds.clear();
    this.setState('idle', '');
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.disconnect();
  }

  getAdminNotifications(page = 0, size = 20): Observable<NotificationHistoryPage> {
    return this.http.get<NotificationHistoryPage>(this.apiUrl, { params: { page, size } });
  }

  markAsRead(id: string | number): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/${id}/read`, {});
  }

  markAllAsRead(): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/read-all`, {});
  }

  private poll(emitNew: boolean): void {
    this.getAdminNotifications(0, 20).subscribe({
      next: (page) => {
        for (const item of [...page.content].reverse()) {
          if (emitNew && !this.knownNotificationIds.has(item.id)) this.notificationSubject.next(item);
          this.knownNotificationIds.add(item.id);
        }
        this.setState('connected', '');
      },
      error: () => this.setState('error', 'Không thể đồng bộ thông báo. Hệ thống sẽ tự thử lại.')
    });
  }

  private stopPolling(): void {
    if (this.pollingId !== undefined) {
      clearInterval(this.pollingId);
      this.pollingId = undefined;
    }
  }

  private isOnline(): boolean {
    return !this.browserPlatform || navigator.onLine;
  }

  private setState(state: NotificationConnectionState, message: string): void {
    this.ngZone.run(() => {
      this.connectionStateSubject.next(state);
      this.connectionErrorSubject.next(message);
    });
  }
}
