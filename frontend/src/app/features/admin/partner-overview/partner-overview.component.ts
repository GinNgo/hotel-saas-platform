import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { finalize, timeout } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth';
import { PropertyService } from '../../../core/services/property.service';
import { FeedbackStateComponent } from '../../../shared/components/feedback-state/feedback-state.component';

type PartnerColumnType = 'text' | 'number' | 'status' | 'currency' | 'date' | 'boolean';
type PartnerActionKey = 'approve' | 'reject' | 'open-properties' | 'open-room-types' | 'open-rooms';
type LoadFailure = 'forbidden' | 'unauthorized' | 'error' | null;

export type PartnerRow = Record<string, unknown>;

export interface PartnerColumn {
  key: string;
  label: string;
  type?: PartnerColumnType;
  emphasis?: boolean;
}

export interface PartnerAction {
  key: PartnerActionKey;
  label: string;
  icon: string;
  tone?: 'primary' | 'success' | 'danger';
}

export interface PartnerViewConfig {
  title: string;
  description: string;
  emptyTitle: string;
  emptyMessage: string;
  readOnlyMessage?: string;
  columns: PartnerColumn[];
  actions: PartnerAction[];
}

const ENUM_LABELS: Record<string, string> = {
  ACTIVE: 'Đang hoạt động',
  APPROVED: 'Đã duyệt',
  AVAILABLE: 'Trống',
  CLEAN: 'Sạch',
  CLEANING: 'Đang dọn',
  DRAFT: 'Bản nháp',
  INACTIVE: 'Tạm ngừng',
  IMPORTED_PENDING_REVIEW: 'Chờ rà soát',
  INSPECTED: 'Đã kiểm tra',
  LIFETIME: 'Trọn đời',
  MAINTENANCE: 'Bảo trì',
  MONTHLY: 'Hàng tháng',
  NONE: 'Chưa đăng ký',
  NO_PLAN: 'Chưa có gói',
  OCCUPIED: 'Đang sử dụng',
  OWNER: 'Chủ cơ sở',
  PAID: 'Đã thanh toán',
  PENDING: 'Chờ xử lý',
  PENDING_APPROVAL: 'Chờ duyệt',
  RECEPTIONIST: 'Lễ tân',
  REJECTED: 'Từ chối',
  RESERVED: 'Đã đặt',
  STAFF: 'Nhân viên',
  UNPAID: 'Chưa thanh toán',
  YEARLY: 'Hàng năm',
  OUT_OF_SERVICE: 'Ngừng phục vụ',
  DIRTY: 'Chưa dọn',
  ADMIN: 'Quản trị cơ sở',
  HOTEL: 'Khách sạn',
  MOTEL: 'Nhà nghỉ',
  HOMESTAY: 'Homestay',
  APARTMENT: 'Căn hộ / Villa',
  BANK_TRANSFER: 'Chuyển khoản',
  CASH: 'Tiền mặt',
  CANCELLED: 'Đã hủy',
  COMPLETED: 'Hoàn tất',
  EXPIRED: 'Hết hạn',
  FAILED: 'Thất bại',
  ONE_TIME: 'Một lần',
};

