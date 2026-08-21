import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, ParamMap, convertToParamMap, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { signal } from '@angular/core';
import { ClientApiService } from '../../../core/services/client-api.service';
import { AuthService } from '../../../core/services/auth';
import { FavoriteService } from '../../../core/services/favorite.service';
import { HotelDetailComponent } from './hotel-detail.component';

describe('HotelDetailComponent', () => {
  let fixture: ComponentFixture<HotelDetailComponent>;
  let component: HotelDetailComponent;
  let params$: Subject<ParamMap>;
  let api: { getHotelById: ReturnType<typeof vi.fn>; getRoomTypesByHotel: ReturnType<typeof vi.fn>; getPropertyReviews: ReturnType<typeof vi.fn>; submitPropertyClaim: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    localStorage.removeItem('luxestay.locale');
    params$ = new Subject<ParamMap>();
    api = {
      getHotelById: vi.fn(() => throwError(() => ({ status: 404 }))),
      getRoomTypesByHotel: vi.fn(() => of([])),
      getPropertyReviews: vi.fn(() => of({ content: [], totalElements: 0, totalPages: 0, pageNumber: 1, pageSize: 5, summary: null })),
      submitPropertyClaim: vi.fn(() => of({}))
    };

    await TestBed.configureTestingModule({
      imports: [HotelDetailComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { logout$: new Subject<void>(), isLoggedIn: () => false } },
        { provide: FavoriteService, useValue: { favorites: signal([]), ensureLoaded: () => of([]), isFavorite: () => false, add: vi.fn(), remove: vi.fn() } },
        { provide: ClientApiService, useValue: api },
        { provide: ActivatedRoute, useValue: { queryParams: of({}), paramMap: params$, snapshot: { fragment: null } } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(HotelDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders a recoverable state for an invalid route parameter', () => {
    params$.next(convertToParamMap({ id: 'not-a-number' }));
    fixture.detectChanges();

    expect(component.pageError).toContain('không hợp lệ');
    expect(api.getHotelById).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Tìm chỗ nghỉ khác');
  });

  it('renders a not-found recovery state when the API returns 404', () => {
    params$.next(convertToParamMap({ id: '999999' }));
    fixture.detectChanges();

    expect(api.getHotelById).toHaveBeenCalledWith(999999);
    expect(component.pageError).toContain('Không tìm thấy chỗ nghỉ này');
    expect(fixture.nativeElement.textContent).toContain('Chuyến đi vẫn có thể tiếp tục');
  });

  it('hides stale property details when the public room catalog becomes unavailable', () => {
    api.getHotelById.mockReturnValue(of({ id: 44, name: 'Stale property' }));
    api.getRoomTypesByHotel.mockReturnValue(throwError(() => ({ status: 404 })));

    params$.next(convertToParamMap({ id: '44' }));
    fixture.detectChanges();

    expect(api.getRoomTypesByHotel).toHaveBeenCalledWith(44, undefined, undefined, 2);
    expect(component.hotel).toBeNull();
    expect(component.roomTypes).toEqual([]);
    expect(component.pageError).toContain('Không tìm thấy chỗ nghỉ này');
  });

  it('shows a one-night estimate immediately when a room is selected without dates', async () => {
    const room = {
      id: 902,
      code: 'DOUBLE',
      nameVi: 'Phòng đôi',
      nameEn: 'Double room',
      maxGuest: 3,
      maxGuests: 3,
      maxAdults: 2,
      maxChildren: 1,
      basePrice: 875000,
      descriptionVi: 'Phòng đôi',
      descriptionEn: 'Double room',
      availableRooms: 3,
    };
    api.getHotelById.mockReturnValue(of({ id: 44, name: 'Biệt thự Sóc Sơn Xanh' }));
    api.getRoomTypesByHotel.mockReturnValue(of([room]));

    params$.next(convertToParamMap({ id: '44' }));
    fixture.detectChanges();
    await fixture.whenStable();
    component.selectQuantity(room, 1);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.selectedQuote).toBeNull();
    expect(component.displayedRoomTotal).toBe(875000);
    expect(fixture.nativeElement.querySelector('.summary-total strong')?.textContent).toContain('875.000');
    expect(fixture.nativeElement.querySelector('.summary-total small')?.textContent).toContain('1 đêm');
    expect(fixture.nativeElement.querySelector('.mobile-booking-bar strong')?.textContent).toContain('875.000');
    expect(fixture.nativeElement.querySelector('.mobile-booking-bar button')?.disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('.mobile-booking-bar')?.getAttribute('aria-live')).toBe('polite');
  });

  it('renders canonical quote totals, member tier, and typed sponsored disclosure', async () => {
    const room = {
      id: 901,
      code: 'DELUXE',
      nameVi: 'Deluxe',
      nameEn: 'Deluxe',
      maxGuest: 2,
      maxGuests: 2,
      maxAdults: 2,
      maxChildren: 1,
      basePrice: 500000,
      descriptionVi: 'Deluxe',
      descriptionEn: 'Deluxe',
      availableRooms: 2,
    };
    const hotel = {
      id: 44,
      name: 'LuxeStay Riverside',
      addressLine: '1 River Road',
      starRating: 4,
      latitude: 10.7,
      longitude: 106.7,
      propertyType: 'HOTEL',
      sponsoredPlacement: {
        placementId: 77,
        placementKind: 'SPONSORED',
        disclosureVi: 'Được tài trợ',
        disclosureEn: 'Sponsored',
        endsAt: '2026-08-04T00:00:00Z',
      },
    };
    api.getHotelById.mockReturnValue(of(hotel));
    api.getRoomTypesByHotel.mockReturnValue(of([room]));
    params$.next(convertToParamMap({ id: '44' }));
    fixture.detectChanges();
    await fixture.whenStable();

    component.selectQuantity(room, 1);
    component.bookingQueryParams = {
      checkIn: '2026-08-10',
      checkOut: '2026-08-12',
      adultCount: 2,
      childCount: 0,
      roomCount: 1,
    };
    component.selectedQuote = {
      quoteId: 'quote-44',
      expiresAt: '2026-08-10T12:15:00Z',
      propertyId: 44,
      roomTypeId: 901,
      nightlyPrice: 500000,
      numberOfNights: 2,
      roomQuantity: 1,
      baseSubtotal: 1000000,
      taxAmount: 120000,
      feeAmount: 15000,
      taxesAndFees: 135000,
      appliedPromotions: [{
        campaignId: 71,
        code: 'MEMBER10',
        applicationType: 'AUTOMATIC',
        nameVi: 'Giá thành viên',
        nameEn: 'Member price',
        discountAmount: 100000,
      }],
      memberBenefit: {
        eligible: true,
        tierCode: 'GOLD',
        tierNameVi: 'Vàng',
        tierNameEn: 'Gold',
      },
      totalDiscount: 100000,
      finalTotal: 1035000,
      currency: 'VND',
    };
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-sponsored="true"]')).toBeTruthy();
    const summary = fixture.nativeElement.querySelector('.booking-summary') as HTMLElement;
    expect(summary.textContent).toContain('1.000.000');
    expect(summary.querySelector('.promotion-proof')?.textContent).toContain('Vàng');
    expect(summary.querySelector('.summary-total strong')?.textContent).toContain('1.035.000');
  });

  it('exposes the active gallery image as a pressed control', async () => {
    api.getHotelById.mockReturnValue(of({
      id: 44,
      name: 'LuxeStay Gallery',
      mainImageUrl: '/hotel-main.webp',
      galleryUrls: ['/hotel-room.webp'],
    }));
    api.getRoomTypesByHotel.mockReturnValue(of([]));

    params$.next(convertToParamMap({ id: '44' }));
    fixture.detectChanges();
    await fixture.whenStable();

    const gallery = fixture.nativeElement.querySelector('.gallery-rail') as HTMLElement;
    const buttons = [...gallery.querySelectorAll('button')] as HTMLButtonElement[];
    expect(gallery.getAttribute('role')).toBe('group');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('false');

    buttons[1].click();
    fixture.detectChanges();
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('labels the claim dialog and closes it with Escape', async () => {
    component.hotel = {
      id: 44,
      name: 'LuxeStay Claim',
      approvalStatus: 'IMPORTED_PENDING_REVIEW',
    } as any;
    component.isLoading = false;
    fixture.detectChanges();

    component.openClaimModal();
    fixture.detectChanges();
    await fixture.whenStable();

    const dialog = fixture.nativeElement.querySelector('.claim-dialog') as HTMLElement;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('claim-dialog-title');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(component.showClaimModal).toBe(false);
    expect(fixture.nativeElement.querySelector('.claim-dialog')).toBeNull();
  });

  it('renders verified-stay review summary and category scores', async () => {
    api.getHotelById.mockReturnValue(of({ id: 44, name: 'Reviewed Hotel', reviewScore: 9.2, reviewCount: 1 }));
    api.getRoomTypesByHotel.mockReturnValue(of([]));
    api.getPropertyReviews.mockReturnValue(of({ content: [{ id: 'r1', score: 9, cleanlinessScore: 10, serviceScore: 9, locationScore: 8, valueScore: 9, title: 'Great stay', comment: 'Everything was comfortable and clean.', reviewerName: 'Verified Guest', stayedAt: '2026-08-02', createdAt: '2026-08-03', verifiedStay: true }], totalElements: 1, totalPages: 1, pageNumber: 1, pageSize: 5, summary: { score: 9, cleanliness: 10, service: 9, location: 8, value: 9 } }));
    params$.next(convertToParamMap({ id: '44' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.getPropertyReviews).toHaveBeenCalledWith(44, 1, 5);
    const section = fixture.nativeElement.querySelector('.reviews-section') as HTMLElement;
    expect(section.textContent).toContain('Kỳ lưu trú đã xác minh');
    expect(section.textContent).toContain('Verified Guest');
    expect(section.textContent).toContain('Great stay');
    expect(section.querySelectorAll('progress')).toHaveLength(4);
  });

  it('submits a normalized ownership claim and shows inline success feedback', () => {
    component.hotel = { id: 44, name: 'LuxeStay Claim' } as any;
    component.showClaimModal = true;
    component.claimForm = {
      verificationMethod: 'EMAIL',
      verificationData: '  owner@luxestay.vn  ',
      note: '  Hồ sơ đã gửi qua email  ',
    };

    component.submitClaim();
    fixture.detectChanges();

    expect(api.submitPropertyClaim).toHaveBeenCalledWith(44, {
      verificationMethod: 'EMAIL',
      verificationData: 'owner@luxestay.vn',
      note: 'Hồ sơ đã gửi qua email',
    });
    expect(component.claimSubmitting).toBe(false);
    expect(component.claimMessage).toContain('đã được gửi');
    expect(fixture.nativeElement.querySelector('.claim-feedback')?.textContent).toContain('đã được gửi');
  });
});
