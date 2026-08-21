import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { ActionCode, FunctionCode, PermissionService } from '../../../core/services/permission.service';
import { Promotion, PromotionService, SavePromotionRequest } from '../../../core/services/promotion.service';

@Component({ selector: 'app-promotion-management', standalone: true, imports: [CommonModule, FormsModule], templateUrl: './promotion-management.component.html', styleUrl: './promotion-management.component.css' })
export class PromotionManagementComponent implements OnInit {
  private readonly api = inject(PromotionService); private readonly permissions = inject(PermissionService); private readonly cdr = inject(ChangeDetectorRef);
  promotions: Promotion[] = []; loading = true; saving = false; error = ''; showForm = false; editingId?: string;
  form: SavePromotionRequest = this.emptyForm();
  get canCreate(): boolean { return this.permissions.hasPermission(FunctionCode.HOTEL, ActionCode.CREATE); }
  get canUpdate(): boolean { return this.permissions.hasPermission(FunctionCode.HOTEL, ActionCode.UPDATE); }
  ngOnInit(): void { this.load(); }
  load(): void { this.loading = true; this.api.list().pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); })).subscribe({ next: rows => { this.promotions = rows; }, error: e => { this.error = e?.error?.message || 'Không thể tải danh sách ưu đãi.'; } }); }
  openCreate(): void { if (!this.canCreate) return; this.editingId = undefined; this.form = this.emptyForm(); this.showForm = true; }
  openEdit(item: Promotion): void { if (!this.canUpdate) return; this.editingId = item.id; this.form = { code: item.code, title: item.title, discountPercent: item.discountPercent, maxDiscountAmount: item.maxDiscountAmount, minBookingAmount: item.minBookingAmount, startDateUtc: this.localDateTime(item.startDateUtc), endDateUtc: this.localDateTime(item.endDateUtc), isActive: item.isActive, applicationType: item.applicationType }; this.showForm = true; }
  save(): void { if (this.saving || !this.valid || (this.editingId ? !this.canUpdate : !this.canCreate)) return; this.saving = true; this.error = ''; const request = this.editingId ? this.api.update(this.editingId, this.form) : this.api.create(this.form); request.pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); })).subscribe({ next: () => { this.showForm = false; this.load(); }, error: e => { this.error = e?.error?.message || 'Không thể lưu ưu đãi.'; } }); }
  deactivate(item: Promotion): void { if (!this.canUpdate || this.saving || !globalThis.confirm(`Tắt ưu đãi ${item.code}?`)) return; this.saving = true; this.api.deactivate(item.id).pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); })).subscribe({ next: () => this.load(), error: e => { this.error = e?.error?.message || 'Không thể tắt ưu đãi.'; } }); }
  get valid(): boolean { return !!this.form.code.trim() && !!this.form.title.trim() && this.form.discountPercent > 0 && this.form.discountPercent <= 100 && !!this.form.startDateUtc && !!this.form.endDateUtc && this.form.startDateUtc < this.form.endDateUtc; }
  private emptyForm(): SavePromotionRequest { const start = new Date(); const end = new Date(Date.now() + 7 * 86400000); return { code: '', title: '', discountPercent: 10, maxDiscountAmount: null, minBookingAmount: null, startDateUtc: this.localDateTime(start.toISOString()), endDateUtc: this.localDateTime(end.toISOString()), isActive: true, applicationType: 'AUTOMATIC' }; }
  private localDateTime(value: string): string { return value.slice(0, 16); }
  formatDate(value: string): string { return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(new Date(value)); }
}
