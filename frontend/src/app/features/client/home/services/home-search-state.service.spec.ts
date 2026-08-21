import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { HomeSearchStateService, RecentSearch } from './home-search-state.service';

describe('HomeSearchStateService', () => {
  const navigate = vi.fn();
  let service: HomeSearchStateService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15, 12, 0, 0, 0));
    localStorage.clear();
    navigate.mockReset();
    TestBed.configureTestingModule({
      providers: [
        HomeSearchStateService,
        { provide: Router, useValue: { navigate } },
      ],
    });
    service = TestBed.inject(HomeSearchStateService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps an invalid same-day overnight range visible and blocks submission', () => {
    const date = new Date(2026, 6, 29, 0, 0, 0, 0);

    service.updateDates(date, date);

    expect(service.state().checkOutDate?.getTime()).toBe(date.getTime());
    expect(service.dateValidationError()).toContain('sau ngày nhận phòng');
    expect(service.submitSearch()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('submits day-use with one local calendar date and no checkout parameter', () => {
    const date = new Date(2026, 11, 31, 0, 0, 0, 0);
    service.updateStayType('DAY_USE');
    service.updateDates(date, null);

    expect(service.submitSearch()).toBe(true);
    expect(navigate).toHaveBeenCalledWith(['/search'], {
      queryParams: expect.objectContaining({
        stayType: 'DAY_USE',
        checkInDate: '2026-12-31',
      }),
    });
    const queryParams = navigate.mock.calls[0][1].queryParams;
    expect(queryParams.checkOutDate).toBeUndefined();
  });

  it('restores day-use recent searches without inventing a checkout date', () => {
    const recent: RecentSearch = {
      displayLocation: 'Đà Nẵng',
      keyword: '',
      provinceId: 48,
      wardId: null,
      propertyId: null,
      selectedSuggestionType: 'PROVINCE',
      stayType: 'DAY_USE',
      checkInDate: '2027-01-10',
      checkOutDate: null,
      adultCount: 2,
      childCount: 0,
      roomCount: 1,
      createdAt: new Date().toISOString(),
    };

    service.applyRecentSearch(recent);

    expect(service.state().stayType).toBe('DAY_USE');
    expect(service.state().checkOutDate).toBeNull();
  });

  it('serializes local calendar dates across a year boundary without a timezone shift', () => {
    const checkIn = new Date(2026, 11, 31, 23, 45);
    const checkOut = new Date(2027, 0, 1, 18, 30);

    service.updateDates(checkIn, checkOut);

    expect(service.state().checkInDate?.getHours()).toBe(0);
    expect(service.state().checkOutDate?.getHours()).toBe(0);
    expect(service.submitSearch()).toBe(true);
    expect(navigate).toHaveBeenCalledWith(['/search'], {
      queryParams: expect.objectContaining({
        checkInDate: '2026-12-31',
        checkOutDate: '2027-01-01',
      }),
    });
  });

  it('repairs an invalid restored overnight range without changing its local check-in date', () => {
    const recent: RecentSearch = {
      displayLocation: 'Hà Nội',
      keyword: '',
      provinceId: 1,
      wardId: null,
      propertyId: null,
      selectedSuggestionType: 'PROVINCE',
      stayType: 'OVERNIGHT',
      checkInDate: '2027-03-15',
      checkOutDate: '2027-03-15',
      adultCount: 2,
      childCount: 1,
      roomCount: 1,
      createdAt: new Date().toISOString(),
    };

    service.applyRecentSearch(recent);

    expect(service.state().checkInDate).toEqual(new Date(2027, 2, 15));
    expect(service.state().checkOutDate).toEqual(new Date(2027, 2, 16));
    expect(service.dateValidationError()).toBe('');
  });

  it('persists the stay type and local dates in recent searches', () => {
    service.updateLocation('', 'Đà Nẵng', 48, null);
    service.updatePropertyTypes(['APARTMENT', 'VILLA']);
    service.updateDates(new Date(2027, 3, 30), new Date(2027, 4, 1));

    expect(service.submitSearch()).toBe(true);

    const stored = JSON.parse(localStorage.getItem('luxestay.recent-searches') || '[]');
    expect(stored[0]).toEqual(expect.objectContaining({
      displayLocation: 'Đà Nẵng',
      stayType: 'OVERNIGHT',
      propertyTypes: ['APARTMENT', 'VILLA'],
      checkInDate: '2027-04-30',
      checkOutDate: '2027-05-01',
    }));
  });

  it('restores property type filters from a recent search', () => {
    const recent: RecentSearch = {
      displayLocation: 'Đà Lạt', keyword: '', provinceId: 68, wardId: null, propertyId: null,
      selectedSuggestionType: 'PROVINCE', stayType: 'OVERNIGHT', propertyTypes: ['VILLA'],
      checkInDate: '2027-02-10', checkOutDate: '2027-02-12', adultCount: 4, childCount: 0,
      roomCount: 2, createdAt: new Date().toISOString(),
    };

    service.applyRecentSearch(recent);
    expect(service.state().propertyTypes).toEqual(['VILLA']);

    expect(service.submitSearch()).toBe(true);
    expect(navigate).toHaveBeenCalledWith(['/search'], {
      queryParams: expect.objectContaining({ propertyTypes: 'VILLA' }),
    });
  });

  it('persists landmark geography and defaults result sorting to nearest', () => {
    service.selectSuggestion({
      type: 'LANDMARK',
      id: 501,
      name: 'Cầu Rồng',
      displayName: 'Cầu Rồng, Đà Nẵng',
      provinceId: 48,
      latitude: 16.0611,
      longitude: 108.2277,
      defaultRadiusKm: 8,
    });

    expect(service.submitSearch()).toBe(true);
    expect(service.state()).toEqual(expect.objectContaining({
      selectedSuggestionType: 'LANDMARK',
      landmarkId: 501,
      provinceId: 48,
      latitude: 16.0611,
      longitude: 108.2277,
      radiusKm: 8,
    }));
    expect(navigate).toHaveBeenCalledWith(['/search'], {
      queryParams: expect.objectContaining({
        landmarkId: 501,
        provinceId: 48,
        radiusKm: 8,
        sortBy: 'NEAREST',
      }),
    });
  });

  it('restores landmark context from a reloaded search URL', () => {
    service.restoreLocation({
      keyword: '',
      displayName: 'Hồ Hoàn Kiếm, Hà Nội',
      selectedSuggestionType: 'LANDMARK',
      provinceId: 1,
      wardId: null,
      landmarkId: 777,
      radiusKm: 10,
      latitude: 21.0287,
      longitude: 105.8521,
    });

    expect(service.state()).toEqual(expect.objectContaining({
      locationDisplayName: 'Hồ Hoàn Kiếm, Hà Nội',
      selectedSuggestionType: 'LANDMARK',
      landmarkId: 777,
      provinceId: 1,
      radiusKm: 10,
      latitude: 21.0287,
      longitude: 105.8521,
    }));
  });
});
