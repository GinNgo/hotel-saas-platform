import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { RoleService } from './role.service';

describe('RoleService RBAC contract', () => {
  it('preserves GUID role and permission ids from the backend', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const service = TestBed.inject(RoleService);
    const http = TestBed.inject(HttpTestingController);
    let result: unknown;

    service.getRolePermissionsTree('8b58f955-4d16-45b0-a6e1-4f2c79b42410').subscribe(value => result = value);
    const request = http.expectOne(`${environment.apiUrl}/role-permissions/tree/8b58f955-4d16-45b0-a6e1-4f2c79b42410`);
    request.flush([{ id: 'RESERVATION', name: 'RESERVATION', functions: [{
      id: '744d15aa-7df6-4515-9559-6d27f21dc01d', code: 'CHECKIN', name: 'Check-in',
      moduleCode: 'RESERVATION', supportedActionMask: 65, actionMask: 1, isActive: true,
    }] }]);

    expect((result as any[])[0].functions[0].id).toBe('744d15aa-7df6-4515-9559-6d27f21dc01d');
    http.verify();
  });
});
