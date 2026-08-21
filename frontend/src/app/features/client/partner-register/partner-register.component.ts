import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { FilterService, MessageService } from 'primeng/api';
import { SelectModule } from 'primeng/select';
import { finalize, timeout } from 'rxjs';
import { PropertyLocation, PropertyService } from '../../../core/services/property.service';
import { AuthService } from '../../../core/services/auth';
import { UserService } from '../../../core/services/user';

interface PartnerRegistrationApiError {
  code?: string;
  message?: string;
  correlationId?: string;
  fieldErrors?: Record<string, string>;
}

@Component({
  selector: 'app-partner-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, SelectModule],
  templateUrl: './partner-register.component.html',
  styleUrls: ['./partner-register.component.css']
})
export class PartnerRegisterComponent implements OnInit {
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  private router = inject(Router);
  private messages = inject(MessageService);
  private filterService = inject(FilterService);
  private propertyService = inject(PropertyService);
  private authService = inject(AuthService);
  private userService = inject(UserService);

  registerForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    fullName: ['', Validators.required],
    phone: ['', Validators.required],
    propertyName: ['', Validators.required],
    provinceId: [null as string | number | null, Validators.required],
    wardId: [null as string | number | null],
    propertyAddress: ['', Validators.required]
  });

  isLoading = false;
  provincesLoading = false;
  wardsLoading = false;
  provinces: PropertyLocation[] = [];
  wards: PropertyLocation[] = [];
  errorMessage = '';
  isAuthenticatedRegistration = false;
  profileLoading = false;

  ngOnInit(): void {
    this.filterService.register('locationFuzzy', (value: unknown, filter: unknown): boolean =>
      this.matchesLocation(value, filter));
    this.loadProvinces();
    this.loadAuthenticatedProfile();
  }

  private loadAuthenticatedProfile(): void {
    this.isAuthenticatedRegistration = this.authService.isLoggedIn();
    if (!this.isAuthenticatedRegistration) return;

    const passwordControl = this.registerForm.controls['password'];
    passwordControl.clearValidators();
    passwordControl.setValue('');
    passwordControl.updateValueAndValidity();

    this.profileLoading = true;
    this.userService.getProfile().pipe(
      finalize(() => { this.profileLoading = false; })
    ).subscribe({
      next: user => {
        this.registerForm.patchValue({
          email: user.email,
          fullName: user.fullName ?? '',
          phone: user.phone ?? '',
        });
      },
      error: () => {
        this.isAuthenticatedRegistration = false;
        passwordControl.setValidators([Validators.required, Validators.minLength(6)]);
        passwordControl.updateValueAndValidity();
      },
    });
  }

  private matchesLocation(value: unknown, filter: unknown): boolean {
    const query = this.normalizeSearchText(filter);
    if (!query) return true;

    const candidate = this.normalizeSearchText(value);
    if (!candidate) return false;
    if (candidate.includes(query)) return true;

    const queryTokens = query.split(' ').filter(token => token.length > 1);
    const candidateTokens = candidate.split(' ').filter(Boolean);
    return queryTokens.every(queryToken => candidateTokens.some(candidateToken =>
      candidateToken.includes(queryToken) || this.isCloseToken(candidateToken, queryToken)));
  }

  private normalizeSearchText(value: unknown): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLocaleLowerCase('vi')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private isCloseToken(candidate: string, query: string): boolean {
    if (query.length < 4 || Math.abs(candidate.length - query.length) > 1) return false;
    const previous = Array.from({ length: query.length + 1 }, (_, index) => index);
    for (let candidateIndex = 1; candidateIndex <= candidate.length; candidateIndex++) {
      const current = [candidateIndex];
      for (let queryIndex = 1; queryIndex <= query.length; queryIndex++) {
        current[queryIndex] = Math.min(
          current[queryIndex - 1] + 1,
          previous[queryIndex] + 1,
          previous[queryIndex - 1] + (candidate[candidateIndex - 1] === query[queryIndex - 1] ? 0 : 1),
        );
      }
      previous.splice(0, previous.length, ...current);
    }
    return previous[query.length] <= 1;
  }

  loadProvinces(): void {
    this.provincesLoading = true;
    this.propertyService.getProvinces().pipe(
      timeout(10000),
      finalize(() => { this.provincesLoading = false; })
    ).subscribe({
      next: provinces => { this.provinces = provinces; },
      error: () => {
        this.errorMessage = 'Không thể tải danh sách tỉnh/thành phố. Vui lòng thử lại.';
        this.messages.add({ severity: 'error', summary: 'Lỗi địa điểm', detail: this.errorMessage });
      }
    });
  }

  onProvinceChange(): void {
    const provinceId = this.registerForm.controls['provinceId'].value as string | number | null;
    this.registerForm.controls['wardId'].setValue(null);
    this.wards = [];
    if (!provinceId) return;
    this.wardsLoading = true;
    this.propertyService.getWards(provinceId).pipe(
      timeout(10000),
      finalize(() => { this.wardsLoading = false; })
    ).subscribe({
      next: wards => { this.wards = wards; },
      error: () => {
        this.errorMessage = 'Không thể tải danh sách phường/xã. Vui lòng chọn lại tỉnh/thành phố.';
        this.messages.add({ severity: 'error', summary: 'Lỗi địa điểm', detail: this.errorMessage });
      }
    });
  }

  onSubmit() {
    if (this.registerForm.invalid) {
      Object.keys(this.registerForm.controls).forEach(key => {
        this.registerForm.get(key)?.markAsTouched();
      });
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    const formValue = this.registerForm.getRawValue();
    const province = this.provinces.find(item => String(item.id) === String(formValue.provinceId));
    const ward = this.wards.find(item => String(item.id) === String(formValue.wardId));
    const payload = {
      ...formValue,
      password: this.isAuthenticatedRegistration ? undefined : formValue.password,
      provinceName: province?.nameVi ?? '',
      wardName: ward?.nameVi ?? null,
    };

    this.http.post(`${environment.apiUrl}/partner/register`, payload, { responseType: 'text' })
      .subscribe({
        next: () => {
          this.isLoading = false;
          this.messages.add({
            severity: 'success',
            summary: 'Đăng ký thành công',
            detail: 'Hồ sơ đối tác đã được gửi và đang chờ duyệt.',
            life: 4000,
          });
          void this.router.navigate(['/partner/registration-status']);
        },
        error: (err: HttpErrorResponse) => {
          this.isLoading = false;
          this.errorMessage = this.registrationErrorMessage(err);
          this.messages.add({
            severity: 'error',
            summary: 'Chưa thể đăng ký đối tác',
            detail: this.errorMessage,
            life: 5000,
          });
        }
      });
  }

  private registrationErrorMessage(error: HttpErrorResponse): string {
    const apiError = this.parseApiError(error.error);
    const fieldMessage = apiError?.fieldErrors ? Object.values(apiError.fieldErrors)[0] : undefined;
    const message = fieldMessage || this.messageForCode(apiError?.code) || apiError?.message;
    const fallback = 'Không thể gửi hồ sơ. Vui lòng kiểm tra thông tin và thử lại.';
    const translatedMessage = message && !message.startsWith('The request conflicts') ? message : fallback;
    return apiError?.correlationId
      ? `${translatedMessage} Mã hỗ trợ: ${apiError.correlationId}`
      : translatedMessage;
  }

  private parseApiError(value: unknown): PartnerRegistrationApiError | null {
    if (value && typeof value === 'object') return value as PartnerRegistrationApiError;
    if (typeof value !== 'string') return null;
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed as PartnerRegistrationApiError : null;
    } catch {
      return value.trim() ? { message: value } : null;
    }
  }

  private messageForCode(code?: string): string | null {
    switch (code) {
      case 'EMAIL_ALREADY_EXISTS':
      case 'USERNAME_ALREADY_EXISTS':
        return 'Email này đã có tài khoản. Vui lòng đăng nhập bằng tài khoản đó để đăng ký đối tác.';
      case 'CONFLICT':
        return 'Tài khoản đã có hồ sơ đối tác đang chờ xử lý.';
      case 'DATA_CONFLICT':
        return 'Dữ liệu hồ sơ chưa hợp lệ hoặc đã tồn tại. Vui lòng kiểm tra email và thông tin cơ sở.';
      default:
        return null;
    }
  }
}
