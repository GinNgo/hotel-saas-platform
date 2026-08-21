import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { finalize, timeout } from 'rxjs/operators';
import { MessageService } from 'primeng/api';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { AuthService } from '../../../core/services/auth';
import { ActionCode, FunctionCode, PermissionService } from '../../../core/services/permission.service';
import {
  AdminProperty,
  CreatePropertyRequest,
  PropertyLocation,
  PropertyService
} from '../../../core/services/property.service';

type PropertyStatus = 'DRAFT' | 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'REJECTED';
type SubscriptionTier = 'Basic' | 'Pro' | 'Enterprise';

@Component({
  selector: 'app-property-management',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    TableModule,
    ButtonModule,
    ToastModule,
    TagModule,
    TooltipModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    TextareaModule
  ],
  providers: [MessageService],
  templateUrl: './property-management.html',
  styleUrl: './property-management.css'
})
export class PropertyManagementComponent implements OnInit {
  private readonly propertyService = inject(PropertyService);
  private readonly messageService = inject(MessageService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);
  public readonly authService = inject(AuthService);
  private readonly permissions = inject(PermissionService);

  properties: AdminProperty[] = [];
  provinces: PropertyLocation[] = [];
  wards: PropertyLocation[] = [];
  loading = false;
  locationsLoading = false;
  saving = false;
  dialogVisible = false;
  isAdmin = false;
  canManagePricing = false;
  canCreate = false;
  canApprove = false;
  canUpdate = false;
  canManageSubscription = false;
  formError = '';
  pricingDialogVisible = false;
  pricingSaving = false;
  pricingError = '';
  pricingProperty: AdminProperty | null = null;
  subscriptionDialogVisible = false;
  subscriptionSaving = false;
  subscriptionError = '';
  subscriptionProperty: AdminProperty | null = null;
  selectedSubscriptionTier: SubscriptionTier = 'Basic';
  readonly subscriptionTiers: Array<{ label: string; value: SubscriptionTier; description: string }> = [
    { label: 'Basic', value: 'Basic', description: 'Vận hành cơ bản, không có folio dịch vụ nâng cao.' },
    { label: 'Pro', value: 'Pro', description: 'Folio dịch vụ, vận hành và báo cáo nâng cao.' },
    { label: 'Enterprise', value: 'Enterprise', description: 'Hạn mức lớn nhất cho chuỗi và đội ngũ mở rộng.' },
  ];

  readonly pricingForm = this.formBuilder.nonNullable.group({
    taxRatePercent: [0, [Validators.required, Validators.min(0), Validators.max(30)]],
    serviceFeeRatePercent: [0, [Validators.required, Validators.min(0), Validators.max(30)]]
  });

  readonly propertyTypes = [
    { label: 'Khách sạn', value: 'HOTEL' },
    { label: 'Nhà nghỉ', value: 'MOTEL' },
    { label: 'Homestay', value: 'HOMESTAY' },
    { label: 'Căn hộ / Villa', value: 'APARTMENT' }
  ];
  readonly amenityOptions = [
    ['WIFI', 'Wi-Fi miễn phí'], ['POOL', 'Hồ bơi'], ['PARKING', 'Bãi đỗ xe'], ['BREAKFAST', 'Bữa sáng'],
    ['AIRPORT_SHUTTLE', 'Đưa đón sân bay'], ['GYM', 'Phòng gym'], ['SPA', 'Spa'], ['RESTAURANT', 'Nhà hàng'],
    ['PET_FRIENDLY', 'Cho phép thú cưng'], ['FAMILY_ROOMS', 'Phòng gia đình'], ['BEACH', 'Bãi biển'], ['EV_CHARGING', 'Trạm sạc xe điện']
  ].map(([value, label]) => ({ value, label }));

