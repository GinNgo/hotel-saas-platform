import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ChatMessage {
  id?: string | number;
  conversationId: string | number;
  propertyId?: string | number;
  hotelId?: string | number;
  senderId: string | number;
  receiverId?: string | number;
  content: string;
  timestamp?: string;
  isRead?: boolean;
}

export interface ChatConversation {
  conversationId: string | number;
  customerId: string | number;
  customerName: string;
  propertyId?: string | number;
  propertyName?: string;
  hotelId?: string | number;
  hotelName?: string;
  reservationId?: string | number;
  assignedAgentId?: string | number;
  channel: 'IN_APP' | 'TENANT_ADMIN';
  subject: string;
  status: 'OPEN' | 'ASSIGNED' | 'ESCALATED' | 'CLOSED';
  lastMessage: string;
  lastMessageAt?: string;
  version: number;
  assignedAt?: string;
  closedByUserId?: string | number;
  closedAt?: string;
  reopenedByUserId?: string | number;
  reopenedAt?: string;
}

export type ChatMode = 'customer' | 'support';
export type ChatConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/chat`;
  private readonly messageSubject = new BehaviorSubject<ChatMessage | null>(null);
  private readonly connectionStateSubject = new BehaviorSubject<ChatConnectionState>('connected');
  private readonly connectionErrorSubject = new BehaviorSubject('');

  readonly message$ = this.messageSubject.asObservable();
  readonly connectionState$ = this.connectionStateSubject.asObservable();
  readonly connectionError$ = this.connectionErrorSubject.asObservable();

  connect(_mode: ChatMode): void { this.connectionStateSubject.next('connected'); }
  disconnect(): void { this.connectionStateSubject.next('idle'); }

  getMyHistory(): Observable<ChatMessage[]> {
    return this.http.get<ChatMessage[]>(`${this.apiUrl}/me/history`);
  }

  createCustomerSupportMessage(content: string, propertyId?: string | number, reservationId?: string | number): Observable<ChatMessage> {
    return this.http.post<ChatMessage>(`${this.apiUrl}/me/messages`, { content, propertyId, reservationId });
  }

  getMyTenantSupportHistory(): Observable<ChatMessage[]> {
    return this.http.get<ChatMessage[]>(`${this.apiUrl}/tenant/history`);
  }

  getTenantSupportHistory(propertyId: string | number): Observable<ChatMessage[]> {
    return this.http.get<ChatMessage[]>(`${this.apiUrl}/tenant/history`, { params: { propertyId } });
  }

  createTenantSupportMessage(propertyId: string | number, content: string): Observable<ChatMessage> {
    return this.http.post<ChatMessage>(`${this.apiUrl}/tenant/messages`, { propertyId, content });
  }

  getSupportConversations(): Observable<ChatConversation[]> {
    return this.http.get<ChatConversation[]>(`${this.apiUrl}/support/conversations`);
  }

  getSupportHistory(conversationId: string | number): Observable<ChatMessage[]> {
    return this.http.get<ChatMessage[]>(`${this.apiUrl}/support/conversations/${conversationId}`);
  }

  replyToSupportConversation(conversationId: string | number, content: string): Observable<ChatMessage> {
    return this.http.post<ChatMessage>(`${this.apiUrl}/support/conversations/${conversationId}/messages`, { content });
  }

  assignConversation(conversationId: string | number, expectedVersion: number): Observable<ChatConversation> {
    return this.http.post<ChatConversation>(`${this.apiUrl}/support/conversations/${conversationId}/assign`, { expectedVersion });
  }

  closeConversation(conversationId: string | number, expectedVersion: number): Observable<ChatConversation> {
    return this.http.post<ChatConversation>(`${this.apiUrl}/support/conversations/${conversationId}/close`, { expectedVersion });
  }

  reopenConversation(conversationId: string | number, expectedVersion: number): Observable<ChatConversation> {
    return this.http.post<ChatConversation>(`${this.apiUrl}/support/conversations/${conversationId}/reopen`, { expectedVersion });
  }
}
