import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { ActionCode, PermissionService } from '../../../core/services/permission.service';
import { OperationalTask, OperationalTaskAssignee, OperationalTaskService } from '../../../core/services/operational-task.service';

@Component({
  selector: 'app-operational-tasks',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './operational-tasks.component.html',
  styleUrl: './operational-tasks.component.css',
})
export class OperationalTasksComponent implements OnInit {
  private readonly api = inject(OperationalTaskService);
  private readonly route = inject(ActivatedRoute);
  private readonly permissions = inject(PermissionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  tasks: OperationalTask[] = [];
  assignees: OperationalTaskAssignee[] = [];
  selectedAssignee: Record<string, string | number | undefined> = {};
  status = '';
  aiOnly = false;
  toolNameFilter = '';
  search = '';
  loading = false;
  error = '';
  notice = '';
  hotelId?: string | number;
  busyTaskId?: string | number;

  get visibleTasks(): OperationalTask[] {
    const term = this.search.trim().toLocaleLowerCase('vi-VN');
    return this.tasks.filter(task => {
      if (this.status && task.status !== this.status) return false;
      if (this.aiOnly && task.taskType !== 'AI_TOOL') return false;
      if (this.toolNameFilter && task.toolName !== this.toolNameFilter) return false;
      if (!term) return true;
      return [task.publicId, task.sourceReference, task.sourceDescription, task.assignedToName, task.aggregateId]
        .some(value => String(value || '').toLocaleLowerCase('vi-VN').includes(term));
    });
  }

  countByStatus(value: OperationalTask['status']): number {
    return this.tasks.filter(task => task.status === value).length;
  }

  ngOnInit(): void {
    this.hotelId = this.parsePropertyId(this.route.snapshot.queryParamMap.get('propertyId')) ?? undefined;
    this.aiOnly = this.route.snapshot.queryParamMap.get('aiOnly') === 'true' || (this.route.snapshot.url || []).some(segment => segment.path === 'ai-tasks');
    this.toolNameFilter = this.route.snapshot.queryParamMap.get('toolName') || '';
    this.load();
  }

  load(): void {
    if (!this.hotelId) {
      this.error = 'Hãy chọn cơ sở đang quản lý để xem tác vụ.';
      return;
    }
    this.loading = true;
    this.error = '';
    this.notice = '';
    const tasksRequest = this.aiOnly || this.toolNameFilter
      ? this.api.list(this.hotelId, undefined, { taskType: this.aiOnly ? 'AI_TOOL' : undefined, toolName: this.toolNameFilter || undefined, page: 1, pageSize: 50 })
      : this.api.list(this.hotelId);
    tasksRequest.pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.loading = false; this.cdr.markForCheck(); })).subscribe({
      next: tasks => {
        this.tasks = Array.isArray(tasks) ? tasks : [];
        this.selectedAssignee = Object.fromEntries(this.tasks.map(task => [String(task.id), task.assignedToUserId]));
        this.cdr.markForCheck();
      },
      error: error => { this.error = error?.error?.message || 'Không thể tải hàng đợi tác vụ.'; this.cdr.markForCheck(); },
    });
    if (this.canReassign()) {
      this.api.assignees(this.hotelId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: assignees => { this.assignees = assignees || []; this.cdr.markForCheck(); },
        error: () => { this.assignees = []; this.cdr.markForCheck(); },
      });
    }
  }

  selectStatus(status: '' | OperationalTask['status']): void {
    this.status = status;
  }

  canExecute(task: OperationalTask): boolean {
    return this.permissions.hasPermission(task.functionCode, ActionCode.TASK_EXECUTE);
  }

  canReassign(): boolean {
    return this.permissions.hasPermission('OPERATIONAL_TASK', ActionCode.UPDATE);
  }

  claim(task: OperationalTask): void {
    this.run(task, this.api.claim(task), 'Đã nhận tác vụ.');
  }

  complete(task: OperationalTask): void {
    this.run(task, this.api.execute(task, 'Hoàn tất từ hàng đợi vận hành'), 'Tác vụ đã hoàn tất.');
  }

  cancel(task: OperationalTask): void {
    const reason = window.prompt('Nhập lý do hủy tác vụ (tối thiểu 5 ký tự):', 'Không còn cần xử lý');
    if (!reason || reason.trim().length < 5) return;
    this.run(task, this.api.cancel(task, reason.trim()), 'Đã hủy tác vụ và ghi audit.');
  }

  reassign(task: OperationalTask): void {
    const assigneeUserId = this.selectedAssignee[String(task.id)];
    if (!assigneeUserId) {
      this.error = 'Hãy chọn nhân sự nhận tác vụ.';
      return;
    }
    this.run(task, this.api.reassign(task, assigneeUserId, 'Phân công lại từ hàng đợi vận hành'), 'Đã cập nhật người phụ trách.');
  }

  taskLabel(task: OperationalTask): string {
    return task.taskType === 'AI_TOOL' ? `AI · ${task.toolName || 'Yêu cầu nghiệp vụ'}` : ({ REFUND_APPROVAL: 'Duyệt hoàn tiền', HOUSEKEEPING: 'Dọn phòng', MAINTENANCE: 'Bảo trì phòng' } as Record<string, string>)[task.taskType] || task.taskType;
  }

  taskDescription(task: OperationalTask): string {
    return ({
      REFUND_APPROVAL: 'Kiểm tra yêu cầu và chuyển sang nhà cung cấp thanh toán.',
      HOUSEKEEPING: 'Hoàn tất vệ sinh để đưa phòng trở lại kho sẵn sàng.',
      MAINTENANCE: 'Xác nhận sửa chữa hoàn tất và mở lại phòng.',
    } as Record<string, string>)[task.taskType] || 'Tác vụ vận hành cần được xử lý.';
  }

  statusLabel(status: OperationalTask['status']): string {
    return ({ OPEN: 'Chưa nhận', ASSIGNED: 'Đã giao', IN_PROGRESS: 'Đang xử lý', BLOCKED: 'Đang chặn', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy' } as Record<string, string>)[status] || status;
  }

  assigneeName(userId?: string | number): string {
    if (!userId) return 'Chưa phân công';
    const staff = this.assignees.find(item => String(item.userId) === String(userId));
    return staff ? (staff.fullName || staff.username) : `Nhân sự ${userId}`;
  }

  assignedDisplay(task: OperationalTask): string {
    if (task.assignedToName) return task.assignedToName;
    return this.assigneeName(task.assignedToUserId);
  }

  sourceLabel(task: OperationalTask): string {
    return ({ PROPERTY_REFUND: 'Mã hoàn tiền', HOUSEKEEPING: 'Phòng cần dọn', ROOM_MAINTENANCE: 'Phòng bảo trì' } as Record<string, string>)[task.aggregateType] || 'Đối tượng';
  }

  openAuthoritative(task: OperationalTask): void {
    const routes: Record<string, string> = { 'reservation.checkin': '/management/front-desk', 'pricing.update': '/management/room-rates', 'refund.request': '/management/refunds', 'rbac.update': '/admin/role-permissions' };
    const route = routes[task.toolName || ''] || '/management/tasks';
    void this.router.navigate([route], { queryParams: { propertyId: this.hotelId, aggregateId: task.aggregateId, returnUrl: `/management/ai-tasks?propertyId=${this.hotelId}` } });
  }

  roleLabel(role: string): string {
    return ({ Owner: 'Chủ cơ sở', Manager: 'Quản lý', Receptionist: 'Lễ tân', Housekeeper: 'Buồng phòng' } as Record<string, string>)[role] || role;
  }

  trackTask(_: number, task: OperationalTask): string | number { return task.id; }

  private run(task: OperationalTask, request: Observable<OperationalTask>, success: string): void {
    if (this.busyTaskId !== undefined) return;
    this.busyTaskId = task.id;
    this.error = '';
    this.notice = '';
    request.pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busyTaskId = undefined)).subscribe({
      next: updated => {
        this.tasks = this.tasks.map(item => item.id === updated.id ? updated : item);
        this.selectedAssignee[String(updated.id)] = updated.assignedToUserId;
        this.notice = success;
      },
      error: error => this.error = error?.error?.message || 'Không thể cập nhật tác vụ.',
    });
  }

  private parsePropertyId(value: string | null): string | number | null {
    if (!value) return null;
    if (/^\d+$/.test(value)) return Number(value);
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
  }
}
