import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { FinancialAmount } from '../../shared/financial/financial.models';
import { FinancialMutationOptions } from './property-payment.service';

export type ReservationChargeType =
  | 'ROOM'
  | 'SERVICE'
  | 'MINIBAR'
  | 'LAUNDRY'
  | 'SURCHARGE'
  | 'TAX'
  | 'FEE'
  | 'DISCOUNT'
  | 'ADJUSTMENT';
export type ServiceChargeType = Extract<ReservationChargeType, 'SERVICE' | 'MINIBAR' | 'LAUNDRY'>;
export type SurchargeType =
  | 'EARLY_CHECK_IN'
  | 'LATE_CHECK_OUT'
  | 'EXTRA_GUEST'
  | 'DAMAGE'
  | 'CLEANING'
  | 'LOST_KEY'
  | 'OTHER';
export type NegativeAdjustmentType =
  | 'SERVICE_RECOVERY'
  | 'GOODWILL'
  | 'PRICE_CORRECTION'
  | 'MANUAL_DISCOUNT'
  | 'OTHER';
export type CheckoutSettlementState = 'SETTLED' | 'OUTSTANDING' | 'OVERPAID';

export interface AddServiceChargeRequest {
  serviceId: string | number;
  chargeType: ServiceChargeType;
  quantity: number;
  serviceUsedAt?: string;
}

export interface AddSurchargeRequest {
  type: SurchargeType;
  description: string;
  amount: FinancialAmount;
}

export interface AddNegativeAdjustmentRequest {
  type: NegativeAdjustmentType;
  description: string;
  amount: FinancialAmount;
}

export interface ReservationCharge {
  id: string | number;
  reservationId: string | number;
  chargeType: ReservationChargeType;
  code: string;
  name: string;
  description: string | null;
  quantity: number;
  unitPrice: FinancialAmount;
  taxAmount: FinancialAmount;
  discountAmount: FinancialAmount;
  totalAmount: FinancialAmount;
  serviceUsedAt: string | null;
  correlationId: string | null;
  replayed: boolean;
}

export interface FolioLine {
  sourceType: string;
  sourceId: string | number | null;
  category: string;
  code: string;
  name: string;
  description: string | null;
  quantity: number;
  unitPrice: FinancialAmount;
  taxAmount: FinancialAmount;
  discountAmount: FinancialAmount;
  snapshotAmount: FinancialAmount;
  signedEffect: FinancialAmount;
  usageStartedAt: string | null;
  usageEndedAt: string | null;
}

export interface ReservationFolio {
  roomCharges: FinancialAmount;
  serviceCharges: FinancialAmount;
  surchargeCharges: FinancialAmount;
  taxCharges: FinancialAmount;
  feeCharges: FinancialAmount;
  discounts: FinancialAmount;
  grossCharges: FinancialAmount;
  depositRequired: FinancialAmount;
  successfulPayments: FinancialAmount;
  successfulRefunds: FinancialAmount;
  otherCredits: FinancialAmount;
  netSettled: FinancialAmount;
  balance: FinancialAmount;
  lines: FolioLine[];
  sourceVersion: number;
  calculatedAt: string;
}

export interface CheckoutPreview {
  reservationId: string | number;
  hotelId: string | number;
  settlementState: CheckoutSettlementState;
  checkoutAllowed: boolean;
  blockingError: string | null;
  sourceVersion: number;
  calculatedAt: string;
  folio: ReservationFolio;
}

export interface CheckoutOverride {
  overrideId: string | number | null;
  debtOverrideApplied: boolean;
  preview: CheckoutPreview;
}

export interface CheckoutFinancialSummary {
  grossCharges: FinancialAmount;
  depositRequired: FinancialAmount;
  successfulPayments: FinancialAmount;
  successfulRefunds: FinancialAmount;
  remainingBalance: FinancialAmount;
  financialState: string;
  sourceVersion: number;
  calculatedAt: string;
}

export interface CheckoutResult {
  reservationId: string | number;
  reservationStatus: string;
  invoiceId: string | number;
  invoiceNumber: string;
  invoiceStatus: string;
  totalAmount: FinancialAmount;
  dirtyRoomIds: Array<string | number>;
  financialSummary: CheckoutFinancialSummary;
}

