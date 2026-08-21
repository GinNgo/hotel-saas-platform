import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ManagementApiService, ManagedProperty } from '../../../core/services/management-api.service';
import { FeedbackStateComponent } from '../../../shared/components/feedback-state/feedback-state.component';
import { ActionCode, FunctionCode, PermissionService } from '../../../core/services/permission.service';
import { RoomRateEditorComponent } from './room-rate-editor.component';

@Component({ selector: 'app-management-inventory', standalone: true, imports: [CommonModule, FormsModule, FeedbackStateComponent, RoomRateEditorComponent], templateUrl: './management-inventory.component.html', styleUrl: './management-inventory.component.css' })
export class ManagementInventoryComponent implements OnInit {
  private api = inject(ManagementApiService); private route = inject(ActivatedRoute); private cdr = inject(ChangeDetectorRef); private permissions = inject(PermissionService);
  mode: 'room-types' | 'rooms' = 'room-types'; properties: ManagedProperty[] = []; propertyId?: string | number; rows: any[] = []; roomTypes: any[] = []; loading = true; saving = false; error = ''; showForm = false; changingRoomId?: string | number; roomView: 'grid' | 'table' = 'grid';
  maintenanceRoom: any | null = null; maintenanceReason = ''; maintenanceError = '';
  private limits: Record<string, number> = {};
  private upgradeRequired = false;
  roomTypeForm: any = { code: '', nameVi: '', nameEn: '', bedType: 'DOUBLE', bedCount: 1, maxAdults: 2, maxChildren: 1, maxGuests: 3, basePrice: 0, status: 'ACTIVE', includesBreakfast: false, isRefundable: true, freeCancellationHours: 24, smokingAllowed: false, amenityCodes: [] };
  readonly roomAmenityOptions = [{code:'AIR_CONDITIONING',label:'Điều hòa'},{code:'PRIVATE_BATHROOM',label:'Phòng tắm riêng'},{code:'BATHTUB',label:'Bồn tắm'},{code:'BALCONY',label:'Ban công'},{code:'CITY_VIEW',label:'Hướng thành phố'},{code:'SEA_VIEW',label:'Hướng biển'},{code:'MINIBAR',label:'Minibar'},{code:'TV',label:'TV'},{code:'SAFE',label:'Két an toàn'},{code:'WORK_DESK',label:'Bàn làm việc'},{code:'SOUNDPROOF',label:'Cách âm'},{code:'KITCHEN',label:'Bếp'}];
  bulkForm: any = { roomTypeId: undefined, fromNumber: 101, toNumber: 105, floor: 1, status: 'AVAILABLE' };
  readonly floors = Array.from({ length: 30 }, (_, index) => index + 1);
  get canCreate(): boolean { return this.permissions.hasPermission(this.mode === 'room-types' ? FunctionCode.ROOM_TYPE : FunctionCode.ROOM, ActionCode.CREATE); }
  get canMaintain(): boolean { return this.permissions.hasPermission(FunctionCode.ROOM, ActionCode.TASK_EXECUTE); }

  ngOnInit(): void {
    this.mode = this.route.snapshot.data['mode'] || 'room-types';
    this.api.context().subscribe({
      next: context => { this.properties = context.properties; this.propertyId = context.activePropertyId; this.limits = context.limits || {}; this.upgradeRequired = !!context.upgradeRequired; this.reload(); this.cdr.markForCheck(); },
      error: e => { this.error = e?.error?.message || 'Không thể tải context.'; this.loading = false; this.cdr.markForCheck(); }
    });
  }

  reload(): void {
    if (!this.propertyId) { this.rows = []; this.loading = false; this.cdr.markForCheck(); return; }
    this.error = '';
    this.loading = true;
    const request = this.mode === 'room-types' ? this.api.roomTypes(this.propertyId) : this.api.rooms(this.propertyId);
    request.subscribe({
      next: rows => {
        this.rows = rows;
        this.loading = false;
        if (this.mode === 'rooms') {
          this.api.roomTypes(this.propertyId!).subscribe({ next: types => { this.roomTypes = types; this.cdr.markForCheck(); }, error: () => this.cdr.markForCheck() });
        }
        this.cdr.markForCheck();
      },
      error: e => { this.error = e?.error?.message || 'Không thể tải dữ liệu.'; this.loading = false; this.cdr.markForCheck(); }
    });
  }

