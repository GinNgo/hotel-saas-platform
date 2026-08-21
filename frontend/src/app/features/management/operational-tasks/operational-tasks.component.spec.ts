import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { OperationalTask, OperationalTaskService } from '../../../core/services/operational-task.service';
import { PermissionService } from '../../../core/services/permission.service';
import { OperationalTasksComponent } from './operational-tasks.component';

describe('OperationalTasksComponent', () => {
  const propertyId = '0f21f652-1c7a-4db9-9bf5-2d64f47b5f32';
  let fixture: ComponentFixture<OperationalTasksComponent>;
  let api: {
    list: ReturnType<typeof vi.fn>;
    assignees: ReturnType<typeof vi.fn>;
    claim: ReturnType<typeof vi.fn>;
    execute: ReturnType<typeof vi.fn>;
    reassign: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    api = {
      list: vi.fn(() => of([task()])),
      assignees: vi.fn(() => of([{ userId: 'user-guid', username: 'linh', fullName: 'Linh Nguyễn', role: 'Receptionist' }])),
      claim: vi.fn(() => of({ ...task(), status: 'ASSIGNED' as const, assignedToUserId: 'user-guid', version: 2 })),
      execute: vi.fn(),
      reassign: vi.fn(() => of({ ...task(), status: 'ASSIGNED' as const, assignedToUserId: 'user-guid', version: 2 })),
    };
    await TestBed.configureTestingModule({
      imports: [OperationalTasksComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: (key: string) => key === 'propertyId' ? propertyId : null } } } },
        { provide: OperationalTaskService, useValue: api },
        { provide: PermissionService, useValue: { hasPermission: () => true } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(OperationalTasksComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('loads the GUID property queue and renders real staff names', () => {
    expect(api.list).toHaveBeenCalledWith(propertyId);
    expect(api.assignees).toHaveBeenCalledWith(propertyId);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Linh Nguyễn');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Lễ tân');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('RF-2026-01');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('450000 VND');
  });

  it('claims a task with its optimistic version', () => {
    const button = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
      .find(item => item.textContent?.includes('Nhận việc')) as HTMLButtonElement;
    button.click();
    expect(api.claim).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-guid', version: 1 }));
  });

  it('reassigns to the selected staff user GUID', () => {
    fixture.componentInstance.selectedAssignee['task-guid'] = 'user-guid';
    fixture.componentInstance.reassign(task());
    expect(api.reassign).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-guid' }), 'user-guid', 'Phân công lại từ hàng đợi vận hành');
  });

  it('filters visible cards by source context without changing the server queue', () => {
    fixture.componentInstance.search = 'RF-2026-01';
    expect(fixture.componentInstance.visibleTasks).toHaveLength(1);
    fixture.componentInstance.search = 'không tồn tại';
    expect(fixture.componentInstance.visibleTasks).toHaveLength(0);
  });

  it('filters status locally while preserving authoritative queue counts', () => {
    const completed = { ...task(), id: 'task-completed', status: 'COMPLETED' as const };
    fixture.componentInstance.tasks = [task(), completed];
    fixture.componentInstance.selectStatus('COMPLETED');

    expect(fixture.componentInstance.visibleTasks).toEqual([completed]);
    expect(fixture.componentInstance.countByStatus('OPEN')).toBe(1);
    expect(fixture.componentInstance.countByStatus('COMPLETED')).toBe(1);
    expect(api.list).toHaveBeenCalledTimes(1);
  });

  function task(): OperationalTask {
    return {
      id: 'task-guid', publicId: 'TASK-2026-01', hotelId: propertyId, taskType: 'REFUND_APPROVAL',
      functionCode: 'OPERATIONAL_TASK', requiredAction: 64, aggregateType: 'PROPERTY_REFUND',
      aggregateId: 'refund-guid', sourceReference: 'RF-2026-01', sourceDescription: '450000 VND · Khách hủy đúng hạn',
      assignedToUserId: 'user-guid', assignedToName: 'Linh Nguyễn', assignedToRole: 'Receptionist', status: 'OPEN', version: 1,
    };
  }
});
