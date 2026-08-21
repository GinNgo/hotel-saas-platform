import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Promotion {
  id: string; tenantId: string; code: string; title: string; discountPercent: number;
  maxDiscountAmount?: number | null; minBookingAmount?: number | null;
  startDateUtc: string; endDateUtc: string; isActive: boolean; applicationType: 'AUTOMATIC' | 'COUPON';
}
export interface SavePromotionRequest {
  code: string; title: string; discountPercent: number; maxDiscountAmount?: number | null;
  minBookingAmount?: number | null; startDateUtc: string; endDateUtc: string; isActive: boolean; applicationType: 'AUTOMATIC' | 'COUPON';
}
@Injectable({ providedIn: 'root' })
export class PromotionService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/promotions`;
  list(): Observable<Promotion[]> { return this.http.get<Promotion[]>(this.url); }
  create(body: SavePromotionRequest): Observable<Promotion> { return this.http.post<Promotion>(this.url, body); }
  update(id: string, body: SavePromotionRequest): Observable<Promotion> { return this.http.put<Promotion>(`${this.url}/${id}`, body); }
  deactivate(id: string): Observable<void> { return this.http.delete<void>(`${this.url}/${id}`); }
}
