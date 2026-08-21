import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { finalize, map, tap, timeout } from 'rxjs/operators';
import { ConfirmationService, MessageService } from 'primeng/api';
import { SharedModule } from '../../../shared/shared.module';
import { AdminInventoryService, AdminPropertyOption, AdminRoom, AdminRoomType, BulkRoomRequest } from '../../../core/services/admin-inventory.service';
import { ActionCode, FunctionCode, PermissionService } from '../../../core/services/permission.service';

@Component({
  selector: 'app-room-management',
  imports: [SharedModule],
  providers: [ConfirmationService, MessageService],
  templateUrl: './room-management.html',
  styleUrl: './room-management.css',
})
export class RoomManagement implements OnInit {
  private api = inject(AdminInventoryService);
  private messages = inject(MessageService);
  private confirmations = inject(ConfirmationService);
  private permissions = inject(PermissionService);
  private cdr = inject(ChangeDetectorRef);
  private route = inject(ActivatedRoute, { optional: true });
  private router = inject(Router, { optional: true });

  rooms: AdminRoom[] = []; roomTypes: AdminRoomType[] = []; properties: AdminPropertyOption[] = [];
  loading = false; saving = false; errorMessage = '';
  page = 1; pageSize = 15; totalItems = 0;
  searchText = ''; propertyFilter: string | number | null = null; roomTypeFilter: string | number | null = null;
  floorFilter: number | null = null; statusFilter = ''; housekeepingFilter = ''; maintenanceFilter = '';
  dialogVisible = false; bulkVisible = false; editingId: string | number | null = null;
  stateChangingId: string | number | null = null;
  maintenanceDialogVisible = false; maintenanceRoom: AdminRoom | null = null; maintenanceReason = ''; maintenanceError = '';
  form: Partial<AdminRoom> = this.emptyForm();
  bulk: BulkRoomRequest = this.emptyBulk();

  canCreate = this.permissions.hasPermission(FunctionCode.ROOM, ActionCode.CREATE);
  canUpdate = this.permissions.hasPermission(FunctionCode.ROOM, ActionCode.UPDATE);
  canDelete = this.permissions.hasPermission(FunctionCode.ROOM, ActionCode.DELETE);
  canExecute = this.permissions.hasPermission(FunctionCode.ROOM, ActionCode.TASK_EXECUTE);
  readonly roomStatuses = [
    { label: 'Đã xóa mềm', value: 'DELETED' },
    { label: 'Phòng trống', value: 'AVAILABLE' },
    { label: 'Đã đặt', value: 'RESERVED' },
    { label: 'Đang có khách', value: 'OCCUPIED' },
    { label: 'Chờ dọn', value: 'DIRTY' },
    { label: 'Đang dọn', value: 'CLEANING' },
    { label: 'Đang bảo trì', value: 'MAINTENANCE' },
    { label: 'Ngừng sử dụng', value: 'OUT_OF_SERVICE' },
  ];
  readonly housekeepingStatuses = [
    { label: 'Sạch', value: 'CLEAN' },
    { label: 'Chờ dọn', value: 'DIRTY' },
    { label: 'Đang dọn', value: 'CLEANING' },
    { label: 'Đã kiểm tra', value: 'INSPECTED' },
  ];
  readonly maintenanceStatuses = [
    { label: 'Không bảo trì', value: 'NONE' },
    { label: 'Đang bảo trì', value: 'MAINTENANCE' },
    { label: 'Ngừng sử dụng', value: 'OUT_OF_SERVICE' },
  ];
  readonly floorOptions = Array.from({ length: 30 }, (_, index) => ({
    label: `Tầng ${index + 1}`,
    value: index + 1,
  }));

