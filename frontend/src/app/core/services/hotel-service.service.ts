import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface HotelServiceDTO {
  id?: string | number;
  hotelId?: string | number;
  code: string;
  nameVi: string;
  nameEn: string;
  price: number;
  descriptionVi?: string;
  descriptionEn?: string;
  status: string;
  systemService?: boolean;
  createdAt?: string;
}

@Injectable({
  providedIn: 'root'
})
export class HotelServiceService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/services`;

  getServices(hotelId?: string | number): Observable<HotelServiceDTO[]> {
    return this.http.get<HotelServiceDTO[]>(this.apiUrl, hotelId ? { params: { hotelId } } : {});
  }

  getServicesForHotel(hotelId: string | number): Observable<HotelServiceDTO[]> {
    if ((typeof hotelId === 'number' && (!Number.isInteger(hotelId) || hotelId <= 0))
      || (typeof hotelId === 'string' && !hotelId.trim())) {
      throw new Error('A valid hotelId is required to load a tenant service catalog.');
    }
    return this.getServices(hotelId);
  }

  createService(service: HotelServiceDTO, hotelId?: string | number): Observable<HotelServiceDTO> {
    return this.http.post<HotelServiceDTO>(this.apiUrl, service, hotelId ? { params: { hotelId } } : {});
  }

  updateService(id: string | number, service: HotelServiceDTO): Observable<HotelServiceDTO> {
    return this.http.put<HotelServiceDTO>(`${this.apiUrl}/${id}`, service);
  }

  deleteService(id: string | number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
