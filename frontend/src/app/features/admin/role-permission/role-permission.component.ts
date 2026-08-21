import { ChangeDetectorRef, Component, HostListener, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SharedModule } from '@app/shared/shared.module';
import { AppFunction, AppModule, Role, RoleService } from '@app/core/services/role.service';
import { ConfirmationService, MessageService } from 'primeng/api';
import { finalize, timeout } from 'rxjs/operators';

@Component({
  selector: 'app-role-permission',
  standalone: true,
  imports: [SharedModule],
  providers: [MessageService, ConfirmationService],
  templateUrl: './role-permission.component.html',
  styleUrl: './role-permission.component.css'
})
export class RolePermissionComponent implements OnInit {
  roles: Role[] = [];
  selectedRole: Role | null = null;
  modules: AppModule[] = [];
  loading = false;
  loadingRoles = false;
  saving = false;
  errorMessage = '';
  dirty = false;
  pendingRole: Role | null = null;
  private originalMasks = new Map<string | number, number>();

  actions = [
    { label: 'Xem', value: 1 },
    { label: 'Thêm', value: 2 },
    { label: 'Sửa', value: 4 },
    { label: 'Xóa', value: 8 },
    { label: 'Xuất', value: 16 },
    { label: 'Duyệt', value: 32 },
    { label: 'Thực hiện', value: 64 }
  ];

  private roleService = inject(RoleService);
  private messageService = inject(MessageService);
  private route = inject(ActivatedRoute);
  private confirmationService = inject(ConfirmationService);
  private cdr = inject(ChangeDetectorRef);

  get protectedRole(): boolean {
    const immutableCodes = ['SUPER_ADMIN', 'ADMIN', 'CUSTOMER'];
    return immutableCodes.includes(this.selectedRole?.code || '');
  }

  get editableSystemRole(): boolean {
    return Boolean(this.selectedRole?.systemRole) && !this.protectedRole;
  }

  get changedPermissionCount(): number {
    return this.modules.flatMap(module => module.functions).filter(func => (func.actionMask || 0) !== (this.originalMasks.get(func.id) || 0)).length;
  }

  ngOnInit(): void {
    this.loadRoles();
  }

