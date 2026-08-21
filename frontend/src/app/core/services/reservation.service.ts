import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ReservationDetail {
  id?: string | number;
  reservationId?: string | number;
  roomId: string | number | null;
  roomNumber?: string;
  priceAtBooking?: number;
}

export type PaymentLifecycleStatus = 'CREATED' | 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';
export type RefundLifecycleStatus = 'REQUESTED' | 'PENDING_APPROVAL' | 'POLICY_BLOCKED' | 'PENDING_PROVIDER' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export interface PaymentLifecycleSummary {
  publicId?: string;
  provider: string;
  amount: number;
  currency: 'VND';
  status: PaymentLifecycleStatus;
  expiresAt?: string;
  completedAt?: string;
  reconciliationRequired: boolean;
  failureCode?: string;
}

export interface RefundSummary {
  publicId: string;
  amount: number;
  currency: 'VND';
  provider: string;
  status: RefundLifecycleStatus;
  requestedAt: string;
  completedAt?: string;
  failureCode?: string;
}

export interface OperationalQuote {
  roomId: string | number;
  roomNumber: string;
  roomTypeId: string | number;
  roomTypeName: string;
  nightlyPrice: number;
  nights: number;
  baseSubtotal: number;
  discount: number;
  finalTotal: number;
  currency: 'VND';
  promotionCode?: string;
  promotionName?: string;
}

export interface Reservation {
  id?: string | number;
  bookingCode?: string;
  userId: string | number | null;
  username?: string;
  userFullName?: string;
  checkInDate: string;
  checkOutDate: string;
  guests: number;
  adults?: number;
  children?: number;
  totalAmount?: number;
  status?: string;
  paymentMethod: string;
  specialRequests?: string;
  guestFullName?: string;
  guestPhoneNumber?: string;
  guestEmail?: string;
  roomId?: string | number;
  expectedTotal?: number;
  cancellationReasonCode?: string;
  cancellationReason?: string;
  cancelledAt?: string;
  details: ReservationDetail[];
  roomTypeId?: string | number;
  quantity?: number;
  payment?: PaymentLifecycleSummary;
  refunds?: RefundSummary[];
}

@Injectable({
  providedIn: 'root',
})
export class ReservationService {
  private apiUrl = `${environment.apiUrl}/reservations`;

  constructor(private http: HttpClient) {}

  getAllReservations(from?: string, to?: string): Observable<Reservation[]> {
    const params = from && to ? { from, to } : undefined;
    return this.http.get<Reservation[]>(this.apiUrl, { params });
  }

  getReservationById(id: string | number): Observable<Reservation> {
    return this.http.get<Reservation>(`${this.apiUrl}/${id}`);
  }

  createReservation(reservation: Reservation, idempotencyKey: string): Observable<Reservation> {
    return this.http.post<Reservation>(this.apiUrl, reservation, { headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }) });
  }

  getOperationalQuote(roomId: string | number, checkIn: string, checkOut: string, adults: number, children: number): Observable<OperationalQuote> {
    return this.http.get<OperationalQuote>(`${this.apiUrl}/operational-quote`, {
      params: { roomId: String(roomId), checkIn, checkOut, adults: String(adults), children: String(children) }
    });
  }

  updateReservationStatus(id: string | number, status: string): Observable<Reservation> {
    return this.http.put<Reservation>(`${this.apiUrl}/${id}/status?status=${status}`, {});
  }

  checkIn(id: string | number): Observable<Reservation> {
    return this.http.post<Reservation>(`${this.apiUrl}/${id}/check-in`, {});
  }

  assignRooms(id: string | number): Observable<Reservation> {
    return this.http.post<Reservation>(`${this.apiUrl}/${id}/assign-rooms`, {});
  }

  cancelOperational(id: string | number): Observable<Reservation> {
    return this.http.post<Reservation>(`${this.apiUrl}/${id}/cancel-operational`, {});
  }

  markNoShow(id: string | number): Observable<Reservation> {
    return this.http.post<Reservation>(`${this.apiUrl}/${id}/no-show`, {});
  }

  cancelMyReservation(id: string | number, cancellation: { reasonCode: string; reason?: string }, idempotencyKey?: string): Observable<Reservation> {
    const options = idempotencyKey
      ? { headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }) }
      : {};
    return this.http.post<Reservation>(`${this.apiUrl}/${id}/cancel`, cancellation, options);
  }

}