  ngOnInit(): void {
    if (!this.route?.queryParamMap) { this.loadData(); return; }
    this.route.queryParamMap.subscribe(params => {
      this.searchText = params.get('search') || '';
      this.propertyFilter = params.get('propertyId') || null;
      this.roomTypeFilter = params.get('roomTypeId') || null;
      this.statusFilter = params.get('status') || '';
      this.housekeepingFilter = params.get('housekeepingStatus') || '';
      this.maintenanceFilter = params.get('maintenanceStatus') || '';
      this.page = Math.max(1, Number(params.get('page') || 1));
      this.pageSize = Math.max(1, Number(params.get('pageSize') || 15));
      this.loadData();
    });
  }
  get availableTypeOptions(): AdminRoomType[] { const hotelId = this.editingId ? this.form.hotelId : (this.form.hotelId || this.bulk.hotelId); return this.roomTypes.filter(t => !hotelId || t.hotelId === hotelId); }
  get filteredRooms(): AdminRoom[] { const key=this.searchText.trim().toLowerCase(); return this.rooms.filter(r => (!key || r.roomNumber.toLowerCase().includes(key)) && (!this.propertyFilter || r.hotelId===this.propertyFilter) && (!this.roomTypeFilter || r.roomTypeId===this.roomTypeFilter) && (this.floorFilter===null || r.floor===this.floorFilter) && (!this.statusFilter || r.status===this.statusFilter) && (!this.housekeepingFilter || r.housekeepingStatus===this.housekeepingFilter) && (!this.maintenanceFilter || r.maintenanceStatus===this.maintenanceFilter)); }
  roomStatusLabel(status: string): string { return this.statusLabel(this.roomStatuses, status); }
  housekeepingStatusLabel(status: string): string { return this.statusLabel(this.housekeepingStatuses, status); }
  maintenanceStatusLabel(status: string): string { return this.statusLabel(this.maintenanceStatuses, status); }

  loadData(): void { this.loading=true; this.errorMessage=''; const roomsRequest = this.api.getRoomsPaged({ search: this.searchText.trim() || undefined, propertyId: this.propertyFilter || undefined, roomTypeId: this.roomTypeFilter || undefined, status: this.statusFilter || undefined, page: this.page, pageSize: this.pageSize }).pipe(tap(result => this.totalItems = result.totalItems), map(result => result.items)); forkJoin({rooms:roomsRequest,roomTypes:this.api.getRoomTypes(),properties:this.api.getProperties()}).pipe(timeout(15000),finalize(()=>{this.loading=false;this.cdr.detectChanges();})).subscribe({next:d=>{this.rooms=d.rooms;this.roomTypes=d.roomTypes;this.properties=d.properties;},error:e=>this.errorMessage=e?.error?.message||'Không thể tải danh sách phòng.'}); }
  onPageChange(event: { first?: number; rows?: number }): void { this.pageSize = event.rows || this.pageSize; this.page = Math.floor((event.first || 0) / this.pageSize) + 1; this.loadData(); }
  propertyName(id:string|number):string{const p=this.properties.find(x=>x.id===id);return p?.nameVi||p?.name||`Cơ sở #${id}`;}
  resetFilters():void{this.searchText='';this.propertyFilter=null;this.roomTypeFilter=null;this.floorFilter=null;this.statusFilter='';this.housekeepingFilter='';this.maintenanceFilter='';this.page=1;this.updateQuery();}
  updateQuery(): void { if (!this.router || !this.route) return; void this.router.navigate([], { relativeTo: this.route, queryParams: { search: this.searchText || null, propertyId: this.propertyFilter || null, roomTypeId: this.roomTypeFilter || null, status: this.statusFilter || null, housekeepingStatus: this.housekeepingFilter || null, maintenanceStatus: this.maintenanceFilter || null, page: this.page, pageSize: this.pageSize }, queryParamsHandling: 'merge' }); }
  onFormPropertyChange():void{this.form.roomTypeId=undefined;}
  onBulkPropertyChange():void{this.bulk.roomTypeId=0;}
  openCreate():void{if(!this.canCreate)return;this.editingId=null;this.form=this.emptyForm();this.dialogVisible=true;}
  openEdit(room:AdminRoom):void{if(!this.canUpdate)return;this.editingId=room.id;this.form={...room};this.dialogVisible=true;}
  openBulk():void{if(!this.canCreate)return;this.form=this.emptyForm();this.editingId=null;this.bulk=this.emptyBulk();this.bulkVisible=true;}

