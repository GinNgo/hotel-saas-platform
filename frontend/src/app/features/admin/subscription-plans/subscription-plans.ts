import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { AuthService } from '../../../core/services/auth';
import { AccountSubscription, SubscriptionPlan, SubscriptionPlanCommand, SubscriptionService } from '../../../core/services/subscription.service';
import { finalize, timeout } from 'rxjs';

@Component({
  selector: 'app-subscription-plans',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, CardModule, ToastModule, TableModule, TagModule, DialogModule, InputTextModule, InputNumberModule, SelectModule],
  providers: [MessageService],
  templateUrl: './subscription-plans.html',
  styles: [`
    .plan-card { height: 100%; display: flex; flex-direction: column; }
    .plan-price { margin: 1rem 0; color: var(--hotel-primary); font-size: 2rem; font-weight: 700; }
    .plan-features { flex-grow: 1; text-align: left; }
    .feature-item { display: flex; align-items: center; gap: .5rem; margin: .5rem 0; }
    .feature-item i { color: var(--hotel-success); }
  `]
})
export class SubscriptionPlansComponent implements OnInit {
  private subscriptionService = inject(SubscriptionService);
  private messageService = inject(MessageService);
  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);

  plans: SubscriptionPlan[] = [];
  mySubscriptions: AccountSubscription[] = [];
  loading = true;
  errorMessage = '';
  dialogVisible = false;
  saving = false;
  editingId?: string | number;
  form: SubscriptionPlanCommand = this.emptyForm();
  billingOptions = [
    { label: 'Theo tháng', value: 'MONTHLY' },
    { label: 'Theo năm', value: 'YEARLY' },
    { label: 'Thanh toán một lần', value: 'ONCE' }
  ];
  readonly featureCatalog = [
    { code: 'MAX_IMAGES', label: 'Hình ảnh' },
    { code: 'MAX_PROPERTIES', label: 'Số cơ sở' },
    { code: 'MAX_ROOMS', label: 'Phòng' },
    { code: 'MAX_ROOM_TYPES', label: 'Loại phòng' },
    { code: 'MAX_STAFF', label: 'Nhân viên' },
    { code: 'PROMOTION_CAMPAIGNS', label: 'Chiến dịch khuyến mãi' },
    { code: 'SPONSORED_PLACEMENTS', label: 'Vị trí tài trợ' }
  ];

  get isSystemAdministrator(): boolean {
    return this.authService.getRoles().some(role => role === 'SUPER_ADMIN' || role === 'ADMIN');
  }

  ngOnInit(): void {
    this.loadPlans();
    if (!this.isSystemAdministrator) this.loadMySubscriptions();
  }

  loadPlans(): void {
    this.loading = true;
    this.errorMessage = '';
    const request = this.isSystemAdministrator
      ? this.subscriptionService.getAdminPlans()
      : this.subscriptionService.getPlans();
    request.pipe(
      timeout(15_000),
      finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: data => {
        this.plans = data.map(plan => ({ ...plan, features: plan.features ?? [] }));
      },
      error: () => {
        this.errorMessage = 'Không thể tải danh sách gói dịch vụ.';
        this.messageService.add({ severity: 'error', summary: 'Lỗi', detail: this.errorMessage });
      }
    });
  }

  loadMySubscriptions(): void {
    this.subscriptionService.getMySubscriptions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => { this.mySubscriptions = data; this.cdr.detectChanges(); },
        error: () => { this.mySubscriptions = []; this.cdr.detectChanges(); }
      });
  }

  isCurrentPlan(plan: SubscriptionPlan): boolean {
    return this.mySubscriptions.some(sub => sub.plan.id === plan.id && sub.status === 'ACTIVE');
  }

  billingLabel(plan: SubscriptionPlan): string {
    if (plan.isLifetime || plan.billingType === 'ONCE') return 'Vĩnh viễn';
    return plan.billingType === 'YEARLY' ? 'Năm' : 'Tháng';
  }

  openCreate(): void {
    this.editingId = undefined;
    this.form = this.emptyForm();
    this.dialogVisible = true;
  }

  openEdit(plan: SubscriptionPlan): void {
    this.editingId = plan.id;
    this.form = {
      code: plan.code,
      nameVi: plan.nameVi,
      nameEn: plan.nameEn || '',
      billingType: plan.billingType as SubscriptionPlanCommand['billingType'],
      price: plan.price,
      isLifetime: plan.isLifetime,
      features: this.featureCatalog.map(item => ({
        code: item.code,
        limit: plan.features.find(feature => feature.code === item.code)?.limit ?? 0
      }))
    };
    this.dialogVisible = true;
  }

  savePlan(): void {
    if (this.saving || !this.form.code.trim() || !this.form.nameVi.trim() || this.form.price < 0) return;
    if (this.form.billingType === 'ONCE') this.form.isLifetime = true;
    this.saving = true;
    const request = this.editingId
      ? this.subscriptionService.updateAdminPlan(this.editingId, this.form)
      : this.subscriptionService.createAdminPlan(this.form);
    request.pipe(
      finalize(() => { this.saving = false; this.cdr.detectChanges(); }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: () => {
        this.dialogVisible = false;
        this.messageService.add({ severity: 'success', summary: 'Thành công', detail: this.editingId ? 'Đã cập nhật gói.' : 'Đã tạo gói mới.' });
        this.loadPlans();
      },
      error: error => {
        const detail = error.error?.message || error.error?.detail || 'Không thể lưu gói dịch vụ.';
        this.messageService.add({ severity: 'error', summary: 'Lỗi', detail });
      }
    });
  }

  toggleSelling(plan: SubscriptionPlan): void {
    const nextStatus = plan.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    this.subscriptionService.setAdminPlanStatus(plan.id, nextStatus)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.plans = this.plans.map(item => item.id === updated.id ? { ...updated, features: updated.features ?? [] } : item);
          this.messageService.add({ severity: 'success', summary: 'Thành công', detail: nextStatus === 'ACTIVE' ? 'Gói đã được bán lại.' : 'Gói đã ngừng bán.' });
          this.cdr.detectChanges();
        },
        error: error => this.messageService.add({ severity: 'error', summary: 'Lỗi', detail: error.error?.message || 'Không thể đổi trạng thái gói.' })
      });
  }

  private emptyForm(): SubscriptionPlanCommand {
    return {
      code: '',
      nameVi: '',
      nameEn: '',
      billingType: 'MONTHLY',
      price: 0,
      isLifetime: false,
      features: this.featureCatalog.map(item => ({ code: item.code, limit: 0 }))
    };
  }
}
