import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { AccessTokenSessionStore } from '../auth/access-token-session.store';

export interface RoomStatusRealtimeItem {
  tenantId: string;
  roomId: string | number;
  roomNumber: string;
  status: string;
}

@Injectable({ providedIn: 'root' })
export class RoomStatusRealtimeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly tokenStore = inject(AccessTokenSessionStore);
  private readonly roomStatusSubject = new Subject<RoomStatusRealtimeItem[]>();
  private connection: HubConnection | null = null;
  private consumers = 0;
  private starting: Promise<void> | null = null;

  readonly roomStatusChanged$ = this.roomStatusSubject.asObservable();

  connect(): void {
    this.consumers += 1;
    if (!isPlatformBrowser(this.platformId)) return;

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
    void connection.stop();
  }

  private getOrCreateConnection(): HubConnection {
    if (this.connection) return this.connection;

    const connection = new HubConnectionBuilder()
      .withUrl('/hubs/room-status', {
        accessTokenFactory: () => this.tokenStore.getValidToken() ?? '',
      })
      .withAutomaticReconnect([0, 2_000, 5_000, 10_000])
      .configureLogging(LogLevel.Warning)
      .build();

    connection.on('RoomStatusChanged', (rooms: RoomStatusRealtimeItem[]) => {
      if (Array.isArray(rooms)) this.roomStatusSubject.next(rooms);
    });
    this.connection = connection;
    return connection;
  }
}
