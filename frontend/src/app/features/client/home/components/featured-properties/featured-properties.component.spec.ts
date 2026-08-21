import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { FeaturedPropertiesComponent } from './featured-properties.component';
import { HomeSearchStateService } from '../../services/home-search-state.service';

describe('FeaturedPropertiesComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeaturedPropertiesComponent],
      providers: [provideRouter([])]
    }).compileComponents();
  });

  it('renders a recoverable empty state when no properties are available', () => {
    const fixture = TestBed.createComponent(FeaturedPropertiesComponent);
    fixture.componentInstance.loading = false;
    fixture.componentInstance.properties = [];
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.empty-state')?.textContent).toContain('Chưa có cơ sở phù hợp');
    expect(fixture.nativeElement.querySelector('.view-all')).toBeTruthy();
  });

  it('announces a property data error separately from an empty result', () => {
    const fixture = TestBed.createComponent(FeaturedPropertiesComponent);
    fixture.componentInstance.loading = false;
    fixture.componentInstance.error = true;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.error-state')?.textContent).toContain('Chưa thể tải cơ sở nổi bật');
  });

  it('clears stale location and property type filters before opening all stays', () => {
    const fixture = TestBed.createComponent(FeaturedPropertiesComponent);
    const state = TestBed.inject(HomeSearchStateService);
    state.restoreLocation({ keyword: '', displayName: 'Tất cả chỗ nghỉ', selectedSuggestionType: 'PROVINCE', provinceId: 10133, wardId: null });
    state.updatePropertyTypes(['MOTEL']);
    fixture.componentInstance.viewAll();

    expect(state.state().provinceId).toBeNull();
    expect(state.state().propertyTypes).toEqual([]);
  });
});
