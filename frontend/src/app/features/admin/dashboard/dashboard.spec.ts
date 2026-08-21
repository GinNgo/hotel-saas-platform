import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AnalyticsService } from '../../../core/services/analytics';
import { AdminInventoryService } from '../../../core/services/admin-inventory.service';
import { AuthService } from '../../../core/services/auth';
import { Dashboard } from './dashboard';
import { PropertyService } from '../../../core/services/property.service';
import { HotelServiceService } from '../../../core/services/hotel-service.service';
import { Router } from '@angular/router';
import { vi } from 'vitest';

describe('Admin Dashboard', () => {
  it('loads real out-of-service rooms as maintenance work orders', async () => {
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { getRoles: () => [] } },
        { provide: AnalyticsService, useValue: { getDashboardData: () => of({ totalRevenue: 500000, totalBookings: 1, bookingsToday: 3, occupancyRate: 50, labels: ['19/08'], revenueData: [500000], occupancyData: [50] }) } },
        { provide: AdminInventoryService, useValue: { getRooms: () => of([
          { id: 'room-1', hotelId: 'hotel-1', roomTypeId: 'type-1', roomNumber: '101', floor: 1, status: 'OUT_OF_SERVICE', housekeepingStatus: 'CLEAN', maintenanceStatus: 'MAINTENANCE', maintenanceReason: 'Kiểm tra điều hòa' },
          { id: 'room-2', hotelId: 'hotel-1', roomTypeId: 'type-1', roomNumber: '102', floor: 1, status: 'AVAILABLE', housekeepingStatus: 'CLEAN', maintenanceStatus: 'NONE' },
        ]), getRoomTypes: () => of([]) } },
        { provide: PropertyService, useValue: { getAllProperties: () => of([]), submitProperty: vi.fn() } },
        { provide: HotelServiceService, useValue: { getServices: () => of([]) } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.totalWorkOrders).toBe(1);
    expect(fixture.componentInstance.workOrders[0]).toMatchObject({ roomNumber: '101', issue: 'Kiểm tra điều hòa' });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('101');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('3');

    fixture.componentInstance.onFilterChange({ keyword: 'không có' });
    expect(fixture.componentInstance.totalWorkOrders).toBe(0);
    fixture.componentInstance.onFilterChange({ keyword: 'điều hòa' });
    expect(fixture.componentInstance.totalWorkOrders).toBe(1);
  });

  it('derives onboarding from real catalogs and submits the active property for approval', async () => {
    const submitProperty = vi.fn(() => of({
      id: 'hotel-1', name: 'Audit Hotel', nameVi: 'Audit Hotel', addressLine: '1 Biển',
      status: 'PENDING_APPROVAL', approvalStatus: 'PENDING_APPROVAL', operationStatus: 'INACTIVE',
    }));
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { getRoles: () => ['PROPERTY_OWNER'] } },
        { provide: AnalyticsService, useValue: { getDashboardData: () => of({ totalRevenue: 0, totalBookings: 0, bookingsToday: 0, occupancyRate: 0, labels: [], revenueData: [], occupancyData: [] }) } },
        { provide: AdminInventoryService, useValue: {
          getRooms: () => of([]),
          getRoomTypes: () => of([{ id: 'type-1', hotelId: 'hotel-1' }]),
        } },
        { provide: PropertyService, useValue: {
          getAllProperties: () => of([{ id: 'hotel-1', name: 'Audit Hotel', nameVi: 'Audit Hotel', addressLine: '1 Biển', status: 'DRAFT' }]),
          submitProperty,
        } },
        { provide: HotelServiceService, useValue: { getServices: () => of([{ id: 'service-1', hotelId: 'hotel-1' }]) } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.completedSteps).toBe(3);
    expect(fixture.componentInstance.progressPercentage).toBe(75);

    fixture.componentInstance.submitOnboardingApproval();
    expect(submitProperty).toHaveBeenCalledWith('hotel-1');
    expect(fixture.componentInstance.approvalButtonLabel).toBe('Đang chờ duyệt');
    expect(fixture.componentInstance.onboardingMessage).toContain('chờ quản trị viên');

    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.componentInstance.navigateTo('/admin/properties');
    expect(navigate).toHaveBeenCalledWith(['/admin/properties']);
  });
});
