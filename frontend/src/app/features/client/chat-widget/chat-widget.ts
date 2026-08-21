import { CommonModule } from '@angular/common';
import {
  AfterViewChecked,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  signal
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timeout } from 'rxjs';

import {
  ChatConnectionState,
  ChatMessage,
  ChatService
} from '../../../core/services/chat.service';
import { AuthService } from '../../../core/services/auth';
import { PublicI18nService } from '../../../core/i18n/public-i18n.service';
import { AiService, ChatHistoryMessage } from '../../../core/services/ai';
import { ClientApiService, Hotel } from '../../../core/services/client-api.service';
import { ImageFallbackService } from '../../../core/services/image-fallback.service';

const AI_TIMEOUT_MS = 30_000;
const CHAT_SYNC_INTERVAL_MS = 15_000;

interface AiWidgetMessage {
  sender: 'user' | 'ai';
  text: string;
  time: Date;
  searchParams?: Record<string, string | number>;
  suggestedProperties?: Hotel[];
}

const DESTINATIONS = [
  'Hà Nội', 'Hồ Chí Minh', 'TP.HCM', 'Sài Gòn', 'Đà Nẵng', 'Đà Lạt',
  'Nha Trang', 'Phú Quốc', 'Vũng Tàu', 'Hội An', 'Huế', 'Hạ Long',
  'Cần Thơ', 'Quy Nhơn', 'Sapa', 'Sa Pa', 'Mũi Né', 'Phan Thiết'
];

@Component({
  selector: 'app-chat-widget',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './chat-widget.html',
  styleUrl: './chat-widget.css'
})
export class ChatWidgetComponent implements OnInit, OnDestroy, AfterViewChecked {
  private readonly chatService = inject(ChatService);
  private readonly authService = inject(AuthService);
  private readonly aiService = inject(AiService);
  private readonly clientApi = inject(ClientApiService);
  private readonly imageFallback = inject(ImageFallbackService);
  private readonly destroyRef = inject(DestroyRef);
  readonly i18n = inject(PublicI18nService);

  @ViewChild('scrollMe') private scrollContainer?: ElementRef<HTMLElement>;
  @ViewChild('triggerButton') private triggerButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('messageInput') private messageInput?: ElementRef<HTMLInputElement>;

  readonly isOpen = signal(false);
  readonly isLoggedIn = signal(false);
  readonly currentUserId = signal<string | number | null>(null);
  readonly messages = signal<ChatMessage[]>([]);
  readonly historyState = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly historyError = signal('');
  readonly connectionState = signal<ChatConnectionState>('idle');
  readonly connectionError = signal('');
  readonly isSending = signal(false);
  readonly sendError = signal('');
  readonly mode = signal<'ai' | 'human'>('ai');
  readonly aiMessages = signal<AiWidgetMessage[]>([]);
  readonly aiTyping = signal(false);
  readonly aiError = signal('');

