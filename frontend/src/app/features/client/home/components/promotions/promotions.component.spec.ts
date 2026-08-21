import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';

import { LocaleService } from '../../../../../core/i18n/locale.service';
import { PublicPromotion } from '../../../../../core/services/client-api.service';
import { PromotionsComponent } from './promotions.component';

const activePromotion: PublicPromotion = {
  id: 1,
  code: 'SUMMER10',
  propertyId: 501,
  nameVi: 'Mùa hè tiết kiệm',
  nameEn: 'Summer savings',
  applicationType: 'COUPON',
  discountType: 'PERCENT',
  discountValue: 10,
  maxDiscount: 200_000,
  endsAt: '2026-08-31T23:59:59Z',
  memberOnly: false,
  requiredTierCodes: [],
};

const memberPromotion: PublicPromotion = {
  ...activePromotion,
  id: 2,
  code: 'GOLD20',
  memberOnly: true,
  requiredTierCodes: ['GOLD'],
};

describe('PromotionsComponent', () => {
  function createFixture() {
    TestBed.configureTestingModule({
      imports: [PromotionsComponent],
      providers: [
        provideRouter([]),
        provideTranslateService(),
        { provide: LocaleService, useValue: { locale: signal<'vi' | 'en'>('vi') } },
      ],
    });
    const fixture = TestBed.createComponent(PromotionsComponent);
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    return fixture;
  }

  it('renders a bounded loading state before active API data arrives', () => {
    const fixture = createFixture();

    expect(fixture.nativeElement.querySelector('.promotion-skeletons')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('.promotion-skeleton')).toHaveLength(2);
  });

  it('renders typed campaigns, member requirements and copy affordance', async () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('loading', false);
    fixture.componentRef.setInput('promotions', [activePromotion, memberPromotion]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.promotion-item')).toHaveLength(2);
    expect(fixture.nativeElement.textContent).toContain('GOLD');
    expect(fixture.nativeElement.querySelector('.copy-button')?.getAttribute('aria-label')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('a.promotion-link')?.getAttribute('href')).toContain('/hotel/501');
  });

  it('shows an honest empty state without placeholder cards', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('loading', false);
    fixture.componentRef.setInput('promotions', []);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.promotion-feedback')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('.promotion-item')).toHaveLength(0);
  });

  it('exposes an error recovery action and never creates fake data', () => {
    const fixture = createFixture();
    const retry = vi.fn();
    fixture.componentRef.setInput('loading', false);
    fixture.componentRef.setInput('error', true);
    fixture.componentInstance.retry.subscribe(retry);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.promotion-error button') as HTMLButtonElement).click();
    expect(retry).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelectorAll('.promotion-item')).toHaveLength(0);
  });
});