export const PARTNER_VIEW_CONFIGS: Record<string, PartnerViewConfig> = {
  'property-owners': {
    title: 'Chủ cơ sở',
    description: 'Theo dõi tài khoản sở hữu cơ sở, gói dịch vụ và trạng thái thanh toán.',
    emptyTitle: 'Chưa có chủ cơ sở',
    emptyMessage: 'Chưa có tài khoản sở hữu cơ sở phù hợp với quyền truy cập hiện tại.',
    readOnlyMessage: 'Dữ liệu chủ cơ sở được cung cấp ở chế độ chỉ xem từ hệ thống quản trị.',
    columns: [
      { key: 'full_name', label: 'Chủ cơ sở', emphasis: true },
      { key: 'email', label: 'Email' },
      { key: 'account_status', label: 'Tài khoản', type: 'status' },
      { key: 'property_count', label: 'Cơ sở', type: 'number' },
      { key: 'room_count', label: 'Phòng', type: 'number' },
      { key: 'plan_code', label: 'Gói dịch vụ' },
      { key: 'subscription_status', label: 'Trạng thái gói', type: 'status' },
      { key: 'start_at', label: 'Bắt đầu', type: 'date' },
      { key: 'end_at', label: 'Hết hạn', type: 'date' },
      { key: 'is_lifetime', label: 'Trọn đời', type: 'boolean' },
      { key: 'payment_status', label: 'Thanh toán', type: 'status' },
      { key: 'total_paid', label: 'Đã thanh toán', type: 'currency' },
    ],
    actions: [],
  },
  'property-registrations': {
    title: 'Tài khoản đã đăng phòng',
    description: 'Đối chiếu quan hệ sở hữu giữa tài khoản và cơ sở đã đăng ký.',
    emptyTitle: 'Chưa có đăng ký cơ sở',
    emptyMessage: 'Chưa có quan hệ sở hữu nào được ghi nhận trong hệ thống.',
    readOnlyMessage: 'Đây là báo cáo đối chiếu; thay đổi đăng ký được thực hiện trong luồng quản lý cơ sở.',
    columns: [
      { key: 'full_name', label: 'Chủ tài khoản', emphasis: true },
      { key: 'email', label: 'Email' },
      { key: 'name_vi', label: 'Cơ sở' },
      { key: 'property_id', label: 'Mã cơ sở', type: 'number' },
      { key: 'approval_status', label: 'Phê duyệt', type: 'status' },
      { key: 'operation_status', label: 'Vận hành', type: 'status' },
      { key: 'registered_at', label: 'Ngày đăng ký', type: 'date' },
    ],
    actions: [],
  },
  'property-owners/unsubscribed': {
    title: 'Tài khoản chưa mua gói',
    description: 'Nhận diện chủ cơ sở chưa có gói đăng ký đang hoạt động để hỗ trợ kịp thời.',
    emptyTitle: 'Không có tài khoản cần nhắc',
    emptyMessage: 'Tất cả chủ cơ sở hiện có đều đã có gói đăng ký hoặc chưa phát sinh dữ liệu.',
    readOnlyMessage: 'Danh sách này chỉ hỗ trợ theo dõi; việc bán gói được xử lý trong quy trình subscription riêng.',
    columns: [
      { key: 'full_name', label: 'Chủ cơ sở', emphasis: true },
      { key: 'email', label: 'Email' },
      { key: 'account_status', label: 'Tài khoản', type: 'status' },
      { key: 'user_id', label: 'Mã tài khoản', type: 'number' },
    ],
    actions: [],
  },
  'property-approvals': {
    title: 'Duyệt cơ sở',
    description: 'Xử lý các cơ sở đang chờ duyệt hoặc cần rà soát trước khi vận hành.',
    emptyTitle: 'Không có cơ sở chờ duyệt',
    emptyMessage: 'Không có hồ sơ nào đang chờ xử lý trong phạm vi quyền hiện tại.',
    columns: [
      { key: 'name_vi', label: 'Cơ sở', emphasis: true },
      { key: 'code', label: 'Mã cơ sở' },
      { key: 'address', label: 'Địa chỉ' },
      { key: 'property_type', label: 'Loại hình', type: 'text' },
      { key: 'approval_status', label: 'Phê duyệt', type: 'status' },
      { key: 'operation_status', label: 'Vận hành', type: 'status' },
      { key: 'owner_name', label: 'Chủ cơ sở' },
      { key: 'owner_email', label: 'Email chủ cơ sở' },
    ],
    actions: [
      { key: 'approve', label: 'Duyệt cơ sở', icon: 'pi pi-check', tone: 'success' },
      { key: 'reject', label: 'Từ chối cơ sở', icon: 'pi pi-times', tone: 'danger' },
    ],
  },
  'property-staff': {
    title: 'Nhân viên cơ sở',
    description: 'Theo dõi nhân sự được phân công và thời hạn hiệu lực tại từng cơ sở.',
    emptyTitle: 'Chưa có nhân viên cơ sở',
    emptyMessage: 'Chưa có nhân sự nào được phân công trong phạm vi dữ liệu hiện tại.',
    readOnlyMessage: 'Bảng này chỉ xem. Phân công nhân sự được quản lý trong module người dùng và phân quyền.',
    columns: [
      { key: 'full_name', label: 'Nhân viên', emphasis: true },
      { key: 'email', label: 'Email' },
      { key: 'property_name', label: 'Cơ sở' },
      { key: 'relationship_type', label: 'Vai trò' },
      { key: 'assignment_status', label: 'Phân công', type: 'status' },
      { key: 'account_status', label: 'Tài khoản', type: 'status' },
      { key: 'start_date', label: 'Từ ngày', type: 'date' },
      { key: 'end_date', label: 'Đến ngày', type: 'date' },
    ],
    actions: [],
  },
  'property-room-types': {
    title: 'Danh mục loại phòng',
    description: 'Kiểm tra danh mục loại phòng theo từng cơ sở và nhanh chóng mở màn hình quản lý chi tiết.',
    emptyTitle: 'Chưa có loại phòng',
    emptyMessage: 'Chưa có loại phòng nào được ghi nhận cho các cơ sở hiện tại.',
    columns: [
      { key: 'property_name', label: 'Cơ sở', emphasis: true },
      { key: 'code', label: 'Mã loại phòng' },
      { key: 'name_vi', label: 'Tên loại phòng' },
      { key: 'base_price', label: 'Giá cơ bản', type: 'currency' },
      { key: 'max_adults', label: 'Người lớn', type: 'number' },
      { key: 'max_children', label: 'Trẻ em', type: 'number' },
      { key: 'max_guests', label: 'Tối đa', type: 'number' },
      { key: 'room_count', label: 'Số phòng', type: 'number' },
      { key: 'status', label: 'Trạng thái', type: 'status' },
    ],
    actions: [{ key: 'open-room-types', label: 'Mở quản lý loại phòng', icon: 'pi pi-external-link' }],
  },
  'property-rooms': {
    title: 'Danh sách phòng',
    description: 'Theo dõi tình trạng phòng, vệ sinh và bảo trì theo từng cơ sở.',
    emptyTitle: 'Chưa có phòng',
    emptyMessage: 'Chưa có phòng vật lý nào được ghi nhận cho các cơ sở hiện tại.',
    columns: [
      { key: 'property_name', label: 'Cơ sở', emphasis: true },
      { key: 'room_type_name', label: 'Loại phòng' },
      { key: 'room_number', label: 'Số phòng', emphasis: true },
      { key: 'floor', label: 'Tầng', type: 'number' },
      { key: 'status', label: 'Trạng thái', type: 'status' },
      { key: 'housekeeping_status', label: 'Vệ sinh', type: 'status' },
      { key: 'maintenance_status', label: 'Bảo trì', type: 'status' },
      { key: 'is_demo', label: 'Dữ liệu mẫu', type: 'boolean' },
    ],
    actions: [{ key: 'open-rooms', label: 'Mở quản lý phòng', icon: 'pi pi-external-link' }],
  },
  'subscription-orders': {
    title: 'Đơn đăng ký gói',
    description: 'Theo dõi đơn đăng ký gói, số tiền và trạng thái xử lý theo thời gian.',
    emptyTitle: 'Chưa có đơn đăng ký',
    emptyMessage: 'Chưa có đơn đăng ký gói nào trong phạm vi dữ liệu hiện tại.',
    readOnlyMessage: 'Đơn đăng ký được hiển thị ở chế độ chỉ xem; xử lý thanh toán tuân theo module subscription.',
    columns: [
      { key: 'order_code', label: 'Mã đơn', emphasis: true },
      { key: 'email', label: 'Tài khoản' },
      { key: 'plan_code', label: 'Mã gói' },
      { key: 'billing_type', label: 'Chu kỳ' },
      { key: 'total_amount', label: 'Tổng tiền', type: 'currency' },
      { key: 'currency', label: 'Tiền tệ' },
      { key: 'status', label: 'Trạng thái', type: 'status' },
      { key: 'created_at', label: 'Ngày tạo', type: 'date' },
    ],
    actions: [],
  },
  'subscription-payments': {
    title: 'Thanh toán gói',
    description: 'Đối chiếu phương thức, giao dịch và trạng thái thanh toán của các đơn đăng ký.',
    emptyTitle: 'Chưa có thanh toán',
    emptyMessage: 'Chưa có giao dịch thanh toán gói nào trong phạm vi dữ liệu hiện tại.',
    readOnlyMessage: 'Bảng đối chiếu thanh toán chỉ xem; cập nhật giao dịch phải đi qua cổng thanh toán được cấp phép.',
    columns: [
      { key: 'order_code', label: 'Mã đơn', emphasis: true },
      { key: 'email', label: 'Tài khoản' },
      { key: 'payment_method', label: 'Phương thức' },
      { key: 'amount', label: 'Số tiền', type: 'currency' },
      { key: 'payment_status', label: 'Trạng thái', type: 'status' },
      { key: 'transaction_code', label: 'Mã giao dịch' },
      { key: 'paid_at', label: 'Thời điểm thanh toán', type: 'date' },
    ],
    actions: [],
  },
  'software-contracts': {
    title: 'Hợp đồng phần mềm',
    description: 'Theo dõi hợp đồng, thời hạn và giá trị gói phần mềm theo tài khoản/cơ sở.',
    emptyTitle: 'Chưa có hợp đồng',
    emptyMessage: 'Chưa có hợp đồng phần mềm nào trong phạm vi dữ liệu hiện tại.',
    readOnlyMessage: 'Hợp đồng được cung cấp ở chế độ chỉ xem; thay đổi pháp lý cần quy trình riêng.',
    columns: [
      { key: 'contract_no', label: 'Số hợp đồng', emphasis: true },
      { key: 'email', label: 'Tài khoản' },
      { key: 'property_name', label: 'Cơ sở' },
      { key: 'plan_code', label: 'Mã gói' },
      { key: 'contract_type', label: 'Loại hợp đồng' },
      { key: 'start_date', label: 'Bắt đầu', type: 'date' },
      { key: 'end_date', label: 'Kết thúc', type: 'date' },
      { key: 'is_lifetime', label: 'Trọn đời', type: 'boolean' },
      { key: 'contract_value', label: 'Giá trị', type: 'currency' },
      { key: 'status', label: 'Trạng thái', type: 'status' },
    ],
    actions: [],
  },
};

