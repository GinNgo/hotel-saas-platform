import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface Role {
  id: string | number;
  code: string;
  name: string;
  description: string;
  status?: string;
  systemRole?: boolean;
  userCount?: number;
  roleType?: 'SYSTEM' | 'CUSTOM';
  updatedAt?: string;
  version?: number;
}

export interface AppModule {
  id: string | number;
  code: string;
  name: string;
  functions: AppFunction[];
}

export interface AppFunction {
  id: string | number;
  code: string;
  name: string;
  moduleCode: string;
  actionMask: number;
  supportedActionMask: number;
  isActive: boolean;
}

export interface UpdateRolePermissionsRequest {
  expectedVersion: number;
  reason?: string;
  permissions: Array<{
  functionId: string | number;
    actionMask: number;
  }>;
}

@Injectable({
  providedIn: 'root'
})
export class RoleService {
  private apiUrl = `${environment.apiUrl}/roles`;
  private rolePermUrl = `${environment.apiUrl}/role-permissions`;
  private http = inject(HttpClient);

  getRoles(): Observable<Role[]> {
    return this.http.get<any>(this.apiUrl).pipe(
      map(response => Array.isArray(response) ? response : (response?.items ?? response?.data ?? []))
    );
  }

  createRole(role: any): Observable<Role> {
    return this.http.post<any>(this.apiUrl, role).pipe(
      map(response => response?.data ?? response)
    );
  }

  updateRole(id: string | number, role: any): Observable<Role> {
    return this.http.put<any>(`${this.apiUrl}/${id}`, role).pipe(
      map(response => response?.data ?? response)
    );
  }

  deleteRole(id: string | number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  getRolePermissionsTree(roleId: string | number): Observable<AppModule[]> {
    return this.http.get<any>(`${this.rolePermUrl}/tree/${roleId}`).pipe(
      map(response => Array.isArray(response) ? response : (response?.items ?? response?.data ?? []))
    );
  }

  updateRolePermissions(roleId: string | number, data: UpdateRolePermissionsRequest): Observable<number> {
    return this.http.post<{ updated: number; version?: number }>(`${this.rolePermUrl}/${roleId}`, data).pipe(
      map(response => response?.version ?? response?.updated ?? 0)
    );
  }
}
