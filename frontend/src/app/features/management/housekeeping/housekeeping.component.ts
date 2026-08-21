import { CommonModule, DOCUMENT } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Observable, forkJoin, fromEvent, merge, timer } from 'rxjs';
import { AuthService } from '../../../core/services/auth';
import { HousekeepingAssignee, HousekeepingService, HousekeepingStatus, HousekeepingTask } from '../../../core/services/housekeeping.service';
import { ManagementApiService, ManagedProperty, ManagementRoom } from '../../../core/services/management-api.service';
import { ActionCode, FunctionCode, PermissionService } from '../../../core/services/permission.service';
import { FeedbackStateComponent } from '../../../shared/components/feedback-state/feedback-state.component';

@Component({
  selector: 'app-housekeeping',
  standalone: true,
  imports: [CommonModule, FormsModule, FeedbackStateComponent],
  templateUrl: './housekeeping.component.html',
  styleUrl: './housekeeping.component.css',
})
export class HousekeepingComponent implements OnInit {
  private readonly api = inject(HousekeepingService);
  private readonly managementApi = inject(ManagementApiService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly permissions = inject(PermissionService);
  private readonly document = inject(DOCUMENT);

  properties: ManagedProperty[] = [];
  propertyId?: string | number;
  status?: HousekeepingStatus;
  searchTerm = '';
  tasks: HousekeepingTask[] = [];
  summaryTasks: HousekeepingTask[] = [];
  assignees: HousekeepingAssignee[] = [];
  rooms: ManagementRoom[] = [];
  selectedAssignee: Record<string, string | number | undefined> = {};
  loading = true;
  syncing = false;
  syncWarning = '';
  lastSyncedAt?: Date;
  error = '';
  actionTaskId?: string | number;
  assigningTaskId?: string | number;
  completionNotice = '';
  completionBlocked = false;
  showCreateForm = false;
  createRoomId?: string | number;
  createTaskType: 'INSPECTION' | 'TOUCH_UP' | 'DEEP_CLEANING' = 'INSPECTION';
  createPriority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' = 'NORMAL';
  createNotes = '';
  creating = false;
  createError = '';
  cancellingTaskId?: string | number;
  cancellationReason = '';
  cancellationError = '';
  readonly hasCompletionPermission = this.permissions.hasPermission(FunctionCode.HOUSEKEEPING, ActionCode.TASK_EXECUTE);
  readonly hasExecutionPermission = this.permissions.hasPermission(FunctionCode.HOUSEKEEPING, ActionCode.TASK_EXECUTE);
  readonly hasUpdatePermission = this.permissions.hasPermission(FunctionCode.HOUSEKEEPING, ActionCode.UPDATE);
  readonly hasCreatePermission = this.permissions.hasPermission(FunctionCode.HOUSEKEEPING, ActionCode.CREATE);
  readonly hasCancelPermission = this.permissions.hasPermission(FunctionCode.HOUSEKEEPING, ActionCode.DELETE);

  ngOnInit(): void {
    const propertyParam = this.route.snapshot.queryParamMap.get('propertyId');
    const routePropertyId = propertyParam
      ? (/^\d+$/.test(propertyParam) ? Number(propertyParam) : propertyParam)
      : undefined;
    this.managementApi.context(routePropertyId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: context => {
        this.properties = context.properties || [];
        this.propertyId = context.activePropertyId || this.properties[0]?.id;
        this.load();
        this.startBackgroundRefresh();
      },
      error: error => this.fail(error, 'Không thể tải phạm vi cơ sở.'),
    });
  }

