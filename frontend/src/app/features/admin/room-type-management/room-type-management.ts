import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, from, of } from 'rxjs';
import { concatMap, reduce } from 'rxjs/operators';
import { finalize, map, tap, timeout } from 'rxjs/operators';
import { ConfirmationService, MessageService } from 'primeng/api';
import { SharedModule } from '../../../shared/shared.module';
import { AdminInventoryService, AdminPropertyOption, AdminRoomType, RoomTypeImage } from '../../../core/services/admin-inventory.service';
import { ActionCode, FunctionCode, PermissionService } from '../../../core/services/permission.service';

@Component({
  selector: 'app-room-type-management',
  imports: [SharedModule],
  providers: [ConfirmationService, MessageService],
  templateUrl: './room-type-management.html',
  styleUrl: './room-type-management.css',
})
export class RoomTypeManagement implements OnInit {
  private api = inject(AdminInventoryService);
  private messages = inject(MessageService);
  private confirmations = inject(ConfirmationService);
  private permissions = inject(PermissionService);
  private cdr = inject(ChangeDetectorRef);
  private route = inject(ActivatedRoute, { optional: true });
  private router = inject(Router, { optional: true });

  roomTypes: AdminRoomType[] = [];
  properties: AdminPropertyOption[] = [];
  loading = false;
  page = 1;
  pageSize = 15;
  totalItems = 0;
  saving = false;
  errorMessage = '';
  searchText = '';
  propertyFilter: string | number | null = null;
  statusFilter = '';
  dialogVisible = false;
  editingId: string | number | null = null;
  imageText = '';
  pendingImages: File[] = [];
  previewUrls: string[] = [];
  existingImages: RoomTypeImage[] = [];
  form: Partial<AdminRoomType> = this.emptyForm();

  canCreate = this.permissions.hasPermission(FunctionCode.ROOM_TYPE, ActionCode.CREATE);
  canUpdate = this.permissions.hasPermission(FunctionCode.ROOM_TYPE, ActionCode.UPDATE);
  canDelete = this.permissions.hasPermission(FunctionCode.ROOM_TYPE, ActionCode.DELETE);

  bedTypes = ['SINGLE', 'DOUBLE', 'TWIN', 'MULTIPLE', 'KING', 'QUEEN'];
  statuses = [{ label: 'Đang hoạt động', value: 'ACTIVE' }, { label: 'Ngừng hoạt động', value: 'INACTIVE' }, { label: 'Đã xóa mềm', value: 'DELETED' }];
  readonly amenityOptions = [{value:'AIR_CONDITIONING',label:'Điều hòa'},{value:'PRIVATE_BATHROOM',label:'Phòng tắm riêng'},{value:'BATHTUB',label:'Bồn tắm'},{value:'BALCONY',label:'Ban công'},{value:'CITY_VIEW',label:'Hướng thành phố'},{value:'SEA_VIEW',label:'Hướng biển'},{value:'MINIBAR',label:'Minibar'},{value:'TV',label:'TV'},{value:'SAFE',label:'Két an toàn'},{value:'WORK_DESK',label:'Bàn làm việc'},{value:'SOUNDPROOF',label:'Cách âm'},{value:'KITCHEN',label:'Bếp'}];

  ngOnInit(): void {
    if (!this.route?.queryParamMap) { this.loadData(); return; }
    this.route.queryParamMap.subscribe(params => {
      this.searchText = params.get('search') || '';
      this.propertyFilter = params.get('propertyId') || null;
      this.statusFilter = params.get('status') || '';
      this.page = Math.max(1, Number(params.get('page') || 1));
      this.pageSize = Math.max(1, Number(params.get('pageSize') || 15));
      this.loadData();
    });
  }

  get filteredRoomTypes(): AdminRoomType[] {
    const keyword = this.searchText.trim().toLocaleLowerCase('vi');
    return this.roomTypes.filter(item =>
      (!keyword || `${item.code} ${item.nameVi} ${item.nameEn || ''}`.toLocaleLowerCase('vi').includes(keyword)) &&
      (!this.propertyFilter || item.hotelId === this.propertyFilter) &&
      (!this.statusFilter || item.status === this.statusFilter));
  }

