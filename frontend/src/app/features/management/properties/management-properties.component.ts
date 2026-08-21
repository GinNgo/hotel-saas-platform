import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, timeout } from 'rxjs';
import { AuthService } from '../../../core/services/auth';
import { ManagedProperty, ManagementApiService } from '../../../core/services/management-api.service';
import { PropertyLocation, PropertyService } from '../../../core/services/property.service';
import { FeedbackStateComponent } from '../../../shared/components/feedback-state/feedback-state.component';

@Component({
  selector: 'app-management-properties',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FeedbackStateComponent],
  templateUrl: './management-properties.component.html',
  styleUrl: './management-properties.component.css',
})
export class ManagementPropertiesComponent implements OnInit {
  private readonly api = inject(ManagementApiService);
  private readonly propertyService = inject(PropertyService);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);

  properties: ManagedProperty[] = [];
  provinces: PropertyLocation[] = [];
  wards: PropertyLocation[] = [];
  loading = true;
  locationsLoading = false;
  saving = false;
  showCreate = false;
  error = '';
  success = '';
  readonly canCreate = this.authService.getRoles().some(role => role === 'PROPERTY_OWNER' || role === 'SUPER_ADMIN');

  readonly form = this.fb.nonNullable.group({
    nameVi: ['', [Validators.required, Validators.maxLength(255)]],
    nameEn: ['', Validators.maxLength(255)],
    propertyType: ['HOTEL', Validators.required],
    provinceId: [null as number | null, Validators.required],
    wardId: [null as string | number | null],
    address: ['', [Validators.required, Validators.maxLength(1000)]],
    phone: ['', Validators.maxLength(50)],
    email: ['', [Validators.email, Validators.maxLength(255)]],
    website: ['', Validators.maxLength(255)],
    starRating: [0, [Validators.min(0), Validators.max(5)]],
    descriptionVi: ['', Validators.maxLength(4000)],
    descriptionEn: ['', Validators.maxLength(4000)],
  });

  ngOnInit(): void {
    this.load();
    this.loadProvinces();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.api.properties().pipe(
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: properties => { this.properties = properties; },
      error: error => { this.error = error?.error?.message || 'Không thể tải danh sách cơ sở.'; },
    });
  }

  provinceChanged(): void {
    const provinceId = this.form.controls.provinceId.value;
    this.form.controls.wardId.setValue(null);
    this.wards = [];
    if (!provinceId) return;
    this.locationsLoading = true;
    this.propertyService.getWards(provinceId).pipe(
      timeout(10000),
      finalize(() => { this.locationsLoading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: wards => { this.wards = wards; },
      error: () => { this.error = 'Không thể tải danh sách phường/xã.'; },
    });
  }

  openCreate(): void {
    if (!this.canCreate) return;
    this.form.reset({
      nameVi: '', nameEn: '', propertyType: 'HOTEL', provinceId: null, wardId: null,
      address: '', phone: '', email: '', website: '', starRating: 0,
      descriptionVi: '', descriptionEn: '',
    });
    this.wards = [];
    this.error = '';
    this.success = '';
    this.showCreate = true;
  }

  save(): void {
    if (!this.canCreate || this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    if (value.provinceId === null) return;
    this.saving = true;
    this.error = '';
    this.api.createProperty({ ...value, provinceId: value.provinceId, wardId: value.wardId }).pipe(
      timeout(15000),
      finalize(() => { this.saving = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: property => {
        this.properties = [...this.properties, property];
        this.showCreate = false;
        this.success = 'Đã tạo cơ sở ở trạng thái bản nháp.';
      },
      error: error => { this.error = error?.error?.message || 'Không thể tạo cơ sở.'; },
    });
  }

  private loadProvinces(): void {
    this.locationsLoading = true;
    this.propertyService.getProvinces().pipe(
      timeout(10000),
      finalize(() => { this.locationsLoading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: provinces => { this.provinces = provinces; },
      error: () => { this.error = 'Không thể tải danh sách tỉnh/thành phố.'; },
    });
  }
}
