import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface EmailVerificationDispatch {
  message: string;
  emailSent: boolean;
  alreadyVerified: boolean;
  pendingEmail?: string | null;
}

export interface EmailVerificationResult {
  message: string;
  emailChanged: boolean;
  email: string;
}

@Injectable({ providedIn: 'root' })
export class EmailVerificationService {
  private readonly http = inject(HttpClient);
  private readonly authUrl = `${environment.apiUrl}/auth/email-verification`;
  private readonly userUrl = `${environment.apiUrl}/users/me`;

  confirm(token: string): Observable<EmailVerificationResult> {
    return this.http.post<EmailVerificationResult>(`${this.authUrl}/confirm`, { token });
  }

  resend(): Observable<EmailVerificationDispatch> {
    return this.http.post<EmailVerificationDispatch>(`${this.userUrl}/email-verification/resend`, {});
  }

  requestEmailChange(newEmail: string): Observable<EmailVerificationDispatch> {
    return this.http.post<EmailVerificationDispatch>(`${this.userUrl}/email-change`, { newEmail });
  }
}
