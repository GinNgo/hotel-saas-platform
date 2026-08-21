import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface AdminPropertyOption { id: string | number; name: string; nameVi?: string; code?: string; }
export interface AdminRoomType {
  id: string | number; hotelId: string | number; code: string; nameVi: string; nameEn?: string;
  descriptionVi?: string; descriptionEn?: string; bedType?: string; bedCount?: number;
  area?: number; maxAdults?: number; maxChildren?: number; maxGuests: number;
  basePrice: number; status: string; totalRooms?: number; imageUrls?: string[];
  includesBreakfast?: boolean; isRefundable?: boolean; freeCancellationHours?: number;
  smokingAllowed?: boolean; amenityCodes?: string[];
  images?: RoomTypeImage[];
  createdAt?: string; updatedAt?: string;
}
export interface AdminRoom {
  id: string | number; hotelId: string | number; roomTypeId: string | number; roomTypeCode?: string;
  roomTypeNameVi?: string; roomNumber: string; floor: number; status: string;
  housekeepingStatus: string; maintenanceStatus: string; maxGuests?: number;
  note?: string; createdAt?: string; updatedAt?: string;
  maintenanceReason?: string; maintenanceStartedAt?: string; maintenanceCompletedAt?: string;
  maintenanceStartedByUserId?: string | number; maintenanceCompletedByUserId?: string | number;
}
export interface BulkRoomRequest {
  hotelId: string | number; roomTypeId: string | number; floor: number; fromNumber: number;
  toNumber: number; prefix?: string; status?: 'AVAILABLE';
}
export interface BulkRoomResult { created: AdminRoom[]; failedRoomNumbers: string[]; }
export interface PagedResult<T> { items: T[]; page: number; pageSize: number; totalItems: number; totalPages: number; }
export interface RoomTypeImage { id: string; url: string; thumbnailUrl?: string; displayOrder: number; altText?: string; isPrimary: boolean; }

@Injectable({ providedIn: 'root' })
export class AdminInventoryService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  getProperties(): Observable<AdminPropertyOption[]> {
    return this.http.get<AdminPropertyOption[]>(`${this.api}/v1/hotels`);
  }
  getRoomTypes(includeDeleted = false): Observable<AdminRoomType[]> { return this.http.get<AdminRoomType[]>(`${this.api}/room-types`, { params: includeDeleted ? { includeDeleted: 'true' } : {} }); }
  getRoomTypesPaged(query: Record<string, string | number | boolean | undefined>): Observable<PagedResult<AdminRoomType>> {
    let params = new HttpParams(); Object.entries(query).forEach(([key, value]) => { if (value !== undefined) params = params.set(key, String(value)); });
    return this.http.get<PagedResult<AdminRoomType>>(`${this.api}/room-types/paged`, { params });
  }
  createRoomType(value: Partial<AdminRoomType>): Observable<AdminRoomType> { return this.http.post<AdminRoomType>(`${this.api}/room-types`, value); }
  updateRoomType(id: string | number, value: Partial<AdminRoomType>): Observable<AdminRoomType> { return this.http.put<AdminRoomType>(`${this.api}/room-types/${id}`, value); }
  deleteRoomType(id: string | number): Observable<void> { return this.http.delete<void>(`${this.api}/room-types/${id}`); }
  restoreRoomType(id: string | number): Observable<AdminRoomType> { return this.http.post<AdminRoomType>(`${this.api}/room-types/${id}/restore`, {}); }
  uploadRoomTypeImage(id: string | number, file: File, altText = ''): Observable<RoomTypeImage> { const form = new FormData(); form.append('file', file); form.append('altText', altText); return this.http.post<RoomTypeImage>(`${this.api}/media/room-types/${id}`, form); }
  deleteRoomTypeImage(id: string | number, imageId: string): Observable<void> { return this.http.delete<void>(`${this.api}/media/room-types/${id}/${imageId}`); }
  updateRoomTypeImage(id: string | number, imageId: string, altText: string): Observable<RoomTypeImage> { return this.http.put<RoomTypeImage>(`${this.api}/media/room-types/${id}/${imageId}`, { altText }); }
  orderRoomTypeImages(id: string | number, imageIds: string[]): Observable<void> { return this.http.put<void>(`${this.api}/media/room-types/${id}/order`, imageIds); }

  getRooms(includeDeleted = false): Observable<AdminRoom[]> { return this.http.get<AdminRoom[]>(`${this.api}/rooms`, { params: includeDeleted ? { includeDeleted: 'true' } : {} }); }
  getRoomsPaged(query: Record<string, string | number | undefined>): Observable<PagedResult<AdminRoom>> { let params = new HttpParams(); Object.entries(query).forEach(([key, value]) => { if (value !== undefined) params = params.set(key, String(value)); }); return this.http.get<PagedResult<AdminRoom>>(`${this.api}/rooms/paged`, { params }); }
  getAvailableRooms(checkIn: string, checkOut: string, hotelId?: string | number): Observable<AdminRoom[]> {
    let params = new HttpParams().set('checkIn', checkIn).set('checkOut', checkOut);
    if (hotelId !== undefined && hotelId !== null) params = params.set('hotelId', String(hotelId));
    return this.http.get<AdminRoom[]>(`${this.api}/rooms/available`, { params });
  }
  createRoom(value: Partial<AdminRoom>): Observable<AdminRoom> { return this.http.post<AdminRoom>(`${this.api}/rooms`, value); }
  updateRoom(id: string | number, value: Partial<AdminRoom>): Observable<AdminRoom> { return this.http.put<AdminRoom>(`${this.api}/rooms/${id}`, value); }
  startRoomMaintenance(id: string | number, reason: string): Observable<AdminRoom> { return this.http.post<AdminRoom>(`${this.api}/rooms/${id}/maintenance/start`, { reason }); }
  completeRoomMaintenance(id: string | number): Observable<AdminRoom> { return this.http.post<AdminRoom>(`${this.api}/rooms/${id}/maintenance/complete`, {}); }
  deleteRoom(id: string | number): Observable<void> { return this.http.delete<void>(`${this.api}/rooms/${id}`); }
  restoreRoom(id: string | number): Observable<AdminRoom> { return this.http.post<AdminRoom>(`${this.api}/rooms/${id}/restore`, {}); }
  bulkCreateRooms(value: BulkRoomRequest): Observable<BulkRoomResult> { return this.http.post<BulkRoomResult>(`${this.api}/rooms/bulk`, value); }
}
