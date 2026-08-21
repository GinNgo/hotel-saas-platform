import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, Subject, finalize, shareReplay, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { isPlatformBrowser } from '@angular/common';
import { AccessTokenSessionStore } from '../auth/access-token-session.store';

export interface AuthState {
  isAuthenticated: boolean;
  userId?: string | number | null;
  username: string;
  fullName: string;
  avatarUrl: string;
  roles: string[];
  permissions: AuthPermission[];
  assignedProperties?: Array<{ id?: string | number; active?: boolean }>;
  defaultPortal?: 'client' | 'management' | 'admin';
  defaultRoute?: string;
  activePropertyId?: string | number | null;
}

export interface AuthPermission {
  function: string;
  actionMask: number;
}

export interface AuthResponse {
  accessToken: string;
  userId?: string | number;
  id?: string | number;
  username: string;
  roles: string[];
  permissions: AuthPermission[];
  assignedProperties?: Array<{ id?: string | number; active?: boolean }>;
  defaultPortal?: 'client' | 'management' | 'admin';
  defaultRoute?: string;
  activePropertyId?: string | number | null;
}

export interface AuthSessionUser {
  id?: string | number;
  userId?: string | number;
  username?: string;
  fullName?: string;
  avatarUrl?: string;
  roles?: string[];
  permissions?: AuthPermission[];
  assignedProperties?: Array<{ id?: string | number; active?: boolean }>;
  defaultPortal?: 'client' | 'management' | 'admin';
  defaultRoute?: string;
  activePropertyId?: string | number | null;
}

export interface RegistrationResponse {
  message: string;
  welcomeEmailSent: boolean;
  verificationEmailSent?: boolean;
}

export interface PasswordResetResponse {
  message: string;
}

export type SocialProvider = 'GOOGLE' | 'FACEBOOK';

