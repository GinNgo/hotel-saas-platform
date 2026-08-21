import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { Hotel } from './client-api.service';

export interface AdminProperty extends Hotel {
  nameVi?: string;
  nameEn?: string;
  status?: string;
  operationStatus?: string;
  taxRatePercent?: number;
  serviceFeeRatePercent?: number;
}

export interface PropertyLocation {
  id: string | number;
  nameVi: string;
  nameEn?: string;
  locationType: 'PROVINCE' | 'WARD';
  parent?: { id: string | number };
  fullPath?: string;
  legacyParentName?: string;
  displayName?: string;
}

export interface CreatePropertyRequest {
  name: string;
  nameVi: string;
  nameEn?: string;
  propertyType: string;
  addressLine: string;
  city: string;
  country: string;
  provinceId?: string | number | null;
  wardId?: string | number | null;
  description?: string;
  descriptionVi?: string;
  descriptionEn?: string;
  starRating?: number;
  phone?: string;
  email?: string;
  website?: string;
  mainImage?: string;
  amenityCodes?: string[];
  checkInTime?: string;
  checkOutTime?: string;
  cancellationPolicy?: string;
  childrenPolicy?: string;
  petPolicy?: string;
  houseRules?: string;
  taxRatePercent?: number;
  serviceFeeRatePercent?: number;
  latitude?: number;
  longitude?: number;
  status: 'DRAFT';
  approvalStatus: 'DRAFT';
  operationStatus: 'INACTIVE';
  isDemo: false;
  dataSource: 'ADMIN';
}

@Injectable({
  providedIn: 'root'
})
export class PropertyService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/v1/hotels`;

  getAllProperties(): Observable<AdminProperty[]> {
    return this.http.get<AdminProperty[]>(this.apiUrl);
  }

  getProvinces(): Observable<PropertyLocation[]> {
    return this.http.get<PropertyLocation[]>(`${environment.apiUrl}/public/locations/provinces`);
  }

  getWards(provinceId: string | number): Observable<PropertyLocation[]> {
    return this.http.get<PropertyLocation[]>(`${environment.apiUrl}/public/locations/provinces/${provinceId}/wards`).pipe(
      map((wards) => wards
        .map((ward) => ({
          ...ward,
          displayName: ward.legacyParentName
            ? `${ward.nameVi} — ${ward.legacyParentName}`
            : ward.nameVi,
        }))
        .sort((left, right) => (left.displayName ?? left.nameVi).localeCompare(
          right.displayName ?? right.nameVi,
          'vi',
          { numeric: true },
        )),
      ),
    );
  }

  createProperty(property: CreatePropertyRequest): Observable<AdminProperty> {
    return this.http.post<AdminProperty>(this.apiUrl, property);
  }

  updateProperty(id: string | number, property: Partial<CreatePropertyRequest>): Observable<AdminProperty> {
    return this.http.put<AdminProperty>(`${this.apiUrl}/${id}`, property);
  }

  updatePricingSettings(id: string | number, settings: { taxRatePercent: number; serviceFeeRatePercent: number }): Observable<AdminProperty> {
    return this.http.put<AdminProperty>(`${this.apiUrl}/${id}/pricing-settings`, settings);
  }

  submitProperty(id: string | number): Observable<AdminProperty> {
    return this.http.post<AdminProperty>(`${this.apiUrl}/${id}/submit`, {});
  }

  approveProperty(id: string | number): Observable<AdminProperty> {
    return this.http.post<AdminProperty>(`${this.apiUrl}/${id}/approve`, {});
  }

  rejectProperty(id: string | number): Observable<AdminProperty> {
    return this.http.post<AdminProperty>(`${this.apiUrl}/${id}/reject`, {});
  }
}