  newMessage = '';
  private renderedMessageCount = 0;
  private sendTimeoutId?: ReturnType<typeof setTimeout>;
  private syncIntervalId?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.chatService.message$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((message) => this.handleIncomingMessage(message));
    this.chatService.connectionState$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => this.connectionState.set(state));
    this.chatService.connectionError$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((error) => this.connectionError.set(error));

    this.authService.currentUser$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => this.handleAuthChange(state.isAuthenticated));
  }

  ngOnDestroy(): void {
    this.clearSendTimeout();
    this.stopBackgroundSync();
    this.chatService.disconnect();
  }

  ngAfterViewChecked(): void {
    if (this.messages().length !== this.renderedMessageCount) {
      this.renderedMessageCount = this.messages().length;
      this.scrollToBottom();
    }
  }

  scrollToBottom(): void {
    const container = this.scrollContainer?.nativeElement;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }

  loadHistory(): void {
    if (!this.isLoggedIn() || this.historyState() === 'loading') return;
    this.historyState.set('loading');
    this.historyError.set('');

    this.chatService.getMyHistory().subscribe({
      next: (messages) => {
        this.messages.set(messages);
        this.historyState.set('ready');
      },
      error: () => {
        this.historyState.set('error');
        this.historyError.set(this.i18n.text('PUBLIC.SUPPORT.LOADING_HISTORY'));
      }
    });
  }

  toggleChat(): void {
    if (this.isOpen()) {
      this.closeChat();
      return;
    }

    this.isOpen.set(true);
    this.ensureAiGreeting();
    queueMicrotask(() => this.messageInput?.nativeElement.focus());
  }

  @HostListener('document:keydown.escape')
  closeChat(): void {
    if (!this.isOpen()) return;
    this.isOpen.set(false);
    queueMicrotask(() => this.triggerButton?.nativeElement.focus());
  }

  retryConnection(): void {
    this.sendError.set('');
    this.connectionState.set('connected');
    this.loadHistory();
    this.startBackgroundSync();
  }

  sendMessage(): void {
    const content = this.newMessage.trim();
    if (!content || this.isSending()) return;

    if (this.mode() === 'ai') {
      this.sendAiMessage(content);
      return;
    }

    this.sendError.set('');
    this.isSending.set(true);
    this.chatService.createCustomerSupportMessage(content).subscribe({
      next: (message) => {
        this.handleIncomingMessage(message);
        this.newMessage = '';
        this.isSending.set(false);
      },
      error: () => {
        this.isSending.set(false);
        this.sendError.set(this.i18n.text('PUBLIC.SUPPORT.SEND_ERROR'));
      }
    });
  }

  connectionLabel(): string {
    switch (this.connectionState()) {
      case 'connected': return this.i18n.text('PUBLIC.SUPPORT.CONNECTED');
      case 'connecting': return this.i18n.text('PUBLIC.SUPPORT.CONNECTING');
      case 'reconnecting': return this.i18n.text('PUBLIC.SUPPORT.RECONNECTING');
      case 'error': return this.i18n.text('PUBLIC.SUPPORT.DISCONNECTED');
      default: return this.i18n.text('PUBLIC.SUPPORT.NOT_CONNECTED');
    }
  }

  isOwnMessage(message: ChatMessage): boolean {
    return message.senderId === this.currentUserId();
  }

  private handleIncomingMessage(message: ChatMessage | null): void {
    if (!message) return;
    const userId = this.currentUserId();
    if (message.senderId !== userId && message.receiverId !== userId) return;

    this.messages.update((messages) => {
      if (message.id && messages.some((item) => item.id === message.id)) return messages;
      return [...messages, message];
    });

    if (message.senderId === userId) {
      this.isSending.set(false);
      this.clearSendTimeout();
    }
  }

  switchMode(mode: 'ai' | 'human'): void {
    this.mode.set(mode);
    this.sendError.set('');
    this.aiError.set('');
    if (mode === 'ai') this.ensureAiGreeting();
    queueMicrotask(() => this.messageInput?.nativeElement.focus());
  }

  useSuggestion(message: string): void {
    if (this.aiTyping()) return;
    this.newMessage = message;
    this.sendMessage();
  }

  formatAiMessage(text: string): string {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const inline = (value: string) => value.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    return escaped.split(/\r?\n/).map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '<span class="ai-copy-spacer"></span>';

      const bullet = trimmed.match(/^[-*]\s+(.+)$/);
      if (bullet) return `<span class="ai-copy-item"><span aria-hidden="true">•</span>${inline(bullet[1])}</span>`;

      const numbered = trimmed.match(/^(\d+[.)])\s+(.+)$/);
      if (numbered) return `<span class="ai-copy-item"><strong>${numbered[1]}</strong>${inline(numbered[2])}</span>`;

      return `<span class="ai-copy-line">${inline(trimmed)}</span>`;
    }).join('');
  }

  propertyImage(property: Hotel): string {
    return property.thumbnailUrl || property.mainImageUrl || property.mainImage
      || this.imageFallback.property(property.propertyType);
  }

  propertyPrice(property: Hotel): number | null {
    return property.pricing?.discountedNightlyPrice
      ?? property.pricing?.discountedPrice
      ?? property.pricing?.nightlyPrice
      ?? property.startingPrice
      ?? null;
  }

  handlePropertyImageError(event: Event, property: Hotel): void {
    this.imageFallback.replace(event, this.imageFallback.property(property.propertyType));
  }

  private sendAiMessage(content: string): void {
    if (this.aiTyping()) return;
    const existing = this.aiMessages();
    const firstUserIndex = existing.findIndex((message) => message.sender === 'user');
    const history = (firstUserIndex >= 0 ? existing.slice(firstUserIndex) : [])
      .slice(-10)
      .map<ChatHistoryMessage>((message) => ({ role: message.sender, text: message.text }));

    this.newMessage = '';
    this.aiError.set('');
    this.aiTyping.set(true);
    this.aiMessages.update((messages) => [...messages, { sender: 'user', text: content, time: new Date() }]);

    let receivedChunk = false;
    const searchParams = this.buildSearchParams([...history, { role: 'user', text: content }]);
    let suggestedProperties: Hotel[] = [];
    if (searchParams) this.loadSuggestedProperties(searchParams, (items) => suggestedProperties = items);
    this.aiService.customerChatStream(content, history, this.authService.getAccessToken()).pipe(
      timeout(AI_TIMEOUT_MS),
    ).subscribe({
      next: (chunk) => {
        if (!receivedChunk) {
          receivedChunk = true;
          this.aiMessages.update((messages) => [
            ...messages,
            { sender: 'ai', text: chunk, time: new Date(), searchParams, suggestedProperties }
          ]);
          return;
        }
        this.aiMessages.update((messages) => messages.map((message, index) =>
          index === messages.length - 1 ? { ...message, text: message.text + chunk } : message
        ));
      },
      complete: () => {
        if (receivedChunk) {
          this.aiTyping.set(false);
        } else {
          this.sendAiFallback(content, history, searchParams);
        }
      },
      error: () => {
        if (receivedChunk) {
          this.aiTyping.set(false);
          this.aiError.set('Kết nối AI bị gián đoạn. Bạn có thể gửi lại câu hỏi để tiếp tục.');
        } else {
          this.sendAiFallback(content, history, searchParams);
        }
      }
    });
  }

  private sendAiFallback(
    content: string,
    history: ChatHistoryMessage[],
    searchParams?: Record<string, string | number>
  ): void {
    this.aiService.customerChat(content, history).pipe(timeout(AI_TIMEOUT_MS)).subscribe({
      next: (response) => {
        const reply = response.reply?.trim();
        if (reply) {
          this.aiMessages.update((messages) => [
            ...messages,
            { sender: 'ai', text: reply, time: new Date(), searchParams }
          ]);
        } else {
          this.aiError.set('AI chưa thể trả lời lúc này. Bạn có thể chuyển sang gặp nhân viên.');
        }
        this.aiTyping.set(false);
      },
      error: () => {
        this.aiTyping.set(false);
        this.aiError.set('AI đang bận hoặc chưa được cấu hình. Bạn có thể chuyển sang gặp nhân viên.');
      }
    });
  }

  private loadSuggestedProperties(
    searchParams: Record<string, string | number>,
    capture: (items: Hotel[]) => void
  ): void {
    this.clientApi.searchHotels({ ...searchParams, pageNumber: 1, pageSize: 3 }).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (page) => {
        const items = page.content.slice(0, 3);
        capture(items);
        this.aiMessages.update((messages) => messages.map((message, index) =>
          index === messages.length - 1 && message.sender === 'ai' && message.searchParams === searchParams
            ? { ...message, suggestedProperties: items }
            : message
        ));
      },
      error: () => capture([])
    });
  }

  private ensureAiGreeting(): void {
    if (this.aiMessages().length > 0) return;
    this.aiMessages.set([{
      sender: 'ai',
      text: 'Xin chào! Tôi có thể tư vấn điểm đến, khu vực lưu trú, loại phòng và giúp bạn chuẩn bị thông tin trước khi gặp nhân viên.',
      time: new Date(),
    }]);
  }

  private buildSearchParams(history: ChatHistoryMessage[]): Record<string, string | number> | undefined {
    const text = history
      .filter((message) => message.role === 'user')
      .map((message) => message.text)
      .join(' ');
    const normalized = this.normalizeVietnamese(text);
    const params: Record<string, string | number> = {
      adultCount: 1,
      childCount: 0,
      roomCount: 1,
      sortBy: 'POPULAR'
    };

    const guestMatch = normalized.match(/(\d{1,2})\s*(?:nguoi|khach|adult)/i);
    if (guestMatch) params['adultCount'] = Number(guestMatch[1]);

    const roomMatch = normalized.match(/(\d{1,2})\s*(?:phong|room)/i);
    if (roomMatch) params['roomCount'] = Number(roomMatch[1]);

    const millionMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*(?:trieu|tr)/i);
    const thousandMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*(?:nghin|ngan|k)\b/i);
    const plainBudgetMatch = normalized.match(/(?:ngan sach|gia|toi da|max)\D{0,12}(\d{6,9})\b/i);
    if (millionMatch) {
      params['maxPrice'] = Math.round(Number(millionMatch[1].replace(',', '.')) * 1_000_000);
    } else if (thousandMatch) {
      params['maxPrice'] = Math.round(Number(thousandMatch[1].replace(',', '.')) * 1_000);
    } else if (plainBudgetMatch) {
      params['maxPrice'] = Number(plainBudgetMatch[1]);
    }

    const destination = DESTINATIONS.find((item) => normalized.includes(this.normalizeVietnamese(item)));
    if (destination) {
      params['keyword'] = destination;
      params['displayLocation'] = destination;
    }

    const hasUsefulCriteria = Boolean(destination || guestMatch || roomMatch || millionMatch || thousandMatch || plainBudgetMatch);
    return hasUsefulCriteria ? params : undefined;
  }

  private normalizeVietnamese(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase();
  }

  private handleAuthChange(isAuthenticated: boolean): void {
    const userId = isAuthenticated ? this.authService.getCurrentUserId() : null;
    const loggedIn = isAuthenticated && userId !== null;

    if (loggedIn === this.isLoggedIn() && userId === this.currentUserId()) return;

    this.currentUserId.set(userId);
    this.isLoggedIn.set(loggedIn);
    this.messages.set([]);
    this.historyState.set('idle');
    this.historyError.set('');
    this.connectionError.set('');
    this.sendError.set('');
    this.isSending.set(false);
    this.clearSendTimeout();

    if (!loggedIn) {
      this.chatService.disconnect();
      return;
    }

    this.connectionState.set('connected');
    this.loadHistory();
  }

  private clearSendTimeout(): void {
    if (this.sendTimeoutId !== undefined) {
      clearTimeout(this.sendTimeoutId);
      this.sendTimeoutId = undefined;
    }
  }

  private startBackgroundSync(): void {
    this.stopBackgroundSync();
    this.syncIntervalId = setInterval(() => {
      if (!this.isLoggedIn() || this.isSending() || globalThis.document?.visibilityState === 'hidden') return;
      this.chatService.getMyHistory().subscribe({
        next: (messages) => this.messages.set(messages),
        error: () => undefined
      });
    }, CHAT_SYNC_INTERVAL_MS);
  }

  private stopBackgroundSync(): void {
    if (this.syncIntervalId !== undefined) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = undefined;
    }
  }
}
