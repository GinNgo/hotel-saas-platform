import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type HousekeepingStatus = 'PENDING' | 'CLAIMED' | 'IN_PROGRESS' | 'COMPLETED';

export interface HousekeepingTask {
  id: string | number;
  hotelId: string | number;
  roomId: string | number;
  roomNumber: string;
  reservationId: string | number | null;
  bookingCode: string | null;
  taskType: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' | string;
  status: HousekeepingStatus;
  assignedToUserId: string | number | null;
  assignedToUsername: string | null;
  assignedToName: string | null;
  assignedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  note: string | null;
  version: string | number;
  staleAssignment: boolean;
  roomStatus: string;
  roomHousekeepingStatus: string;
  roomMaintenanceStatus: string;
  roomReleased: boolean;
}

export interface HousekeepingAssignee {
  userId: string | number;
  username: string;
  fullName: string | null;
}

export interface CreateHousekeepingTaskRequest {
  roomId: string | number;
  taskType: 'INSPECTION' | 'TOUCH_UP' | 'DEEP_CLEANING';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  notes: string;
}

@Injectable({ providedIn: 'root' })
export class HousekeepingService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/housekeeping`;

  list(propertyId: string | number, status?: HousekeepingStatus): Observable<HousekeepingTask[]> {
    let params = new HttpParams().set('propertyId', propertyId);
    if (status) params = params.set('status', status);
    return this.http.get<HousekeepingTask[]>(`${this.url}/tasks`, { params });
  }

  assignees(propertyId: string | number): Observable<HousekeepingAssignee[]> {
    return this.http.get<HousekeepingAssignee[]>(`${this.url}/assignees`, {
      params: new HttpParams().set('propertyId', propertyId),
    });
  }

  create(request: CreateHousekeepingTaskRequest): Observable<HousekeepingTask> {
    return this.http.post<HousekeepingTask>(`${this.url}/tasks`, request);
  }

  cancel(taskId: string | number, reason: string, expectedVersion?: string | number): Observable<void> {
    return this.http.delete<void>(`${this.url}/tasks/${taskId}`, { body: { reason, expectedVersion } });
  }

  claim(taskId: string | number, expectedVersion?: string | number): Observable<HousekeepingTask> {
    return this.http.post<HousekeepingTask>(`${this.url}/tasks/${taskId}/claim`, { expectedVersion });
  }

  assign(taskId: string | number, userId: string | number, expectedVersion?: string | number): Observable<HousekeepingTask> {
    return this.http.post<HousekeepingTask>(`${this.url}/tasks/${taskId}/assign`, { userId, expectedVersion });
  }

  start(taskId: string | number, expectedVersion?: string | number): Observable<HousekeepingTask> {
    return this.http.post<HousekeepingTask>(`${this.url}/tasks/${taskId}/start`, { expectedVersion });
  }

  complete(taskId: string | number, expectedVersion: string | number): Observable<HousekeepingTask> {
    return this.http.post<HousekeepingTask>(`${this.url}/tasks/${taskId}/complete`, { expectedVersion });
  }
}