export interface CreditNoteLineRequest {
  invoiceLineId?: number;
  description: string;
  amount: FinancialAmount;
}

export interface CreditNoteRequest {
  reason: string;
  lines: CreditNoteLineRequest[];
}

export interface CreditNoteLine {
  id: number;
  invoiceLineId: number | null;
  description: string;
  amount: FinancialAmount;
}

export interface CreditNote {
  id: number;
  creditNoteNumber: string;
  reason: string;
  amount: FinancialAmount;
  issuedAt: string;
  lines: CreditNoteLine[];
}

@Injectable({ providedIn: 'root' })
export class PropertyCheckoutService {
  private readonly http = inject(HttpClient);
  private readonly managementReservationsUrl = `${environment.apiUrl}/management/reservations`;
  private readonly managementInvoicesUrl = `${environment.apiUrl}/management/invoices`;

  addServiceCharge(
    reservationId: string | number,
    request: AddServiceChargeRequest,
    options?: FinancialMutationOptions,
  ): Observable<ReservationCharge> {
    return this.http.post<ReservationCharge>(
      `${this.reservationUrl(reservationId)}/charges/services`,
      request,
      { headers: this.mutationHeaders(options) },
    );
  }

  addSurcharge(
    reservationId: string | number,
    request: AddSurchargeRequest,
    options?: FinancialMutationOptions,
  ): Observable<ReservationCharge> {
    return this.http.post<ReservationCharge>(
      `${this.reservationUrl(reservationId)}/charges/surcharges`,
      { ...request, negativeAdjustment: false },
      { headers: this.mutationHeaders(options) },
    );
  }

  addNegativeAdjustment(
    reservationId: string | number,
    request: AddNegativeAdjustmentRequest,
    options?: FinancialMutationOptions,
  ): Observable<ReservationCharge> {
    return this.http.post<ReservationCharge>(
      `${this.reservationUrl(reservationId)}/charges/surcharges`,
      {
        type: request.type,
        negativeType: request.type,
        description: request.description,
        amount: request.amount,
        negativeAdjustment: true,
      },
      { headers: this.mutationHeaders(options) },
    );
  }

  preview(reservationId: string | number): Observable<CheckoutPreview> {
    return this.http.post<CheckoutPreview>(
      `${this.reservationUrl(reservationId)}/checkout-preview`,
      null,
    );
  }

  authorizeDebtOverride(
    reservationId: string | number,
    reason: string,
    options?: FinancialMutationOptions,
  ): Observable<CheckoutOverride> {
    return this.http.post<CheckoutOverride>(
      `${this.reservationUrl(reservationId)}/checkout-override`,
      { reason, correlationId: options?.correlationId },
      { headers: this.mutationHeaders(options) },
    );
  }

  checkout(
    reservationId: string | number,
    checkoutOverrideId?: string | number,
    options?: FinancialMutationOptions,
  ): Observable<CheckoutResult> {
    return this.http.post<CheckoutResult>(
      `${this.reservationUrl(reservationId)}/checkout`,
      checkoutOverrideId === undefined ? null : { checkoutOverrideId },
      { headers: this.mutationHeaders(options) },
    );
  }

  issueCreditNote(
    invoiceId: number,
    request: CreditNoteRequest,
    options?: FinancialMutationOptions,
  ): Observable<CreditNote> {
    return this.http.post<CreditNote>(
      `${this.managementInvoicesUrl}/${invoiceId}/credit-notes`,
      { ...request, correlationId: options?.correlationId },
      { headers: this.mutationHeaders(options) },
    );
  }

  private reservationUrl(reservationId: string | number): string {
    return `${this.managementReservationsUrl}/${reservationId}`;
  }

  private mutationHeaders(options?: FinancialMutationOptions): HttpHeaders {
    let headers = new HttpHeaders();
    if (options?.idempotencyKey) {
      headers = headers.set('Idempotency-Key', options.idempotencyKey);
    }
    if (options?.correlationId) {
      headers = headers.set('X-Correlation-ID', options.correlationId);
    }
    return headers;
  }
}