  readonly form = this.formBuilder.nonNullable.group({
    nameVi: ['', [Validators.required, Validators.maxLength(255)]],
    nameEn: ['', Validators.maxLength(255)],
    propertyType: ['HOTEL', Validators.required],
    provinceId: [null as number | null, Validators.required],
    wardId: [null as string | number | null],
    address: ['', [Validators.required, Validators.maxLength(1000)]],
    starRating: [0, [Validators.min(0), Validators.max(5)]],
    phone: ['', Validators.maxLength(50)],
    email: ['', [Validators.email, Validators.maxLength(255)]],
    website: ['', Validators.maxLength(255)],
    mainImage: ['', Validators.maxLength(1000)],
    descriptionVi: ['', Validators.maxLength(4000)],
    descriptionEn: ['', Validators.maxLength(4000)]
    , amenityCodes: [[] as string[]], checkInTime: ['14:00', Validators.required], checkOutTime: ['12:00', Validators.required],
    cancellationPolicy: ['', Validators.maxLength(2000)], childrenPolicy: ['', Validators.maxLength(2000)],
    petPolicy: ['', Validators.maxLength(2000)], houseRules: ['', Validators.maxLength(2000)],
    taxRatePercent: [0, [Validators.min(0), Validators.max(30)]],
    serviceFeeRatePercent: [0, [Validators.min(0), Validators.max(30)]]
    , latitude: [null as number | null, [Validators.min(-90), Validators.max(90)]], longitude: [null as number | null, [Validators.min(-180), Validators.max(180)]]
  });

  ngOnInit(): void {
    this.canCreate = this.permissions.hasPermission(FunctionCode.HOTEL, ActionCode.CREATE);
    this.canUpdate = this.permissions.hasPermission(FunctionCode.HOTEL, ActionCode.UPDATE);
    this.canApprove = this.permissions.hasPermission(FunctionCode.HOTEL, ActionCode.APPROVE);
    this.canManageSubscription = this.permissions.hasPermission(FunctionCode.PLATFORM_BILLING, ActionCode.UPDATE);
    this.isAdmin = this.canCreate;
    this.canManagePricing = this.canUpdate;
    this.loadProperties();
    this.loadProvinces();
  }

