import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface RoomRateOverride {
  id: string;
  tenantId: string;
  roomTypeId: string;
  startDate: string;
  endDate: string;
  nightlyPrice: number;
  priority: number;
  isActive: boolean;
  createdAtUtc: string;
  updatedAtUtc?: string | null;
}

export interface SaveRoomRateOverrideRequest {
  roomTypeId: string;
  startDate: string;
  endDate: string;
  nightlyPrice: number;
  priority: number;
  isActive: boolean;
}

@Injectable({ providedIn: 'root' })
export class RoomRateOverrideService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/room-rate-overrides`;

  list(roomTypeId: string): Observable<RoomRateOverride[]> {
    return this.http.get<RoomRateOverride[]>(this.baseUrl, { params: { roomTypeId } });
  }

  create(request: SaveRoomRateOverrideRequest): Observable<RoomRateOverride> {
    return this.http.post<RoomRateOverride>(this.baseUrl, request);
  }

  update(id: string, request: SaveRoomRateOverrideRequest): Observable<RoomRateOverride> {
    return this.http.put<RoomRateOverride>(`${this.baseUrl}/${id}`, request);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
