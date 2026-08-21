import { CommonModule } from '@angular/common';
import { Component, DestroyRef, ElementRef, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

import { AuthService } from '../../../core/services/auth';
import { ChatConnectionState, ChatMessage, ChatService } from '../../../core/services/chat.service';
import { ActionCode, FunctionCode, PermissionService } from '../../../core/services/permission.service';

const SEND_ACK_TIMEOUT_MS = 10_000;
const CHAT_SYNC_INTERVAL_MS = 15_000;

@Component({
  selector: 'app-system-support',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './system-support.component.html',
  styleUrl: './system-support.component.css',
})
export class SystemSupportComponent implements OnInit, OnDestroy {
  private readonly chatService = inject(ChatService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly permissions = inject(PermissionService);

  @ViewChild('messageStream') private messageStream?: ElementRef<HTMLElement>;

  readonly messages = signal<ChatMessage[]>([]);
  readonly historyState = signal<'loading' | 'ready' | 'error'>('loading');
  readonly connectionState = signal<ChatConnectionState>('idle');
  readonly errorMessage = signal('');
  readonly isSending = signal(false);

  readonly canCreate = this.permissions.hasPermission(FunctionCode.AI_CHAT, ActionCode.CREATE);
  propertyId: string | null = null;
  currentUserId: string | number | null = null;
  newMessage = '';
  private sendTimeoutId?: ReturnType<typeof setTimeout>;
  private syncIntervalId?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.currentUserId = this.authService.getCurrentUserId();
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        this.propertyId = this.parsePropertyId(params.get('propertyId'));
        if (this.propertyId) {
          this.loadHistory();
          this.startBackgroundSync();
        } else {
          this.stopBackgroundSync();
        }
      });
    this.chatService.message$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((message) => this.handleIncomingMessage(message));
    this.chatService.connectionState$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => this.connectionState.set(state));
    this.chatService.connectionError$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((message) => this.errorMessage.set(message));

    this.connectionState.set('connected');
  }

  ngOnDestroy(): void {
    this.clearSendTimeout();
    this.stopBackgroundSync();
    this.chatService.disconnect();
  }

  loadHistory(): void {
    this.historyState.set('loading');
    if (!this.propertyId) return;
    this.chatService.getTenantSupportHistory(this.propertyId).subscribe({
      next: (messages) => {
        this.messages.set(messages);
        this.historyState.set('ready');
        queueMicrotask(() => this.scrollToBottom());
      },
      error: () => {
        this.historyState.set('error');
        this.errorMessage.set('Không thể tải lịch sử hỗ trợ.');
      },
    });
  }

  sendMessage(): void {
    const content = this.newMessage.trim();
    if (!content || !this.propertyId || !this.canCreate || this.isSending()) return;

    this.errorMessage.set('');
    this.isSending.set(true);
    this.chatService.createTenantSupportMessage(this.propertyId, content).subscribe({
      next: (message) => {
        this.handleIncomingMessage(message);
        this.newMessage = '';
        this.isSending.set(false);
      },
      error: () => {
        this.isSending.set(false);
        this.errorMessage.set('Không thể gửi yêu cầu hỗ trợ.');
      }
    });
  }

  retry(): void {
    this.errorMessage.set('');
    this.loadHistory();
  }

  isOwnMessage(message: ChatMessage): boolean {
    return message.senderId === this.currentUserId;
  }

  private handleIncomingMessage(message: ChatMessage | null): void {
    if (!message || (message.senderId !== this.currentUserId && message.receiverId !== this.currentUserId)) return;
    this.messages.update((messages) => {
      if (message.id && messages.some((item) => item.id === message.id)) return messages;
      return [...messages, message];
    });
    if (message.senderId === this.currentUserId) {
      this.isSending.set(false);
      this.clearSendTimeout();
    }
    queueMicrotask(() => this.scrollToBottom());
  }

  private clearSendTimeout(): void {
    if (this.sendTimeoutId !== undefined) {
      clearTimeout(this.sendTimeoutId);
      this.sendTimeoutId = undefined;
    }
  }

  private scrollToBottom(): void {
    const element = this.messageStream?.nativeElement;
    if (element) element.scrollTop = element.scrollHeight;
  }

  private parsePropertyId(value: string | null): string | null {
    if (!value) return null;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
  }

  private startBackgroundSync(): void {
    this.stopBackgroundSync();
    this.syncIntervalId = setInterval(() => {
      if (!this.propertyId || this.isSending() || globalThis.document?.visibilityState === 'hidden') return;
      this.chatService.getTenantSupportHistory(this.propertyId).subscribe({
        next: (messages) => {
          this.messages.set(messages);
          queueMicrotask(() => this.scrollToBottom());
        },
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
