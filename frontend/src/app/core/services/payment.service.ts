import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PaymentSession {
  sessionId: string;
  reservationId: string | number;
  bookingCode: string;
  provider: 'VNPAY' | 'MOMO' | 'ZALOPAY';
  method: string;
  amount: number;
  currency: 'VND';
  status: 'CREATED' | 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';
  mode: 'SANDBOX' | 'SIMULATOR';
  expiresAt: string;
  url: string;
  reconciliationRequired: boolean;
  confirmationEmailStatus?: 'SENT' | 'NOT_CONFIGURED' | 'FAILED' | 'PENDING';
  confirmationEmailRecipient?: string;
  confirmationEmailSent?: boolean;
}

export interface PaymentSessionStatus {
  sessionId: string;
  reservationId: string | number;
  bookingCode: string;
  provider: 'VNPAY' | 'MOMO' | 'ZALOPAY';
  amount: number;
  currency: 'VND';
  status: 'CREATED' | 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';
  expiresAt: string;
  completedAt?: string;
  reconciliationRequired: boolean;
  failureCode?: string;
  confirmationEmailStatus?: 'SENT' | 'NOT_CONFIGURED' | 'FAILED' | 'PENDING';
  confirmationEmailRecipient?: string;
  confirmationEmailSent?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class PaymentService {
  private apiUrl = `${environment.apiUrl}/payments`;


  constructor(private http: HttpClient) {}

  createPaymentSession(
    reservationId: string | number,
    provider: string,
    idempotencyKey: string,
    bookingAccessKey?: string,
  ): Observable<PaymentSession> {
    let headers = new HttpHeaders({ 'Idempotency-Key': idempotencyKey });
    if (bookingAccessKey) headers = headers.set('Booking-Access-Key', bookingAccessKey);
    return this.http.post<PaymentSession>(
      `${this.apiUrl}/sessions`,
      { reservationId, provider },
      { headers },
    );
  }

  getPaymentSessionStatus(sessionId: string, bookingAccessKey?: string): Observable<PaymentSessionStatus> {
    const headers = bookingAccessKey
      ? new HttpHeaders({ 'Booking-Access-Key': bookingAccessKey })
      : undefined;
    return this.http.get<PaymentSessionStatus>(
      `${this.apiUrl}/sessions/${encodeURIComponent(sessionId)}`,
      { headers },
    );
  }

  getActivePaymentSession(
    reservationId: string | number,
    bookingAccessKey?: string,
  ): Observable<PaymentSession> {
    const headers = bookingAccessKey
      ? new HttpHeaders({ 'Booking-Access-Key': bookingAccessKey })
      : undefined;
    return this.http.get<PaymentSession>(
      `${this.apiUrl}/reservations/${reservationId}/active-session`,
      { headers },
    );
  }

}