  loadProperties(): void {
    this.loading = true;
    this.propertyService.getAllProperties().pipe(
      timeout(10000),
      finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: data => { this.properties = data; },
      error: error => {
        const detail = error?.error?.message || 'Không thể tải danh sách cơ sở.';
        this.messageService.add({ severity: 'error', summary: 'Lỗi', detail });
      }
    });
  }

  loadProvinces(): void {
    this.locationsLoading = true;
    this.propertyService.getProvinces().pipe(
      timeout(10000),
      finalize(() => {
        this.locationsLoading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: data => { this.provinces = data; },
      error: () => {
        this.messageService.add({
          severity: 'warn',
          summary: 'Thiếu dữ liệu địa điểm',
          detail: 'Không thể tải danh sách tỉnh/thành phố. Bạn có thể thử lại khi mở biểu mẫu.'
        });
      }
    });
  }

  onProvinceChange(): void {
    const provinceId = this.form.controls.provinceId.value;
    this.form.controls.wardId.setValue(null);
    this.wards = [];
    if (!provinceId) return;

    this.locationsLoading = true;
    this.propertyService.getWards(provinceId).pipe(
      timeout(10000),
      finalize(() => {
        this.locationsLoading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: data => { this.wards = data; },
      error: error => {
        const detail = error?.error?.message || 'Không thể tải danh sách phường/xã.';
        this.messageService.add({ severity: 'error', summary: 'Lỗi địa điểm', detail });
      }
    });
  }

  openCreate(): void {
    if (!this.canCreate) return;
    if (!this.isAdmin) {
      this.messageService.add({ severity: 'warn', summary: 'Không đủ quyền', detail: 'Chỉ quản trị hệ thống mới có thể tạo cơ sở.' });
      return;
    }
    this.form.reset({
      nameVi: '', nameEn: '', propertyType: 'HOTEL', provinceId: null, wardId: null,
      address: '', starRating: 0, phone: '', email: '', website: '', mainImage: '',
      descriptionVi: '', descriptionEn: '', amenityCodes: [], checkInTime: '14:00', checkOutTime: '12:00',
      cancellationPolicy: '', childrenPolicy: '', petPolicy: '', houseRules: '', taxRatePercent: 0, serviceFeeRatePercent: 0
      , latitude: null, longitude: null
    });
    this.formError = '';
    this.wards = [];
    this.dialogVisible = true;
    if (!this.provinces.length) this.loadProvinces();
  }

  closeCreate(): void {
    if (!this.saving) this.dialogVisible = false;
  }

  save(): void {
    if (!this.canCreate) return;
    if (this.saving) return;
    this.formError = '';
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.formError = 'Vui lòng bổ sung các trường bắt buộc trước khi lưu.';
      this.messageService.add({ severity: 'warn', summary: 'Thiếu thông tin', detail: this.formError });
      return;
    }

    const value = this.form.getRawValue();
    if ((value.latitude === null) !== (value.longitude === null)) {
      this.formError = 'Vui lòng nhập đầy đủ cả vĩ độ và kinh độ.';
      this.messageService.add({ severity: 'warn', summary: 'Tọa độ chưa đầy đủ', detail: this.formError });
      return;
    }
    const province = this.provinces.find(item => item.id === value.provinceId);
    if (!province || value.provinceId === null) {
      this.formError = 'Vui lòng chọn tỉnh/thành phố và phường/xã hợp lệ.';
      this.messageService.add({ severity: 'warn', summary: 'Thiếu địa điểm', detail: this.formError });
      return;
    }

    const request: CreatePropertyRequest = {
      name: value.nameVi.trim(),
      nameVi: value.nameVi.trim(),
      nameEn: value.nameEn.trim() || undefined,
      propertyType: value.propertyType,
      addressLine: value.address.trim(),
      city: province.nameVi,
      country: 'Việt Nam',
      provinceId: value.provinceId,
      wardId: value.wardId,
      description: value.descriptionVi.trim() || undefined,
      descriptionVi: value.descriptionVi.trim() || undefined,
      descriptionEn: value.descriptionEn.trim() || undefined,
      starRating: value.starRating,
      phone: value.phone.trim() || undefined,
      email: value.email.trim() || undefined,
      website: value.website.trim() || undefined,
      mainImage: value.mainImage.trim() || undefined,
      amenityCodes: value.amenityCodes,
      checkInTime: value.checkInTime, checkOutTime: value.checkOutTime,
      cancellationPolicy: value.cancellationPolicy.trim() || undefined, childrenPolicy: value.childrenPolicy.trim() || undefined,
      petPolicy: value.petPolicy.trim() || undefined, houseRules: value.houseRules.trim() || undefined,
      taxRatePercent: value.taxRatePercent, serviceFeeRatePercent: value.serviceFeeRatePercent,
      latitude: value.latitude ?? undefined, longitude: value.longitude ?? undefined,
      status: 'DRAFT',
      approvalStatus: 'DRAFT',
      operationStatus: 'INACTIVE',
      isDemo: false,
      dataSource: 'ADMIN'
    };

    this.saving = true;
    this.propertyService.createProperty(request).pipe(
      timeout(15000),
      finalize(() => { this.saving = false; })
    ).subscribe({
      next: () => {
        this.dialogVisible = false;
        this.messageService.add({ severity: 'success', summary: 'Đã tạo cơ sở', detail: 'Cơ sở được tạo ở trạng thái bản nháp.' });
        this.loadProperties();
      },
      error: error => {
        this.formError = error?.error?.message || 'Không thể tạo cơ sở. Vui lòng kiểm tra dữ liệu và thử lại.';
        this.messageService.add({ severity: 'error', summary: 'Không thể tạo cơ sở', detail: this.formError });
      }
    });
  }

  submit(property: AdminProperty): void {
    if (!this.canUpdate) return;
    this.propertyService.submitProperty(property.id).pipe(timeout(10000)).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Thành công', detail: 'Đã gửi yêu cầu duyệt.' });
        this.loadProperties();
      },
      error: error => {
        const detail = error?.error?.message || 'Không thể gửi yêu cầu duyệt.';
        this.messageService.add({ severity: 'error', summary: 'Lỗi', detail });
      }
    });
  }

  approve(property: AdminProperty): void {
    if (!this.canApprove) return;
    this.propertyService.approveProperty(property.id).pipe(timeout(10000)).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Thành công', detail: 'Đã duyệt cơ sở.' });
        this.loadProperties();
      },
      error: error => {
        const detail = error?.error?.message || 'Không thể duyệt cơ sở.';
        this.messageService.add({ severity: 'error', summary: 'Lỗi', detail });
      }
    });
  }

  reject(property: AdminProperty): void {
    if (!this.canApprove) return;
    this.propertyService.rejectProperty(property.id).pipe(timeout(10000)).subscribe({
      next: () => {
        this.messageService.add({ severity: 'warn', summary: 'Đã từ chối', detail: 'Cơ sở đã được chuyển sang trạng thái từ chối.' });
        this.loadProperties();
      },
      error: error => {
        const detail = error?.error?.message || 'Không thể từ chối cơ sở.';
        this.messageService.add({ severity: 'error', summary: 'Lỗi', detail });
      }
    });
  }

  statusCode(property: AdminProperty): PropertyStatus {
    const status = property.status || property.approvalStatus || property.operationStatus;
    return ['DRAFT', 'PENDING', 'ACTIVE', 'INACTIVE', 'REJECTED'].includes(status || '')
      ? status as PropertyStatus
      : 'DRAFT';
  }

  statusLabel(property: AdminProperty): string {
    return {
      DRAFT: 'Bản nháp', PENDING: 'Chờ duyệt', ACTIVE: 'Hoạt động',
      INACTIVE: 'Tạm ngưng', REJECTED: 'Từ chối'
    }[this.statusCode(property)];
  }

  statusSeverity(property: AdminProperty): 'success' | 'info' | 'warn' | 'danger' {
    const status = this.statusCode(property);
    if (status === 'ACTIVE') return 'success';
    if (status === 'REJECTED' || status === 'INACTIVE') return 'danger';
    if (status === 'PENDING') return 'warn';
    return 'info';
  }

  isInvalid(controlName: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  openSubscription(property: AdminProperty): void {
    if (!this.canManageSubscription) return;
    this.subscriptionProperty = property;
    this.selectedSubscriptionTier = property.subscriptionTier || 'Basic';
    this.subscriptionError = '';
    this.subscriptionDialogVisible = true;
  }

  closeSubscription(): void {
    if (this.subscriptionSaving) return;
    this.subscriptionDialogVisible = false;
    this.subscriptionProperty = null;
    this.subscriptionError = '';
  }

  saveSubscription(): void {
    const property = this.subscriptionProperty;
    if (!property || this.subscriptionSaving || !this.canManageSubscription) return;
    this.subscriptionSaving = true;
    this.subscriptionError = '';
    this.propertyService.updateSubscriptionTier(property.id, this.selectedSubscriptionTier).pipe(
      timeout(10000),
      finalize(() => { this.subscriptionSaving = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: result => {
        property.subscriptionTier = this.selectedSubscriptionTier;
        this.messageService.add({ severity: 'success', summary: 'Đã cập nhật gói', detail: result.message || `Cơ sở đã chuyển sang gói ${this.selectedSubscriptionTier}.` });
        this.subscriptionDialogVisible = false;
        this.subscriptionProperty = null;
      },
      error: error => {
        this.subscriptionError = error?.error?.message || 'Không thể cập nhật gói dịch vụ.';
      },
    });
  }

  openPricingSettings(property: AdminProperty): void {
    if (!this.canManagePricing) return;
    this.pricingProperty = property;
    this.pricingError = '';
    this.pricingForm.reset({
      taxRatePercent: property.taxRatePercent ?? 0,
      serviceFeeRatePercent: property.serviceFeeRatePercent ?? 0
    });
    this.pricingDialogVisible = true;
  }

  closePricingSettings(): void {
    if (!this.pricingSaving) this.pricingDialogVisible = false;
  }

  savePricingSettings(): void {
    if (!this.canUpdate) return;
    if (this.pricingSaving || !this.pricingProperty) return;
    this.pricingError = '';
    if (this.pricingForm.invalid) {
      this.pricingForm.markAllAsTouched();
      this.pricingError = 'Thuế suất và phí dịch vụ phải nằm trong khoảng 0-30%.';
      return;
    }
    this.pricingSaving = true;
    this.propertyService.updatePricingSettings(this.pricingProperty.id, this.pricingForm.getRawValue()).pipe(
      timeout(10000),
      finalize(() => { this.pricingSaving = false; this.cdr.detectChanges(); })
    ).subscribe({
      next: updated => {
        this.properties = this.properties.map(item => item.id === updated.id ? updated : item);
        this.pricingDialogVisible = false;
        this.messageService.add({ severity: 'success', summary: 'Đã cập nhật giá', detail: 'Thuế và phí dịch vụ sẽ áp dụng cho các báo giá mới.' });
      },
      error: error => { this.pricingError = error?.error?.message || 'Không thể cập nhật thuế và phí dịch vụ.'; }
    });
  }

  toggleAmenity(code: string, checked: boolean): void {
    const values = new Set(this.form.controls.amenityCodes.value);
    checked ? values.add(code) : values.delete(code);
    this.form.controls.amenityCodes.setValue([...values]);
  }
}
