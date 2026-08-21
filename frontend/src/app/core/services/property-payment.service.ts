import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  FinancialAmount,
  FinancialCurrency,
  FinancialState,
} from '../../shared/financial/financial.models';
import {
  PropertyPaymentEnvironment,
  PropertyPaymentMethodCode,
} from './property-payment-configuration.service';

export type PropertyPaymentPurpose = 'DEPOSIT' | 'BALANCE' | 'SERVICE' | 'SURCHARGE' | 'OTHER';
export type PropertyPaymentState = Extract<
  FinancialState,
  'CREATED' | 'PENDING' | 'PENDING_VERIFICATION' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'EXPIRED'
>;
export type BookingFinancialState = Extract<
  FinancialState,
  'UNPAID' | 'PARTIALLY_PAID' | 'DEPOSIT_PAID' | 'PAID' | 'OVERPAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED'
>;

export interface BookingFinancialSummary {
  reservationId: string | number;
  grossCharges: FinancialAmount;
  depositRequired: FinancialAmount;
  successfulPayments: FinancialAmount;
  successfulRefunds: FinancialAmount;
  remainingBalance: FinancialAmount;
  currency: FinancialCurrency;
  financialState: BookingFinancialState;
  sourceVersion: number;
  calculatedAt: string;
}

export interface CreatePropertyPaymentAttemptRequest {
  purpose: PropertyPaymentPurpose;
  method: PropertyPaymentMethodCode;
}

export interface PropertyPaymentReceiver {
  bankName: string | null;
  bankCode: string | null;
  accountName: string | null;
  accountNumberMasked: string | null;
  qrProvider: string | null;
  merchantReferenceMasked: string | null;
  instructionsVi: string | null;
  instructionsEn: string | null;
}

export interface PropertyPaymentAttempt {
  attemptId: string;
  reservationId: string | number;
  purpose: PropertyPaymentPurpose;
  status: PropertyPaymentState;
  environment: PropertyPaymentEnvironment;
  expectedAmount: FinancialAmount;
  currency: FinancialCurrency;
  expiresAt: string;
  method: PropertyPaymentMethodCode;
  provider: string;
  receiver: PropertyPaymentReceiver;
  uniqueTransferContent: string | null;
  qrData: string | null;
  redirectUrl: string | null;
  replayed: boolean;
}

export interface ManualPaymentConfirmationRequest {
  reason: string;
  evidenceReference: string;
}

export interface ManualPaymentConfirmation {
  attemptId: string;
  transactionId: string;
  status: PropertyPaymentState;
  amount: FinancialAmount;
  confirmedAt: string;
  replayed: boolean;
}

export interface FinancialMutationOptions {
  idempotencyKey?: string;
  correlationId?: string;
  bookingAccessKey?: string;
}

@Injectable({ providedIn: 'root' })
export class PropertyPaymentService {
  private readonly http = inject(HttpClient);
  private readonly reservationsUrl = `${environment.apiUrl}/reservations`;
  private readonly attemptsUrl = `${environment.apiUrl}/payment-attempts`;
  private readonly managementAttemptsUrl = `${environment.apiUrl}/management/payment-attempts`;

  getFinancialSummary(reservationId: string | number): Observable<BookingFinancialSummary> {
    return this.http.get<BookingFinancialSummary>(
      `${this.reservationsUrl}/${reservationId}/financial-summary`,
    );
  }

  createAttempt(
    reservationId: string | number,
    request: CreatePropertyPaymentAttemptRequest,
    options?: FinancialMutationOptions,
  ): Observable<PropertyPaymentAttempt> {
    return this.http.post<PropertyPaymentAttempt>(
      `${this.reservationsUrl}/${reservationId}/payment-attempts`,
      request,
      { headers: this.mutationHeaders(options) },
    );
  }

  getAttempt(attemptId: string): Observable<PropertyPaymentAttempt> {
    return this.http.get<PropertyPaymentAttempt>(`${this.attemptsUrl}/${encodeURIComponent(attemptId)}`);
  }

  cancelAttempt(
    attemptId: string,
    options?: FinancialMutationOptions,
  ): Observable<PropertyPaymentAttempt> {
    return this.http.post<PropertyPaymentAttempt>(
      `${this.attemptsUrl}/${encodeURIComponent(attemptId)}/cancel`,
      null,
      { headers: this.mutationHeaders(options) },
    );
  }

  confirmManual(
    attemptId: string,
    request: ManualPaymentConfirmationRequest,
    options?: FinancialMutationOptions,
  ): Observable<ManualPaymentConfirmation> {
    return this.http.post<ManualPaymentConfirmation>(
      `${this.managementAttemptsUrl}/${encodeURIComponent(attemptId)}/confirm-manual`,
      request,
      { headers: this.mutationHeaders(options) },
    );
  }

  confirmSimulator(attemptId: string): Observable<unknown> {
    return this.http.post(
      `${environment.apiUrl}/financial-simulator/property-payment-attempts/${encodeURIComponent(attemptId)}/confirm`,
      null,
    );
  }

  private mutationHeaders(options?: FinancialMutationOptions): HttpHeaders {
    let headers = new HttpHeaders();
    if (options?.idempotencyKey) {
      headers = headers.set('Idempotency-Key', options.idempotencyKey);
    }
    if (options?.correlationId) {
      headers = headers.set('X-Correlation-ID', options.correlationId);
    }
    if (options?.bookingAccessKey) {
      headers = headers.set('Booking-Access-Key', options.bookingAccessKey);
    }
    return headers;
  }
}
