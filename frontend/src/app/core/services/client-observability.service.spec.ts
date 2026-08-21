import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { ClientObservabilityService } from './client-observability.service';

describe('ClientObservabilityService', () => {
  let service: ClientObservabilityService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ClientObservabilityService);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('records only secret-safe HTTP metadata and a bounded correlation id', async () => {
    const eventPromise = firstValueFrom(service.events$);

    service.recordHttpFailure('POST /unsafe?token=secret', 503, ' corr / 42 ');

    const event = await eventPromise;
    expect(event).toEqual(expect.objectContaining({
      transport: 'http',
      operation: 'UNKNOWN',
      outcome: 'failure',
      status: 503,
      correlationId: 'corr-42',
    }));
    expect(Object.keys(event)).not.toContain('body');
    expect(Object.keys(event)).not.toContain('url');
    expect(JSON.stringify(event)).not.toContain('secret');
  });

  it('creates STOMP correlation ids without accepting payload data', () => {
    const correlationId = service.createCorrelationId('chat');

    expect(correlationId).toMatch(/^chat-[A-Za-z0-9-]+$/);
    expect(correlationId.length).toBeLessThanOrEqual(100);
  });

  it('records a bounded STOMP phase without broker error details', async () => {
    const eventPromise = firstValueFrom(service.events$);

    service.recordStompFailure('notification', 'socket / token=secret', 'stomp / 42');

    const event = await eventPromise;
    expect(event).toEqual(expect.objectContaining({
      transport: 'stomp',
      operation: 'notification.unknown',
      correlationId: 'stomp-42',
    }));
    expect(Object.keys(event)).not.toContain('message');
    expect(Object.keys(event)).not.toContain('reason');
    expect(JSON.stringify(event)).not.toContain('secret');
  });
});
