import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface OperationalAuditEvent {
  id: string;
  scope: 'TENANT' | 'SYSTEM';
  hotelId?: string | null;
  domain: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  actorType: string;
  actorId?: string | null;
  reason: string;
  beforeState?: string | null;
  afterState?: string | null;
  correlationId: string;
  occurredAt: string;
}

export interface OperationalAuditPage {
  content: OperationalAuditEvent[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export interface OperationalAuditFilters {
  scope?: 'TENANT' | 'SYSTEM';
  hotelId?: string;
  domain?: string;
  eventType?: string;
  aggregateType?: string;
  aggregateId?: string;
  actorId?: string;
  correlationId?: string;
  from?: string;
  to?: string;
  page?: number;
  size?: number;
}

@Injectable({ providedIn: 'root' })
export class OperationalAuditService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = `${environment.apiUrl}/admin/audit-events`;

  search(filters: OperationalAuditFilters = {}): Observable<OperationalAuditPage> {
    let params = new HttpParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    });
    return this.http.get<OperationalAuditPage>(this.endpoint, { params });
  }

  export(filters: Omit<OperationalAuditFilters, 'page' | 'size'> = {}): Observable<Blob> {
    let params = new HttpParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    });
    return this.http.get(this.endpoint + '/export', { params, responseType: 'blob' });
  }
}
