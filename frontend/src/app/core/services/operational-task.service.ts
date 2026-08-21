import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { map } from 'rxjs/operators';

export interface OperationalTask {
  id: string | number;
  publicId: string;
  hotelId: string | number;
  taskType: string;
  toolName?: string | null;
  functionCode: string;
  requiredAction: number;
  aggregateType: string;
  aggregateId: string;
  status: 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'BLOCKED';
  assignedToUserId?: string | number;
  assignedToName?: string;
  assignedToRole?: string;
  sourceReference?: string;
  sourceDescription?: string;
  resultReference?: string;
  version: number;
}

export interface OperationalTaskAssignee {
  userId: string | number;
  username: string;
  fullName?: string | null;
  role: string;
}

@Injectable({ providedIn: 'root' })
export class OperationalTaskService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/management/tasks`;

  list(hotelId: string | number, status?: OperationalTask['status'], options?: { taskType?: string; toolName?: string; from?: string; to?: string; sort?: string; page?: number; pageSize?: number }) {
    let params = new HttpParams().set('hotelId', hotelId);
    if (status) params = params.set('status', status);
    Object.entries(options || {}).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== '') params = params.set(key, value); });
    return this.http.get<OperationalTask[] | OperationalTaskPage>(this.baseUrl, { params }).pipe(
      map(response => Array.isArray(response) ? response : response.items),
    );
  }

  aiContext(task: OperationalTask) { return this.http.get<AiTaskContext>(`${this.baseUrl}/${task.id}/ai-context`); }

  assignees(hotelId: string | number) {
    return this.http.get<OperationalTaskAssignee[]>(`${this.baseUrl}/assignees`, {
      params: new HttpParams().set('hotelId', hotelId)
    });
  }

  claim(task: OperationalTask) {
    return this.http.post<OperationalTask>(`${this.baseUrl}/${task.id}/claim`, null, {
      params: { expectedVersion: task.version }
    });
  }

  execute(task: OperationalTask, reason?: string) {
    return this.http.post<OperationalTask>(`${this.baseUrl}/${task.id}/execute`, {
      expectedVersion: task.version,
      command: 'COMPLETE',
      reason,
      payload: {}
    });
  }

  cancel(task: OperationalTask, reason: string) {
    return this.http.post<OperationalTask>(`${this.baseUrl}/${task.id}/cancel`, {
      expectedVersion: task.version,
      reason,
    });
  }

  reassign(task: OperationalTask, assigneeUserId: string | number, reason: string) {
    return this.http.post<OperationalTask>(`${this.baseUrl}/${task.id}/reassign`, {
      expectedVersion: task.version,
      assigneeUserId,
      reason
    });
  }
}

export interface AiTaskContext { id: string; publicId: string; toolName?: string; functionCode: string; requiredAction: number; aggregateType: string; aggregateId: string; sanitizedPayload?: string; authoritativeRoute: string; status: string; version: number; }
export interface OperationalTaskPage { items: OperationalTask[]; page: number; pageSize: number; totalItems: number; totalPages: number; }

