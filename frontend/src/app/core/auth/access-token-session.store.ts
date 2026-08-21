import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';

const TOKEN_KEY = 'token';
const EXPIRY_SKEW_MS = 5_000;

export type AccessTokenStatus = 'valid' | 'expired' | 'malformed';

export interface AccessTokenInspection {
  expiresAt: number | null;
  status: AccessTokenStatus;
}

export function inspectAccessToken(token: string, now = Date.now()): AccessTokenInspection {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return { expiresAt: null, status: 'malformed' };

    const payload = JSON.parse(decodeBase64Url(parts[1])) as { exp?: unknown };
    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
      return { expiresAt: null, status: 'malformed' };
    }

    const expiresAt = payload.exp * 1_000;
    return {
      expiresAt,
      status: expiresAt > now + EXPIRY_SKEW_MS ? 'valid' : 'expired',
    };
  } catch {
    return { expiresAt: null, status: 'malformed' };
  }
}

@Injectable({ providedIn: 'root' })
export class AccessTokenSessionStore {
  private readonly platformId = inject(PLATFORM_ID);

  getValidToken(now = Date.now()): string | null {
    const token = this.readToken();
    if (!token) return null;

    if (inspectAccessToken(token, now).status !== 'valid') {
      this.clearToken();
      return null;
    }
    return token;
  }

  saveToken(token: string, now = Date.now()): boolean {
    if (!this.isBrowser() || inspectAccessToken(token, now).status !== 'valid') {
      this.clearToken();
      return false;
    }

    sessionStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem(TOKEN_KEY);
    return true;
  }

  clearToken(): void {
    if (!this.isBrowser()) return;
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }

  millisecondsUntilExpiry(token: string, now = Date.now()): number {
    const inspection = inspectAccessToken(token, now);
    return inspection.status === 'valid' && inspection.expiresAt !== null
      ? inspection.expiresAt - now
      : 0;
  }

  private readToken(): string | null {
    if (!this.isBrowser()) return null;

    const current = sessionStorage.getItem(TOKEN_KEY);
    if (current) return current;

    const legacy = localStorage.getItem(TOKEN_KEY);
    if (!legacy) return null;

    sessionStorage.setItem(TOKEN_KEY, legacy);
    localStorage.removeItem(TOKEN_KEY);
    return legacy;
  }

  private isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  return atob(normalized + padding);
}
