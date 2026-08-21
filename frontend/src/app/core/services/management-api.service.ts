import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface ManagedProperty { id: string | number; code: string; nameVi?: string; name?: string; nameEn?: string; propertyType: string; address: string; provinceId?: number; wardId?: number; approvalStatus: string; operationStatus: string; operational?: boolean; mainImage?: string; isDemo: boolean; }
export interface CreateManagementPropertyRequest { nameVi: string; nameEn: string; propertyType: string; provinceId: string | number | null; wardId?: string | number | null; address: string; phone: string; email: string; website: string; starRating: number; descriptionVi: string; descriptionEn: string; }
export interface ManagementUsage { properties?: number; roomTypes?: number; rooms?: number; staff?: number; images?: number; }
export interface ManagementContext { properties: ManagedProperty[]; activePropertyId?: string | number; activePropertyOperational?: boolean; planCode: string; subscriptionStatus: string; subscriptionSource?: string; endAt?: string; lifetime: boolean; limits: Record<string, number>; usage: ManagementUsage; upgradeRequired: boolean; dashboard?: Record<string, number>; }
export interface ManagementRoom { id: string | number; hotelId: string | number; roomTypeId: string | number; roomTypeCode?: string; roomTypeNameVi: string; roomNumber: string; floor: number; status: string; housekeepingStatus: string; maintenanceStatus: string; note?: string; }

@Injectable({ providedIn: 'root' })
export class ManagementApiService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/management`;

  context(activePropertyId?: string | number) {
    return this.http.get<ManagementContext>(`${this.baseUrl}/context`, { params: activePropertyId ? { activePropertyId } : {} });
  }
  properties() { return this.http.get<ManagedProperty[]>(`${this.baseUrl}/properties`); }
  createProperty(body: CreateManagementPropertyRequest) { return this.http.post<ManagedProperty>(`${this.baseUrl}/properties`, body); }
  roomTypes(propertyId: string | number) { return this.http.get<any[]>(`${this.baseUrl}/room-types`, { params: { propertyId } }); }
  rooms(propertyId: string | number) { return this.http.get<ManagementRoom[]>(`${this.baseUrl}/rooms`, { params: { propertyId } }); }
  createRoomType(body: any) { return this.http.post<any>(`${this.baseUrl}/room-types`, body); }
  createRoom(body: any) { return this.http.post<any>(`${this.baseUrl}/rooms`, body); }
  bulkRooms(body: any) { return this.http.post<any[]>(`${this.baseUrl}/rooms/bulk`, body); }
  startRoomMaintenance(roomId: string | number, reason: string) { return this.http.post<any>(`${this.baseUrl}/rooms/${roomId}/maintenance/start`, { reason }); }
  completeRoomMaintenance(roomId: string | number) { return this.http.post<any>(`${this.baseUrl}/rooms/${roomId}/maintenance/complete`, {}); }
}
