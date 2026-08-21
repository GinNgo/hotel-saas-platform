import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PermissionService } from '../../../core/services/permission.service';
import { PromotionService } from '../../../core/services/promotion.service';
import { PromotionManagementComponent } from './promotion-management.component';

describe('PromotionManagementComponent', () => {
  let fixture: ComponentFixture<PromotionManagementComponent>; let component: PromotionManagementComponent;
  let api: { list: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; deactivate: ReturnType<typeof vi.fn> };
  beforeEach(async () => { api = { list: vi.fn(() => of([])), create: vi.fn(() => of({})), update: vi.fn(() => of({})), deactivate: vi.fn(() => of(void 0)) }; await TestBed.configureTestingModule({ imports: [PromotionManagementComponent], providers: [{ provide: PromotionService, useValue: api }, { provide: PermissionService, useValue: { hasPermission: vi.fn(() => true) } }] }).compileComponents(); fixture = TestBed.createComponent(PromotionManagementComponent); component = fixture.componentInstance; fixture.detectChanges(); });
  it('validates and creates a campaign payload', () => { component.openCreate(); component.form = { code: 'FLASH10', title: 'Flash', discountPercent: 10, maxDiscountAmount: null, minBookingAmount: null, startDateUtc: '2026-09-01T00:00', endDateUtc: '2026-09-07T00:00', isActive: true, applicationType: 'AUTOMATIC' }; component.save(); expect(api.create).toHaveBeenCalledWith(component.form); });
});
