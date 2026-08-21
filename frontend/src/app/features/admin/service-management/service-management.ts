import { ChangeDetectorRef, Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { SharedModule } from '@app/shared/shared.module';
import { HotelServiceService, HotelServiceDTO } from '@app/core/services/hotel-service.service';
import { ManagementApiService, ManagedProperty } from '@app/core/services/management-api.service';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Subject, of } from 'rxjs';
import { catchError, finalize, switchMap, tap, timeout } from 'rxjs/operators';
import { ActionCode, FunctionCode, PermissionService } from '@app/core/services/permission.service';

@Component({
  selector: 'app-service-management',
  imports: [SharedModule],
  providers: [MessageService, ConfirmationService],
  templateUrl: './service-management.html',
  styleUrl: './service-management.css'
})
export class ServiceManagement implements OnInit {
  services: HotelServiceDTO[] = [];
  properties: ManagedProperty[] = [];
  selectedPropertyId: string | number | null = null;
  loading = true;
  saving = false;
  errorMessage = '';
  dialogVisible = false;
  editingId?: string | number;
  form: HotelServiceDTO = this.emptyForm();

  private hotelService = inject(HotelServiceService);
  private managementApi = inject(ManagementApiService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);
  private changeDetector = inject(ChangeDetectorRef);
  private permissions = inject(PermissionService);
  readonly canCreate = this.permissions.hasPermission(FunctionCode.HOTEL_SERVICE, ActionCode.CREATE);
  readonly canUpdate = this.permissions.hasPermission(FunctionCode.HOTEL_SERVICE, ActionCode.UPDATE);
  readonly canDelete = this.permissions.hasPermission(FunctionCode.HOTEL_SERVICE, ActionCode.DELETE);

  /** Emits to cancel any in-flight context+services request chain. */
  private loadTrigger$ = new Subject<string | number | undefined>();

