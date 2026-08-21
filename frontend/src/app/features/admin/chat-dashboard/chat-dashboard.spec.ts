import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChatDashboardComponent } from './chat-dashboard';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, Subject } from 'rxjs';
import { AuthService } from '../../../core/services/auth';
import { ChatService } from '../../../core/services/chat.service';
import { PermissionService } from '../../../core/services/permission.service';
import { ActivatedRoute } from '@angular/router';

describe('ChatDashboard', () => {
  let component: ChatDashboardComponent;
  let fixture: ComponentFixture<ChatDashboardComponent>;
  const getSupportConversations = vi.fn(() => of([]));
  const assignConversation = vi.fn((conversationId: string | number) => of({
    conversationId, customerId: 'customer-id', customerName: 'Khách hàng', propertyName: 'LuxeStay',
    channel: 'IN_APP' as const, subject: 'Hỗ trợ', status: 'ASSIGNED' as const, lastMessage: '', version: 2
  }));

  beforeEach(async () => {
    getSupportConversations.mockClear();
    assignConversation.mockClear();
    await TestBed.configureTestingModule({
      imports: [ChatDashboardComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: {
            getCurrentUserId: () => 7,
            getAccessToken: () => 'test-token',
          }
        },
        { provide: PermissionService, useValue: { hasPermission: () => true } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
        {
          provide: ChatService,
          useValue: {
            connect: () => undefined,
            disconnect: () => undefined,
            message$: new Subject(),
            connectionState$: of('idle'),
            connectionError$: of(''),
            getSupportConversations,
            getSupportHistory: () => of([]),
            assignConversation,
            closeConversation: vi.fn(),
            reopenConversation: vi.fn(),
            isConnected: () => false,
          }
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ChatDashboardComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('does not fail before a conversation body is mounted', () => {
    expect(() => component.scrollToBottom()).not.toThrow();
  });

  it('refreshes the platform support queue in the background', () => {
    vi.useFakeTimers();
    getSupportConversations.mockClear();
    (component as unknown as { startBackgroundSync(): void }).startBackgroundSync();

    vi.advanceTimersByTime(15_000);

    expect(getSupportConversations).toHaveBeenCalledOnce();
    expect(component.conversationState()).toBe('ready');
    vi.useRealTimers();
  });

  it('assigns an open conversation with its optimistic version', () => {
    component.conversations.set([{
      conversationId: 'conversation-id', customerId: 'customer-id', customerName: 'Khách hàng', propertyName: 'LuxeStay',
      channel: 'IN_APP', subject: 'Hỗ trợ', status: 'OPEN', lastMessage: '', version: 1
    }]);
    component.selectedConversationId.set('conversation-id');

    component.assignSelected();

    expect(assignConversation).toHaveBeenCalledWith('conversation-id', 1);
    expect(component.getConversation('conversation-id')?.status).toBe('ASSIGNED');
  });
});
