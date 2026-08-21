import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { provideRouter } from '@angular/router';

import { ChatWidgetComponent } from './chat-widget';
import { ChatService } from '../../../core/services/chat.service';
import { AuthService } from '../../../core/services/auth';
import { AiService } from '../../../core/services/ai';
import { ClientApiService } from '../../../core/services/client-api.service';

describe('ChatWidget', () => {
  let component: ChatWidgetComponent;
  let fixture: ComponentFixture<ChatWidgetComponent>;
  let authState$: BehaviorSubject<{ isAuthenticated: boolean }>;
  let currentUserId: string | number | null;
  let chatService: {
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    getMyHistory: ReturnType<typeof vi.fn>;
    createCustomerSupportMessage: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    authState$ = new BehaviorSubject<{ isAuthenticated: boolean }>({ isAuthenticated: true });
    currentUserId = 42;
    chatService = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      getMyHistory: vi.fn(() => of([])),
      createCustomerSupportMessage: vi.fn((content: string) => of({ id: 'message-id', conversationId: 'conversation-id', senderId: currentUserId!, content })),
    };
    await TestBed.configureTestingModule({
      imports: [ChatWidgetComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            currentUser$: authState$,
            getCurrentUserId: () => currentUserId,
            getAccessToken: () => 'test-token',
          }
        },
        {
          provide: ChatService,
          useValue: {
            ...chatService,
            message$: new Subject(),
            connectionState$: of('idle'),
            connectionError$: of(''),
            isConnected: () => false,
          }
        },
        {
          provide: AiService,
          useValue: {
            customerChatStream: vi.fn(() => of('Gợi ý ', 'từ AI')),
            customerChat: vi.fn(() => of({ reply: 'Gợi ý từ AI' }))
          }
        },
        {
          provide: ClientApiService,
          useValue: {
            searchHotels: vi.fn(() => of({
              content: [{
                id: 99,
                name: 'LuxeStay Riverside',
                addressLine: 'Quận 1',
                starRating: 4,
                latitude: 0,
                longitude: 0,
                thumbnailUrl: '/hotel.webp',
                propertyType: 'HOTEL',
                pricing: { nightlyPrice: 2_000_000, discountedPrice: 1_800_000, numberOfNights: 1, taxAmount: 0, feeAmount: 0, totalAmount: 1_800_000, currency: 'VND' }
              }],
              totalElements: 1,
              totalPages: 1,
              number: 1,
              size: 3
            }))
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ChatWidgetComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('does not fail when the chat body is not mounted', () => {
    expect(() => component.scrollToBottom()).not.toThrow();
  });

  it('exposes dialog semantics and sends human support through REST', () => {
    component.toggleChat();
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(panel?.getAttribute('aria-labelledby')).toBe('support-chat-title');
    expect(fixture.nativeElement.querySelector('.close-button')?.getAttribute('aria-label')).toContain('Đóng');

    component.newMessage = 'hello';
    component.switchMode('human');
    component.sendMessage();

    expect(chatService.createCustomerSupportMessage).toHaveBeenCalledWith('hello');
    expect(component.messages()).toHaveLength(1);
    expect(component.sendError()).toBe('');
  });

  it('uses AI concierge before human support', () => {
    component.toggleChat();
    component.newMessage = 'Tư vấn điểm đến';

    component.sendMessage();

    expect(component.aiMessages().at(-1)?.text).toBe('Gợi ý từ AI');
    expect(component.aiTyping()).toBe(false);
  });

  it('keeps human support input enabled while an AI response is still streaming', () => {
    component.toggleChat();
    component.aiTyping.set(true);
    component.switchMode('human');
    component.connectionState.set('connected');
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('#support-message');
    expect(input.disabled).toBe(false);
  });

  it('shows the animated three-dot indicator while AI is responding', () => {
    component.toggleChat();
    component.aiTyping.set(true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.ai-typing-dot')).toHaveLength(3);
    expect(fixture.nativeElement.querySelector('.ai-thinking')?.getAttribute('aria-label'))
      .toBe('AI đang chuẩn bị tư vấn');
  });

  it('routes AI recommendations to search with extracted filters', () => {
    component.toggleChat();
    component.newMessage = 'Tìm phòng ở Hà Nội cho 2 người, ngân sách 3 triệu';

    component.sendMessage();
    fixture.detectChanges();

    const recommendation = component.aiMessages().at(-1);
    expect(recommendation?.searchParams).toMatchObject({
      keyword: 'Hà Nội',
      displayLocation: 'Hà Nội',
      adultCount: 2,
      roomCount: 1,
      maxPrice: 3_000_000,
      sortBy: 'POPULAR'
    });
    const action = fixture.nativeElement.querySelector('.ai-search-action');
    expect(action?.textContent).toContain('Xem phòng phù hợp với yêu cầu');
    expect(action?.getAttribute('href')).toContain('/search');
    expect(action?.getAttribute('href')).toContain('maxPrice=3000000');
    const propertyCard = fixture.nativeElement.querySelector('.ai-property-card');
    expect(propertyCard?.textContent).toContain('LuxeStay Riverside');
    expect(propertyCard?.getAttribute('href')).toContain('/hotel/99');
  });

  it('does not show a search action for a generic greeting', () => {
    component.toggleChat();
    component.newMessage = 'Xin chào';

    component.sendMessage();
    fixture.detectChanges();

    expect(component.aiMessages().at(-1)?.searchParams).toBeUndefined();
    expect(fixture.nativeElement.querySelector('.ai-search-action')).toBeNull();
  });

  it('formats safe AI markdown into readable sections', () => {
    const html = component.formatAiMessage('**Loại phòng**\n1. Family Suite\n- Gần trung tâm');

    expect(html).toContain('<strong>Loại phòng</strong>');
    expect(html).toContain('ai-copy-item');
    expect(html).not.toContain('**');
  });

  it('activates chat when the persistent client layout receives a login update', () => {
    authState$.next({ isAuthenticated: false });
    fixture.detectChanges();
    chatService.connect.mockClear();
    chatService.getMyHistory.mockClear();

    currentUserId = 84;
    authState$.next({ isAuthenticated: true });
    fixture.detectChanges();

    expect(component.isLoggedIn()).toBe(true);
    expect(component.currentUserId()).toBe(84);
    expect(component.connectionState()).toBe('connected');
    expect(chatService.connect).not.toHaveBeenCalled();
    expect(chatService.getMyHistory).toHaveBeenCalledOnce();
  });

  it('refreshes human support history in the background without resetting the loading state', () => {
    vi.useFakeTimers();
    chatService.getMyHistory.mockClear();
    (component as unknown as { startBackgroundSync(): void }).startBackgroundSync();

    vi.advanceTimersByTime(15_000);

    expect(chatService.getMyHistory).toHaveBeenCalledOnce();
    expect(component.historyState()).toBe('ready');
    vi.useRealTimers();
  });
});