  save(): void {
    if (!this.propertyId || this.saving || !this.canCreate) return;
    this.error = '';
    if (this.mode === 'room-types') {
      if (this.upgradeRequired || this.limits['MAX_ROOM_TYPES'] === undefined) {
        this.error = 'Cơ sở chưa có gói dịch vụ đang hoạt động. Vui lòng kích hoạt hoặc đăng ký gói trước khi thêm loại phòng.';
        return;
      }
      const limit = this.limits['MAX_ROOM_TYPES'];
      if (limit !== undefined && limit >= 0 && this.rows.length >= limit) {
        this.error = `Goi dich vu hien tai da dat gioi han ${limit} loai phong. Vui long nang cap goi dich vu.`;
        return;
      }
    }
    this.saving = true;
    const request = this.mode === 'room-types'
      ? this.api.createRoomType({ ...this.roomTypeForm, hotelId: this.propertyId })
      : this.api.bulkRooms({ ...this.bulkForm, hotelId: this.propertyId });
    request.subscribe({
      next: () => { this.showForm = false; this.saving = false; this.reload(); this.cdr.markForCheck(); },
      error: e => { this.error = e?.error?.message || (this.mode === 'room-types' ? 'Không thể thêm loại phòng.' : 'Không thể tạo dải phòng.'); this.saving = false; this.cdr.markForCheck(); }
    });
  }

  toggleMaintenance(row: any): void {
    if (!this.canMaintain || this.changingRoomId || row.maintenanceStatus === 'OUT_OF_SERVICE') return;
    if (row.maintenanceStatus !== 'MAINTENANCE') {
      this.maintenanceRoom = row; this.maintenanceReason = ''; this.maintenanceError = '';
      return;
    }
    this.executeMaintenance(row, false);
  }

  confirmMaintenance(): void {
    const reason = this.maintenanceReason.trim();
    if (!this.maintenanceRoom || reason.length < 3) { this.maintenanceError = 'Vui lòng nhập lý do bảo trì ít nhất 3 ký tự.'; return; }
    this.executeMaintenance(this.maintenanceRoom, true, reason);
  }

  private executeMaintenance(row: any, enabled: boolean, reason = ''): void {
    this.error = '';
    this.changingRoomId = row.id;
    const request = enabled ? this.api.startRoomMaintenance(row.id, reason) : this.api.completeRoomMaintenance(row.id);
    request.subscribe({
      next: () => { this.changingRoomId = undefined; this.maintenanceRoom = null; this.reload(); this.cdr.markForCheck(); },
      error: e => { this.maintenanceError = e?.error?.message || 'Không thể chuyển trạng thái bảo trì.'; this.changingRoomId = undefined; this.cdr.markForCheck(); }
    });
  }

  get roomFloors(): Array<{ floor: number | string; rooms: any[] }> {
    const grouped = new Map<number | string, any[]>();
    for (const room of this.rows) {
      const floor = room.floor ?? 'Khác';
      grouped.set(floor, [...(grouped.get(floor) || []), room]);
    }
    return Array.from(grouped.entries())
      .sort(([left], [right]) => Number(left) - Number(right))
      .map(([floor, rooms]) => ({ floor, rooms: [...rooms].sort((a, b) => String(a.roomNumber).localeCompare(String(b.roomNumber), 'vi', { numeric: true })) }));
  }

  roomStatus(row: any): string {
    if (row.maintenanceStatus === 'OUT_OF_SERVICE') return 'OUT_OF_SERVICE';
    if (row.maintenanceStatus === 'MAINTENANCE') return 'MAINTENANCE';
    return row.status || 'AVAILABLE';
  }

  roomStatusLabel(row: any): string {
    return ({ AVAILABLE: 'Phòng trống', RESERVED: 'Đã đặt', OCCUPIED: 'Đang ở', DIRTY: 'Cần dọn', CLEANING: 'Đang dọn', MAINTENANCE: 'Bảo trì', OUT_OF_SERVICE: 'Ngưng sử dụng' } as Record<string, string>)[this.roomStatus(row)] || this.roomStatus(row);
  }
  toggleRoomAmenity(code:string,checked:boolean):void{const values=new Set<string>(this.roomTypeForm.amenityCodes||[]);checked?values.add(code):values.delete(code);this.roomTypeForm.amenityCodes=[...values];}
}
