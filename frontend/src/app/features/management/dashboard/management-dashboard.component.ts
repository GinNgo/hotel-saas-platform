import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ManagedProperty, ManagementApiService, ManagementContext } from '../../../core/services/management-api.service';
import { FeedbackStateComponent } from '../../../shared/components/feedback-state/feedback-state.component';

@Component({
  selector: 'app-management-dashboard', standalone: true, imports: [CommonModule, FormsModule, RouterLink, FeedbackStateComponent],
  templateUrl: './management-dashboard.component.html', styleUrl: './management-dashboard.component.css'
})
export class ManagementDashboardComponent implements OnInit {
  private api = inject(ManagementApiService);
  private cdr = inject(ChangeDetectorRef);
  context?: ManagementContext;
  selectedPropertyId?: string | number;
  loading = true;
  error = '';

  ngOnInit(): void { this.load(); }
  load(propertyId?: string | number): void {
    this.loading = true;
    this.error = '';
    this.api.context(propertyId).subscribe({
      next: context => { this.context = context; this.selectedPropertyId = context.activePropertyId; this.loading = false; this.cdr.markForCheck(); },
      error: error => { this.error = error?.error?.message || 'Không thể tải tổng quan.'; this.loading = false; this.cdr.markForCheck(); }
    });
  }
  selectProperty(): void { this.load(this.selectedPropertyId); }
  get activeProperty(): ManagedProperty | undefined { return this.context?.properties.find(property => property.id === this.selectedPropertyId); }
  propertyName(property: ManagedProperty): string {
    return property.nameVi?.trim()
      || property.name?.trim()
      || property.nameEn?.trim()
      || `Cơ sở #${property.id}`;
  }
  get activePropertyOperational(): boolean {
    return this.context?.activePropertyOperational
      ?? this.activeProperty?.operational
      ?? (this.activeProperty?.approvalStatus === 'APPROVED' && this.activeProperty?.operationStatus === 'ACTIVE');
  }
  value(name: string): number { return this.context?.dashboard?.[name] || 0; }
  get totalOperationalRooms(): number { return this.value('totalRooms'); }
  get occupancyRate(): number { return this.totalOperationalRooms ? Math.round((this.value('occupiedRooms') / this.totalOperationalRooms) * 100) : 0; }
  formatVnd(value: number): string { return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value || 0)} ₫`; }
  limit(name: string): string { const value = this.context?.limits?.[name]; return value === -1 ? 'Không giới hạn' : String(value ?? 0); }
  statusLabel(status?: string): string {
    return ({
      ACTIVE: 'Đang hoạt động',
      INACTIVE: 'Không hoạt động',
      EXPIRED: 'Đã hết hạn',
      SUSPENDED: 'Tạm ngưng',
      PENDING: 'Chờ xử lý',
      PENDING_PAYMENT: 'Chờ thanh toán',
      DRAFT: 'Bản nháp',
      PENDING_APPROVAL: 'Chờ duyệt',
      APPROVED: 'Đã duyệt',
      REJECTED: 'Bị từ chối',
      NONE: 'Chưa có',
    } as Record<string, string>)[status || 'NONE'] || status || 'Chưa có';
  }
  sourceLabel(source?: string): string {
    return ({ PLATFORM: 'Hệ thống thanh toán gói', LEGACY: 'Dữ liệu thuê bao cũ', NONE: 'Chưa có' } as Record<string, string>)[source || 'NONE'] || source || 'Chưa có';
  }
}