  loadRoles(): void {
    this.loadingRoles = true;
    this.errorMessage = '';

    this.roleService.getRoles().pipe(
      timeout(10000),
      finalize(() => {
        this.loadingRoles = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (data) => {
        this.roles = data;
        const requestedRoleId = this.route.snapshot.queryParamMap.get('roleId');
        this.selectedRole = this.roles.find((role) => role.id === requestedRoleId) || this.roles[0] || null;
        this.loadPermissions();
      },
      error: (error) => {
        this.errorMessage = error?.error?.message || 'Không thể tải danh sách vai trò.';
        this.messageService.add({ severity: 'error', summary: 'Lỗi', detail: this.errorMessage });
      }
    });
  }

  onRoleChange(role: Role): void {
    if (role.id === this.selectedRole?.id) return;
    if (!this.dirty) {
      this.applyRoleChange(role);
      return;
    }
    this.pendingRole = role;
    this.confirmationService.confirm({
      header: 'Bỏ thay đổi chưa lưu?',
      message: `Bạn đã sửa quyền của vai trò "${this.selectedRole?.name}". Chuyển vai trò sẽ bỏ các thay đổi này.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Bỏ thay đổi',
      rejectLabel: 'Tiếp tục chỉnh sửa',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.applyRoleChange(role),
      reject: () => { this.pendingRole = null; }
    });
  }

  private applyRoleChange(role: Role): void {
    this.pendingRole = null;
    this.selectedRole = role;
    this.loadPermissions();
  }

  loadPermissions(): void {
    if (!this.selectedRole) {
      this.modules = [];
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.roleService.getRolePermissionsTree(this.selectedRole.id).pipe(
      timeout(10000),
      finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (data) => {
        this.modules = data;
        this.originalMasks = new Map(data.flatMap(module => module.functions.map(func => [func.id, func.actionMask || 0] as [string | number, number])));
        this.dirty = false;
      },
      error: (error) => {
        this.errorMessage = error?.error?.message || 'Không thể tải ma trận phân quyền.';
        this.messageService.add({ severity: 'error', summary: 'Lỗi', detail: this.errorMessage });
      }
    });
  }

  hasPermission(func: AppFunction, actionValue: number): boolean {
    return ((func.actionMask || 0) & actionValue) === actionValue;
  }

  supportsAction(func: AppFunction, actionValue: number): boolean {
    return ((func.supportedActionMask ?? 127) & actionValue) === actionValue;
  }

  togglePermission(func: AppFunction, actionValue: number, checked: boolean): void {
    if (this.protectedRole || !this.supportsAction(func, actionValue)) return;
    const currentMask = func.actionMask || 0;
    if (actionValue === 1 && !checked) {
      func.actionMask = 0;
    } else if (checked) {
      func.actionMask = currentMask | actionValue | 1;
    } else {
      func.actionMask = currentMask & ~actionValue;
    }
    this.updateDirty();
  }

  toggleModule(module: AppModule, actionValue: number, checked: boolean): void {
    module.functions.forEach((func) => this.togglePermission(func, actionValue, checked));
  }

  toggleAll(actionValue: number, checked: boolean): void { this.modules.forEach(module => this.toggleModule(module, actionValue, checked)); }
  allHavePermission(actionValue: number): boolean { const funcs=this.modules.flatMap(m=>m.functions).filter(f=>this.supportsAction(f,actionValue)); return funcs.length>0 && funcs.every(f=>this.hasPermission(f, actionValue)); }
  someHavePermission(actionValue: number): boolean { const funcs=this.modules.flatMap(m=>m.functions).filter(f=>this.supportsAction(f,actionValue)); const granted=funcs.filter(f=>this.hasPermission(f,actionValue)).length; return granted>0&&granted<funcs.length; }
  resetPermissions(): void { this.modules.forEach(m=>m.functions.forEach(f=>f.actionMask=this.originalMasks.get(f.id)||0)); this.dirty=false; }
  private updateDirty(): void { this.dirty=this.modules.some(m=>m.functions.some(f=>(f.actionMask||0)!==(this.originalMasks.get(f.id)||0))); }

  moduleHasPermission(module: AppModule, actionValue: number): boolean {
    const supportedFunctions = module.functions.filter((func) => this.supportsAction(func, actionValue));
    return supportedFunctions.length > 0 && supportedFunctions.every((func) => this.hasPermission(func, actionValue));
  }

  moduleSupportsAction(module: AppModule, actionValue: number): boolean {
    return module.functions.some((func) => this.supportsAction(func, actionValue));
  }

  moduleSomeHavePermission(module: AppModule, actionValue: number): boolean {
    const funcs=module.functions.filter(func=>this.supportsAction(func,actionValue));
    const granted=funcs.filter(func=>this.hasPermission(func,actionValue)).length;
    return granted>0&&granted<funcs.length;
  }

  @HostListener('window:beforeunload', ['$event']) protectUnsavedChanges(event:BeforeUnloadEvent):void {
    if (!this.dirty) return;
    event.preventDefault();
    event.returnValue='';
  }

  savePermissions(): void {
    if (!this.selectedRole || this.saving || !this.dirty || this.protectedRole) return;

    this.confirmationService.confirm({ header: 'Xác nhận lưu phân quyền', message: `Áp dụng thay đổi quyền cho vai trò "${this.selectedRole.name}"?`, icon: 'pi pi-exclamation-triangle', acceptLabel: 'Lưu thay đổi', rejectLabel: 'Hủy', accept: () => this.performSave() });
  }

  private performSave(): void {
    if (!this.selectedRole) return;

    const permissions = this.modules.flatMap((module) =>
      module.functions.map((func) => ({
        functionId: func.id,
        actionMask: func.actionMask || 0
      }))
    );

    if (this.selectedRole.version === undefined) {
      this.errorMessage = 'Vai trò chưa có phiên bản để kiểm soát xung đột. Hãy tải lại danh sách vai trò.';
      return;
    }

    this.saving = true;
    this.roleService.updateRolePermissions(this.selectedRole.id, {
      expectedVersion: this.selectedRole.version,
      reason: 'Cập nhật ma trận quyền từ giao diện quản trị',
      permissions
    }).pipe(
      timeout(10000),
      finalize(() => {
        this.saving = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (version) => {
        this.selectedRole!.version = version;
        this.messageService.add({ severity: 'success', summary: 'Thành công', detail: 'Đã cập nhật phân quyền.' });
        this.loadPermissions();
      },
      error: (error) => {
        const detail = error?.error?.message || 'Không thể lưu phân quyền.';
        this.messageService.add({ severity: 'error', summary: 'Lỗi', detail });
        if (error?.status === 409 || error?.error?.code === 'ROLE_PERMISSIONS_VERSION_CONFLICT') {
          this.dirty = false;
          this.errorMessage = 'Ma trận quyền đã được thay đổi bởi người khác. Đã tải lại dữ liệu mới nhất.';
          this.loadPermissions();
        }
      }
    });
  }
}
