import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth';
import { PartnerOverviewComponent } from './partner-overview.component';

describe('PartnerOverviewComponent', () => {
  let http: HttpTestingController;
  let routeData: Record<string, string>;
  let roles: string[];

  beforeEach(async () => {
    routeData = { title: 'Chủ cơ sở', endpoint: 'property-owners' };
    roles = [];
    await TestBed.configureTestingModule({
      imports: [PartnerOverviewComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useFactory: () => ({ snapshot: { data: routeData } }) },
        { provide: AuthService, useValue: { getRoles: () => roles } },
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('renders endpoint-specific columns instead of raw API keys', async () => {
    const fixture = TestBed.createComponent(PartnerOverviewComponent);
    fixture.detectChanges();

    http.expectOne(`${environment.apiUrl}/admin/property-owners`).flush([
      { user_id: 1, full_name: 'Owner One', email: 'owner@example.com', property_count: 2, plan_code: 'PRO' },
    ]);
    await fixture.whenStable();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Owner One');
    expect(element.textContent).toContain('Gói dịch vụ');
    expect(element.textContent).not.toContain('FULL_NAME');
    expect(element.querySelector('table')).not.toBeNull();
  });

  it('renders an explicit permission state for a denied endpoint', async () => {
    const fixture = TestBed.createComponent(PartnerOverviewComponent);
    fixture.detectChanges();

    http.expectOne(`${environment.apiUrl}/admin/property-owners`).flush(
      { message: 'Forbidden' },
      { status: 403, statusText: 'Forbidden' },
    );
    await fixture.whenStable();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Bạn không có quyền truy cập');
    expect(element.textContent).toContain('Về bảng điều khiển');
    expect(element.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('uses the real property approval endpoint for the approve action', async () => {
    routeData = { title: 'Duyệt cơ sở', endpoint: 'property-approvals' };
    roles = ['ADMIN'];

    const fixture = TestBed.createComponent(PartnerOverviewComponent);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/admin/property-approvals`).flush([
      { id: 7, name_vi: 'Hotel One', approval_status: 'PENDING_APPROVAL' },
    ]);
    await fixture.whenStable();

    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    const approveButton = Array.from(buttons).find(button => button.textContent?.includes('Duyệt cơ sở'));
    expect(approveButton).toBeDefined();
    if (!approveButton) throw new Error('Approve action was not rendered');
    approveButton.click();

    http.expectOne(`${environment.apiUrl}/v1/hotels/7/approve`).flush({ id: 7 });
    http.expectOne(`${environment.apiUrl}/admin/property-approvals`).flush([]);
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Đã duyệt cơ sở.');
  });
});
