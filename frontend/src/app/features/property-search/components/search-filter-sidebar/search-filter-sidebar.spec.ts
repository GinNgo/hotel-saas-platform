import { SearchFilterSidebarComponent } from './search-filter-sidebar';

describe('SearchFilterSidebarComponent', () => {
  it('formats Vietnamese currency without US grouping', () => {
    const component = new SearchFilterSidebarComponent();
    expect(component.formatVnd(10000000)).toBe('10.000.000 ₫');
    expect(component.formatVnd(0)).toBe('0 ₫');
  });

  it('emits validated filters only when applied', () => {
    const component = new SearchFilterSidebarComponent();
    const emit = vi.spyOn(component.filtersChanged, 'emit');
    component.priceRange = [-100, 1500000];
    component.selectedPropertyTypes = ['HOTEL'];
    component.selectedStars = [4, 5];
    component.selectedReviewScore = 8;
    component.applyFilters();
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      minPrice: 0, maxPrice: 1500000, propertyTypes: ['HOTEL'], starRatings: [4, 5], minReviewScore: 8
    }));
  });
});
