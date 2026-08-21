import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';

import { environment } from '../../../environments/environment';
import { AuthService } from './auth';

describe('AuthService social identity API', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists linked providers without client-side account merging', () => {
    service.listSocialIdentities().subscribe();
    const request = http.expectOne(`${environment.apiUrl}/auth/social-identities`);
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('posts the provider credential to the explicit link endpoint', () => {
    service.linkSocialIdentity('GOOGLE', 'verified-id-token').subscribe();
    const request = http.expectOne(`${environment.apiUrl}/auth/social-identities/google/link`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ credential: 'verified-id-token' });
    request.flush({ provider: 'GOOGLE', providerEmail: 'guest@example.com', passwordRequiredToUnlink: true });
  });

  it('sends the password only when explicitly supplied for the last unlink', () => {
    service.unlinkSocialIdentity('GOOGLE', 'Current@123').subscribe();
    const request = http.expectOne(`${environment.apiUrl}/auth/social-identities/google`);
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toEqual({ currentPassword: 'Current@123' });
    request.flush(null);
  });
});
