import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { SharedModule } from '@app/shared/shared.module';
import { Role, RoleService } from '@app/core/services/role.service';
import { ConfirmationService, MessageService } from 'primeng/api';
import { PermissionService, ActionCode, FunctionCode } from '@app/core/services/permission.service';
import { Subscription } from 'rxjs';
import { filter, finalize, timeout } from 'rxjs/operators';

@Component({
  selector: 'app-role-management',
  standalone: true,
  imports: [SharedModule],
  providers: [ConfirmationService, MessageService],
  templateUrl: './role-management.component.html',
  styleUrl: './role-management.component.css'
})
export class RoleManagementComponent implements OnInit, OnDestroy {
  roles: Role[] = [];
  loading = true;
  saving = false;
  errorMessage = '';
  searchText = '';
  statusFilter = '';

  displayDialog = false;
  roleDialogMode: 'create' | 'edit' = 'create';
  roleForm: Role = {
    id: 0,
    code: '',
    name: '',
    description: ''
  };
  private roleFormSnapshot = '';

  private roleService = inject(RoleService);
  private confirmationService = inject(ConfirmationService);
  private messageService = inject(MessageService);
  private router = inject(Router);
  private permissionService = inject(PermissionService);
  private cdr = inject(ChangeDetectorRef);
  private routeSub?: Subscription;

  canCreate = this.permissionService.hasPermission(FunctionCode.ROLE, ActionCode.CREATE);
  canUpdate = this.permissionService.hasPermission(FunctionCode.ROLE, ActionCode.UPDATE);
  canDelete = this.permissionService.hasPermission(FunctionCode.ROLE, ActionCode.DELETE);
  statusOptions = [{ label: 'Đang hoạt động', value: 'ACTIVE' }, { label: 'Ngừng hoạt động', value: 'INACTIVE' }];

  get filteredRoles(): Role[] {
    const key = this.searchText.trim().toLocaleLowerCase('vi');
    return this.roles.filter(role => (!key || `${role.code} ${role.name}`.toLocaleLowerCase('vi').includes(key)) &&
      (!this.statusFilter || (role.status || 'ACTIVE') === this.statusFilter));
  }

  get codeError(): string {
    const code=this.roleForm.code.trim().toUpperCase();
    if (!code) return 'Vui lòng nhập mã vai trò.';
    if (!/^[A-Z][A-Z0-9_]{2,49}$/.test(code)) return 'Mã gồm 3-50 ký tự, bắt đầu bằng chữ và chỉ dùng A-Z, 0-9 hoặc dấu gạch dưới.';
    if (this.roleDialogMode==='create'&&this.roles.some(role=>role.code.toUpperCase()===code)) return 'Mã vai trò đã tồn tại.';
    return '';
  }

  get nameError(): string {
    const name=this.roleForm.name.trim();
    if (!name) return 'Vui lòng nhập tên vai trò.';
    if (name.length>100) return 'Tên vai trò không được vượt quá 100 ký tự.';
    return '';
  }

  get dialogDirty(): boolean { return this.roleFormSnapshot!==this.serializeRoleForm(this.roleForm); }
  get roleFormValid(): boolean { return !this.codeError&&!this.nameError&&(this.roleForm.description||'').trim().length<=500; }

