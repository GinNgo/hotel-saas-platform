import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { ModuleManagementComponent } from './module-management';

describe('ModuleManagementComponent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModuleManagementComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('groups the GUID permission catalog by authoritative module code', async () => {
    const fixture = TestBed.createComponent(ModuleManagementComponent);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/modules`).flush([
      { id: 'RESERVATION', code: 'RESERVATION', name: 'RESERVATION' },
    ]);
    http.expectOne(`${environment.apiUrl}/functions`).flush([
      {
        id: '744d15aa-7df6-4515-9559-6d27f21dc01d', code: 'CHECKIN', name: 'Check-in',
        moduleCode: 'RESERVATION', supportedActionMask: 5, isActive: true,
      },
    ]);
    await fixture.whenStable();

    expect(fixture.componentInstance.nodes[0].children?.[0].data.id)
      .toBe('744d15aa-7df6-4515-9559-6d27f21dc01d');
    expect(fixture.componentInstance.nodes[0].children?.[0].data.supportedActionMask).toBe(5);
  });
});
