import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { Sidebar } from './sidebar';
import { AuthService } from '../../core/services/auth';

describe('Sidebar', () => {
  let http: HttpTestingController;
  let roles: string[];

  beforeEach(async () => {
    roles = [];
    await TestBed.configureTestingModule({
      imports: [Sidebar],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: { getRoles: () => roles } },
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('keeps only authorized unique routes returned by API', () => {
    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();

    http.expectOne(`${environment.apiUrl}/auth/my-menu`).flush([
      {
        id: 1,
        code: 'SYSTEM',
        name: 'Hệ thống',
        functions: [
          { id: 1, code: 'USERS', name: 'Người dùng', url: '/admin/users', icon: 'people' },
          { id: 2, code: 'USERS', name: 'Trùng mã', url: '/admin/accounts', icon: 'people' },
          { id: 3, code: 'ROLES', name: 'Trùng route', url: '/admin/users', icon: 'shield' },
          { id: 4, code: 'EMPTY', name: 'Không có route', url: '', icon: 'block' },
        ],
      },
    ]);

    expect(fixture.componentInstance.isLoading).toBe(false);
    expect(fixture.componentInstance.errorMessage).toBe('');
    expect(fixture.componentInstance.menuItems).toHaveLength(1);
    expect(fixture.componentInstance.menuItems[0].functions.map((item) => item.code)).toEqual([
      'USERS',
    ]);
  });

  it('shows recoverable error and retries menu request', () => {
    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();

    http
      .expectOne(`${environment.apiUrl}/auth/my-menu`)
      .flush({}, { status: 500, statusText: 'Server Error' });

    expect(fixture.componentInstance.isLoading).toBe(false);
    expect(fixture.componentInstance.errorMessage).toBe('Không thể tải menu theo quyền.');

    fixture.componentInstance.loadMenu();
    expect(fixture.componentInstance.isLoading).toBe(true);

    http.expectOne(`${environment.apiUrl}/auth/my-menu`).flush([]);
    expect(fixture.componentInstance.errorMessage).toBe('');
    expect(fixture.componentInstance.menuItems).toEqual([]);
  });

  it('removes tenant operations and points system administrators to platform revenue', () => {
    roles = ['SUPER_ADMIN'];
    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();

    http.expectOne(`${environment.apiUrl}/auth/my-menu`).flush([
      {
        id: 1,
        code: 'SYSTEM',
        name: 'Hệ thống',
        functions: [{ id: 1, code: 'REPORT', name: 'Bảng điều khiển', url: '/admin/dashboard', icon: 'chart' }],
      },
      {
        id: 2,
        code: 'HOTEL',
        name: 'Khách sạn',
        functions: [{ id: 2, code: 'ROOM', name: 'Phòng', url: '/admin/rooms', icon: 'home' }],
      },
    ]);

    expect(fixture.componentInstance.menuItems.map(module => module.code)).toEqual(['SYSTEM']);
    expect(fixture.componentInstance.menuItems[0].functions[0]).toMatchObject({
      name: 'Doanh thu hệ thống',
      url: '/admin/platform-revenue',
    });
  });
});
