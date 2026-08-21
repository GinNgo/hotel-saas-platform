import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of, Subject } from 'rxjs';

import { AuthService } from '../../../core/services/auth';
import { ChatService } from '../../../core/services/chat.service';
import { PermissionService } from '../../../core/services/permission.service';
import { SystemSupportComponent } from './system-support.component';

describe('SystemSupportComponent', () => {
  let fixture: ComponentFixture<SystemSupportComponent>;
  let component: SystemSupportComponent;
  const propertyId = '0f21f652-1c7a-4db9-9bf5-2d64f47b5f32';
  const createTenantSupportMessage = vi.fn(() => of({ id: 'message-id', conversationId: 'conversation-id', propertyId, senderId: 'user-id', content: 'Cần hỗ trợ' }));
  const getTenantSupportHistory = vi.fn(() => of([]));

  beforeEach(async () => {
    createTenantSupportMessage.mockClear();
    getTenantSupportHistory.mockClear();
    await TestBed.configureTestingModule({
      imports: [SystemSupportComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { queryParamMap: of({ get: (key: string) => key === 'propertyId' ? propertyId : null }) } },
        { provide: AuthService, useValue: { getCurrentUserId: () => 'user-id' } },
        { provide: PermissionService, useValue: { hasPermission: () => true } },
        {
          provide: ChatService,
          useValue: {
            connect: vi.fn(),
            disconnect: vi.fn(),
            message$: new Subject(),
            connectionState$: of('connected'),
            connectionError$: of(''),
            getTenantSupportHistory,
            createTenantSupportMessage,
            isConnected: () => true,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SystemSupportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('sends the request with the active tenant property', () => {
    component.newMessage = 'Cần hỗ trợ';
    component.sendMessage();

    expect(createTenantSupportMessage).toHaveBeenCalledWith(propertyId, 'Cần hỗ trợ');
  });

  it('unlocks the composer after the REST acknowledgement arrives', () => {
    component.newMessage = 'Cần hỗ trợ';

    component.sendMessage();
    expect(component.isSending()).toBe(false);
    expect(component.messages()).toHaveLength(1);
  });

  it('refreshes tenant history in the background', () => {
    vi.useFakeTimers();
    getTenantSupportHistory.mockClear();
    (component as unknown as { startBackgroundSync(): void }).startBackgroundSync();

    vi.advanceTimersByTime(15_000);

    expect(getTenantSupportHistory).toHaveBeenCalledWith(propertyId);
    expect(component.historyState()).toBe('ready');
    vi.useRealTimers();
  });
});
