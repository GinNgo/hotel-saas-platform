import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../../../core/services/auth';
import { HousekeepingService, HousekeepingTask } from '../../../core/services/housekeeping.service';
import { ManagementApiService } from '../../../core/services/management-api.service';
import { PermissionService } from '../../../core/services/permission.service';
import { HousekeepingComponent } from './housekeeping.component';

describe('HousekeepingComponent', () => {
  const context = {
    properties: [{ id: 10, code: 'P-10', nameVi: 'Property 10', propertyType: 'HOTEL', address: 'Address', approvalStatus: 'APPROVED', operationStatus: 'ACTIVE', isDemo: false }],
    activePropertyId: 10,
    activePropertyOperational: true,
    planCode: 'STANDARD', subscriptionStatus: 'ACTIVE', subscriptionSource: 'PLATFORM', lifetime: false,
    limits: {}, usage: {}, upgradeRequired: false,
  };

  let fixture: ComponentFixture<HousekeepingComponent>;
  let housekeeping: {
    list: ReturnType<typeof vi.fn>;
    assignees: ReturnType<typeof vi.fn>;
    claim: ReturnType<typeof vi.fn>;
    assign: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    complete: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  };
  let permission: { hasPermission: ReturnType<typeof vi.fn> };
  let managementRooms: any[];
  let managementRoomsApi: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    housekeeping = {
      list: vi.fn(() => of([])),
      assignees: vi.fn(() => of([])),
      claim: vi.fn(),
      assign: vi.fn(),
      start: vi.fn(),
      complete: vi.fn(),
      create: vi.fn(),
      cancel: vi.fn(),
    };
    permission = { hasPermission: vi.fn(() => true) };
    managementRooms = [{ id: 101, hotelId: 10, roomTypeId: 1, roomTypeNameVi: 'Deluxe', roomNumber: '101', floor: 1, status: 'AVAILABLE', housekeepingStatus: 'CLEAN', maintenanceStatus: 'NONE' }];
    managementRoomsApi = vi.fn(() => of(managementRooms));
    await TestBed.configureTestingModule({
      imports: [HousekeepingComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
        { provide: ManagementApiService, useValue: { context: () => of(context), rooms: managementRoomsApi } },
        { provide: HousekeepingService, useValue: housekeeping },
        { provide: AuthService, useValue: { getCurrentUserId: () => 7 } },
        { provide: PermissionService, useValue: permission },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(HousekeepingComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('renders an accessible empty queue state', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent || '';
    expect(text).toContain('Không có tác vụ');
    expect(housekeeping.list).toHaveBeenCalledWith(10);
    expect(housekeeping.list).toHaveBeenCalledTimes(1);
  });

  it('filters one authoritative snapshot without requesting each status again', async () => {
    const pending = { ...task(), id: 42, status: 'PENDING' as const };
    const completed = { ...task(), id: 43, status: 'COMPLETED' as const };
    housekeeping.list.mockReturnValue(of([pending, task(), completed]));
    const componentFixture = TestBed.createComponent(HousekeepingComponent);
    componentFixture.detectChanges();
    await componentFixture.whenStable();
    const component = componentFixture.componentInstance;

    expect(component.summaryTasks).toHaveLength(3);
    expect(component.tasks.map(item => item.id)).toEqual([42, 41]);
    component.setStatus('COMPLETED');

    expect(component.tasks.map(item => item.id)).toEqual([43]);
    expect(housekeeping.list).toHaveBeenCalledTimes(2);
  });

  it('refreshes the shared snapshot silently when operational updates are requested', async () => {
    const component = fixture.componentInstance;
    const callsBeforeRefresh = housekeeping.list.mock.calls.length;
    const assigneeCallsBeforeRefresh = housekeeping.assignees.mock.calls.length;

    component.refreshIfVisible();
    await fixture.whenStable();

    expect(housekeeping.list).toHaveBeenCalledTimes(callsBeforeRefresh + 1);
    expect(housekeeping.assignees).toHaveBeenCalledTimes(assigneeCallsBeforeRefresh);
    expect(component.loading).toBe(false);
    expect(component.syncing).toBe(false);
    expect(component.lastSyncedAt).toBeInstanceOf(Date);
  });

  it('searches the local snapshot by room, booking code, or assignee', async () => {
    housekeeping.list.mockReturnValue(of([
      { ...task(), id: 51, roomNumber: '301', bookingCode: 'LXS-ALPHA', assignedToName: 'Lan' },
      { ...task(), id: 52, roomNumber: '502', bookingCode: 'LXS-BETA', assignedToName: 'Minh' },
    ]));
    const componentFixture = TestBed.createComponent(HousekeepingComponent);
    componentFixture.detectChanges();
    await componentFixture.whenStable();
    const component = componentFixture.componentInstance;

    component.searchTerm = 'beta';
    component.applyStatusFilter();
    expect(component.tasks.map(item => item.id)).toEqual([52]);
    component.searchTerm = 'lan';
    component.applyStatusFilter();
    expect(component.tasks.map(item => item.id)).toEqual([51]);
    expect(housekeeping.list).toHaveBeenCalledTimes(2);
  });

  it('renders authoritative task type, priority, and operational note', async () => {
    housekeeping.list.mockReturnValue(of([{ ...task(), note: 'Ưu tiên dọn trước 14:00' }]));
    const componentFixture = TestBed.createComponent(HousekeepingComponent);
    componentFixture.detectChanges();
    await componentFixture.whenStable();
    const text = (componentFixture.nativeElement as HTMLElement).textContent || '';

    expect(text).toContain('Dọn sau checkout');
    expect(text).toContain('Cao');
    expect(text).toContain('Ưu tiên dọn trước 14:00');
  });

  it('creates a validated manual task and refreshes the shared snapshot', async () => {
    const created = { ...task(), id: 60, reservationId: null, bookingCode: null, taskType: 'Inspection', priority: 'URGENT', note: 'Kiểm tra minibar' };
    housekeeping.create.mockReturnValue(of(created));
    const componentFixture = TestBed.createComponent(HousekeepingComponent);
    componentFixture.detectChanges();
    await componentFixture.whenStable();
    const component = componentFixture.componentInstance;
    component.showCreateForm = true;
    component.createRoomId = 101;
    component.createTaskType = 'INSPECTION';
    component.createPriority = 'URGENT';
    component.createNotes = '  Kiểm tra minibar  ';

    component.createTask();
    await componentFixture.whenStable();

    expect(housekeeping.create).toHaveBeenCalledWith({ roomId: 101, taskType: 'INSPECTION', priority: 'URGENT', notes: 'Kiểm tra minibar' });
    expect(component.showCreateForm).toBe(false);
    expect(component.completionNotice).toContain('Kiểm tra phòng');
  });

  it('excludes occupied and out-of-service rooms from manual task creation', async () => {
    managementRooms.push(
      { ...managementRooms[0], id: 102, roomNumber: '102', status: 'OCCUPIED' },
      { ...managementRooms[0], id: 103, roomNumber: '103', status: 'OUT_OF_SERVICE' },
    );
    const componentFixture = TestBed.createComponent(HousekeepingComponent);
    componentFixture.detectChanges();
    await componentFixture.whenStable();

    expect(componentFixture.componentInstance.rooms.map(room => room.roomNumber)).toEqual(['101']);
  });

  it('refreshes room availability after a create conflict without losing form details', async () => {
    housekeeping.create.mockReturnValue(throwError(() => ({
      error: { code: 'ROOM_OCCUPIED', message: 'Phòng vừa có khách nhận phòng.' },
    })));
    const component = fixture.componentInstance;
    component.showCreateForm = true;
    component.createRoomId = 101;
    component.createTaskType = 'DEEP_CLEANING';
    component.createPriority = 'URGENT';
    component.createNotes = 'Tổng vệ sinh sau sự kiện';
    managementRooms.splice(0, managementRooms.length, { ...managementRooms[0], status: 'OCCUPIED' });

    component.createTask();
    await fixture.whenStable();

    expect(managementRoomsApi).toHaveBeenCalledTimes(2);
    expect(component.createRoomId).toBeUndefined();
    expect(component.createTaskType).toBe('DEEP_CLEANING');
    expect(component.createPriority).toBe('URGENT');
    expect(component.createNotes).toBe('Tổng vệ sinh sau sự kiện');
    expect(component.createError).toContain('vừa có khách');
  });

  it('cancels an unstarted task and refreshes the queue', async () => {
    const pendingTask = { ...task(), reservationId: null, bookingCode: null, taskType: 'TouchUp', status: 'PENDING' as const };
    housekeeping.list.mockReturnValue(of([pendingTask]));
    housekeeping.cancel.mockReturnValue(of(undefined));
    const componentFixture = TestBed.createComponent(HousekeepingComponent);
    componentFixture.detectChanges();
    await componentFixture.whenStable();
    const component = componentFixture.componentInstance;

    component.cancelTask(pendingTask);
    expect(component.cancellingTaskId).toBe(pendingTask.id);
    expect(housekeeping.cancel).not.toHaveBeenCalled();
    component.cancellationReason = '  Yêu cầu đã được xử lý tại quầy  ';
    component.confirmCancellation(pendingTask);
    await componentFixture.whenStable();

    expect(housekeeping.cancel).toHaveBeenCalledWith(pendingTask.id, 'Yêu cầu đã được xử lý tại quầy', pendingTask.version);
    expect(component.completionNotice).toContain('Đã hủy tác vụ');
  });

  it('renders loading state while the queue request is pending', async () => {
    housekeeping.list.mockReturnValue(throwError(() => new Error('network')));
    const pending = TestBed.createComponent(HousekeepingComponent);
    pending.detectChanges();
    await pending.whenStable();
    expect((pending.nativeElement as HTMLElement).textContent).toContain('Không thể tải hàng đợi');
  });

  it('shows completion only to the assigned user with the approve permission', async () => {
    housekeeping.list.mockReturnValue(of([task()]));
    const assigned = TestBed.createComponent(HousekeepingComponent);
    assigned.detectChanges();
    await assigned.whenStable();
    expect((assigned.nativeElement as HTMLElement).textContent).toContain('Hoàn tất và kiểm tra mở bán');

    permission.hasPermission.mockReturnValue(false);
    const denied = TestBed.createComponent(HousekeepingComponent);
    denied.detectChanges();
    await denied.whenStable();
    expect((denied.nativeElement as HTMLElement).textContent).not.toContain('Hoàn tất và kiểm tra mở bán');
  });

  it('completes with the optimistic version and explains a maintenance-blocked release', async () => {
    const activeTask = task();
    housekeeping.list.mockReturnValue(of([activeTask]));
    housekeeping.complete.mockReturnValue(of({
      ...activeTask,
      status: 'COMPLETED',
      completedAt: '2026-08-04T04:00:00',
      roomStatus: 'MAINTENANCE',
      roomHousekeepingStatus: 'CLEAN',
      roomMaintenanceStatus: 'MAINTENANCE',
      roomReleased: false,
    }));
    const active = TestBed.createComponent(HousekeepingComponent);
    active.detectChanges();
    await active.whenStable();

    const button = Array.from((active.nativeElement as HTMLElement).querySelectorAll('button'))
      .find(item => item.textContent?.includes('Hoàn tất và kiểm tra mở bán')) as HTMLButtonElement;
    button.click();
    active.detectChanges();
    await active.whenStable();

    expect(housekeeping.complete).toHaveBeenCalledWith(41, 6);
    expect((active.nativeElement as HTMLElement).textContent).toContain('vẫn bị chặn bởi MAINTENANCE');
  });

  it('renders the terminal clean and available state', async () => {
    housekeeping.list.mockReturnValue(of([{
      ...task(),
      status: 'COMPLETED',
      completedAt: '2026-08-04T04:00:00',
      roomStatus: 'AVAILABLE',
      roomHousekeepingStatus: 'CLEAN',
      roomReleased: true,
    }]));
    const completed = TestBed.createComponent(HousekeepingComponent);
    completed.detectChanges();
    await completed.whenStable();
    completed.componentInstance.setStatus('COMPLETED');
    completed.detectChanges();

    expect((completed.nativeElement as HTMLElement).textContent).toContain('Phòng đã sạch và sẵn sàng mở bán.');
  });

  function task(): HousekeepingTask {
    return {
      id: 41,
      hotelId: 10,
      roomId: 101,
      roomNumber: '101',
      reservationId: 55,
      bookingCode: 'LXS-HOUSEKEEPING-55',
      taskType: 'CheckoutCleaning',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      assignedToUserId: 7,
      assignedToUsername: 'cleaner',
      assignedToName: 'Cleaner',
      assignedAt: '2026-08-04T03:30:00',
      startedAt: '2026-08-04T03:35:00',
      completedAt: null,
      note: null,
      version: 6,
      staleAssignment: false,
      roomStatus: 'CLEANING',
      roomHousekeepingStatus: 'CLEANING',
      roomMaintenanceStatus: 'NONE',
      roomReleased: false,
    };
  }
});
