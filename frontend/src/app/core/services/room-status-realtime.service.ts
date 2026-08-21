import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, InjectionToken, PLATFORM_ID } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { AccessTokenSessionStore } from '../auth/access-token-session.store';

export interface RoomStatusRealtimeItem {
  tenantId: string;
  roomId: string | number;
  roomNumber: string;
  status: string;
}

export interface ReservationExpiredRealtimeEvent {
  tenantId: string;
  reservationId: string;
  bookingCode: string;
  expiredAtUtc: string;
}

export const ROOM_STATUS_HUB_CONNECTION_FACTORY = new InjectionToken<() => HubConnection>(
  'ROOM_STATUS_HUB_CONNECTION_FACTORY',
  {
    providedIn: 'root',
    factory: () => {
      const tokenStore = inject(AccessTokenSessionStore);
      const platformId = inject(PLATFORM_ID);
      return () => new HubConnectionBuilder()
        .withUrl(`${isPlatformBrowser(platformId) ? window.location.origin : 'http://localhost'}/hubs/room-status`, {
          accessTokenFactory: () => tokenStore.getValidToken() ?? '',
        })
        .withAutomaticReconnect([0, 2_000, 5_000, 10_000])
        .configureLogging(LogLevel.Warning)
        .build();
    },
  },
);

@Injectable({ providedIn: 'root' })
export class RoomStatusRealtimeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly tokenStore = inject(AccessTokenSessionStore);
  private readonly connectionFactory = inject(ROOM_STATUS_HUB_CONNECTION_FACTORY);
  private readonly roomStatusSubject = new Subject<RoomStatusRealtimeItem[]>();
  private readonly reservationExpiredSubject = new Subject<ReservationExpiredRealtimeEvent>();
  private connection: HubConnection | null = null;
  private consumers = 0;
  private starting: Promise<void> | null = null;

  readonly roomStatusChanged$ = this.roomStatusSubject.asObservable();
  readonly reservationExpired$ = this.reservationExpiredSubject.asObservable();

  connect(): void {
    this.consumers += 1;
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.tokenStore.getValidToken()) return;

    const connection = this.getOrCreateConnection();
    if (connection.state !== HubConnectionState.Disconnected || this.starting) return;

    this.starting = connection.start()
      .catch(() => undefined)
      .finally(() => { this.starting = null; });
  }

  disconnect(): void {
    this.consumers = Math.max(0, this.consumers - 1);
    if (this.consumers > 0 || !this.connection) return;

    const connection = this.connection;
    this.connection = null;
    connection.off('RoomStatusChanged');
    connection.off('ReservationExpired');
    void connection.stop();
  }

  private getOrCreateConnection(): HubConnection {
    if (this.connection) return this.connection;

    const connection = this.connectionFactory();

    connection.on('RoomStatusChanged', (rooms: RoomStatusRealtimeItem[]) => {
      if (Array.isArray(rooms)) this.roomStatusSubject.next(rooms);
    });
    connection.on('ReservationExpired', (event: ReservationExpiredRealtimeEvent) => {
      if (event?.reservationId) this.reservationExpiredSubject.next(event);
    });
    this.connection = connection;
    return connection;
  }

}
