import { Injectable } from '@angular/core';
import { ReplaySubject } from 'rxjs';

export interface ClientOperationalEvent {
  transport: 'http' | 'stomp';
  operation: string;
  outcome: 'failure';
  status?: number;
  correlationId?: string;
  occurredAt: string;
}

@Injectable({ providedIn: 'root' })
export class ClientObservabilityService {
  private readonly eventsSubject = new ReplaySubject<ClientOperationalEvent>(20);

  readonly events$ = this.eventsSubject.asObservable();

  recordHttpFailure(method: string, status: number, correlationId?: string | null): void {
    const normalizedMethod = method.trim().toUpperCase();
    const operation = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'].includes(normalizedMethod)
      ? normalizedMethod
      : 'UNKNOWN';
    this.publish({
      transport: 'http',
      operation,
      outcome: 'failure',
      status,
      correlationId: this.safeCorrelationId(correlationId),
      occurredAt: new Date().toISOString(),
    });
  }

  recordStompFailure(channel: 'chat' | 'notification', phase: string, correlationId?: string | null): void {
    const normalizedPhase = phase.trim().toLowerCase();
    const operationPhase = ['broker', 'socket', 'close', 'publish', 'payload', 'connect'].includes(normalizedPhase)
      ? normalizedPhase
      : 'unknown';
    this.publish({
      transport: 'stomp',
      operation: `${channel}.${operationPhase}`,
      outcome: 'failure',
      correlationId: this.safeCorrelationId(correlationId),
      occurredAt: new Date().toISOString(),
    });
  }

  createCorrelationId(prefix = 'web'): string {
    const randomId = globalThis.crypto?.randomUUID?.()
      ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    return `${this.safeValue(prefix, 'web')}-${randomId}`.slice(0, 100);
  }

  private publish(event: ClientOperationalEvent): void {
    this.eventsSubject.next(event);
    console.warn('[operational-event]', event);
  }

  private safeCorrelationId(value?: string | null): string | undefined {
    if (!value?.trim()) return undefined;
    return value.trim().replace(/[^A-Za-z0-9._:-]+/g, '-').slice(0, 100);
  }

  private safeValue(value: string | undefined, fallback: string): string {
    const normalized = value?.trim().replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 64);
    return normalized || fallback;
  }
}
