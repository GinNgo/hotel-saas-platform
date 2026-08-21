import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { OperationalTask, OperationalTaskService } from './operational-task.service';

describe('OperationalTaskService', () => {
  let service: OperationalTaskService;
  let http: HttpTestingController;
  const task: OperationalTask = {
    id: '0f21f652-1c7a-4db9-9bf5-2d64f47b5f31', publicId: 'TASK-1', hotelId: '0f21f652-1c7a-4db9-9bf5-2d64f47b5f32',
    taskType: 'REFUND_APPROVAL', functionCode: 'OPERATIONAL_TASK', requiredAction: 64,
    aggregateType: 'PROPERTY_REFUND', aggregateId: 'refund-1', status: 'OPEN', version: 1,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(OperationalTaskService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('keeps GUID property and task identities across queue mutations', () => {
    service.list(task.hotelId, 'OPEN', { sort: 'createdasc' }).subscribe();
    const list = http.expectOne(request => request.url === `${environment.apiUrl}/management/tasks`);
    expect(list.request.params.get('hotelId')).toBe(task.hotelId);
    expect(list.request.params.get('status')).toBe('OPEN');
    expect(list.request.params.get('sort')).toBe('createdasc');
    list.flush([]);

    service.assignees(task.hotelId).subscribe();
    const assignees = http.expectOne(request => request.url === `${environment.apiUrl}/management/tasks/assignees`);
    expect(assignees.request.params.get('hotelId')).toBe(task.hotelId);
    assignees.flush([]);

    service.claim(task).subscribe();
    const claim = http.expectOne(`${environment.apiUrl}/management/tasks/${task.id}/claim?expectedVersion=1`);
    expect(claim.request.method).toBe('POST');
    claim.flush(task);

    service.reassign(task, '0f21f652-1c7a-4db9-9bf5-2d64f47b5f33', 'Đổi ca trực').subscribe();
    const reassign = http.expectOne(`${environment.apiUrl}/management/tasks/${task.id}/reassign`);
    expect(reassign.request.body.assigneeUserId).toBe('0f21f652-1c7a-4db9-9bf5-2d64f47b5f33');
    reassign.flush(task);

    service.cancel(task, 'Khách đã hủy yêu cầu').subscribe();
    const cancel = http.expectOne(`${environment.apiUrl}/management/tasks/${task.id}/cancel`);
    expect(cancel.request.method).toBe('POST');
    expect(cancel.request.body).toEqual({ expectedVersion: 1, reason: 'Khách đã hủy yêu cầu' });
    cancel.flush({ ...task, status: 'CANCELLED', version: 2 });
  });
});
