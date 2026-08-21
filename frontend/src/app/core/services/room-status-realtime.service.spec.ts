import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessTokenSessionStore } from '../auth/access-token-session.store';
import { HubConnection } from '@microsoft/signalr';
import { ROOM_STATUS_HUB_CONNECTION_FACTORY, RoomStatusRealtimeService } from './room-status-realtime.service';

const signalR = vi.hoisted(() => {
  const handlers = new Map<string, (payload: unknown) => void>();
  const connection = {
    state: 'Disconnected',
    start: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
    on: vi.fn((name: string, handler: (payload: unknown) => void) => handlers.set(name, handler)),
    off: vi.fn((name: string) => handlers.delete(name)),
  };
  const builder = {
    withUrl: vi.fn().mockReturnThis(),
    withAutomaticReconnect: vi.fn().mockReturnThis(),
    configureLogging: vi.fn().mockReturnThis(),
    build: vi.fn(() => connection),
  };
  return { handlers, connection, builder };
});

describe('RoomStatusRealtimeService', () => {
  beforeEach(() => {
    signalR.handlers.clear();
    signalR.connection.start.mockClear();
    signalR.connection.stop.mockClear();
    signalR.connection.on.mockClear();
    signalR.connection.off.mockClear();
    signalR.builder.withUrl.mockClear();
    signalR.builder.build.mockClear();
    TestBed.configureTestingModule({
      providers: [
        RoomStatusRealtimeService,
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: AccessTokenSessionStore, useValue: { getValidToken: () => 'valid-token' } },
        { provide: ROOM_STATUS_HUB_CONNECTION_FACTORY, useValue: () => signalR.connection as unknown as HubConnection },
      ],
    });
  });

  it('connects once and supplies the current access token', async () => {
    const service = TestBed.inject(RoomStatusRealtimeService);

    service.connect();
    service.connect();
    await Promise.resolve();

    expect(signalR.connection.start).toHaveBeenCalledTimes(1);
    expect(signalR.connection.start).toHaveBeenCalledTimes(1);
  });

  it('publishes room events and stops after the last consumer disconnects', async () => {
    const service = TestBed.inject(RoomStatusRealtimeService);
    const received: unknown[] = [];
    service.roomStatusChanged$.subscribe(event => received.push(event));

    service.connect();
    service.connect();
    signalR.handlers.get('RoomStatusChanged')?.([{ tenantId: 'tenant-a', roomId: 10, roomNumber: '101', status: 'OCCUPIED' }]);
    service.disconnect();
    expect(signalR.connection.stop).not.toHaveBeenCalled();
    service.disconnect();
    await Promise.resolve();

    expect(received).toHaveLength(1);
    expect(signalR.connection.stop).toHaveBeenCalledTimes(1);
    expect(signalR.connection.off).toHaveBeenCalledWith('RoomStatusChanged');
  });

  it('publishes reservation expiry events from the tenant hub', () => {
    const service = TestBed.inject(RoomStatusRealtimeService);
    const received: unknown[] = [];
    service.reservationExpired$.subscribe(event => received.push(event));
    service.connect();

    signalR.handlers.get('ReservationExpired')?.({
      tenantId: 'tenant-a', reservationId: 'reservation-a', bookingCode: 'LXS-001', expiredAtUtc: '2026-08-21T00:00:00Z',
    });

    expect(received).toHaveLength(1);
  });
});
