import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface EmailOutboxFailure {
  id: string | number;
  hotelId: string | number | null;
  idempotencyKey: string;
  templateKey: string;
  templateVersion: string;
  maskedRecipient: string;
  subject: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  manualRetryCount: number;
  lastErrorCode: string | null;
  failedAt: string | null;
  nextAttemptAt: string;
  createdAt: string;
}

export interface EmailDeliveryAttempt {
  id: string | number;
  attemptNumber: number;
  outcome: string;
  errorCode: string | null;
  providerMessageId: string | null;
  durationMs: number;
  attemptedAt: string;
}

export interface EmailOutboxPage {
  content: EmailOutboxFailure[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

@Injectable({ providedIn: 'root' })
export class EmailOutboxService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/admin/email-outbox`;

  failures(page = 0, size = 25): Observable<EmailOutboxPage> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<EmailOutboxPage>(`${this.api}/failures`, { params });
  }

  attempts(id: string | number): Observable<EmailDeliveryAttempt[]> {
    return this.http.get<EmailDeliveryAttempt[]>(`${this.api}/${id}/attempts`);
  }

  retry(id: string | number): Observable<EmailOutboxFailure> {
    return this.http.post<EmailOutboxFailure>(`${this.api}/${id}/retry`, {});
  }
}
