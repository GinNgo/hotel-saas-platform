import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import {
  PaymentLifecycleSummary,
  RefundSummary,
  Reservation,
  ReservationService,
} from '../../../core/services/reservation.service';
import { InvoiceService } from '../../../core/services/invoice.service';
import { ActivatedRoute, Router } from '@angular/router';
import { CardModule } from 'primeng/card';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { TooltipModule } from 'primeng/tooltip';
import { CheckoutResult } from '../../../core/services/property-checkout.service';
import { ReservationCheckoutComponent } from './reservation-checkout.component';
import { ActionCode, FunctionCode, PermissionService } from '../../../core/services/permission.service';
import { Observable, finalize, fromEvent, merge, switchMap, timer } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { RoomStatusRealtimeService } from '../../../core/services/room-status-realtime.service';
import { AdminInventoryService, AdminRoom } from '../../../core/services/admin-inventory.service';

@Component({
  selector: 'app-reservation-management',
  standalone: true,
  imports: [
    CommonModule,
    TableModule,
    ButtonModule,
    CardModule,
    ToastModule,
    DialogModule,
    TooltipModule,
    ReservationCheckoutComponent,
    FormsModule,
  ],
  providers: [MessageService],
  templateUrl: './reservation-management.html',
  styleUrls: ['./reservation-management.css'],
})
export class ReservationManagement implements OnInit {
  reservations: Reservation[] = [];
  searchTerm = '';
  statusFilter = '';

  showCheckoutDialog = false;
  showCheckInDialog = false;
  checkInReservation: Reservation | null = null;
  availableCheckInRooms: AdminRoom[] = [];
  selectedCheckInRoomIds: (string | number)[] = [];
  guestIdentityCard = '';
  checkInRoomsLoading = false;
  selectedReservationId: string | number | null = null;
  selectedBookingCode = '';
  private permissionService = inject(PermissionService);
  readonly canViewServices = this.permissionService.hasPermission(FunctionCode.HOTEL_SERVICE, ActionCode.VIEW);
  readonly canUpdateReservation = this.permissionService.hasPermission(FunctionCode.RESERVATION, ActionCode.UPDATE);
  readonly canAssignRooms = this.permissionService.hasPermission(FunctionCode.RESERVATION_ASSIGNMENT, ActionCode.TASK_EXECUTE);
  readonly canCheckIn = this.permissionService.hasPermission(FunctionCode.CHECKIN, ActionCode.TASK_EXECUTE);
  readonly canCheckOut = this.permissionService.hasPermission(FunctionCode.CHECKOUT, ActionCode.TASK_EXECUTE);
  readonly canReadCheckout = this.permissionService.hasPermission(FunctionCode.CHECKOUT, ActionCode.VIEW);
  readonly canViewInvoice = this.permissionService.hasPermission(FunctionCode.INVOICE, ActionCode.VIEW);
  readonly canCancelOperational = this.permissionService.hasPermission(FunctionCode.RESERVATION_CANCEL, ActionCode.UPDATE);
  readonly canMarkNoShow = this.permissionService.hasPermission(FunctionCode.RESERVATION_NO_SHOW, ActionCode.UPDATE);
  readonly lifecycleActionKey = signal<string | null>(null);
  cancelPendingId: string | number | null = null;
  noShowPendingId: string | number | null = null;
  readonly destroyRef = inject(DestroyRef);
  private readonly realtime = inject(RoomStatusRealtimeService);
  private readonly inventory = inject(AdminInventoryService);
  readonly document = inject(DOCUMENT);
  syncing = false;
  syncWarning = '';
  lastSyncedAt?: Date;

  constructor(
    private reservationService: ReservationService,
    private invoiceService: InvoiceService,
    private messageService: MessageService,
    private router: Router,
    private route: ActivatedRoute,
    private changeDetector: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.searchTerm = (this.route.snapshot.queryParamMap.get('q') || '').trim();
    this.statusFilter = (this.route.snapshot.queryParamMap.get('status') || '').trim().toUpperCase();
    this.loadReservations();
    this.startBackgroundRefresh();
    this.realtime.reservationExpired$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(event => {
      if (this.reservations.some(item => String(item.id) === String(event.reservationId))) this.loadReservations();
    });
    this.realtime.connect();
    this.destroyRef.onDestroy(() => this.realtime.disconnect());
  }

