import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AuditLogComponent } from './audit-log.component';
import { OperationalAuditService } from '../../../core/services/operational-audit.service';
import { AuthService } from '../../../core/services/auth';

describe('AuditLogComponent', () => {
  let fixture: ComponentFixture<AuditLogComponent>;
  let component: AuditLogComponent;
  const auditService = {
    search: vi.fn(() => of({ content: [{
      id: 1, scope: 'TENANT', hotelId: 12, domain: 'ROOM', eventType: 'ROOM_UPDATED', aggregateType: 'ROOM',
      aggregateId: '10', actorType: 'USER', actorId: 7, reason: 'Updated', beforeState: '{"status":"DIRTY"}',
      afterState: '{"status":"AVAILABLE"}', correlationId: 'corr-1', occurredAt: '2026-08-03T04:00:00Z',
    }], totalElements: 1, totalPages: 1, number: 0, size: 25 })),
    export: vi.fn(() => of(new Blob(['id\n1'])))
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuditLogComponent],
      providers: [
        { provide: OperationalAuditService, useValue: auditService },
        { provide: AuthService, useValue: { getRoles: () => ['HOTEL_MANAGER'] } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AuditLogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders a tenant event and expands before/after state', () => {
    expect(fixture.nativeElement.textContent).toContain('ROOM_UPDATED');
    component.toggle(component.events[0]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('DIRTY');
    expect(fixture.nativeElement.textContent).toContain('AVAILABLE');
  });

  it('shows a truthful error state when the viewer is denied', () => {
    auditService.search.mockReturnValueOnce(throwError(() => new Error('denied')));
    component.load();
    fixture.detectChanges();
    expect(component.error).toContain('Không thể tải nhật ký');
  });
});