  load(): void {
    if (!this.propertyId) {
      this.tasks = [];
      this.assignees = [];
      this.loading = false;
      this.cdr.markForCheck();
      return;
    }
    this.loading = true;
    this.error = '';
    this.syncWarning = '';
    forkJoin({
      tasks: this.api.list(this.propertyId),
      assignees: this.api.assignees(this.propertyId),
      rooms: this.managementApi.rooms(this.propertyId),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ tasks, assignees, rooms }) => {
        this.summaryTasks = tasks;
        this.applyStatusFilter();
        this.assignees = assignees;
        this.rooms = rooms.filter(room => room.status !== 'OCCUPIED' && room.status !== 'OUT_OF_SERVICE');
        this.loading = false;
        this.syncing = false;
        this.syncWarning = '';
        this.lastSyncedAt = new Date();
        this.cdr.markForCheck();
      },
      error: error => this.fail(error, 'Không thể tải hàng đợi housekeeping.'),
    });
  }

  refreshIfVisible(): void {
    if (this.document.visibilityState === 'hidden' || this.loading || this.syncing || this.actionTaskId || this.creating) return;
    if (!this.propertyId) return;
    this.syncing = true;
    this.api.list(this.propertyId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: tasks => {
        this.summaryTasks = tasks;
        this.applyStatusFilter();
        this.syncing = false;
        this.syncWarning = '';
        this.lastSyncedAt = new Date();
        this.cdr.markForCheck();
      },
      error: () => {
        this.syncing = false;
        this.syncWarning = 'Chưa thể đồng bộ thay đổi mới. Dữ liệu hiện tại vẫn được giữ nguyên.';
        this.cdr.markForCheck();
      },
    });
  }

  claim(task: HousekeepingTask): void { if (!this.hasExecutionPermission) return; this.runAction(task.id, () => this.api.claim(task.id, task.version)); }

  assign(task: HousekeepingTask): void {
    if (!this.hasUpdatePermission) return;
    const userId = this.selectedAssignee[task.id];
    if (!userId) return;
    this.assigningTaskId = task.id;
    this.error = '';
    this.api.assign(task.id, userId, task.version).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.assigningTaskId = undefined; this.load(); },
      error: error => { this.assigningTaskId = undefined; this.fail(error, 'Không thể gán tác vụ.'); },
    });
  }

  start(task: HousekeepingTask): void { if (!this.hasExecutionPermission) return; this.runAction(task.id, () => this.api.start(task.id, task.version)); }

  complete(task: HousekeepingTask): void {
    this.actionTaskId = task.id;
    this.error = '';
    this.completionNotice = '';
    this.api.complete(task.id, task.version).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: completed => {
        this.actionTaskId = undefined;
        this.completionBlocked = !completed.roomReleased;
        this.completionNotice = completed.roomReleased
          ? `Phòng ${completed.roomNumber} đã sạch và sẵn sàng mở bán.`
          : `Phòng ${completed.roomNumber} đã sạch nhưng vẫn bị chặn bởi ${completed.roomMaintenanceStatus}.`;
        this.load();
      },
      error: error => {
        this.actionTaskId = undefined;
        this.fail(error, 'Không thể hoàn tất tác vụ housekeeping.');
      },
    });
  }

  canStart(task: HousekeepingTask): boolean {
    return task.status === 'CLAIMED' && task.assignedToUserId === this.auth.getCurrentUserId() && !task.staleAssignment;
  }

  canComplete(task: HousekeepingTask): boolean {
    return this.hasCompletionPermission
      && task.status === 'IN_PROGRESS'
      && task.assignedToUserId === this.auth.getCurrentUserId();
  }

  statusLabel(status: HousekeepingStatus): string {
    return ({ PENDING: 'Chờ xử lý', CLAIMED: 'Đã nhận', IN_PROGRESS: 'Đang dọn', COMPLETED: 'Hoàn tất' } as Record<string, string>)[status] || status;
  }

  createTask(): void {
    if (!this.hasCreatePermission) return;
    const notes = this.createNotes.trim();
    if (!this.createRoomId || notes.length < 3 || notes.length > 500 || this.creating) return;
    this.creating = true;
    this.createError = '';
    this.api.create({ roomId: this.createRoomId, taskType: this.createTaskType, priority: this.createPriority, notes })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: task => {
          this.creating = false;
          this.showCreateForm = false;
          this.createRoomId = undefined;
          this.createNotes = '';
          this.completionBlocked = false;
          this.completionNotice = `Đã tạo tác vụ ${this.taskTypeLabel(task.taskType)} cho phòng ${task.roomNumber}.`;
          this.load();
        },
        error: error => {
          this.creating = false;
          this.createError = this.apiErrorMessage(error) || 'Không thể tạo tác vụ housekeeping.';
          if (['ROOM_OCCUPIED', 'ROOM_OUT_OF_SERVICE'].includes(this.apiErrorCode(error) || '')) {
            this.refreshRoomsAfterConflict();
          }
          this.cdr.markForCheck();
        },
      });
  }

  cancelTask(task: HousekeepingTask): void {
    if (!this.hasCancelPermission || this.actionTaskId || task.reservationId || task.taskType === 'CheckoutCleaning' || !['PENDING', 'CLAIMED'].includes(task.status)) return;
    this.cancellingTaskId = task.id;
    this.cancellationReason = '';
    this.cancellationError = '';
  }

  closeCancellation(): void {
    if (this.actionTaskId) return;
    this.cancellingTaskId = undefined;
    this.cancellationReason = '';
    this.cancellationError = '';
  }

  confirmCancellation(task: HousekeepingTask): void {
    const reason = this.cancellationReason.trim();
    if (this.cancellingTaskId !== task.id || reason.length < 3 || reason.length > 500 || this.actionTaskId) return;
    this.actionTaskId = task.id;
    this.error = '';
    this.cancellationError = '';
    this.api.cancel(task.id, reason, task.version).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.actionTaskId = undefined;
        this.cancellingTaskId = undefined;
        this.cancellationReason = '';
        this.completionBlocked = false;
        this.completionNotice = `Đã hủy tác vụ ${this.taskTypeLabel(task.taskType)} của phòng ${task.roomNumber}.`;
        this.load();
      },
      error: error => {
        this.actionTaskId = undefined;
        this.cancellationError = this.apiErrorMessage(error) || 'Không thể hủy tác vụ housekeeping.';
        this.cdr.markForCheck();
      },
    });
  }

  taskTypeLabel(taskType: string): string {
    return ({ CheckoutCleaning: 'Dọn sau checkout', Inspection: 'Kiểm tra phòng', TouchUp: 'Dọn bổ sung', DeepCleaning: 'Tổng vệ sinh', MaintenanceSupport: 'Hỗ trợ bảo trì' } as Record<string, string>)[taskType] || taskType;
  }

  priorityLabel(priority: string): string {
    return ({ LOW: 'Thấp', NORMAL: 'Thường', HIGH: 'Cao', URGENT: 'Khẩn cấp' } as Record<string, string>)[priority] || priority;
  }

  taskCount(status: HousekeepingStatus): number {
    return this.summaryTasks.filter(task => task.status === status).length;
  }

  get completionRate(): number {
    return this.summaryTasks.length ? Math.round((this.taskCount('COMPLETED') / this.summaryTasks.length) * 100) : 0;
  }

  setStatus(status?: HousekeepingStatus): void {
    this.status = status;
    this.applyStatusFilter();
  }

  applyStatusFilter(): void {
    const statusTasks = this.status
      ? this.summaryTasks.filter(task => task.status === this.status)
      : this.summaryTasks.filter(task => task.status !== 'COMPLETED');
    const query = this.searchTerm.trim().toLocaleLowerCase('vi');
    this.tasks = query
      ? statusTasks.filter(task => [task.roomNumber, task.bookingCode, task.assignedToName, task.assignedToUsername, task.taskType, task.note]
          .some(value => String(value || '').toLocaleLowerCase('vi').includes(query)))
      : statusTasks;
    this.cdr.markForCheck();
  }

  private runAction(taskId: string | number, request: () => Observable<HousekeepingTask>): void {
    this.actionTaskId = taskId;
    this.error = '';
    request().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.actionTaskId = undefined; this.load(); },
      error: error => { this.actionTaskId = undefined; this.fail(error, 'Không thể cập nhật tác vụ.'); },
    });
  }

  private startBackgroundRefresh(): void {
    merge(timer(30_000, 30_000), fromEvent(this.document, 'visibilitychange'))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refreshIfVisible());
  }

  private refreshRoomsAfterConflict(): void {
    if (!this.propertyId) return;
    this.managementApi.rooms(this.propertyId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: rooms => {
        this.rooms = rooms.filter(room => room.status !== 'OCCUPIED' && room.status !== 'OUT_OF_SERVICE');
        if (!this.rooms.some(room => room.id === this.createRoomId)) this.createRoomId = undefined;
        this.cdr.markForCheck();
      },
    });
  }

  private fail(error: unknown, fallback: string): void {
    this.loading = false;
    this.error = this.apiErrorMessage(error) || fallback;
    this.cdr.markForCheck();
  }

  private apiErrorMessage(error: unknown): string | undefined {
    if (typeof error !== 'object' || error === null || !('error' in error)) return undefined;
    const payload = (error as { error?: unknown }).error;
    if (typeof payload !== 'object' || payload === null || !('message' in payload)) return undefined;
    const message = (payload as { message?: unknown }).message;
    return typeof message === 'string' && message.trim() ? message : undefined;
  }

  private apiErrorCode(error: unknown): string | undefined {
    if (typeof error !== 'object' || error === null || !('error' in error)) return undefined;
    const payload = (error as { error?: unknown }).error;
    if (typeof payload !== 'object' || payload === null || !('code' in payload)) return undefined;
    const code = (payload as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
}