  loadReservations() {
    this.reservationService.getAllReservations().subscribe({
      next: (data) => {
        this.reservations = data;
        this.cancelPendingId = null;
        this.noShowPendingId = null;
        this.syncing = false;
        this.syncWarning = '';
        this.lastSyncedAt = new Date();
        this.changeDetector.detectChanges();
      },
      error: () => {
        this.syncing = false;
        this.messageService.add({
          severity: 'error',
          summary: 'Lỗi',
          detail: 'Không thể tải danh sách đặt phòng',
        });
        this.changeDetector.detectChanges();
      },
    });
  }

  get filteredReservations(): Reservation[] {
    const term = this.searchTerm.trim().toLocaleLowerCase('vi');
    return this.reservations.filter(reservation => {
      const matchesStatus = !this.statusFilter || reservation.status === this.statusFilter;
      const haystack = `${reservation.bookingCode || ''} ${reservation.id || ''} ${reservation.userFullName || ''} ${reservation.username || ''}`.toLocaleLowerCase('vi');
      return matchesStatus && (!term || haystack.includes(term));
    });
  }

  refreshIfVisible(): void {
    if (this.document.visibilityState === 'hidden' || this.syncing || this.lifecycleActionKey()) return;
    this.syncing = true;
    this.reservationService.getAllReservations().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => {
        this.reservations = data;
        this.syncing = false;
        this.syncWarning = '';
        this.lastSyncedAt = new Date();
        this.changeDetector.detectChanges();
      },
      error: () => {
        this.syncing = false;
        this.syncWarning = 'Chưa thể đồng bộ booking mới. Dữ liệu hiện tại vẫn được giữ nguyên.';
        this.changeDetector.detectChanges();
      },
    });
  }

  get upcomingArrivalCount(): number {
    const today = this.localDate(new Date());
    return this.reservations.filter(item => item.status === 'CONFIRMED' && item.checkInDate >= today).length;
  }
  get inHouseCount(): number { return this.reservations.filter(item => item.status === 'CHECKED_IN').length; }
  get pendingCount(): number { return this.reservations.filter(item => item.status === 'PENDING' || item.status === 'PENDING_PAYMENT').length; }
  get checkoutTodayCount(): number { const today = this.localDate(new Date()); return this.reservations.filter(item => item.status === 'CHECKED_IN' && item.checkOutDate === today).length; }
  isCheckInDue(reservation: Reservation): boolean { return reservation.checkInDate <= this.localDate(new Date()); }
  isNoShowDue(reservation: Reservation): boolean { return reservation.checkInDate <= this.localDate(new Date()); }
  canCancelReservation(reservation: Reservation): boolean {
    return (reservation.status === 'PENDING_PAYMENT' || reservation.status === 'CONFIRMED')
      && reservation.payment?.status !== 'SUCCEEDED';
  }

  getSeverity(
    status: string | undefined,
  ): 'success' | 'secondary' | 'info' | 'warn' | 'danger' | 'contrast' | undefined {
    if (!status) return 'info';
    switch (status) {
      case 'CONFIRMED':
        return 'success';
      case 'PENDING':
      case 'PENDING_PAYMENT':
        return 'warn';
      case 'CHECKED_IN':
        return 'info';
      case 'CHECKED_OUT':
        return 'secondary';
      case 'CANCELLED':
        return 'danger';
      default:
        return 'info';
    }
  }

  getReservationLabel(status?: string): string {
    return (
      (
        {
          PENDING: 'Chờ xác nhận',
          PENDING_PAYMENT: 'Chờ thanh toán',
          CONFIRMED: 'Đã xác nhận',
          CHECKED_IN: 'Đang lưu trú',
          CHECKED_OUT: 'Đã trả phòng',
          COMPLETED: 'Hoàn tất',
          CANCELLED: 'Đã hủy',
          EXPIRED: 'Đã hết hạn',
          REJECTED: 'Đã từ chối',
          NO_SHOW: 'Không đến',
        } as Record<string, string>
      )[status || ''] ||
      status ||
      'Chưa xác định'
    );
  }

  getPaymentLabel(payment?: PaymentLifecycleSummary): string {
    if (!payment) return 'Chưa có giao dịch';
    if (payment.reconciliationRequired) return 'Cần đối soát';
    return (
      (
        {
          CREATED: 'Đã tạo phiên',
          PENDING: 'Đang chờ',
          SUCCEEDED: 'Đã thanh toán',
          FAILED: 'Thất bại',
          EXPIRED: 'Hết hạn',
        } as Record<string, string>
      )[payment.status] || payment.status
    );
  }

  getPaymentTone(payment?: PaymentLifecycleSummary): string {
    if (!payment) return 'neutral';
    if (payment.reconciliationRequired) return 'warning';
    const tones: Record<string, string> = {
      SUCCEEDED: 'success',
      FAILED: 'danger',
      EXPIRED: 'neutral',
      PENDING: 'warning',
      CREATED: 'info',
    };
    return tones[payment.status] || 'neutral';
  }

  getPaymentIcon(payment?: PaymentLifecycleSummary): string {
    if (!payment) return 'pi pi-wallet';
    if (payment.reconciliationRequired) return 'pi pi-sync';
    return (
      (
        {
          SUCCEEDED: 'pi pi-check-circle',
          FAILED: 'pi pi-times-circle',
          EXPIRED: 'pi pi-clock',
          PENDING: 'pi pi-hourglass',
          CREATED: 'pi pi-wallet',
        } as Record<string, string>
      )[payment.status] || 'pi pi-wallet'
    );
  }

  getLatestRefund(reservation: Reservation): RefundSummary | undefined {
    const refunds = reservation.refunds;
    return refunds?.length ? refunds[refunds.length - 1] : undefined;
  }

  getRefundLabel(refund?: RefundSummary): string {
    if (!refund) return 'Không có yêu cầu';
    return (
      (
        {
          REQUESTED: 'Đã yêu cầu',
          PENDING_PROVIDER: 'Đang xử lý',
          SUCCEEDED: 'Đã hoàn tiền',
          FAILED: 'Cần xử lý lại',
        } as Record<string, string>
      )[refund.status] || refund.status
    );
  }

  getRefundTone(refund?: RefundSummary): string {
    if (!refund) return 'neutral';
    const tones: Record<string, string> = {
      REQUESTED: 'info',
      PENDING_PROVIDER: 'warning',
      SUCCEEDED: 'success',
      FAILED: 'danger',
    };
    return tones[refund.status] || 'neutral';
  }

  getRefundIcon(refund?: RefundSummary): string {
    if (!refund) return 'pi pi-minus-circle';
    return (
      (
        {
          REQUESTED: 'pi pi-file-plus',
          PENDING_PROVIDER: 'pi pi-hourglass',
          SUCCEEDED: 'pi pi-check-circle',
          FAILED: 'pi pi-exclamation-circle',
        } as Record<string, string>
      )[refund.status] || 'pi pi-replay'
    );
  }

  updateStatus(id: string | number | undefined, status: string) {
    if (!id || !this.canUpdateReservation || status !== 'CONFIRMED') return;
    this.runLifecycleAction(
      id,
      `STATUS_${status}`,
      this.reservationService.updateReservationStatus(id, status),
      'Đã cập nhật trạng thái đặt phòng',
    );
  }

  openCheckIn(reservation: Reservation) {
    if (!reservation.id || !this.canCheckIn) return;
    this.checkInReservation = reservation;
    this.selectedCheckInRoomIds = (reservation.details || []).map(detail => detail.roomId).filter((id): id is string | number => id != null);
    this.guestIdentityCard = '';
    this.availableCheckInRooms = [];
    this.showCheckInDialog = true;
    this.checkInRoomsLoading = true;
    this.inventory.getAvailableRooms(reservation.checkInDate, reservation.checkOutDate).pipe(
      finalize(() => this.checkInRoomsLoading = false),
    ).subscribe({
      next: rooms => this.availableCheckInRooms = rooms.filter(room => room.status === 'AVAILABLE' || room.status === 'CLEAN'),
      error: () => this.messageService.add({ severity: 'error', summary: 'Không thể tải phòng', detail: 'Vui lòng tải lại danh sách phòng sạch rồi thử lại.' }),
    });
  }

  checkIn(id: string | number | undefined): void {
    if (!id || !this.canCheckIn) return;
    const reservation = this.reservations.find(item => String(item.id) === String(id));
    if (reservation) this.openCheckIn(reservation);
  }

  toggleCheckInRoom(roomId: string | number, checked: boolean): void {
    this.selectedCheckInRoomIds = checked
      ? [...new Set([...this.selectedCheckInRoomIds, roomId])]
      : this.selectedCheckInRoomIds.filter(id => String(id) !== String(roomId));
  }

  roomMatchesBooking(room: AdminRoom): boolean {
    const requiredTypes = new Set((this.checkInReservation?.details || []).map(detail => String(detail.roomTypeId || '')));
    return !requiredTypes.size || requiredTypes.has(String(room.roomTypeId));
  }

  submitCheckIn(): void {
    const reservation = this.checkInReservation;
    if (!reservation?.id || this.selectedCheckInRoomIds.length !== reservation.details.length) return;
    this.lifecycleActionKey.set(`CHECK_IN:${reservation.id}`);
    this.reservationService.checkInWithRooms(reservation.id, this.selectedCheckInRoomIds, this.guestIdentityCard).pipe(
      finalize(() => this.lifecycleActionKey.set(null)),
    ).subscribe({
      next: () => {
        this.showCheckInDialog = false;
        this.messageService.add({ severity: 'success', summary: 'Đã nhận phòng', detail: `Đã gán ${this.selectedCheckInRoomIds.length} phòng vật lý cho booking.` });
        this.loadReservations();
      },
      error: error => this.messageService.add({ severity: 'error', summary: 'Không thể check-in', detail: error?.error?.message || 'Phòng đã thay đổi trạng thái. Vui lòng kiểm tra và thử lại.' }),
    });
  }

  cancelOperational(id: string | number | undefined) {
    if (!id || !this.canCancelOperational) return;
    this.runLifecycleAction(
      id,
      'CANCEL',
      this.reservationService.cancelOperational(id),
      'Đã hủy đặt phòng',
    );
  }

  markNoShow(id: string | number | undefined) {
    if (!id || !this.canMarkNoShow) return;
    this.runLifecycleAction(
      id,
      'NO_SHOW',
      this.reservationService.markNoShow(id),
      'Đã đánh dấu khách không đến',
    );
  }

  isLifecycleBusy(id: string | number | undefined, action: string): boolean {
    return Boolean(id && this.lifecycleActionKey() === `${action}:${id}`);
  }

  createNew() {
    this.router.navigate([this.managementPortal ? '/management/front-desk/create' : '/admin/reservations/create']);
  }

  requestCancel(id: string | number | undefined): void {
    if (!id) return;
    if (this.cancelPendingId === id) {
      this.cancelPendingId = null;
      this.cancelOperational(id);
      return;
    }
    this.cancelPendingId = id;
  }

  clearCancelConfirmation(): void {
    this.cancelPendingId = null;
  }

  requestNoShow(id: string | number | undefined): void {
    if (!id) return;
    if (this.noShowPendingId === id) {
      this.noShowPendingId = null;
      this.markNoShow(id);
      return;
    }
    this.noShowPendingId = id;
  }

  clearNoShowConfirmation(): void {
    this.noShowPendingId = null;
  }

  assignRooms(id: string | number | undefined) {
    if (!id || !this.canAssignRooms) return;
    this.runLifecycleAction(id, 'ASSIGN_ROOMS', this.reservationService.assignRooms(id), 'Đã xếp phòng đúng hạng cho booking');
  }

  hasUnassignedRooms(reservation: Reservation): boolean {
    return reservation.details?.some(detail => detail.roomId == null) ?? false;
  }

  roomAssignmentLabel(reservation: Reservation): string {
    const details = reservation.details || [];
    if (!details.length) return '';
    const assigned = details.filter(detail => detail.roomId != null);
    if (!assigned.length) return 'Chưa xếp phòng';
    const roomNumbers = assigned.map(detail => detail.roomNumber).filter((value): value is string => !!value);
    return roomNumbers.length === assigned.length
      ? `Phòng ${roomNumbers.join(', ')}`
      : `Đã xếp ${assigned.length}/${details.length} phòng`;
  }

  getPaymentMethodLabel(method?: string): string {
    return ({ CASH: 'Tiền mặt', BANK_TRANSFER: 'Chuyển khoản', CREDIT_CARD: 'Thẻ tín dụng', VNPAY: 'VNPay' } as Record<string, string>)[method || ''] || method || 'Chưa chọn';
  }

  viewTimeline() {
    this.router.navigate([this.managementPortal ? '/management/front-desk/timeline' : '/admin/reservations/timeline']);
  }

  get managementPortal(): boolean { return this.router.url.startsWith('/management/'); }

  openCheckoutWorkspace(res: Reservation) {
    if (!res.id || !this.canReadCheckout) return;
    this.selectedReservationId = res.id;
    this.selectedBookingCode = res.bookingCode || `RES-${res.id}`;
    this.showCheckoutDialog = true;
  }

  handleCheckoutCompleted(result: CheckoutResult) {
    this.messageService.add({
      severity: 'success',
      summary: 'Đã trả phòng',
      detail: `Đã chốt hóa đơn ${result.invoiceNumber}`,
    });
    this.showCheckoutDialog = false;
    this.loadReservations();
  }

  generateInvoice(resId: string | number | undefined) {
    if (!resId || !this.canViewInvoice) return;
    this.invoiceService.getInvoiceByReservation(resId).pipe(
      switchMap(invoice => this.invoiceService.downloadPdf(invoice.id!)),
    ).subscribe({
      next: (response) => {
        if (!response.body) {
          this.messageService.add({ severity: 'error', summary: 'Lỗi', detail: 'Tệp hóa đơn trả về rỗng' });
          return;
        }
        const url = URL.createObjectURL(response.body);
        const anchor = this.document.createElement('a');
        anchor.href = url;
        anchor.download = `hoa-don-${resId}.pdf`;
        anchor.click();
        URL.revokeObjectURL(url);
        this.messageService.add({
          severity: 'success',
          summary: 'Thành công',
          detail: 'Đã tải hóa đơn PDF',
        });
      },
      error: (err) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Lỗi',
          detail: err?.error?.message || 'Không thể tải hóa đơn PDF. Vui lòng thử lại.',
        });
      },
    });
  }

  private runLifecycleAction(
    reservationId: string | number,
    action: string,
    request$: Observable<Reservation>,
    successDetail: string,
  ) {
    if (this.lifecycleActionKey()) return;
    this.lifecycleActionKey.set(`${action}:${reservationId}`);
    request$
      .pipe(finalize(() => this.lifecycleActionKey.set(null)))
      .subscribe({
        next: () => {
          this.cancelPendingId = null;
          this.noShowPendingId = null;
          this.messageService.add({
            severity: 'success',
            summary: 'Thành công',
            detail: successDetail,
          });
          this.loadReservations();
        },
        error: (error) => {
          this.messageService.add({
            severity: 'error',
            summary: 'Không thể thực hiện',
            detail: error?.error?.message || 'Tài khoản không có quyền hoặc trạng thái đặt phòng không còn phù hợp.',
          });
        },
      });
  }

  private localDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private startBackgroundRefresh(): void {
    merge(timer(30_000, 30_000), fromEvent(this.document, 'visibilitychange'))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refreshIfVisible());
  }
}
