import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ChatRequest {
  message: string;
  history: ChatHistoryMessage[];
}

export interface ChatHistoryMessage {
  role: 'user' | 'ai';
  text: string;
}

export interface ChatResponse {
  reply: string;
  source?: string;
  updatedAtUtc?: string;
}
export interface AiToolDescriptor { name: string; description: string; requiredFunction: string; scope: string; auditEvent: string; requiresConfirmation: boolean; }
export interface AiToolAuthorizationResult { toolName: string; allowed: boolean; confirmationRequired: boolean; denialCode?: string | null; }
export interface AiToolExecutionResult { toolName: string; status: string; auditEvent: string; taskId?: string | null; publicId?: string | null; }

@Injectable({
  providedIn: 'root'
})
export class AiService {
  private apiUrl = `${environment.apiUrl}/ai`;

  constructor(private http: HttpClient) {}

  chat(message: string, history: ChatHistoryMessage[] = []): Observable<ChatResponse> {
    return this.http.post<ChatResponse>(`${this.apiUrl}/chat`, { message, history });
  }

  tools(): Observable<AiToolDescriptor[]> { return this.http.get<AiToolDescriptor[]>(`${this.apiUrl}/tools`); }
  authorizeTool(name: string, propertyId?: string, confirmed = false): Observable<AiToolAuthorizationResult> { return this.http.post<AiToolAuthorizationResult>(`${this.apiUrl}/tools/${encodeURIComponent(name)}/authorize`, { propertyId, confirmed }); }
  executeTool(name: string, propertyId?: string, confirmed = false, reason?: string, options?: { reservationId?: string; roomId?: string; assignedRoomIds?: string[]; expectedVersion?: number; payload?: unknown; idempotencyKey?: string }): Observable<AiToolExecutionResult> { return this.http.post<AiToolExecutionResult>(`${this.apiUrl}/tools/${encodeURIComponent(name)}/execute`, { propertyId, confirmed, reason, ...options }); }

  customerChat(message: string, history: ChatHistoryMessage[] = []): Observable<ChatResponse> {
    return this.http.post<ChatResponse>(`${this.apiUrl}/customer/chat`, { message, history });
  }

  customerChatStream(
    message: string,
    history: ChatHistoryMessage[] = [],
    accessToken?: string | null
  ): Observable<string> {
    return new Observable<string>((subscriber) => {
      const controller = new AbortController();

      void fetch(`${this.apiUrl}/customer/chat/stream`, {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        body: JSON.stringify({ message, history })
      }).then(async (response) => {
        if (!response.ok || !response.body) {
          throw new Error(`AI stream failed with status ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';
          for (const eventBlock of events) {
            const eventName = eventBlock
              .split('\n')
              .find((line) => line.startsWith('event:'))
              ?.slice(6).trim();
            const data = eventBlock
              .split('\n')
              .filter((line) => line.startsWith('data:'))
              // Spring writes the payload immediately after `data:`. A line such
              // as `data: ` is therefore an actual whitespace token from Gemini.
              .map((line) => line.slice(5))
              .join('\n');
            if (eventName === 'done' || data === '[DONE]') {
              subscriber.complete();
              return;
            }
            if (data) subscriber.next(data);
          }
        }
        const tail = decoder.decode();
        if (tail) subscriber.next(tail);
        subscriber.complete();
      }).catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        subscriber.error(error);
      });

      return () => controller.abort();
    });
  }
}
