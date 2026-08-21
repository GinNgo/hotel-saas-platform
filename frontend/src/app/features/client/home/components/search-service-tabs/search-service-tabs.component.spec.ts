import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { HomeSearchStateService } from '../../services/home-search-state.service';
import { SearchServiceTabsComponent } from './search-service-tabs.component';

describe('SearchServiceTabsComponent', () => {
  let fixture: ComponentFixture<SearchServiceTabsComponent>;
  let state: HomeSearchStateService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SearchServiceTabsComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(SearchServiceTabsComponent);
    state = TestBed.inject(HomeSearchStateService);
    fixture.detectChanges();
  });

  it('selects a property type immediately when its button is clicked', () => {
    const buttons = [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
    const homestay = buttons.find(button => button.textContent?.includes('Homestay'))!;

    homestay.click();
    fixture.detectChanges();

    expect(state.state().propertyTypes).toEqual(['HOMESTAY']);
    expect(homestay.getAttribute('aria-pressed')).toBe('true');
  });
});
