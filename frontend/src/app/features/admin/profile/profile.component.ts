import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserService } from '@app/core/services/user';
import { MessageService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { finalize, switchMap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AuthService } from '@app/core/services/auth';
import { Router } from '@angular/router';
import { isPasswordLengthValid, PASSWORD_POLICY } from '@app/core/auth/password-policy';

@Component({
  selector: 'app-admin-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogModule, PasswordModule, ButtonModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class AdminProfileComponent implements OnInit {
  user: any = null;
  originalUser: any = null;
  facility: any = null;
  loading = false;
  saving = false;
  uploadingAvatar = false;

  displayPasswordDialog = false;
  passwordData = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  };

  private userService = inject(UserService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private messageService = inject(MessageService);
  private cdr = inject(ChangeDetectorRef);
  private apiOrigin = environment.apiUrl.replace(/\/api\/?$/, '');
  readonly passwordPolicy = PASSWORD_POLICY;

  ngOnInit() {
    this.loadProfile();
  }

  loadProfile() {
    this.loading = true;
    this.userService.getProfile()
      .pipe(finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
      }))
      .subscribe({
        next: (data) => this.applyProfile(data),
        error: () => {
          this.messageService.add({ severity: 'error', summary: 'Lỗi', detail: 'Không thể tải thông tin hồ sơ' });
        }
      });
  }

  saveProfile() {
    if (!this.user?.fullName?.trim() || !this.user?.email?.trim()) {
      this.messageService.add({ severity: 'warn', summary: 'Thiếu thông tin', detail: 'Vui lòng nhập họ tên và email.' });
      return;
    }

    this.saving = true;
    this.userService.updateProfile(this.profilePayload())
      .pipe(finalize(() => {
        this.saving = false;
        this.cdr.detectChanges();
      }))
      .subscribe({
        next: (data) => {
          this.applyProfile(data);
          this.messageService.add({ severity: 'success', summary: 'Thành công', detail: 'Đã cập nhật thông tin thành công!' });
        },
        error: (error) => {
          const detail = typeof error.error === 'string' ? error.error : 'Không thể cập nhật hồ sơ';
          this.messageService.add({ severity: 'error', summary: 'Lỗi', detail });
        }
      });
  }

  cancelChanges() {
    this.user = this.originalUser ? { ...this.originalUser } : this.user;
  }

  onAvatarSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';

    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.messageService.add({ severity: 'warn', summary: 'Ảnh không hợp lệ', detail: 'Chỉ hỗ trợ JPG, PNG hoặc WEBP.' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.messageService.add({ severity: 'warn', summary: 'Ảnh quá lớn', detail: 'Dung lượng ảnh tối đa là 5 MB.' });
      return;
    }

    this.uploadingAvatar = true;
    this.userService.uploadAvatar(file)
      .pipe(
        switchMap(({ url }) => this.userService.updateProfile({ ...this.profilePayload(), avatarUrl: url })),
        finalize(() => {
          this.uploadingAvatar = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (data) => {
          this.applyProfile(data);
          this.messageService.add({ severity: 'success', summary: 'Thành công', detail: 'Đã cập nhật ảnh đại diện.' });
        },
        error: () => {
          this.messageService.add({ severity: 'error', summary: 'Lỗi', detail: 'Không thể tải ảnh đại diện.' });
        }
      });
  }

  get avatarSrc(): string {
    const avatarUrl = this.user?.avatarUrl;
    if (avatarUrl?.startsWith('data:')) return avatarUrl;
    if (avatarUrl?.startsWith('/')) return `${this.apiOrigin}${avatarUrl}`;
    return '';
  }

  get avatarInitials(): string {
    return (this.user?.fullName || this.user?.username || 'User')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part: string) => part[0]?.toUpperCase() || '')
      .join('');
  }

  changePassword() {
    this.displayPasswordDialog = true;
    this.passwordData = { currentPassword: '', newPassword: '', confirmPassword: '' };
  }

  savePassword() {
    if (!this.passwordData.currentPassword) {
      this.messageService.add({ severity: 'error', summary: 'Lỗi', detail: 'Vui lòng nhập mật khẩu hiện tại.' });
      return;
    }
    if (!isPasswordLengthValid(this.passwordData.newPassword)) {
      this.messageService.add({ severity: 'error', summary: 'Lỗi', detail: `Mật khẩu mới phải có từ ${PASSWORD_POLICY.minLength} đến ${PASSWORD_POLICY.maxLength} ký tự.` });
      return;
    }
    if (this.passwordData.newPassword !== this.passwordData.confirmPassword) {
      this.messageService.add({ severity: 'error', summary: 'Lỗi', detail: 'Mật khẩu xác nhận không khớp!' });
      return;
    }

    this.userService.changePassword({
      currentPassword: this.passwordData.currentPassword,
      newPassword: this.passwordData.newPassword
    }).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Thành công', detail: 'Đã đổi mật khẩu thành công!' });
        this.displayPasswordDialog = false;
        this.authService.logout();
        void this.router.navigate(['/login'], { queryParams: { reason: 'PASSWORD_CHANGED' } });
      },
      error: (error) => {
        this.messageService.add({ severity: 'error', summary: 'Lỗi', detail: error.error?.message || 'Không thể đổi mật khẩu' });
      }
    });
  }

  private profilePayload() {
    return {
      fullName: this.user?.fullName?.trim(),
      email: this.user?.email?.trim(),
      phone: this.user?.phone?.trim() || null,
      avatarUrl: this.user?.avatarUrl || null
    };
  }

  private applyProfile(data: any) {
    this.authService.updateCurrentUser(data);
    const roles = data.roles ? data.roles.map((role: any) => role.code) : [];
    this.user = {
      ...data,
      role: roles.includes('SUPER_ADMIN') ? 'Quản trị viên Hệ thống' : 'Quản lý Chi nhánh'
    };
    this.originalUser = { ...this.user };

    this.facility = !roles.includes('SUPER_ADMIN') && data.hotel
      ? {
          name: data.hotel.name,
          address: data.hotel.address,
          status: 'Đang hoạt động',
          roomsCount: 'N/A'
        }
      : null;
  }
}
