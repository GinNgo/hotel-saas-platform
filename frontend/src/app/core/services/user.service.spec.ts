import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { UserService } from './user';

describe('UserService RBAC adapter', () => {
  let service: UserService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(UserService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('maps the GUID staff contract into the legacy User view model', () => {
    service.getUsers().subscribe(users => {
      expect(users[0].id).toBe('4f7c2dd4-7b5b-4fc8-8ad4-8b2e6b08d9d1');
      expect(users[0].roles[0]).toEqual({ id: '0e6b3b91-82b2-47d7-a4c6-bf24e1d5c2d0', code: 'RECEPTIONIST', name: 'RECEPTIONIST' });
      expect(users[0].hotel).toEqual({ id: 'd5c2c3b4-6fb5-4d9e-a3ca-0d7f1d95d1b0', name: 'Demo Hotel' });
    });
    const request = http.expectOne(`${environment.apiUrl}/users`);
    expect(request.request.method).toBe('GET');
    request.flush([{ id: '4f7c2dd4-7b5b-4fc8-8ad4-8b2e6b08d9d1', username: 'staff', email: 'staff@example.com', fullName: 'Staff', roleId: '0e6b3b91-82b2-47d7-a4c6-bf24e1d5c2d0', role: 'RECEPTIONIST', isActive: true, tenantId: 'd5c2c3b4-6fb5-4d9e-a3ca-0d7f1d95d1b0', tenantName: 'Demo Hotel' }]);
  });

  it('assigns a GUID role using the dedicated endpoint', () => {
    service.assignRole('4f7c2dd4-7b5b-4fc8-8ad4-8b2e6b08d9d1', '0e6b3b91-82b2-47d7-a4c6-bf24e1d5c2d0').subscribe();
    const request = http.expectOne(`${environment.apiUrl}/users/4f7c2dd4-7b5b-4fc8-8ad4-8b2e6b08d9d1/role`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ roleId: '0e6b3b91-82b2-47d7-a4c6-bf24e1d5c2d0' });
    request.flush({ id: '4f7c2dd4-7b5b-4fc8-8ad4-8b2e6b08d9d1', username: 'staff', email: 'staff@example.com', fullName: 'Staff', roleId: '0e6b3b91-82b2-47d7-a4c6-bf24e1d5c2d0', role: 'RECEPTIONIST', isActive: true, tenantId: 'd5c2c3b4-6fb5-4d9e-a3ca-0d7f1d95d1b0', tenantName: 'Demo Hotel' });
  });
});
