import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AnalyticsData {
  totalRevenue: number;
  totalBookings: number;
  bookingsToday: number;
  occupancyRate: number;
  labels: string[];
  revenueData: number[];
  occupancyData: number[];
}

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private apiUrl = `${environment.apiUrl}/analytics`;

  constructor(private http: HttpClient) {}

  getDashboardData(): Observable<AnalyticsData> {
    return this.http.get<AnalyticsData>(`${this.apiUrl}/dashboard`);
  }
}
