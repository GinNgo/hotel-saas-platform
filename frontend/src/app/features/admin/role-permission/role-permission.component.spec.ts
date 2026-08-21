import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { of } from 'rxjs';
import { AppFunction, AppModule, Role, RoleService } from '../../../core/services/role.service';
import { RolePermissionComponent } from './role-permission.component';

describe('RolePermissionComponent', () => {
  let component: RolePermissionComponent;
  let fixture: ComponentFixture<RolePermissionComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RolePermissionComponent],
      providers: [
        {
          provide: RoleService,
          useValue: {
            getRoles: () => of([]),
            getRolePermissionsTree: () => of([]),
            updateRolePermissions: () => of(1)
          }
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: () => null } } }
        }
      ]
    });
    fixture = TestBed.createComponent(RolePermissionComponent);
    component = fixture.componentInstance;
  });

  it('adds VIEW when a dependent action is enabled', () => {
    const func = functionFixture(0, 127);

    component.togglePermission(func, 64, true);

    expect(func.actionMask).toBe(65);
  });

  it('clears dependent actions when VIEW is disabled', () => {
    const func = functionFixture(71, 127);

    component.togglePermission(func, 1, false);

    expect(func.actionMask).toBe(0);
  });

  it('does not grant an unsupported action', () => {
    const func = functionFixture(1, 1);

    component.togglePermission(func, 64, true);

    expect(func.actionMask).toBe(1);
  });

  it('reports an indeterminate bulk state when only some functions have permission', () => {
    component.modules = [moduleFixture([functionFixture(1, 127), { ...functionFixture(0, 127), id: 2 }])];

    expect(component.allHavePermission(1)).toBe(false);
    expect(component.someHavePermission(1)).toBe(true);
    expect(component.moduleSomeHavePermission(component.modules[0], 1)).toBe(true);
  });

  it('asks before discarding unsaved permissions when switching roles', () => {
    const current = roleFixture(1, 'Nhân viên');
    const next = roleFixture(2, 'Quản lý');
    component.selectedRole = current;
    component.dirty = true;
    const confirmation = fixture.debugElement.injector.get(ConfirmationService);
    const confirm = vi.spyOn(confirmation, 'confirm').mockImplementation(options => options.accept?.());
    vi.spyOn(component, 'loadPermissions').mockImplementation(() => undefined);

    component.onRoleChange(next);

    expect(confirm).toHaveBeenCalled();
    expect(component.selectedRole).toBe(next);
    expect(component.loadPermissions).toHaveBeenCalled();
  });

  it('protects the browser unload when edits are dirty', () => {
    component.dirty = true;
    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;

    component.protectUnsavedChanges(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('hides decorative permission-matrix icons from assistive technology', () => {
    fixture.detectChanges();
    component.selectedRole = roleFixture(1, 'Nhân viên');
    component.modules = [moduleFixture([functionFixture(1, 127)])];
    fixture.detectChanges();

    const icons = fixture.nativeElement.querySelectorAll(
      'h2 > i, .alert-danger i, .permission-table-region td > i'
    );
    expect(icons.length).toBeGreaterThan(0);
    expect([...icons].every((icon: Element) => icon.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  function functionFixture(actionMask: number, supportedActionMask: number): AppFunction {
    return {
      id: 1,
      moduleCode: 'OPERATIONS',
      code: 'RESERVATION',
      name: 'Đặt phòng',
      actionMask,
      supportedActionMask,
      isActive: true
    };
  }

  function moduleFixture(functions: AppFunction[]): AppModule {
    return { id: 1, code: 'OPERATIONS', name: 'Vận hành', functions };
  }

  function roleFixture(id: number, name: string): Role {
    return { id, code: `ROLE_${id}`, name, description: '', version: 1 };
  }
});