export interface SocialIdentity {
  provider: SocialProvider;
  providerEmail: string;
  linkedAt?: string;
  lastLoginAt?: string;
  passwordRequiredToUnlink: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);
  private tokenStore = inject(AccessTokenSessionStore);
  private apiUrl = `${environment.apiUrl}/auth`;
  private expiryTimer?: ReturnType<typeof setTimeout>;
  private refreshRequest$?: Observable<AuthResponse>;
  private readonly logoutSubject = new Subject<void>();

  private authStateSubject = new BehaviorSubject<AuthState>({
    isAuthenticated: false,
    userId: null,
    username: '',
    fullName: '',
    avatarUrl: '',
    roles: [],
    permissions: []
  });

  public currentUser$ = this.authStateSubject.asObservable();
  public logout$ = this.logoutSubject.asObservable();

  constructor() {
    this.initAuthState();
  }

  private initAuthState() {
    if (isPlatformBrowser(this.platformId)) {
      const token = this.tokenStore.getValidToken();
      const userStr = localStorage.getItem('user');

      if (!token || !userStr) {
        if (token || userStr) this.clearAuthState();
        return;
      }

      try {
        const user = JSON.parse(userStr);
        this.authStateSubject.next({
          isAuthenticated: true,
          userId: this.resolveUserId(user),
          username: user.username || '',
          fullName: user.fullName || '',
          avatarUrl: user.avatarUrl || '',
          roles: user.roles || [],
          permissions: user.permissions || [],
        });
        this.scheduleSessionExpiry(token);
      } catch {
        this.clearAuthState();
      }
    }
  }

  private clearAuthState() {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = undefined;
    }
    this.tokenStore.clearToken();
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem('user');
      localStorage.removeItem('permissions');
    }
    this.authStateSubject.next({
      isAuthenticated: false,
      userId: null,
      username: '',
      fullName: '',
      avatarUrl: '',
      roles: [],
      permissions: []
    });
    this.logoutSubject.next();
  }

  login(credentials: { username: string; password: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, credentials, { withCredentials: true });
  }

  requestPasswordReset(email: string): Observable<PasswordResetResponse> {
    return this.http.post<PasswordResetResponse>(`${this.apiUrl}/forgot-password`, { email });
  }

  resetPassword(token: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/reset-password`, { token, newPassword });
  }

  register(userData: any): Observable<RegistrationResponse> {
    return this.http.post<RegistrationResponse>(`${this.apiUrl}/register`, userData);
  }

  googleLogin(idToken: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/google`, { idToken }, { withCredentials: true });
  }

  facebookLogin(accessToken: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/facebook`, { accessToken }, { withCredentials: true });
  }

  listSocialIdentities(): Observable<SocialIdentity[]> {
    return this.http.get<SocialIdentity[]>(`${this.apiUrl}/social-identities`);
  }

  linkSocialIdentity(provider: SocialProvider, credential: string): Observable<SocialIdentity> {
    return this.http.post<SocialIdentity>(
      `${this.apiUrl}/social-identities/${provider.toLowerCase()}/link`,
      { credential },
    );
  }

  unlinkSocialIdentity(provider: SocialProvider, currentPassword?: string): Observable<void> {
    const body = currentPassword ? { currentPassword } : undefined;
    return this.http.delete<void>(`${this.apiUrl}/social-identities/${provider.toLowerCase()}`, { body });
  }

  refreshAccessToken(): Observable<AuthResponse> {
    if (!isPlatformBrowser(this.platformId)) {
      return new Observable<AuthResponse>(subscriber => subscriber.error(new Error('Refresh is browser-only.')));
    }
    if (!this.refreshRequest$) {
      this.refreshRequest$ = this.http.post<AuthResponse>(`${this.apiUrl}/refresh`, {}, {
        withCredentials: true,
        headers: { 'X-Refresh-Request': '1' },
      }).pipe(
        tap(response => this.setSession(response.accessToken, this.sessionUserFor(response))),
        finalize(() => { this.refreshRequest$ = undefined; }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.refreshRequest$;
  }

  canRefreshSession(): boolean {
    return this.authStateSubject.value.isAuthenticated;
  }

  logout(): void {
    const accessToken = this.tokenStore.getValidToken();
    this.clearAuthState();
    if (isPlatformBrowser(this.platformId) && typeof fetch === 'function') {
      const headers: Record<string, string> = { 'X-Logout-Request': '1' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
      void fetch(`${this.apiUrl}/logout`, {
        method: 'POST',
        credentials: 'include',
        headers,
      }).catch(() => undefined);
    }
  }

  isLoggedIn(): boolean {
    if (this.authStateSubject.value.isAuthenticated && !this.tokenStore.getValidToken()) {
      this.clearAuthState();
      return false;
    }
    return this.authStateSubject.value.isAuthenticated;
  }

  getAuthState(): AuthState {
    return this.authStateSubject.value;
  }
  
  // This method should be called right after successful login
  // to update the local state.
  setSession(token: string, user: AuthSessionUser): void {
    if (isPlatformBrowser(this.platformId)) {
      if (!this.tokenStore.saveToken(token)) {
        this.clearAuthState();
        return;
      }
      localStorage.setItem('user', JSON.stringify(user));
    }
    this.authStateSubject.next({
      isAuthenticated: true,
      userId: this.resolveUserId(user),
      username: user.username || '',
      fullName: user.fullName || '',
      avatarUrl: user.avatarUrl || '',
      roles: user.roles || [],
      permissions: user.permissions || []
      , assignedProperties: user.assignedProperties,
      defaultPortal: user.defaultPortal,
      defaultRoute: user.defaultRoute,
      activePropertyId: user.activePropertyId
    });
    this.scheduleSessionExpiry(token);
  }

  updateCurrentUser(user: { id?: string | number; userId?: string | number; username?: string; fullName?: string; avatarUrl?: string | null }): void {
    const currentState = this.authStateSubject.value;
    if (!currentState.isAuthenticated) return;

    const nextState: AuthState = {
      ...currentState,
      userId: this.resolveUserId(user) ?? currentState.userId,
      username: user.username ?? currentState.username,
      fullName: user.fullName ?? currentState.fullName,
      avatarUrl: user.avatarUrl ?? ''
    };

    if (
      nextState.userId === currentState.userId
      && nextState.username === currentState.username
      && nextState.fullName === currentState.fullName
      && nextState.avatarUrl === currentState.avatarUrl
    ) return;

    if (isPlatformBrowser(this.platformId)) {
      const storedUser = localStorage.getItem('user');
      let sessionUser: Record<string, unknown> = {};
      try {
        sessionUser = storedUser ? JSON.parse(storedUser) : {};
      } catch {
        sessionUser = {};
      }
      localStorage.setItem('user', JSON.stringify({
        ...sessionUser,
        id: nextState.userId ?? undefined,
        username: nextState.username,
        fullName: nextState.fullName,
        avatarUrl: nextState.avatarUrl
      }));
    }

    this.authStateSubject.next(nextState);
  }

  getRoles(): string[] {
    return this.getAuthState().roles;
  }

  getPermissions(): AuthPermission[] {
    return this.getAuthState().permissions;
  }

  getAccessToken(): string | null {
    const token = this.tokenStore.getValidToken();
    if (!token && this.authStateSubject.value.isAuthenticated) this.clearAuthState();
    return token;
  }

  getCurrentUserId(): string | number | null {
    return this.authStateSubject.value.userId ?? null;
  }

  private sessionUserFor(response: AuthResponse): AuthSessionUser {
    let storedUser: AuthSessionUser = {};
    try {
      const rawUser = localStorage.getItem('user');
      storedUser = rawUser ? JSON.parse(rawUser) as AuthSessionUser : {};
    } catch {
      storedUser = {};
    }
    return {
      ...storedUser,
      id: response.userId ?? response.id ?? storedUser.id,
      userId: response.userId ?? response.id ?? storedUser.userId ?? storedUser.id,
      username: response.username || storedUser.username,
      roles: response.roles || storedUser.roles || [],
      permissions: response.permissions || storedUser.permissions || [],
      assignedProperties: response.assignedProperties ?? storedUser.assignedProperties,
      defaultPortal: response.defaultPortal ?? storedUser.defaultPortal,
      defaultRoute: response.defaultRoute ?? storedUser.defaultRoute,
      activePropertyId: response.activePropertyId ?? storedUser.activePropertyId,
    };
  }

  private resolveUserId(user: { id?: unknown; userId?: unknown }): string | number | null {
    const candidate = user.id ?? user.userId;
    if (typeof candidate === 'number' && Number.isInteger(candidate) && candidate > 0) return candidate;
    if (typeof candidate === 'string' && /^\d+$/.test(candidate)) return Number(candidate);
    if (typeof candidate === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)) return candidate;
    return null;
  }

  private scheduleSessionExpiry(token: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.expiryTimer) clearTimeout(this.expiryTimer);

    const delay = this.tokenStore.millisecondsUntilExpiry(token);
    if (delay <= 0) {
      this.clearAuthState();
      return;
    }
    this.expiryTimer = setTimeout(() => this.clearAuthState(), delay);
  }
}
