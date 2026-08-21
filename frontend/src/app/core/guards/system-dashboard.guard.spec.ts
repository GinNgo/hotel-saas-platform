import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { systemDashboardGuard } from './system-dashboard.guard';

describe('systemDashboardGuard', () => {
  let roles: string[];
  let router: { createUrlTree: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    roles = [];
    router = { createUrlTree: vi.fn(commands => ({ commands })) };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { getRoles: () => roles } },
        { provide: Router, useValue: router },
      ],
    });
  });

  it('redirects a system administrator to platform revenue', () => {
    roles = ['SUPER_ADMIN'];
    const result = TestBed.runInInjectionContext(() => systemDashboardGuard({} as never, {} as never));

    expect(router.createUrlTree).toHaveBeenCalledWith(['/admin/platform-revenue']);
    expect(result).toEqual({ commands: ['/admin/platform-revenue'] });
  });

  it('keeps hotel operators on the operational dashboard', () => {
    roles = ['HOTEL_MANAGER'];
    const result = TestBed.runInInjectionContext(() => systemDashboardGuard({} as never, {} as never));

    expect(result).toBe(true);
  });
});
