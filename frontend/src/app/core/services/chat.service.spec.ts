import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ChatService } from './chat.service';

describe('ChatService', () => {
  let service: ChatService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(ChatService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uses the principal-scoped history endpoint', () => {
    service.getMyHistory().subscribe();

    const request = http.expectOne('/api/chat/me/history');
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('uses the tenant-scoped support history endpoint', () => {
    service.getMyTenantSupportHistory().subscribe();

    const request = http.expectOne('/api/chat/tenant/history');
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('sends customer support through the principal-scoped REST endpoint', () => {
    service.createCustomerSupportMessage('help').subscribe();

    const request = http.expectOne('/api/chat/me/messages');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ content: 'help', propertyId: undefined, reservationId: undefined });
    request.flush({});
  });

  it('uses the GUID tenant support REST endpoints', () => {
    const propertyId = '0f21f652-1c7a-4db9-9bf5-2d64f47b5f32';
    service.getTenantSupportHistory(propertyId).subscribe();
    const history = http.expectOne(request => request.url === '/api/chat/tenant/history' && request.params.get('propertyId') === propertyId);
    expect(history.request.method).toBe('GET');
    history.flush([]);

    service.createTenantSupportMessage(propertyId, 'help').subscribe();
    const send = http.expectOne('/api/chat/tenant/messages');
    expect(send.request.method).toBe('POST');
    expect(send.request.body).toEqual({ propertyId, content: 'help' });
    send.flush({});
  });

  it('sends optimistic versions with platform lifecycle mutations', () => {
    service.assignConversation('conversation-id', 3).subscribe();
    const assign = http.expectOne('/api/chat/support/conversations/conversation-id/assign');
    expect(assign.request.body).toEqual({ expectedVersion: 3 });
    assign.flush({});

    service.closeConversation('conversation-id', 4).subscribe();
    const close = http.expectOne('/api/chat/support/conversations/conversation-id/close');
    expect(close.request.body).toEqual({ expectedVersion: 4 });
    close.flush({});

    service.reopenConversation('conversation-id', 5).subscribe();
    const reopen = http.expectOne('/api/chat/support/conversations/conversation-id/reopen');
    expect(reopen.request.body).toEqual({ expectedVersion: 5 });
    reopen.flush({});
  });

});
