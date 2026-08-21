import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { ClientApiService } from '@app/core/services/client-api.service';
import { RoleService } from '@app/core/services/role.service';
import { User, UserService } from '@app/core/services/user';
import { UserManagement } from './user-management';
import { AuthService } from '@app/core/services/auth';

describe('UserManagement staff lifecycle', () => {
  const staff: User = {
    id: 42,
    username: 'staff-42',
    email: 'staff42@example.com',
    fullName: 'Nguyen Staff',
    roles: [{ id: 3, code: 'RECEPTIONIST', name: 'Le tan' }],
    status: 'INACTIVE',
    createdAt: '2026-01-01T00:00:00',
    staffAssignments: [
      { id: 1, hotelId: 10, hotelName: 'LuxeStay Da Nang', status: 'ACTIVE' },
      {
        id: 2,
        hotelId: 11,
        hotelName: 'LuxeStay Hue',
        status: 'INACTIVE',
        statusReason: 'Previous contract ended',
      },
    ],
  };

  let userService: {
    getUsers: ReturnType<typeof vi.fn>;
    createUser: ReturnType<typeof vi.fn>;
    updateUser: ReturnType<typeof vi.fn>;
    deactivateStaff: ReturnType<typeof vi.fn>;
    reactivateStaff: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    userService = {
      getUsers: vi.fn(() => of([staff])),
      createUser: vi.fn(() => of(staff)),
      updateUser: vi.fn(() => of(staff)),
      deactivateStaff: vi.fn(() => of(staff)),
      reactivateStaff: vi.fn(() => of(staff)),
    };

    await TestBed.configureTestingModule({
      imports: [UserManagement],
      providers: [
        { provide: UserService, useValue: userService },
        { provide: RoleService, useValue: { getRoles: () => of([]) } },
        { provide: ClientApiService, useValue: { getAccessibleHotels: () => of([]) } },
        { provide: AuthService, useValue: { getRoles: () => ['PROPERTY_OWNER'], getCurrentUserId: () => 99 } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { data: { userType: 'STAFF' } }, data: of({ userType: 'STAFF' }) },
        },
      ],
    }).compileComponents();
  });

  it('renders active and historical staff assignments without a destructive delete action', async () => {
    const fixture = TestBed.createComponent(UserManagement);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('LuxeStay Da Nang · Đang làm');
    expect(element.textContent).toContain('LuxeStay Hue · Đã nghỉ');
    expect(element.querySelector('[aria-label^="Ngừng quyền truy cập"]')).not.toBeNull();
    expect(element.querySelector('[aria-label^="Tuyển lại"]')).not.toBeNull();
    expect(element.querySelector('[aria-label^="Xóa"]')).toBeNull();
  });

  it('requires a reason and calls the rehire endpoint for the selected historical property', () => {
    const fixture = TestBed.createComponent(UserManagement);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.openLifecycle(staff, 'reactivate');
    expect(component.lifecycleHotelId).toBe(11);
    component.lifecycleReason = 'New seasonal contract';
    component.submitLifecycle();

    expect(userService.reactivateStaff).toHaveBeenCalledWith(42, {
      hotelId: 11,
      reason: 'New seasonal contract',
    });
  });

  it('loads only tenant-accessible properties for staff assignment', () => {
    const hotelService = TestBed.inject(ClientApiService);
    const accessibleSpy = vi.spyOn(hotelService, 'getAccessibleHotels');

    const fixture = TestBed.createComponent(UserManagement);
    fixture.detectChanges();

    expect(accessibleSpy).toHaveBeenCalled();
  });

  it('does not expose protected or customer roles to a property owner', () => {
    const fixture = TestBed.createComponent(UserManagement);
    const component = fixture.componentInstance;
    component.roles = [
      { id: 1, code: 'SUPER_ADMIN', name: 'Super Admin', description: '', systemRole: true },
      { id: 2, code: 'CUSTOMER', name: 'Khách hàng', description: '', systemRole: true },
      { id: 3, code: 'RECEPTIONIST', name: 'Lễ tân', description: '', systemRole: false, status: 'ACTIVE' },
      { id: 4, code: 'OLD_ROLE', name: 'Đã khóa', description: '', systemRole: false, status: 'INACTIVE' },
    ];

    expect(component.assignableRoles.map(role => role.code)).toEqual(['RECEPTIONIST']);
  });

  it('validates required staff identity, password, role and property', () => {
    const fixture = TestBed.createComponent(UserManagement);
    const component = fixture.componentInstance;
    component.openNew();
    component.userForm.username = 'ab';
    component.userForm.email = 'invalid';
    component.userForm.password = 'short';

    expect(component.userFormValid).toBe(false);
    expect(component.usernameError).toContain('3-50');
    expect(component.emailError).toContain('định dạng');
    expect(component.passwordError).toContain('8');
  });

  it('blocks lifecycle actions for the current account', () => {
    const fixture = TestBed.createComponent(UserManagement);
    const component = fixture.componentInstance;
    const self = { ...staff, id: 99 };
    const lifecycleSpy = vi.spyOn(userService, 'deactivateStaff');

    component.openLifecycle(self, 'deactivate');
    component.lifecycleReason = 'Self lock';
    component.submitLifecycle();

    expect(component.lifecycleDialogVisible).toBe(false);
    expect(lifecycleSpy).not.toHaveBeenCalled();
  });
});
