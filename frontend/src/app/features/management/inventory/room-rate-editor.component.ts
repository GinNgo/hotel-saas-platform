import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, Input, OnChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { ActionCode, FunctionCode, PermissionService } from '../../../core/services/permission.service';
import { RoomRateOverride, RoomRateOverrideService, SaveRoomRateOverrideRequest } from '../../../core/services/room-rate-override.service';

@Component({
  selector: 'app-room-rate-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './room-rate-editor.component.html',
  styleUrl: './room-rate-editor.component.css',
})
export class RoomRateEditorComponent implements OnChanges {
  @Input({ required: true }) roomTypes: any[] = [];

  private readonly api = inject(RoomRateOverrideService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  selectedRoomTypeId = '';
  rates: RoomRateOverride[] = [];
  loading = false;
  saving = false;
  error = '';
  editingId?: string;
  showForm = false;
  form: SaveRoomRateOverrideRequest = this.emptyForm();

  get canCreate(): boolean { return this.permissions.hasPermission(FunctionCode.ROOM_TYPE, ActionCode.CREATE); }
  get canUpdate(): boolean { return this.permissions.hasPermission(FunctionCode.ROOM_TYPE, ActionCode.UPDATE); }
  get canDelete(): boolean { return this.permissions.hasPermission(FunctionCode.ROOM_TYPE, ActionCode.DELETE); }
  get selectedRoomType(): any | undefined { return this.roomTypes.find(item => String(item.id) === this.selectedRoomTypeId); }

  ngOnChanges(): void {
    if (!this.roomTypes.length) { this.selectedRoomTypeId = ''; this.rates = []; return; }
    if (!this.roomTypes.some(item => String(item.id) === this.selectedRoomTypeId)) {
      this.selectedRoomTypeId = String(this.roomTypes[0].id);
      this.load();
    }
  }

  load(): void {
    if (!this.selectedRoomTypeId) return;
    this.loading = true;
    this.error = '';
    this.api.list(this.selectedRoomTypeId).pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); })).subscribe({
      next: rates => { this.rates = rates; },
      error: error => { this.rates = []; this.error = error?.error?.message || 'Không thể tải giá theo giai đoạn.'; },
    });
  }

  openCreate(): void {
    if (!this.canCreate || !this.selectedRoomTypeId) return;
    this.editingId = undefined;
    this.form = this.emptyForm();
    this.showForm = true;
  }

  openEdit(rate: RoomRateOverride): void {
    if (!this.canUpdate) return;
    this.editingId = rate.id;
    this.form = { roomTypeId: rate.roomTypeId, startDate: rate.startDate, endDate: rate.endDate, nightlyPrice: rate.nightlyPrice, priority: rate.priority, isActive: rate.isActive };
    this.showForm = true;
  }

  save(): void {
    if (this.saving || !this.validForm || (this.editingId ? !this.canUpdate : !this.canCreate)) return;
    this.saving = true;
    this.error = '';
    const request = this.editingId ? this.api.update(this.editingId, this.form) : this.api.create(this.form);
    request.pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); })).subscribe({
      next: () => { this.showForm = false; this.load(); },
      error: error => { this.error = error?.error?.message || 'Không thể lưu mức giá.'; },
    });
  }

  remove(rate: RoomRateOverride): void {
    if (!this.canDelete || this.saving || !globalThis.confirm(`Xóa mức giá từ ${this.formatDate(rate.startDate)} đến ${this.formatDate(rate.endDate)}?`)) return;
    this.saving = true;
    this.api.delete(rate.id).pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); })).subscribe({
      next: () => this.load(),
      error: error => { this.error = error?.error?.message || 'Không thể xóa mức giá.'; },
    });
  }

  get validForm(): boolean {
    return !!this.form.startDate && !!this.form.endDate && this.form.startDate <= this.form.endDate && this.form.nightlyPrice > 0 && this.form.priority >= 0 && this.form.priority <= 1000;
  }

  formatDate(value: string): string { return new Intl.DateTimeFormat('vi-VN').format(new Date(`${value}T00:00:00`)); }
  formatMoney(value: number): string { return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value); }

  private emptyForm(): SaveRoomRateOverrideRequest {
    const today = new Date().toISOString().slice(0, 10);
    return { roomTypeId: this.selectedRoomTypeId, startDate: today, endDate: today, nightlyPrice: Number(this.selectedRoomType?.basePrice || 0), priority: 0, isActive: true };
  }
}