  loadData(): void {
    this.loading = true; this.errorMessage = '';
    const roomTypesRequest = this.api.getRoomTypesPaged({ search: this.searchText.trim() || undefined, propertyId: this.propertyFilter || undefined, status: this.statusFilter || undefined, page: this.page, pageSize: this.pageSize }).pipe(tap(result => this.totalItems = result.totalItems), map(result => result.items));
    forkJoin({ roomTypes: roomTypesRequest, properties: this.api.getProperties() }).pipe(
      timeout(15000), finalize(() => { this.loading = false; this.cdr.detectChanges(); })
    ).subscribe({
      next: data => { this.roomTypes = data.roomTypes; this.properties = data.properties; },
      error: err => { this.errorMessage = err?.error?.message || 'Không thể tải danh sách loại phòng.'; }
    });
  }

  propertyName(id: string | number): string { const p = this.properties.find(item => item.id === id); return p?.nameVi || p?.name || `Cơ sở #${id}`; }
  formatVnd(value?: number): string { return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value || 0); }
  resetFilters(): void { this.searchText = ''; this.propertyFilter = null; this.statusFilter = ''; this.page = 1; this.updateQuery(); }
  onPageChange(event: { first?: number; rows?: number }): void { this.pageSize = event.rows || this.pageSize; this.page = Math.floor((event.first || 0) / this.pageSize) + 1; this.updateQuery(); }
  updateQuery(): void { if (!this.router || !this.route) return; void this.router.navigate([], { relativeTo: this.route, queryParams: { search: this.searchText || null, propertyId: this.propertyFilter || null, status: this.statusFilter || null, page: this.page, pageSize: this.pageSize }, queryParamsHandling: 'merge' }); }

  openCreate(): void { if (!this.canCreate) return; this.editingId = null; this.form = this.emptyForm(); this.imageText = ''; this.existingImages = []; this.clearPendingImages(); this.dialogVisible = true; }
  openEdit(item: AdminRoomType): void { if (!this.canUpdate) return; this.editingId = item.id; this.form = { ...item }; this.imageText = (item.imageUrls || []).join('\n'); this.existingImages = [...(item.images || [])]; this.clearPendingImages(); this.dialogVisible = true; }
  onImagesSelected(event: Event): void {
    const files = Array.from((event.target as HTMLInputElement).files || []).filter(file => file.type.startsWith('image/') && file.size <= 5 * 1024 * 1024);
    this.pendingImages = [...this.pendingImages, ...files];
    this.previewUrls = this.pendingImages.map(file => URL.createObjectURL(file));
  }
  removePendingImage(index: number): void { URL.revokeObjectURL(this.previewUrls[index]); this.pendingImages.splice(index, 1); this.previewUrls.splice(index, 1); }
  clearPendingImages(): void { this.previewUrls.forEach(url => URL.revokeObjectURL(url)); this.pendingImages = []; this.previewUrls = []; }
  removeExistingImage(image: RoomTypeImage): void { if (!this.editingId) return; this.api.deleteRoomTypeImage(this.editingId, image.id).subscribe({ next: () => { this.existingImages = this.existingImages.filter(item => item.id !== image.id); this.messages.add({ severity: 'success', summary: 'Đã xóa ảnh', detail: 'Ảnh đã được xóa mềm.' }); }, error: err => this.messages.add({ severity: 'error', summary: 'Lỗi', detail: err?.error?.message || 'Không thể xóa ảnh.' }) }); }
  moveExistingImage(index: number, direction: number): void {
    if (!this.editingId) return;
    const target = index + direction;
    if (target < 0 || target >= this.existingImages.length) return;
    const next = [...this.existingImages]; [next[index], next[target]] = [next[target], next[index]];
    this.api.orderRoomTypeImages(this.editingId, next.map(image => image.id)).subscribe({ next: () => { this.existingImages = next.map((image, order) => ({ ...image, displayOrder: order, isPrimary: order === 0 })); }, error: err => this.messages.add({ severity: 'error', summary: 'Lỗi', detail: err?.error?.message || 'Không thể đổi thứ tự ảnh.' }) });
  }
  setPrimaryImage(index: number): void { if (!this.editingId || index <= 0) return; const next = [...this.existingImages]; const [primary] = next.splice(index, 1); next.unshift(primary); this.api.orderRoomTypeImages(this.editingId, next.map(image => image.id)).subscribe({ next: () => { this.existingImages = next.map((image, order) => ({ ...image, displayOrder: order, isPrimary: order === 0 })); }, error: err => this.messages.add({ severity: 'error', summary: 'Lỗi', detail: err?.error?.message || 'Không thể đặt ảnh chính.' }) }); }
  saveImageAltText(image: RoomTypeImage): void { if (!this.editingId) return; this.api.updateRoomTypeImage(this.editingId, image.id, image.altText || '').subscribe({ next: saved => { Object.assign(image, saved); this.messages.add({ severity: 'success', summary: 'Đã cập nhật', detail: 'Mô tả ảnh đã được lưu.' }); }, error: err => this.messages.add({ severity: 'error', summary: 'Lỗi', detail: err?.error?.message || 'Không thể lưu mô tả ảnh.' }) }); }

  save(): void {
    if (this.editingId ? !this.canUpdate : !this.canCreate) return;
    if (this.saving || !this.form.hotelId || !this.form.code?.trim() || !this.form.nameVi?.trim()) {
      this.messages.add({ severity: 'warn', summary: 'Thiếu thông tin', detail: 'Vui lòng chọn cơ sở, nhập mã và tên loại phòng.' }); return;
    }
    this.form.imageUrls = this.imageText.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
    this.saving = true;
    const request = this.editingId ? this.api.updateRoomType(this.editingId, this.form) : this.api.createRoomType(this.form);
    request.pipe(concatMap(saved => this.pendingImages.length ? from(this.pendingImages).pipe(concatMap(file => this.api.uploadRoomTypeImage(saved.id, file)), reduce(() => saved, saved)) : of(saved)), finalize(() => { this.saving = false; this.cdr.detectChanges(); })).subscribe({
      next: () => { this.dialogVisible = false; this.messages.add({ severity: 'success', summary: 'Thành công', detail: 'Đã lưu loại phòng và ảnh.' }); this.loadData(); },
      error: err => this.messages.add({ severity: 'error', summary: 'Lỗi', detail: err?.error?.message || 'Không thể lưu loại phòng.' })
    });
  }

  deactivate(item: AdminRoomType): void {
    if (!this.canDelete) return;
    this.confirmations.confirm({ header: 'Xác nhận ngừng sử dụng', message: `Ngừng sử dụng loại phòng "${item.nameVi}"?`, icon: 'pi pi-exclamation-triangle', acceptLabel: 'Ngừng sử dụng', rejectLabel: 'Hủy', accept: () =>
      this.api.deleteRoomType(item.id).subscribe({ next: () => { this.messages.add({ severity: 'success', summary: 'Thành công', detail: 'Đã ngừng sử dụng loại phòng.' }); this.loadData(); }, error: err => this.messages.add({ severity: 'error', summary: 'Lỗi', detail: err?.error?.message || 'Không thể cập nhật loại phòng.' }) }) });
  }
  restore(item: AdminRoomType): void { if (!this.canUpdate) return; this.api.restoreRoomType(item.id).subscribe({ next: () => { this.messages.add({ severity: 'success', summary: 'Đã khôi phục', detail: 'Loại phòng đã được khôi phục.' }); this.loadData(); }, error: err => this.messages.add({ severity: 'error', summary: 'Lỗi', detail: err?.error?.message || 'Không thể khôi phục.' }) }); }
  toggleAmenity(code:string,checked:boolean):void{const values=new Set(this.form.amenityCodes||[]);checked?values.add(code):values.delete(code);this.form.amenityCodes=[...values];}

  private emptyForm(): Partial<AdminRoomType> { return { hotelId: undefined, code: '', nameVi: '', nameEn: '', descriptionVi: '', descriptionEn: '', bedType: 'DOUBLE', bedCount: 1, area: 20, maxAdults: 2, maxChildren: 1, maxGuests: 3, basePrice: 0, status: 'ACTIVE', imageUrls: [], includesBreakfast:false, isRefundable:true, freeCancellationHours:24, smokingAllowed:false, amenityCodes:[] }; }
}
