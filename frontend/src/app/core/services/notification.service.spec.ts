import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { AuthService } from './auth';
import { ClientObservabilityService } from './client-observability.service';
import { NotificationHistoryPage, NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService; let http: HttpTestingController; let token: string | null; let logout$: Subject<void>;
  beforeEach(() => {
    token = 'notification-token'; logout$ = new Subject<void>();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: { getAccessToken: () => token, logout$ } },
      { provide: ClientObservabilityService, useValue: { createCorrelationId: () => 'notification-correlation', recordStompFailure: vi.fn() } }] });
    service = TestBed.inject(NotificationService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); vi.restoreAllMocks(); TestBed.resetTestingModule(); });

  it('loads a bounded page of retained notification history', () => {
    let result: NotificationHistoryPage | undefined; service.getAdminNotifications(2, 25).subscribe(page => result = page);
    const request = http.expectOne(req => req.url === '/api/notifications');
    expect(request.request.params.get('page')).toBe('2'); expect(request.request.params.get('size')).toBe('25');
    request.flush({ content: [], totalElements: 0, totalPages: 0, number: 2, size: 25, first: false, last: true, unreadCount: 0, retentionDays: 90 });
    expect(result?.retentionDays).toBe(90);
  });

  it('marks a notification through the ownership-protected REST endpoint', () => {
    service.markAsRead('notification-id').subscribe(); const request = http.expectOne('/api/notifications/notification-id/read');
    expect(request.request.method).toBe('POST'); request.flush(null);
  });

  it('marks all notifications through the ownership-protected bulk endpoint', () => {
    service.markAllAsRead().subscribe(); const request = http.expectOne('/api/notifications/read-all');
    expect(request.request.method).toBe('POST'); request.flush(null);
  });

  it('polls retained notifications and emits only new rows', () => {
    const received: string[] = []; vi.useFakeTimers(); service.notifications$.subscribe(item => received.push(item.title)); service.connect();
    const initial = http.expectOne(req => req.url === '/api/notifications' && req.params.get('page') === '0');
    const page = (content: unknown[]): NotificationHistoryPage => ({ content: content as any, totalElements: content.length, totalPages: 1, number: 0, size: 20, first: true, last: true, unreadCount: content.length, retentionDays: 90 });
    initial.flush(page([{ id: 'n1', title: 'Đã có', userId: 'u1', type: 'TEST', message: 'A', isRead: false, createdAt: '2026-01-01T00:00:00Z' }]));
    expect(received).toEqual([]); vi.advanceTimersByTime(15_000);
    const refresh = http.expectOne(req => req.url === '/api/notifications' && req.params.get('page') === '0');
    refresh.flush(page([{ id: 'n2', title: 'Mới', userId: 'u1', type: 'TEST', message: 'B', isRead: false, createdAt: '2026-01-02T00:00:00Z' }, { id: 'n1', title: 'Đã có', userId: 'u1', type: 'TEST', message: 'A', isRead: false, createdAt: '2026-01-01T00:00:00Z' }]));
    expect(received).toEqual(['Mới']); vi.useRealTimers();
  });

  it('does not connect without a valid token', () => { token = null; const states: string[] = []; service.connectionState$.subscribe(state => states.push(state)); service.connect(); expect(states.at(-1)).toBe('error'); });
});
