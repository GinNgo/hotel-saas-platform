import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { SharedModule } from '@app/shared/shared.module';
import { StaffAssignment, UserService, User } from '@app/core/services/user';
import { RoleService, Role } from '@app/core/services/role.service';
import { ClientApiService, Hotel } from '@app/core/services/client-api.service';
import { ActivatedRoute } from '@angular/router';
import { MessageService } from 'primeng/api';
import { finalize, map, timeout } from 'rxjs/operators';
import { AuthService } from '@app/core/services/auth';
import { Observable } from 'rxjs';
import { isPasswordLengthValid, PASSWORD_POLICY } from '@app/core/auth/password-policy';

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [SharedModule],
  providers: [MessageService],
  templateUrl: './user-management.html',
  styleUrl: './user-management.css',
})
export class UserManagement implements OnInit {
  users: User[] = [];
  roles: Role[] = [];
  hotels: Hotel[] = [];
  loading = true;
  saving = false;
  assigningRoleId: string | number | null = null;
  errorMessage = '';
  userType: 'STAFF' | 'CUSTOMER' = 'STAFF';

  displayDialog = false;
  userDialogMode: 'create' | 'edit' = 'create';
  userForm: any = this.createEmptyForm();
  lifecycleDialogVisible = false;
  lifecycleMode: 'deactivate' | 'reactivate' = 'deactivate';
  lifecycleUser: User | null = null;
  lifecycleHotelId: number | null = null;
  lifecycleReason = '';

  private userService = inject(UserService);
  private roleService = inject(RoleService);
  private hotelService = inject(ClientApiService);
  private route = inject(ActivatedRoute);
  private messageService = inject(MessageService);
  private cdr = inject(ChangeDetectorRef);
  private authService = inject(AuthService);
  readonly isSystemAdministrator = this.authService.getRoles().includes('SUPER_ADMIN');
  readonly currentUserId = this.authService.getCurrentUserId();
  readonly passwordPolicy = PASSWORD_POLICY;

  get assignableRoles(): Role[] {
    const protectedCodes=new Set(['SUPER_ADMIN','ADMIN','CUSTOMER']);
    return this.roles.filter(role => role.status !== 'INACTIVE' && role.code !== 'CUSTOMER' &&
      (this.isSystemAdministrator || !protectedCodes.has(role.code)));
  }

  get usernameError():string {
    const value=(this.userForm.username||'').trim();
    if(!value)return 'Vui lòng nhập tên tài khoản.';
    if(!/^[A-Za-z0-9._-]{3,50}$/.test(value))return 'Tên tài khoản gồm 3-50 ký tự và chỉ dùng chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.';
    return '';
  }

