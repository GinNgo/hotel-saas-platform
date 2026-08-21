import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AnalyticsService, AnalyticsData } from '../../../core/services/analytics';
import { StatCard } from '../../../shared/components/stat-card/stat-card';
import { RevenueChart } from '../../../shared/components/charts/revenue-chart/revenue-chart';
import { OccupancyChart } from '../../../shared/components/charts/occupancy-chart/occupancy-chart';
import { DataTable, ColumnDefinition } from '../../../shared/components/data-table/data-table';
import { PageRequest, SortRequest, FilterRequest } from '../../../shared/models/pagination.model';
import { AuthService } from '../../../core/services/auth';
import { AdminInventoryService, AdminRoom } from '../../../core/services/admin-inventory.service';
import { finalize } from 'rxjs';
import { catchError, forkJoin, of } from 'rxjs';
import { AdminProperty, PropertyService } from '../../../core/services/property.service';
import { HotelServiceService } from '../../../core/services/hotel-service.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, StatCard, RevenueChart, OccupancyChart, DataTable],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard implements OnInit {
  // Onboarding Phase 1 State
  isPhase1 = true;
  onboardingProgress = {
    profileCompleted: false,
    roomsCompleted: false,
    servicesCompleted: false,
    isApproved: false
  };
  onboardingProperty: AdminProperty | null = null;
  onboardingLoading = false;
  onboardingSubmitting = false;
  onboardingMessage = '';
  onboardingError = '';

  get showOnboarding(): boolean {
    const setupRoles = ['PROPERTY_OWNER', 'HOTEL_ADMIN', 'HOTEL_MANAGER', 'OWNER', 'MANAGER'];
    return this.authService.getRoles().some(role => setupRoles.includes(role));
  }

  get completedSteps(): number {
    let count = 0;
    if (this.onboardingProgress.profileCompleted) count++;
    if (this.onboardingProgress.roomsCompleted) count++;
    if (this.onboardingProgress.servicesCompleted) count++;
    return count;
  }

  get progressPercentage(): number {
    return ((this.completedSteps + (this.onboardingProgress.isApproved ? 1 : 0)) / 4) * 100;
  }

  data: AnalyticsData | null = null;
  revenueChartData: any;
  occupancyChartData: any;
  chartOptions: any;

  // Work Orders Table Data
  workOrderColumns: ColumnDefinition[] = [
    { field: 'priority', header: 'Ưu tiên', sortable: true, type: 'badge' },
    { field: 'roomNumber', header: 'Số phòng', sortable: true },
    { field: 'issue', header: 'Sự cố báo cáo' },
    { field: 'reporter', header: 'Người báo cáo' },
    { field: 'createdAt', header: 'Ngày tạo', sortable: true },
    { field: 'status', header: 'Trạng thái', type: 'badge' }
  ];
  
  workOrders: any[] = [];
  private allWorkOrders: any[] = [];
  private workOrderPage: PageRequest = { pageNumber: 1, pageSize: 10 };
  totalWorkOrders = 0;
  loadingWorkOrders = false;
  workOrdersError = '';

  constructor(
    private analyticsService: AnalyticsService, 
    private cdr: ChangeDetectorRef,
    private router: Router,
    private authService: AuthService,
    private inventoryService: AdminInventoryService,
    private propertyService: PropertyService,
    private hotelService: HotelServiceService
  ) {}

  navigateTo(route: string) {
    this.router.navigate([route]);
  }

  ngOnInit() {
    this.analyticsService.getDashboardData().subscribe((res) => {
      this.data = res;
      this.initCharts();
    });
    this.loadWorkOrders();
    if (this.showOnboarding) this.loadOnboarding();

    const documentStyle = getComputedStyle(document.documentElement);
    const textColor = documentStyle.getPropertyValue('--hotel-text');
    const textColorSecondary = documentStyle.getPropertyValue('--hotel-text-muted');
    const surfaceBorder = documentStyle.getPropertyValue('--hotel-border');

    this.chartOptions = {
      maintainAspectRatio: false,
      aspectRatio: 0.8,
      plugins: {
        legend: {
          labels: {
            color: textColor
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: textColorSecondary,
            font: {
              weight: 500
            }
          },
          grid: {
            color: surfaceBorder,
            drawBorder: false
          }
        },
        y: {
          ticks: {
            color: textColorSecondary
          },
          grid: {
            color: surfaceBorder,
            drawBorder: false
          }
        }
      }
    };
  }

  initCharts() {
    if (!this.data) return;

    const documentStyle = getComputedStyle(document.documentElement);

    this.revenueChartData = {
      labels: this.data.labels,
      datasets: [
        {
          label: 'Doanh thu (VNĐ)',
          data: this.data.revenueData,
          fill: true,
          borderColor: documentStyle.getPropertyValue('--hotel-primary'),
          tension: 0.4,
          backgroundColor: 'rgba(37, 99, 235, 0.2)'
        }
      ]
    };

    this.occupancyChartData = {
      labels: this.data.labels,
      datasets: [
        {
          label: 'Thực tế (%)',
          data: this.data.occupancyData,
          fill: false,
          borderColor: documentStyle.getPropertyValue('--hotel-success'),
          tension: 0.4
        }
      ]
    };
  }

  loadWorkOrders() {
    if (this.loadingWorkOrders) return;
    this.loadingWorkOrders = true;
    this.workOrdersError = '';
    this.inventoryService.getRooms().pipe(
      finalize(() => { this.loadingWorkOrders = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: rooms => {
        this.allWorkOrders = rooms.filter(room => this.isMaintenanceRoom(room)).map(room => ({
          id: room.id,
          priority: 'HIGH',
          roomNumber: room.roomNumber,
          issue: room.maintenanceReason?.trim() || room.note?.trim() || 'Phòng đang tạm ngưng để bảo trì',
          reporter: 'Hệ thống vận hành',
          createdAt: room.maintenanceStartedAt || room.updatedAt || room.createdAt || '',
          status: room.maintenanceStatus || 'MAINTENANCE',
        }));
        this.applyWorkOrderView();
      },
      error: error => { this.workOrders = []; this.totalWorkOrders = 0; this.workOrdersError = error?.error?.message || 'Không thể tải danh sách phòng bảo trì.'; },
    });
  }

  loadOnboarding(): void {
    if (this.onboardingLoading) return;
    this.onboardingLoading = true;
    this.onboardingError = '';
    forkJoin({
      properties: this.propertyService.getAllProperties().pipe(catchError(() => of([]))),
      roomTypes: this.inventoryService.getRoomTypes().pipe(catchError(() => of([]))),
      services: this.hotelService.getServices().pipe(catchError(() => of([]))),
    }).pipe(finalize(() => { this.onboardingLoading = false; this.cdr.detectChanges(); })).subscribe({
      next: ({ properties, roomTypes, services }) => {
        const property = properties[0] || null;
        this.onboardingProperty = property;
        const propertyId = property?.id;
        this.onboardingProgress.profileCompleted = !!property && !!(property.nameVi || property.name)?.trim() && !!property.addressLine?.trim();
        this.onboardingProgress.roomsCompleted = !!propertyId && roomTypes.some(item => String(item.hotelId) === String(propertyId));
        this.onboardingProgress.servicesCompleted = !!propertyId && services.some(item => String(item.hotelId) === String(propertyId));
        this.onboardingProgress.isApproved = this.propertyStatus(property) === 'ACTIVE';
      },
      error: error => { this.onboardingError = error?.error?.message || 'Không thể tải tiến độ thiết lập cơ sở.'; },
    });
  }

  submitOnboardingApproval(): void {
    const property = this.onboardingProperty;
    if (!property || this.completedSteps < 3 || this.onboardingSubmitting || !this.canSubmitApproval) return;
    this.onboardingSubmitting = true;
    this.onboardingError = '';
    this.onboardingMessage = '';
    this.propertyService.submitProperty(property.id).pipe(
      finalize(() => { this.onboardingSubmitting = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: updated => {
        this.onboardingProperty = updated;
        this.onboardingProgress.isApproved = this.propertyStatus(updated) === 'ACTIVE';
        this.onboardingMessage = this.onboardingProgress.isApproved
          ? 'Cơ sở đã được kích hoạt.'
          : 'Đã gửi hồ sơ. Cơ sở đang chờ quản trị viên xét duyệt.';
      },
      error: error => { this.onboardingError = error?.error?.message || 'Không thể gửi yêu cầu duyệt.'; },
    });
  }

  get canSubmitApproval(): boolean {
    return ['DRAFT', 'INACTIVE', 'REJECTED'].includes(this.propertyStatus(this.onboardingProperty));
  }

  get approvalButtonLabel(): string {
    if (this.onboardingSubmitting) return 'Đang gửi...';
    const status = this.propertyStatus(this.onboardingProperty);
    if (status === 'ACTIVE') return 'Đã kích hoạt';
    if (status === 'PENDING' || status === 'PENDING_APPROVAL') return 'Đang chờ duyệt';
    return 'Gửi yêu cầu';
  }

  private propertyStatus(property: AdminProperty | null): string {
    return String(property?.status || property?.approvalStatus || property?.operationStatus || '').toUpperCase();
  }

  private isMaintenanceRoom(room: AdminRoom): boolean {
    return room.status === 'OUT_OF_SERVICE' || room.status === 'MAINTENANCE' || room.maintenanceStatus === 'MAINTENANCE';
  }

  private applyWorkOrderView(): void {
    const keyword = this.workOrderPage.keyword?.trim().toLocaleLowerCase('vi') || '';
    let rows = keyword ? this.allWorkOrders.filter(row =>
      [row.roomNumber, row.issue, row.reporter, row.status].some(value => String(value || '').toLocaleLowerCase('vi').includes(keyword)))
      : [...this.allWorkOrders];
    const field = this.workOrderPage.sortField;
    if (field) {
      const direction = this.workOrderPage.sortDirection === 'desc' ? -1 : 1;
      rows.sort((left, right) => String(left[field] ?? '').localeCompare(String(right[field] ?? ''), 'vi', { numeric: true }) * direction);
    }
    this.totalWorkOrders = rows.length;
    const start = (this.workOrderPage.pageNumber - 1) * this.workOrderPage.pageSize;
    this.workOrders = rows.slice(start, start + this.workOrderPage.pageSize);
  }

  onPageChange(event: PageRequest) {
    this.workOrderPage = { ...this.workOrderPage, ...event };
    this.applyWorkOrderView();
  }

  onSortChange(event: SortRequest) {
    this.workOrderPage = { ...this.workOrderPage, ...event, pageNumber: 1 };
    this.applyWorkOrderView();
  }

  onFilterChange(event: FilterRequest) {
    this.workOrderPage = { ...this.workOrderPage, keyword: event.keyword, pageNumber: 1 };
    this.applyWorkOrderView();
  }
}
