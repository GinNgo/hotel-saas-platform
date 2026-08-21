import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type ClaimId = string | number;
export type ClaimStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export interface ClaimPartySummary { id: ClaimId; username?: string | null; email?: string | null; fullName?: string | null; }
export interface ClaimPropertySummary { id?: ClaimId; tenantId?: ClaimId; code: string | null; name: string | null; approvalStatus: string | null; operationStatus: string | null; }
export interface PropertyClaimReview { id: ClaimId; property: ClaimPropertySummary | null; requesterUser: ClaimPartySummary | null; verificationMethod: string | null; verificationData: string | null; note: string | null; status: ClaimStatus; reviewedBy: ClaimPartySummary | null; reviewedAt: string | null; rejectionReason: string | null; createdAt: string | null; }
export interface PropertyClaimPage { content: PropertyClaimReview[]; totalElements?: number; totalPages?: number; pageNumber?: number; pageSize?: number; }

@Injectable({ providedIn: 'root' })
export class PropertyClaimReviewService {
  constructor(private readonly http: HttpClient) {}
  list(status: ClaimStatus | 'ALL'): Observable<PropertyClaimPage> {
    const params = status === 'ALL' ? new HttpParams() : new HttpParams().set('status', status);
    return this.http.get<PropertyClaimPage>(`${environment.apiUrl}/admin/property-claims`, { params });
  }
  approve(id: ClaimId): Observable<unknown> { return this.http.post(`${environment.apiUrl}/admin/property-claims/${id}/approve`, {}); }
  reject(id: ClaimId, reason: string): Observable<unknown> { return this.http.post(`${environment.apiUrl}/admin/property-claims/${id}/reject`, { reason }); }
}