  ngOnInit(): void {
    // Wire up the load pipeline: each trigger cancels the previous in-flight chain.
    this.loadTrigger$.pipe(
      takeUntilDestroyed(this.destroyRef),
      tap(() => {
        this.loading = true;
        this.errorMessage = '';
      }),
      switchMap((requestedPropertyId) =>
        this.managementApi.context(requestedPropertyId).pipe(
          timeout(15000),
          catchError((error) => {
            this.loading = false;
            this.errorMessage = error?.error?.message || 'Không thể tải danh sách cơ sở quản lý.';
            this.messageService.add({ severity: 'error', summary: 'Lỗi', detail: this.errorMessage });
            this.changeDetector.markForCheck();
            return of(null);
          }),
        ),
      ),
    ).subscribe((context) => {
      if (!context) return; // error already handled

      this.properties = context.properties ?? [];
      this.selectedPropertyId = context.activePropertyId ?? this.properties[0]?.id ?? null;
      this.changeDetector.markForCheck();
      this.loadServices();
    });

    // Listen for queryParam changes and feed the pipeline.
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        this.loadTrigger$.next(this.toPropertyId(params.get('propertyId')));
      });
  }

  private toPropertyId(rawValue: string | null): string | number | undefined {
    if (!rawValue) return undefined;
    return /^\d+$/.test(rawValue) ? Number(rawValue) : rawValue;
  }

  loadServices(): void {
    this.loading = true;
    this.errorMessage = '';

    if (!this.selectedPropertyId) {
      this.loading = false;
      this.errorMessage = 'Hãy chọn một cơ sở trước khi tải dịch vụ.';
      return;
    }

    this.hotelService.getServices(this.selectedPropertyId).pipe(
      timeout(15000),
      finalize(() => {
        this.loading = false;
        this.changeDetector.markForCheck();
      })
    ).subscribe({
      next: (data) => {
        this.services = Array.isArray(data) ? data : [];
        this.changeDetector.markForCheck();
      },
      error: (error) => {
        this.services = [];
        this.errorMessage = error?.error?.message || 'Không thể tải danh sách dịch vụ.';
        this.messageService.add({ severity: 'error', summary: 'Lỗi', detail: this.errorMessage });
        this.changeDetector.markForCheck();
      }
    });
  }

  onPropertyChange(): void {
    this.loadServices();
  }

  openCreate(): void {
    if (!this.canCreate) return;
    if (!this.selectedPropertyId) {
      this.messageService.add({ severity: 'warn', summary: 'Chưa chọn cơ sở', detail: 'Hãy chọn cơ sở trước khi thêm dịch vụ.' });
      return;
    }
    this.editingId = undefined;
    this.form = this.emptyForm();
    this.dialogVisible = true;
  }

  openEdit(service: HotelServiceDTO): void {
    if (!this.canUpdate || service.systemService || !service.id) return;
    this.editingId = service.id;
    this.form = { ...service };
    this.dialogVisible = true;
  }

  save(): void {
    if (this.editingId ? !this.canUpdate : !this.canCreate) return;
    if (this.saving || !this.selectedPropertyId) return;
    const payload = this.normalizedPayload();
    if (!payload) return;

    this.saving = true;
    const request = this.editingId
      ? this.hotelService.updateService(this.editingId, payload)
      : this.hotelService.createService(payload, this.selectedPropertyId);
    request.pipe(finalize(() => { this.saving = false; })).subscribe({
      next: () => {
        this.dialogVisible = false;
        this.messageService.add({
          severity: 'success',
          summary: this.editingId ? 'Đã cập nhật' : 'Đã thêm dịch vụ',
          detail: payload.nameVi,
        });
        this.loadServices();
      },
      error: (error) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Không thể lưu dịch vụ',
          detail: error?.error?.message || 'Vui lòng kiểm tra dữ liệu và thử lại.',
        });
      },
    });
  }

  confirmDelete(service: HotelServiceDTO): void {
    if (!this.canDelete || !service.id || service.systemService || this.saving) return;
    this.confirmationService.confirm({
      header: 'Xóa dịch vụ lưu trú',
      message: `Bạn có chắc muốn xóa "${service.nameVi}"?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Xóa',
      rejectLabel: 'Giữ lại',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.delete(service),
    });
  }

  statusLabel(status: string): string {
    return status === 'ACTIVE' ? 'Đang cung cấp' : 'Tạm ngừng';
  }

  private delete(service: HotelServiceDTO): void {
    if (!this.canDelete || !service.id) return;
    this.saving = true;
    this.hotelService.deleteService(service.id).pipe(finalize(() => { this.saving = false; })).subscribe({
      next: () => {
        this.services = this.services.filter((item) => item.id !== service.id);
        this.messageService.add({ severity: 'success', summary: 'Đã xóa dịch vụ', detail: service.nameVi });
      },
      error: (error) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Không thể xóa dịch vụ',
          detail: error?.error?.message || 'Dịch vụ có thể đang được sử dụng.',
        });
      },
    });
  }

  private normalizedPayload(): HotelServiceDTO | null {
    const code = this.form.code.trim().toUpperCase();
    const nameVi = this.form.nameVi.trim();
    const price = Number(this.form.price);
    if (!code || !nameVi || !Number.isFinite(price) || price < 0 || !Number.isInteger(price)) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Dữ liệu chưa hợp lệ',
        detail: 'Mã, tên dịch vụ và giá VND nguyên không âm là bắt buộc.',
      });
      return null;
    }
    return {
      ...this.form,
      hotelId: this.selectedPropertyId ?? undefined,
      code,
      nameVi,
      nameEn: this.form.nameEn.trim() || nameVi,
      price,
      descriptionVi: this.form.descriptionVi?.trim() || undefined,
      descriptionEn: this.form.descriptionEn?.trim() || undefined,
      status: this.form.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
      systemService: false,
    };
  }

  private emptyForm(): HotelServiceDTO {
    return {
      code: '',
      nameVi: '',
      nameEn: '',
      price: 0,
      descriptionVi: '',
      descriptionEn: '',
      status: 'ACTIVE',
      systemService: false,
    };
  }
}
