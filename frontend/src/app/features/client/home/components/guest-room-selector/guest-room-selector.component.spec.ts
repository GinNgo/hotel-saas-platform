import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PublicI18nService } from '../../../../../core/i18n/public-i18n.service';
import { HomeSearchState, HomeSearchStateService } from '../../services/home-search-state.service';
import { GuestRoomSelectorComponent } from './guest-room-selector.component';

describe('GuestRoomSelectorComponent', () => {
  let fixture: ComponentFixture<GuestRoomSelectorComponent>;
  let state: ReturnType<typeof signal<HomeSearchState>>;
  const updateGuests = vi.fn();

  beforeEach(async () => {
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
      checkInDate: new Date(2026, 7, 2),
      checkOutDate: new Date(2026, 7, 3),
      adultCount: 2,
      childCount: 1,
      roomCount: 2,
      latitude: null,
      longitude: null,
    });
    updateGuests.mockReset();
    updateGuests.mockImplementation((adultCount: number, childCount: number, roomCount: number) => {
      state.update(current => ({ ...current, adultCount, childCount, roomCount }));
    });

    await TestBed.configureTestingModule({
      imports: [GuestRoomSelectorComponent],
      providers: [
        {
          provide: HomeSearchStateService,
          useValue: { state, updateGuests },
        },
        {
          provide: PublicI18nService,
          useValue: {
            text: (key: string, params?: Record<string, number>) => {
              const count = params?.['count'];
              const labels: Record<string, string> = {
                'PUBLIC.GUESTS.GUEST_COUNT': `${count} guests`,
                'PUBLIC.GUESTS.ROOM_COUNT': `${count} rooms`,
                'PUBLIC.GUESTS.ADULT_COUNT': `${count} adults`,
                'PUBLIC.GUESTS.CHILD_COUNT': `${count} children`,
              };
              return labels[key] || key;
            },
            count: (key: string, count: number) => {
              const singular = count === 1;
              const labels: Record<string, string> = {
                'PUBLIC.GUESTS.GUEST_COUNT': `${count} ${singular ? 'guest' : 'guests'}`,
                'PUBLIC.GUESTS.ROOM_COUNT': `${count} ${singular ? 'room' : 'rooms'}`,
                'PUBLIC.GUESTS.ADULT_COUNT': `${count} ${singular ? 'adult' : 'adults'}`,
                'PUBLIC.GUESTS.CHILD_COUNT': `${count} ${singular ? 'child' : 'children'}`,
              };
              return labels[key] || key;
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GuestRoomSelectorComponent);
    fixture.detectChanges();
  });

  it('keeps a combined room, adult and child selection in a two-line trigger summary', () => {
    const copy = fixture.nativeElement.querySelector('.guest-trigger > span') as HTMLElement;
    const primary = copy.querySelector('strong');
    const secondary = copy.querySelector('small');

    expect(copy.children).toHaveLength(2);
    expect(primary?.textContent).toContain('3 guests');
    expect(secondary?.textContent).toContain('2 rooms');
    expect(secondary?.querySelector('.desktop-detail')?.textContent).toContain('2 adults');
    expect(secondary?.querySelector('.desktop-detail')?.textContent).toContain('1 child');
  });

  it('updates all three counters from the latest combined state', () => {
    const event = { stopPropagation: vi.fn() } as unknown as Event;

    fixture.componentInstance.updateCount('rooms', 1, event);
    fixture.componentInstance.updateCount('adults', 1, event);
    fixture.componentInstance.updateCount('children', 1, event);

    expect(updateGuests).toHaveBeenNthCalledWith(1, 2, 1, 3);
    expect(updateGuests).toHaveBeenNthCalledWith(2, 3, 1, 3);
    expect(updateGuests).toHaveBeenNthCalledWith(3, 3, 2, 3);
    expect(state()).toEqual(expect.objectContaining({
      adultCount: 3,
      childCount: 2,
      roomCount: 3,
    }));
    expect(event.stopPropagation).toHaveBeenCalledTimes(3);
  });
});
