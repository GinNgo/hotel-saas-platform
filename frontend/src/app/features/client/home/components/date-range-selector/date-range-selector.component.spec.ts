import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HomeSearchState, HomeSearchStateService } from '../../services/home-search-state.service';
import { DateRangeSelectorComponent } from './date-range-selector.component';

describe('DateRangeSelectorComponent', () => {
  let fixture: ComponentFixture<DateRangeSelectorComponent>;
  let state: ReturnType<typeof signal<HomeSearchState>>;
  let validationError: ReturnType<typeof signal<string>>;
  const updateDates = vi.fn();

  beforeEach(async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    state = signal<HomeSearchState>({
      keyword: '',
      locationDisplayName: '',
      selectedSuggestionType: null,
      provinceId: null,
      wardId: null,
      propertyId: null,
      landmarkId: null,
      radiusKm: null,
      propertyTypes: [],
      stayType: 'OVERNIGHT',
      checkInDate: new Date(2026, 6, 29),
      checkOutDate: new Date(2026, 6, 30),
      adultCount: 2,
      childCount: 0,
      roomCount: 1,
      latitude: null,
      longitude: null,
    });
    validationError = signal('');
    updateDates.mockReset();

    await TestBed.configureTestingModule({
      imports: [DateRangeSelectorComponent],
      providers: [{
        provide: HomeSearchStateService,
        useValue: {
          state,
          isDayUse: () => state().stayType === 'DAY_USE',
          dateValidationError: () => validationError(),
          updateDates,
        },
      }],
    }).compileComponents();

    fixture = TestBed.createComponent(DateRangeSelectorComponent);
    fixture.detectChanges();
  });

  it('uses labelled buttons instead of click-only date containers', () => {
    const buttons = fixture.nativeElement.querySelectorAll('button.date-trigger');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('aria-label')).toContain('ngày nhận');
    expect(buttons[1].getAttribute('aria-label')).toContain('ngày trả');
  });

  it('renders one month on a narrow viewport', () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true });
    window.dispatchEvent(new Event('resize'));
    fixture.detectChanges();

    expect(fixture.componentInstance.numberOfMonths).toBe(1);
  });

  it('renders two months on a desktop viewport', () => {
    expect(fixture.componentInstance.numberOfMonths).toBe(2);
  });

  it('keeps a stable range reference between change detection cycles', () => {
    const initialRange = fixture.componentInstance.dateRange();

    fixture.detectChanges();

    expect(fixture.componentInstance.dateRange()).toBe(initialRange);
  });

  it('starts the minimum date at local midnight', () => {
    expect(fixture.componentInstance.minDate.getHours()).toBe(0);
    expect(fixture.componentInstance.minDate.getMinutes()).toBe(0);
  });

  it('emits a valid overnight range and closes the popover', () => {
    const closePopover = vi.spyOn(fixture.componentInstance, 'closePopover');
    const checkIn = new Date(2027, 0, 31);
    const checkOut = new Date(2027, 1, 1);

    fixture.componentInstance.onDateChange([checkIn, checkOut]);

    expect(updateDates).toHaveBeenCalledWith(checkIn, checkOut);
    expect(closePopover).toHaveBeenCalledOnce();
  });

  it('keeps an invalid same-day range open and exposes explicit feedback', () => {
    const closePopover = vi.spyOn(fixture.componentInstance, 'closePopover');
    const date = new Date(2027, 0, 31);
    validationError.set('Ngày trả phòng phải sau ngày nhận phòng.');

    fixture.componentInstance.onDateChange([date, date]);
    fixture.detectChanges();

    expect(updateDates).toHaveBeenCalledWith(date, date);
    expect(closePopover).not.toHaveBeenCalled();
    expect(fixture.componentInstance.selectionTouched).toBe(true);
    expect(fixture.componentInstance.validationError)
      .toBe('Ngày trả phòng phải sau ngày nhận phòng.');
  });

  it('uses one date for preparatory day-use state and closes after selection', () => {
    const closePopover = vi.spyOn(fixture.componentInstance, 'closePopover');
    const date = new Date(2027, 4, 2);
    state.update(current => ({ ...current, stayType: 'DAY_USE', checkOutDate: null }));
    fixture.detectChanges();

    fixture.componentInstance.onDateChange(date);

    expect(updateDates).toHaveBeenCalledWith(date, null);
    expect(closePopover).toHaveBeenCalledOnce();
  });
});
