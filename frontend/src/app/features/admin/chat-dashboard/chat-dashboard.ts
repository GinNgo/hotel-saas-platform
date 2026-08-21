import { CommonModule } from '@angular/common';
import {
  AfterViewChecked,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  signal
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { ActivatedRoute } from '@angular/router';

import {
  ChatConnectionState,
  ChatConversation,
  ChatMessage,
  ChatService
} from '../../../core/services/chat.service';
import { AuthService } from '../../../core/services/auth';
import { ActionCode, FunctionCode, PermissionService } from '../../../core/services/permission.service';

const SEND_ACK_TIMEOUT_MS = 10_000;
const CHAT_SYNC_INTERVAL_MS = 15_000;

@Component({
  selector: 'app-chat-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-dashboard.html',
  styleUrl: './chat-dashboard.css'
})
export class ChatDashboardComponent implements OnInit, OnDestroy, AfterViewChecked {
  private readonly chatService = inject(ChatService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly permissions = inject(PermissionService);
  private readonly route = inject(ActivatedRoute);

  @ViewChild('scrollMe') private scrollContainer?: ElementRef<HTMLElement>;

  readonly conversations = signal<ChatConversation[]>([]);
  readonly selectedConversationId = signal<string | number | null>(null);
  readonly messages = signal<ChatMessage[]>([]);
  readonly currentUserId = signal<string | number | null>(null);
  readonly canReply = this.permissions.hasPermission(FunctionCode.AI_CHAT, ActionCode.UPDATE);
  readonly connectionState = signal<ChatConnectionState>('idle');
  readonly connectionError = signal('');
  readonly conversationState = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly conversationError = signal('');
  readonly messagesState = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly messagesError = signal('');
  readonly isSending = signal(false);
  readonly sendError = signal('');
  readonly lifecycleBusy = signal(false);
  readonly lifecycleError = signal('');

  newMessage = '';
  private renderedMessageCount = 0;
  private sendTimeoutId?: ReturnType<typeof setTimeout>;
  private syncIntervalId?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.currentUserId.set(this.authService.getCurrentUserId());
    this.chatService.message$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((message) => this.handleIncomingMessage(message));
    this.chatService.connectionState$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => this.connectionState.set(state));
    this.chatService.connectionError$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((error) => this.connectionError.set(error));

    this.connectionState.set('connected');
    this.loadConversations();
    this.startBackgroundSync();
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

  loadConversations(): void {
    this.conversationState.set('loading');
    this.conversationError.set('');
    this.chatService.getSupportConversations().subscribe({
      next: (conversations) => {
        this.conversations.set(conversations);
        this.conversationState.set('ready');
        const requestedId = this.route.snapshot.queryParamMap.get('conversationId');
        const requested = requestedId ? conversations.find(item => String(item.conversationId) === requestedId) : undefined;
        if (requested && this.selectedConversationId() !== requested.conversationId) this.selectConversation(requested);
      },
      error: () => {
        this.conversationState.set('error');
        this.conversationError.set('Không thể tải danh sách hội thoại hỗ trợ.');
      }
    });
  }

  retryConnection(): void {
    this.loadConversations();
  }

  selectConversation(conversation: ChatConversation): void {
    this.selectedConversationId.set(conversation.conversationId);
    this.messages.set([]);
    this.messagesState.set('loading');
    this.messagesError.set('');
    this.chatService.getSupportHistory(conversation.conversationId).subscribe({
      next: (messages) => {
        this.messages.set(messages);
        this.messagesState.set('ready');
      },
      error: () => {
        this.messagesState.set('error');
        this.messagesError.set('Không thể tải lịch sử hội thoại này.');
      }
    });
  }

  sendMessage(): void {
    const conversationId = this.selectedConversationId();
    const content = this.newMessage.trim();
    if (!conversationId || !content || !this.canReply || this.getConversation(conversationId)?.status === 'CLOSED' || this.isSending()) return;

    this.sendError.set('');
    this.isSending.set(true);
    this.chatService.replyToSupportConversation(conversationId, content).subscribe({
      next: (message) => {
        this.handleIncomingMessage(message);
        this.newMessage = '';
        this.isSending.set(false);
        this.loadConversations();
      },
      error: () => {
        this.isSending.set(false);
        this.sendError.set('Không thể gửi phản hồi. Hãy thử lại.');
      }
    });
  }

  isOwnMessage(message: ChatMessage): boolean {
    return message.senderId === this.currentUserId();
  }

  connectionLabel(): string {
    switch (this.connectionState()) {
      case 'connected': return 'Đã kết nối';
      case 'connecting': return 'Đang kết nối…';
      case 'reconnecting': return 'Đang kết nối lại…';
      case 'error': return 'Mất kết nối';
      default: return 'Chưa kết nối';
    }
  }

  conversationInitials(conversation: ChatConversation): string {
    return conversation.customerName
      .split(/\s+/)
      .filter(Boolean)
      .slice(-2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || '?';
  }

  getConversation(conversationId: string | number): ChatConversation | undefined {
    return this.conversations().find((conversation) => conversation.conversationId === conversationId);
  }

  conversationTypeLabel(conversation?: ChatConversation): string {
    return conversation?.channel === 'TENANT_ADMIN' ? 'ĐỐI TÁC → QUẢN TRỊ HỆ THỐNG' : 'KHÁCH HÀNG → CƠ SỞ';
  }

  participantLabel(conversation?: ChatConversation): string {
    return conversation?.channel === 'TENANT_ADMIN' ? 'Đối tác' : 'Khách hàng';
  }

  assignSelected(): void {
    const conversation = this.selectedConversation();
    if (!conversation || !this.canReply || this.lifecycleBusy()) return;
    this.runLifecycle(() => this.chatService.assignConversation(conversation.conversationId, conversation.version));
  }

  closeSelected(): void {
    const conversation = this.selectedConversation();
    if (!conversation || conversation.status === 'CLOSED' || !this.canReply || this.lifecycleBusy()) return;
    this.runLifecycle(() => this.chatService.closeConversation(conversation.conversationId, conversation.version));
  }

  reopenSelected(): void {
    const conversation = this.selectedConversation();
    if (!conversation || conversation.status !== 'CLOSED' || !this.canReply || this.lifecycleBusy()) return;
    this.runLifecycle(() => this.chatService.reopenConversation(conversation.conversationId, conversation.version));
  }

  private handleIncomingMessage(message: ChatMessage | null): void {
    if (!message) return;
    const selectedConversationId = this.selectedConversationId();
    if (!this.conversations().some((item) => item.conversationId === message.conversationId)) {
      this.loadConversations();
    }

    if (message.conversationId !== selectedConversationId) return;
    this.messages.update((messages) => {
      if (message.id && messages.some((item) => item.id === message.id)) return messages;
      return [...messages, message];
    });

    if (message.senderId === this.currentUserId()) {
      this.isSending.set(false);
      this.clearSendTimeout();
    }
  }

  private clearSendTimeout(): void {
    if (this.sendTimeoutId !== undefined) {
      clearTimeout(this.sendTimeoutId);
      this.sendTimeoutId = undefined;
    }
  }

  private selectedConversation(): ChatConversation | undefined {
    const id = this.selectedConversationId();
    return id ? this.getConversation(id) : undefined;
  }

  private runLifecycle(request: () => Observable<ChatConversation>): void {
    this.lifecycleBusy.set(true);
    this.lifecycleError.set('');
    request().subscribe({
      next: (updated) => {
        this.conversations.update((items) => items.map((item) => item.conversationId === updated.conversationId ? updated : item));
        this.lifecycleBusy.set(false);
      },
      error: (error) => {
        this.lifecycleBusy.set(false);
        this.lifecycleError.set(error?.error?.message || 'Hội thoại vừa được cập nhật. Vui lòng tải lại và thử lại.');
        this.loadConversations();
      }
    });
  }

  private startBackgroundSync(): void {
    this.stopBackgroundSync();
    this.syncIntervalId = setInterval(() => {
      if (this.isSending() || globalThis.document?.visibilityState === 'hidden') return;
      this.chatService.getSupportConversations().subscribe({
        next: (conversations) => this.conversations.set(conversations),
        error: () => undefined
      });
      const selectedId = this.selectedConversationId();
      if (selectedId) {
        this.chatService.getSupportHistory(selectedId).subscribe({
          next: (messages) => this.messages.set(messages),
          error: () => undefined
        });
      }
    }, CHAT_SYNC_INTERVAL_MS);
  }

  private stopBackgroundSync(): void {
    if (this.syncIntervalId !== undefined) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = undefined;
    }
  }
}