const FALLBACK_CONFIG: PartnerViewConfig = {
  title: 'Đối tác & Cơ sở',
  description: 'Theo dõi dữ liệu đối tác và cơ sở theo quyền truy cập hiện tại.',
  emptyTitle: 'Chưa có dữ liệu',
  emptyMessage: 'Chưa có bản ghi phù hợp với quyền truy cập hiện tại.',
  readOnlyMessage: 'Bảng này được cung cấp ở chế độ chỉ xem.',
  columns: [],
  actions: [],
};

@Component({
  selector: 'app-partner-overview',
  standalone: true,
  imports: [CommonModule, ConfirmDialogModule, FeedbackStateComponent],
  providers: [ConfirmationService],
  templateUrl: './partner-overview.component.html',
  styleUrl: './partner-overview.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PartnerOverviewComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly authService = inject(AuthService);
  private readonly propertyService = inject(PropertyService);
  private readonly confirmationService = inject(ConfirmationService);

  title = FALLBACK_CONFIG.title;
  endpoint = 'property-owners';
  config = FALLBACK_CONFIG;
  columns: PartnerColumn[] = [];
  rows: PartnerRow[] = [];
  loading = false;
  error = '';
  failure: LoadFailure = null;
  actionInFlight = '';
  actionFeedback: { type: 'success' | 'error'; message: string } | null = null;

  ngOnInit(): void {
    this.endpoint = String(this.route.snapshot.data['endpoint'] || this.endpoint);
    this.config = PARTNER_VIEW_CONFIGS[this.endpoint] || FALLBACK_CONFIG;
    this.title = String(this.route.snapshot.data['title'] || this.config.title);
    this.columns = this.config.columns;
    this.load();
  }

  load(clearActionFeedback = true): void {
    this.loading = true;
    this.error = '';
    this.failure = null;
    if (clearActionFeedback) this.actionFeedback = null;

    this.http.get<PartnerRow[]>(`${environment.apiUrl}/admin/${this.endpoint}`).pipe(
      timeout(10000),
      finalize(() => {
        this.loading = false;
        this.cdr.markForCheck();
      }),
    ).subscribe({
      next: rows => {
        this.rows = Array.isArray(rows) ? rows : [];
        this.cdr.markForCheck();
      },
      error: (error: HttpErrorResponse) => {
        this.rows = [];
        this.failure = error?.status === 401 ? 'unauthorized' : error?.status === 403 ? 'forbidden' : 'error';
        this.error = error?.error?.message || 'Không thể tải dữ liệu. Vui lòng thử lại.';
        this.cdr.markForCheck();
      },
    });
  }

  get hasActions(): boolean {
    return this.config.actions.length > 0;
  }

  get canUseActions(): boolean {
    return this.authService.getRoles().some(role => role === 'ADMIN' || role === 'SUPER_ADMIN');
  }

  get cellColumns(): PartnerColumn[] {
    return this.columns.length ? this.columns : [{ key: 'id', label: 'Mã bản ghi' }];
  }

  value(row: PartnerRow, key: string): unknown {
    const normalizedKey = this.normalizeKey(key);
    const entry = Object.entries(row).find(([candidate]) => this.normalizeKey(candidate) === normalizedKey);
    return entry?.[1];
  }

  display(row: PartnerRow, column: PartnerColumn): string {
    const value = this.value(row, column.key);
    if (value === null || value === undefined || value === '') return this.emptyCellValue(row, column);

    if (column.type === 'boolean') return this.toBoolean(value) ? 'Có' : 'Không';
    if (column.type === 'number') return this.formatNumber(value);
    if (column.type === 'currency') return this.formatCurrency(value);
    if (column.type === 'date') return this.formatDate(value);
    if (column.key === 'maintenance_status' && this.rawCode(value) === 'NONE') return 'Bình thường';
    if (column.type === 'status') return this.enumLabel(value);
    const raw = String(value);
    return /^[A-Z0-9_]+$/.test(raw) ? this.enumLabel(raw) : raw;
  }

  actionVisible(action: PartnerAction, row: PartnerRow): boolean {
    if (!this.canUseActions) return false;
    if (action.key !== 'approve' && action.key !== 'reject') return true;
    const status = this.rawCode(this.value(row, 'approval_status'));
    return ['PENDING_APPROVAL', 'IMPORTED_PENDING_REVIEW', 'PENDING'].includes(status);
  }

  actionDisabled(action: PartnerAction, row: PartnerRow): boolean {
    const id = this.value(row, 'id');
    return this.loading || this.actionInFlight === `${action.key}:${String(id)}`;
  }

  actionBusy(action: PartnerAction, row: PartnerRow): boolean {
    return this.actionInFlight === `${action.key}:${String(this.value(row, 'id'))}`;
  }

  hasVisibleRowAction(row: PartnerRow): boolean {
    return this.config.actions.some(action => this.actionVisible(action, row));
  }

  rowActionHint(): string {
    if (!this.canUseActions) return 'Chỉ xem';
    return this.endpoint === 'property-approvals' ? 'Chưa sẵn sàng duyệt' : 'Không có thao tác';
  }

  runAction(action: PartnerAction, row: PartnerRow): void {
    if (!this.actionVisible(action, row) || this.actionDisabled(action, row)) return;

    if (action.key === 'open-properties') return void this.router.navigate(['/admin/properties']);
    if (action.key === 'open-room-types') return void this.router.navigate(['/admin/room-types']);
    if (action.key === 'open-rooms') return void this.router.navigate(['/admin/rooms']);

    const propertyId = this.value(row, 'id');
    if ((typeof propertyId !== 'number' && typeof propertyId !== 'string') || String(propertyId).trim() === '') {
      this.actionFeedback = { type: 'error', message: 'Không xác định được mã cơ sở để thực hiện thao tác.' };
      return;
    }

    if (action.key === 'reject') {
      const propertyName = String(this.value(row, 'name_vi') || `#${propertyId}`);
      this.confirmationService.confirm({
        header: 'Từ chối cơ sở',
        message: `Bạn có chắc muốn từ chối cơ sở "${propertyName}"?`,
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: 'Từ chối',
        rejectLabel: 'Hủy',
        acceptButtonStyleClass: 'p-button-danger',
        rejectButtonStyleClass: 'p-button-text',
        accept: () => this.executePropertyAction(action, propertyId),
      });
      return;
    }

    this.executePropertyAction(action, propertyId);
  }

  private executePropertyAction(action: PartnerAction, propertyId: string | number): void {
    const request$ = action.key === 'approve'
      ? this.propertyService.approveProperty(propertyId)
      : this.propertyService.rejectProperty(propertyId);
    this.actionInFlight = `${action.key}:${propertyId}`;
    this.actionFeedback = null;
    request$.pipe(
      timeout(10000),
      finalize(() => {
        this.actionInFlight = '';
        this.cdr.markForCheck();
      }),
    ).subscribe({
      next: () => {
        this.actionFeedback = {
          type: 'success',
          message: action.key === 'approve' ? 'Đã duyệt cơ sở.' : 'Đã chuyển cơ sở sang trạng thái từ chối.',
        };
        this.load(false);
      },
      error: (error: HttpErrorResponse) => {
        const message = error?.status === 403
          ? 'Bạn không có quyền thực hiện thao tác này.'
          : error?.error?.message || 'Không thể thực hiện thao tác. Vui lòng thử lại.';
        this.actionFeedback = { type: 'error', message };
        this.cdr.markForCheck();
      },
    });
  }

  stateTitle(): string {
    if (this.failure === 'forbidden') return 'Bạn không có quyền truy cập';
    if (this.failure === 'unauthorized') return 'Phiên đăng nhập không còn hiệu lực';
    return 'Không thể tải dữ liệu';
  }

  stateMessage(): string {
    if (this.failure === 'forbidden') return 'Tài khoản hiện tại không được cấp quyền xem dữ liệu đối tác. Hãy liên hệ quản trị viên để được cấp quyền phù hợp.';
    if (this.failure === 'unauthorized') return 'Vui lòng đăng nhập lại để tiếp tục làm việc với khu vực quản trị.';
    return this.error;
  }

  stateActionLabel(): string {
    return this.failure === 'forbidden' ? 'Về bảng điều khiển' : this.failure === 'unauthorized' ? 'Đăng nhập quản trị' : 'Thử lại';
  }

  handleStateAction(): void {
    if (this.failure === 'forbidden') {
      void this.router.navigate(['/admin/dashboard']);
    } else if (this.failure === 'unauthorized') {
      void this.router.navigate(['/admin/login']);
    } else {
      this.load();
    }
  }

  private normalizeKey(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private emptyCellValue(row: PartnerRow, column: PartnerColumn): string {
    if (column.key !== 'property_name' && column.key !== 'name_vi') return '—';
    const propertyId = Number(this.value(row, 'property_id') ?? this.value(row, 'hotel_id') ?? this.value(row, 'id'));
    return Number.isFinite(propertyId) ? `Cơ sở #${propertyId}` : '—';
  }

  private rawCode(value: unknown): string {
    return String(value ?? '').trim().toUpperCase().replaceAll(' ', '_');
  }

  private enumLabel(value: unknown): string {
    const raw = String(value);
    return ENUM_LABELS[this.rawCode(raw)] || raw.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());
  }

  private toBoolean(value: unknown): boolean {
    return value === true || value === 1 || this.rawCode(value) === 'TRUE' || this.rawCode(value) === 'YES';
  }

  private formatNumber(value: unknown): string {
    const number = Number(value);
    return Number.isFinite(number) ? new Intl.NumberFormat('vi-VN').format(number) : this.enumLabel(value);
  }

  private formatCurrency(value: unknown): string {
    const number = Number(value);
    return Number.isFinite(number)
      ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(number)
      : this.enumLabel(value);
  }

  private formatDate(value: unknown): string {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? this.enumLabel(value) : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(date);
  }
}