  save():void{if(this.editingId?!this.canUpdate:!this.canCreate)return;if(this.saving||!this.form.hotelId||!this.form.roomTypeId||!this.form.roomNumber?.trim()){this.messages.add({severity:'warn',summary:'Thiếu thông tin',detail:'Vui lòng chọn cơ sở, loại phòng và nhập số phòng.'});return;}this.saving=true;const req=this.editingId?this.api.updateRoom(this.editingId,this.form):this.api.createRoom(this.form);req.pipe(finalize(()=>{this.saving=false;this.cdr.detectChanges();})).subscribe({next:()=>{this.dialogVisible=false;this.messages.add({severity:'success',summary:'Thành công',detail:'Đã lưu phòng.'});this.loadData();},error:e=>this.messages.add({severity:'error',summary:'Lỗi',detail:e?.error?.message||'Không thể lưu phòng.'})});}
  createBulk():void{if(!this.canCreate)return;if(this.saving||!this.bulk.hotelId||!this.bulk.roomTypeId||this.bulk.fromNumber>this.bulk.toNumber){this.messages.add({severity:'warn',summary:'Dữ liệu chưa hợp lệ',detail:'Vui lòng kiểm tra cơ sở, loại phòng và dải số.'});return;}this.saving=true;this.api.bulkCreateRooms(this.bulk).pipe(finalize(()=>{this.saving=false;this.cdr.detectChanges();})).subscribe({next:r=>{this.bulkVisible=false;const failed=r.failedRoomNumbers?.length?` Bỏ qua phòng trùng: ${r.failedRoomNumbers.join(', ')}.`:'';this.messages.add({severity:r.created.length?'success':'warn',summary:'Kết quả tạo phòng',detail:`Đã tạo ${r.created.length} phòng.${failed}`});this.loadData();},error:e=>this.messages.add({severity:'error',summary:'Lỗi',detail:e?.error?.message||'Không thể tạo phòng hàng loạt.'})});}
  openMaintenance(room:AdminRoom):void{this.maintenanceRoom=room;this.maintenanceReason='';this.maintenanceError='';this.maintenanceDialogVisible=true;}
  startMaintenance():void{const room=this.maintenanceRoom;const reason=this.maintenanceReason.trim();if(!room||this.stateChangingId!==null)return;if(reason.length<3){this.maintenanceError='Vui lòng nhập lý do bảo trì ít nhất 3 ký tự.';return;}this.changeMaintenance(room,true,reason);}
  setMaintenance(room:AdminRoom,enabled:boolean):void{if(enabled){this.openMaintenance(room);return;}this.changeMaintenance(room,false);}
  private changeMaintenance(room:AdminRoom,enabled:boolean,reason=''):void{if(!this.canExecute||this.stateChangingId!==null)return;this.stateChangingId=room.id;const request=enabled?this.api.startRoomMaintenance(room.id,reason):this.api.completeRoomMaintenance(room.id);request.pipe(finalize(()=>{this.stateChangingId=null;this.cdr.detectChanges();})).subscribe({next:()=>{this.maintenanceDialogVisible=false;this.messages.add({severity:'success',summary:'Thành công',detail:enabled?'Đã bắt đầu bảo trì.':'Đã hoàn tất bảo trì.'});this.loadData();},error:e=>{this.maintenanceError=e?.error?.message||'Không thể chuyển trạng thái bảo trì.';this.messages.add({severity:'error',summary:'Lỗi',detail:this.maintenanceError});}});}
  deactivate(room:AdminRoom):void{if(!this.canDelete)return;this.confirmations.confirm({header:'Xác nhận ngừng sử dụng',message:`Ngừng sử dụng phòng ${room.roomNumber}?`,acceptLabel:'Ngừng sử dụng',rejectLabel:'Hủy',accept:()=>this.api.deleteRoom(room.id).subscribe({next:()=>{this.messages.add({severity:'success',summary:'Thành công',detail:'Đã ngừng sử dụng phòng.'});this.loadData();},error:e=>this.messages.add({severity:'error',summary:'Lỗi',detail:e?.error?.message||'Không thể ngừng sử dụng phòng.'})})});}
  restore(room: AdminRoom): void { if (!this.canUpdate) return; this.api.restoreRoom(room.id).subscribe({ next: () => { this.messages.add({severity:'success',summary:'Đã khôi phục',detail:'Phòng đã được khôi phục.'}); this.loadData(); }, error: e => this.messages.add({severity:'error',summary:'Lỗi',detail:e?.error?.message || 'Không thể khôi phục phòng.'}) }); }
  private statusLabel(options: ReadonlyArray<{ label: string; value: string }>, status: string): string { return options.find(option => option.value === status)?.label || status; }
  private emptyForm():Partial<AdminRoom>{return{hotelId:undefined,roomTypeId:undefined,roomNumber:'',floor:1,note:''};}
  private emptyBulk():BulkRoomRequest{return{hotelId:0,roomTypeId:0,floor:1,fromNumber:101,toNumber:110,prefix:''};}
}
