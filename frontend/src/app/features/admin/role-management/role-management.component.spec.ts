import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Subject, of } from 'rxjs';
import { PermissionService } from '../../../core/services/permission.service';
import { Role, RoleService } from '../../../core/services/role.service';
import { RoleManagementComponent } from './role-management.component';

describe('RoleManagementComponent', () => {
  let component: RoleManagementComponent;
  let fixture: ComponentFixture<RoleManagementComponent>;
  let roleService: { getRoles: ReturnType<typeof vi.fn>; createRole: ReturnType<typeof vi.fn>; updateRole: ReturnType<typeof vi.fn>; deleteRole: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    roleService = {
      getRoles: vi.fn(() => of([])),
      createRole: vi.fn(role => of(role)),
      updateRole: vi.fn((_id, role) => of(role)),
      deleteRole: vi.fn(() => of(undefined)),
    };
    await TestBed.configureTestingModule({
      imports: [RoleManagementComponent],
      providers: [
        { provide: RoleService, useValue: roleService },
        { provide: PermissionService, useValue: { hasPermission: () => true } },
        { provide: Router, useValue: { events: new Subject(), navigate: vi.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(RoleManagementComponent);
    component = fixture.componentInstance;
  });

  it('validates role codes and prevents duplicate codes', () => {
    component.roles = [roleFixture({ id: 1, code: 'ACCOUNTANT' })];
    component.openNew();
    component.roleForm.code = 'accountant';
    component.roleForm.name = 'Kế toán khác';

    expect(component.codeError).toContain('đã tồn tại');
    expect(component.roleFormValid).toBe(false);

    component.roleForm.code = 'FRONT DESK';
    expect(component.codeError).toContain('3-50 ký tự');
  });

  it('keeps the role code immutable while editing', async () => {
    component.editRole(roleFixture({ code: 'FRONT_DESK', name: 'Lễ tân' }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect((document.querySelector('#code') as HTMLInputElement).disabled).toBe(true);
    expect(document.body.textContent).toContain('không thể thay đổi sau khi tạo');
  });

  it('does not delete a role that is assigned to users', () => {
    const messages = fixture.debugElement.injector.get(MessageService);
    const add = vi.spyOn(messages, 'add');

    component.deleteRole(roleFixture({ userCount: 3 }));

    expect(roleService.deleteRole).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ summary: 'Vai trò đang được sử dụng' }));
  });

  it('asks before closing a dirty role form', () => {
    component.openNew();
    component.roleForm.name = 'Kế toán';
    const confirmation = fixture.debugElement.injector.get(ConfirmationService);
    const confirm = vi.spyOn(confirmation, 'confirm').mockImplementation(options => options.accept?.());

    component.requestCloseDialog();

    expect(confirm).toHaveBeenCalled();
    expect(component.displayDialog).toBe(false);
  });

  function roleFixture(overrides: Partial<Role> = {}): Role {
    return { id: 7, code: 'ACCOUNTANT', name: 'Kế toán', description: '', status: 'ACTIVE', systemRole: false, userCount: 0, version: 1, ...overrides };
  }
});
