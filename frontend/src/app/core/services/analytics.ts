import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { map } from 'rxjs/operators';

export interface AnalyticsData {
  totalRevenue: number;
  totalBookings: number;
  bookingsToday: number;
  occupancyRate: number;
  labels: string[];
  revenueData: number[];
  occupancyData: number[];
}

export interface PlatformOverview {
  totalTenants: number;
  activeTenants: number;
  totalBookings: number;
  grossMerchandiseValue: number;
}

interface ApiResult<T> { succeeded: boolean; data: T; message?: string; }

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private apiUrl = `${environment.apiUrl}/analytics`;

  constructor(private http: HttpClient) {}

  getDashboardData(): Observable<AnalyticsData> {
    return this.http.get<AnalyticsData>(`${this.apiUrl}/dashboard`);
  }

  getPlatformOverview(): Observable<PlatformOverview> {
    return this.http.get<ApiResult<PlatformOverview>>(`${this.apiUrl}/platform-overview`).pipe(map(result => result.data));
  }
}
