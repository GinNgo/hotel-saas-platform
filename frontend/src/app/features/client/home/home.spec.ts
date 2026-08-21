import { ChangeDetectorRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { AuthService } from '../../../core/services/auth';
import { ClientApiService } from '../../../core/services/client-api.service';
import { LayoutStateService } from '../../../core/services/layout-state.service';
import { HomeComponent } from './home';
import { HomeSearchStateService } from './services/home-search-state.service';

describe('HomeComponent partner entry', () => {
  it('sends unauthenticated users to login with the partner return URL', () => {
    const navigate = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { navigate } },
        { provide: ClientApiService, useValue: {} },
        { provide: LayoutStateService, useValue: { hideMainHeader: { set: vi.fn() } } },
        { provide: HomeSearchStateService, useValue: { bookingQueryParams: vi.fn(() => ({})) } },
        { provide: AuthService, useValue: { getAuthState: vi.fn(() => ({ isAuthenticated: false })) } },
        { provide: ChangeDetectorRef, useValue: { detectChanges: vi.fn() } }
      ]
    });

    const component = TestBed.runInInjectionContext(() => new HomeComponent());
    component.openOwnerPortal();

    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/partner/register' } });
  });
});