  get emailError():string {
    const value=(this.userForm.email||'').trim();
    if(!value)return 'Vui lòng nhập email.';
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)?'':'Email chưa đúng định dạng.';
  }

  get passwordError():string {
    const value=this.userForm.password||'';
    if(this.userDialogMode==='edit'&&!value)return '';
    return isPasswordLengthValid(value)?'':`Mật khẩu phải có từ ${PASSWORD_POLICY.minLength} đến ${PASSWORD_POLICY.maxLength} ký tự.`;
  }

  get userFormValid():boolean {
    const staffValid=this.userType!=='STAFF'||(!!this.userForm.hotelId&&Array.isArray(this.userForm.roleIds)&&this.userForm.roleIds.length>0);
    return !this.usernameError&&!this.emailError&&!this.passwordError&&staffValid;
  }

  ngOnInit(): void {
    this.userType = this.route.snapshot.data['userType'] || 'STAFF';
    this.loadUsers();

    this.route.data.subscribe(data => {
      const nextUserType = data['userType'] || 'STAFF';
      if (nextUserType !== this.userType) {
        this.userType = nextUserType;
        this.loadUsers();
        if (this.userType === 'STAFF') {
          this.loadRoles();
          this.loadHotels();
        }
      }
    });

    if (this.userType === 'STAFF') {
      this.loadRoles();
      this.loadHotels();
    }
  }

  loadUsers(): void {
    this.loading = true;
    this.errorMessage = '';
    this.users = [];

    let usersRequest: Observable<User[]>;
    if (this.userType !== 'CUSTOMER') {
      usersRequest = this.userService.getUsers();
    } else if (this.isSystemAdministrator) {
      usersRequest = this.userService.getCustomers();
    } else {
      usersRequest = this.userService.getPropertyGuests().pipe(
        map(guests => guests.map((guest, index) => ({
          id: -(index + 1),
          username: '',
          email: guest.email,
          fullName: guest.fullName,
          roles: [],
          status: '',
          createdAt: '',
        }))),
      );
    }

    usersRequest.pipe(
      timeout(10000),
      finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (data) => {
        this.users = this.userType === 'CUSTOMER'
          ? data
          : data.filter(u => !u.roles || !u.roles.some((r: any) => r.code === 'CUSTOMER'));
      },
      error: (error) => {
        this.errorMessage = error?.error?.message || 'Không thể tải danh sách người dùng.';
        this.messageService.add({ severity: 'error', summary: 'Lỗi', detail: this.errorMessage });
      }
    });
  }

  loadRoles(): void {
    this.roleService.getRoles().pipe(timeout(10000)).subscribe({
      next: (data) => {
        this.roles = data;
      },
      error: (error) => {
        const detail = error?.error?.message || 'Không thể tải danh sách vai trò.';
        this.messageService.add({ severity: 'error', summary: 'Lỗi', detail });
      }
    });
  }

  loadHotels(): void {
    this.hotelService.getAccessibleHotels().pipe(timeout(10000)).subscribe({
      next: (hotels) => {
        this.hotels = hotels;
        if (!this.isSystemAdministrator && this.hotels.length === 1 && !this.userForm.hotelId) {
          this.userForm.hotelId = this.hotels[0].id;
        }
      },
      error: (error) => {
        const detail = error?.error?.message || 'Không thể tải danh sách cơ sở.';
        this.messageService.add({ severity: 'error', summary: 'Lỗi', detail });
      }
    });
  }

  openNew(): void {
    this.userForm = this.createEmptyForm();
    if (!this.isSystemAdministrator && this.hotels.length === 1) {
      this.userForm.hotelId = this.hotels[0].id;
    }
    this.userDialogMode = 'create';
    this.displayDialog = true;
  }

  editUser(user: User): void {
    const activeAssignment = user.staffAssignments?.find(item => item.status === 'ACTIVE');
    this.userForm = {
      id: user.id,
      username: user.username,
      email: user.email,
      password: '',
      fullName: (user as any).fullName || '',
      phone: (user as any).phone || '',
      status: user.status,
      roleIds: user.roles ? user.roles.map((r: any) => r.id) : [],
      hotelId: activeAssignment?.hotelId ?? user.hotel?.id ?? null
    };
    this.userDialogMode = 'edit';
    this.displayDialog = true;
  }

  saveUser(): void {
    if (this.saving) return;

    this.userForm.username=(this.userForm.username||'').trim();
    this.userForm.email=(this.userForm.email||'').trim().toLowerCase();
    this.userForm.fullName=(this.userForm.fullName||'').trim();
    this.userForm.phone=(this.userForm.phone||'').trim();

    if (!this.userFormValid) {
      const detail=this.usernameError||this.emailError||this.passwordError||(this.userType==='STAFF'&&!this.userForm.roleIds?.length?'Vui lòng chọn ít nhất một vai trò.':'Vui lòng chọn cơ sở được phân công.');
      this.messageService.add({severity:'warn',summary:'Thông tin chưa hợp lệ',detail});
      return;
    }

    if (this.userType === 'STAFF' && !this.userForm.hotelId) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Thiếu cơ sở',
        detail: 'Vui lòng chọn cơ sở được phân công cho nhân sự.'
      });
      return;
    }

    const payload = { ...this.userForm };
    if (this.userType === 'CUSTOMER') {
      const customerRole = this.roles.find(r => r.code === 'CUSTOMER');
      if (customerRole) {
        payload.roleIds = [customerRole.id];
      }
    }

    const request = this.userType === 'CUSTOMER'
      ? (this.userDialogMode === 'create'
        ? this.userService.createCustomer(payload)
        : this.userService.updateCustomer(this.userForm.id, payload))
      : (this.userDialogMode === 'create'
        ? this.userService.createUser(payload)
        : this.userService.updateUser(this.userForm.id, payload));

    this.saving = true;
    request.pipe(
      timeout(10000),
      finalize(() => {
        this.saving = false;
      })
    ).subscribe({
      next: () => {
        this.displayDialog = false;
        this.messageService.add({ severity: 'success', summary: 'Thành công', detail: 'Đã lưu người dùng.' });
        this.loadUsers();
      },
      error: (error) => {
        const detail = error?.error?.message || 'Không thể lưu người dùng.';
        this.messageService.add({ severity: 'error', summary: 'Lỗi', detail });
      }
    });
  }

  openLifecycle(user: User, mode: 'deactivate' | 'reactivate'): void {
    if (user.id===this.currentUserId) {
      this.messageService.add({severity:'warn',summary:'Tài khoản đang đăng nhập',detail:'Không thể thay đổi vòng đời của chính tài khoản đang sử dụng.'});
      return;
    }
    const assignments = this.lifecycleAssignments(user, mode);
    if (!assignments.length) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Không có phân công phù hợp',
        detail: mode === 'deactivate'
          ? 'Nhân viên không còn phân công đang hoạt động.'
          : 'Không tìm thấy lịch sử phân công để tuyển lại.'
      });
      return;
    }
    this.lifecycleUser = user;
    this.lifecycleMode = mode;
    this.lifecycleHotelId = assignments[0].hotelId;
    this.lifecycleReason = '';
    this.lifecycleDialogVisible = true;
  }

  submitLifecycle(): void {
    if (this.saving || !this.lifecycleUser || !this.lifecycleHotelId) return;
    const reason = this.lifecycleReason.trim();
    if (reason.length < 3) {
      this.messageService.add({
        severity: 'warn', summary: 'Thiếu lý do', detail: 'Vui lòng nhập lý do ít nhất 3 ký tự.'
      });
      return;
    }

    const request = this.lifecycleMode === 'deactivate'
      ? this.userService.deactivateStaff(this.lifecycleUser.id, { hotelId: this.lifecycleHotelId, reason })
      : this.userService.reactivateStaff(this.lifecycleUser.id, { hotelId: this.lifecycleHotelId, reason });

    this.saving = true;
    request.pipe(
      timeout(10000),
      finalize(() => {
        this.saving = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: () => {
        this.lifecycleDialogVisible = false;
        this.messageService.add({
          severity: 'success',
          summary: 'Thành công',
          detail: this.lifecycleMode === 'deactivate'
            ? 'Đã ngừng quyền truy cập và giữ nguyên lịch sử nhân sự.'
            : 'Đã tuyển lại nhân viên với một kỳ phân công mới.'
        });
        this.loadUsers();
      },
      error: (error) => {
        const detail = error?.error?.message || 'Không thể cập nhật vòng đời nhân viên.';
        this.messageService.add({ severity: 'error', summary: 'Lỗi', detail });
      }
    });
  }

  lifecycleAssignments(user: User | null, mode: 'deactivate' | 'reactivate'): StaffAssignment[] {
    const expectedStatus = mode === 'deactivate' ? 'ACTIVE' : 'INACTIVE';
    return (user?.staffAssignments || []).filter(item => item.status === expectedStatus);
  }

  hasAssignment(user: User, status: 'ACTIVE' | 'INACTIVE'): boolean {
    return (user.staffAssignments || []).some(item => item.status === status);
  }

  canManageLifecycle(user:User,status:'ACTIVE'|'INACTIVE'):boolean { return user.id!==this.currentUserId&&this.hasAssignment(user,status); }

  assignmentLabel(user: User): string {
    const assignments = user.staffAssignments || [];
    if (!assignments.length) return user.hotel?.name || '-';
    return assignments
      .map(item => `${item.hotelName} · ${item.status === 'ACTIVE' ? 'Đang làm' : 'Đã nghỉ'}`)
      .join(', ');
  }

  getRolesString(roles: any[]): string {
    if (!roles) return '';
    return roles.map(r => r.name).join(', ');
  }

  roleId(user: User): string | number | null {
    return user.roles?.[0]?.id ?? null;
  }

  assignRole(user: User, roleId: string | number): void {
    if (this.assigningRoleId !== null || user.id === this.currentUserId || roleId === this.roleId(user)) return;
    const assign = (this.userService as any).assignRole;
    if (typeof assign !== 'function') return;
    this.assigningRoleId = user.id;
    assign.call(this.userService, user.id, String(roleId)).pipe(finalize(() => this.assigningRoleId = null)).subscribe({
      next: (updated: User) => {
        const index = this.users.findIndex(item => item.id === user.id);
        if (index >= 0) this.users[index] = updated;
        this.messageService.add({ severity: 'success', summary: 'Đã cập nhật', detail: 'Vai trò nhân sự đã được thay đổi.' });
      },
      error: (error: any) => this.messageService.add({ severity: 'error', summary: 'Lỗi', detail: error?.error?.message || 'Không thể gán vai trò.' })
    });
  }

  private createEmptyForm(): any {
    return {
      id: null,
      username: '',
      email: '',
      password: '',
      fullName: '',
      phone: '',
      status: 'ACTIVE',
      roleIds: [],
      hotelId: null
    };
  }
}