  ngOnInit(): void {
    this.loadRoles();
    this.routeSub = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        if (event.urlAfterRedirects.split('?')[0] === '/admin/roles') {
          this.loadRoles();
        }
      });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  loadRoles(): void {
    this.loading = true;
    this.errorMessage = '';

    this.roleService.getRoles().pipe(
      timeout(10000),
      finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (data) => {
        this.roles = data;
      },
      error: (error) => {
        this.errorMessage = error?.error?.message || 'Không thể tải danh sách vai trò.';
        this.messageService.add({ severity: 'error', summary: 'Lỗi', detail: this.errorMessage });
      }
    });
  }

  openNew(): void {
    if (!this.canCreate) {
      this.messageService.add({ severity: 'warn', summary: 'Không đủ quyền', detail: 'Tài khoản chưa có quyền thêm vai trò.' });
      return;
    }

    this.roleForm = { id: 0, code: '', name: '', description: '' };
    this.roleDialogMode = 'create';
    this.roleFormSnapshot = this.serializeRoleForm(this.roleForm);
    this.displayDialog = true;
  }

  editRole(role: Role): void {
    if (!this.canUpdate) {
      this.messageService.add({ severity: 'warn', summary: 'Không đủ quyền', detail: 'Tài khoản chưa có quyền sửa vai trò.' });
      return;
    }

    this.roleForm = { ...role };
    this.roleDialogMode = 'edit';
    this.roleFormSnapshot = this.serializeRoleForm(this.roleForm);
    this.displayDialog = true;
  }

  requestCloseDialog(): void {
    if (this.saving) return;
    if (!this.dialogDirty) { this.displayDialog=false; return; }
    this.confirmationService.confirm({
      header:'Bỏ thay đổi chưa lưu?', message:'Các thay đổi trong biểu mẫu vai trò sẽ bị mất.', icon:'pi pi-exclamation-triangle',
      acceptLabel:'Bỏ thay đổi', rejectLabel:'Tiếp tục chỉnh sửa', acceptButtonStyleClass:'p-button-danger',
      accept:()=>{this.displayDialog=false;}
    });
  }

  onDialogVisibilityChange(visible:boolean):void { if (visible) { this.displayDialog=true; return; } this.requestCloseDialog(); }

  saveRole(): void {
    if (this.saving) return;

    this.roleForm.code = this.roleForm.code.trim().toUpperCase();
    this.roleForm.name = this.roleForm.name.trim();
    this.roleForm.description = (this.roleForm.description || '').trim();

    if (!this.roleFormValid) {
      this.messageService.add({ severity: 'warn', summary: 'Thông tin chưa hợp lệ', detail: this.codeError || this.nameError || 'Mô tả không được vượt quá 500 ký tự.' });
      return;
    }

    if (this.roleDialogMode === 'create' && !this.canCreate) {
      this.messageService.add({ severity: 'warn', summary: 'Không đủ quyền', detail: 'Tài khoản chưa có quyền thêm vai trò.' });
      return;
    }

    if (this.roleDialogMode === 'edit' && !this.canUpdate) {
      this.messageService.add({ severity: 'warn', summary: 'Không đủ quyền', detail: 'Tài khoản chưa có quyền sửa vai trò.' });
      return;
    }

    const request = this.roleDialogMode === 'create'
      ? this.roleService.createRole(this.roleForm)
      : this.roleService.updateRole(this.roleForm.id, this.roleForm);

    this.saving = true;
    request.pipe(
      finalize(() => {
        this.saving = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: () => {
        this.displayDialog = false;
        this.messageService.add({ severity: 'success', summary: 'Thành công', detail: 'Đã lưu vai trò.' });
        this.loadRoles();
      },
      error: (error) => {
        const detail = error?.error?.message || 'Không thể lưu vai trò.';
        this.messageService.add({ severity: 'error', summary: 'Lỗi', detail });
      }
    });
  }

  deleteRole(role: Role): void {
    if (!this.canDelete) {
      this.messageService.add({ severity: 'warn', summary: 'Không đủ quyền', detail: 'Tài khoản chưa có quyền xóa vai trò.' });
      return;
    }
    if (role.systemRole) {
      this.messageService.add({ severity: 'warn', summary: 'Vai trò hệ thống', detail: 'Không thể ngừng sử dụng vai trò hệ thống.' });
      return;
    }
    if ((role.userCount||0)>0) {
      this.messageService.add({ severity: 'warn', summary: 'Vai trò đang được sử dụng', detail: `Hãy chuyển ${role.userCount} người dùng sang vai trò khác trước.` });
      return;
    }

    this.confirmationService.confirm({
      message: `Bạn có chắc muốn xóa vai trò "${role.name}"?`,
      header: 'Xác nhận xóa',
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.saving = true;
        this.roleService.deleteRole(role.id).pipe(
          finalize(() => {
            this.saving = false;
            this.cdr.detectChanges();
          })
        ).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Thành công', detail: 'Đã xóa vai trò.' });
            this.loadRoles();
          },
          error: (error) => {
            const detail = error?.error?.message || 'Không thể xóa vai trò này.';
            this.messageService.add({ severity: 'error', summary: 'Lỗi', detail });
          }
        });
      }
    });
  }

  openPermissions(role: Role): void {
    this.router.navigate(['/admin/role-permissions'], { queryParams: { roleId: role.id } });
  }

  canRemoveRole(role:Role):boolean { return this.canDelete&&!role.systemRole&&role.status!=='INACTIVE'&&(role.userCount||0)===0; }
  private serializeRoleForm(role:Role):string { return JSON.stringify({id:role.id,code:role.code,name:role.name,description:role.description||''}); }
}
