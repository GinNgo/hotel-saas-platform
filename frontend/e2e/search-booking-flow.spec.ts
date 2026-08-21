import { expect, type Page, test } from '@playwright/test';

const hotel = {
  id: 501, name: 'LuxeStay Riverside', addressLine: '1 River Road, Tiền Giang', starRating: 4,
  latitude: 10.35, longitude: 106.35, propertyType: 'HOTEL', provinceName: 'Tiền Giang',
  approvalStatus: 'IMPORTED_PENDING_REVIEW',
  availableRoomCount: 3, lowestRoomType: { id: 901, name: 'Deluxe', maxGuests: 2 },
  amenities: ['Wi-Fi', 'Hồ bơi'], reviewScore: 8.8, reviewCount: 30,
  mainImageUrl: '/assets/properties/hotel-city-01.webp',
  galleryUrls: ['/assets/properties/hotel-room-01.webp', '/assets/properties/hotel-room-02.webp'],
  pricing: { nightlyPrice: 500000, discountedPrice: 500000, numberOfNights: 2, roomQuantity: 1, taxAmount: 60000, feeAmount: 15000, totalAmount: 1075000, currency: 'VND' },
};

async function installSearchFixtures(page: Page): Promise<void> {
  await page.route('**/api/public/properties/search**', route => route.fulfill({ json: {
    content: [hotel], totalElements: 1, totalPages: 1, number: 0, size: 20,
  } }));
  await page.route('**/api/v1/hotels/public/501', route => route.fulfill({ json: hotel }));
  await page.route('**/api/room-types/public/hotel/501**', route => route.fulfill({ json: [{
    id: 901, hotelId: 501, code: 'DLX', nameVi: 'Deluxe', nameEn: 'Deluxe', bedType: 'DOUBLE',
    bedCount: 1, maxAdults: 2, maxChildren: 1, maxGuests: 3, basePrice: 500000,
    descriptionVi: 'Phòng nhìn ra sông', descriptionEn: 'River view room', availableRooms: 3,
  }] }));
  await page.route('**/api/public/quotes**', route => route.fulfill({ json: {
    quoteId: 'quote-mobile-501', expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), propertyId: 501,
    roomTypeId: 901, nightlyPrice: 500000, numberOfNights: 1, roomQuantity: 1,
    baseSubtotal: 500000, taxAmount: 30000, feeAmount: 7500, taxesAndFees: 37500,
    appliedPromotions: [], memberBenefit: { eligible: false }, totalDiscount: 0,
    finalTotal: 537500, currency: 'VND',
  } }));
  await page.route('**/api/reservations/book', route => route.fulfill({ json: {
    id: 7001, bookingCode: 'LS-MOBILE-7001', status: 'CONFIRMED',
    confirmationEmailStatus: 'SENT', confirmationEmailRecipient: 'an@example.com',
  } }));
  await page.route('**/api/properties/501/claim', route => route.fulfill({ json: { id: 77, status: 'PENDING' } }));
}

test.describe('Search result and room selection', () => {
  test.beforeEach(async ({ page }) => installSearchFixtures(page));
  test('keeps search state, applies real filters and opens room selection', async ({ page }) => {
    await page.goto('/search?displayLocation=Ti%E1%BB%81n%20Giang&provinceId=1&checkInDate=2026-08-01&checkOutDate=2026-08-03&adultCount=2&childCount=0&roomCount=1');
    await expect(page.getByRole('heading', { name: 'Tiền Giang' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Xem phòng/ }).first()).toBeVisible({ timeout: 15000 });

    await page.getByRole('checkbox', { name: 'Khách sạn', exact: true }).check();
    await page.getByRole('button', { name: 'Áp dụng bộ lọc' }).click();
    await expect(page).toHaveURL(/propertyTypes=HOTEL/);
    await expect(page.getByRole('button', { name: /Khách sạn/ }).first()).toBeVisible();

    await page.getByRole('button', { name: /Xem phòng/ }).first().click();
    await expect(page).toHaveURL(/checkInDate=2026-08-01/);
    await expect(page).toHaveURL(/checkOutDate=2026-08-03/);
    await expect(page.locator('#rooms')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Chọn phòng' })).toBeVisible();

    await page.locator('.room-quantity-select').first().selectOption('1');
    const holdButton = page.getByRole('button', { name: 'Khóa giữ phòng 15 phút' }).first();
    await expect(holdButton).toBeEnabled();
    await holdButton.click();
    await expect(page).toHaveURL(/\/booking\/901/);
    await expect(page.locator('.hold-timer')).toBeVisible();
    await expect(page.locator('.hold-timer strong')).toHaveText(/^\d{2}:\d{2}$/);
  });

  test('mobile search and filter do not overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/search?checkInDate=2026-08-01&checkOutDate=2026-08-02&adultCount=2&roomCount=1');
    await page.locator('.mobile-summary').click();
    await expect(page.getByRole('dialog', { name: 'Thay đổi tìm kiếm' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });

  test('mobile result filters use touch targets and close with Escape', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/search?checkInDate=2026-08-20&checkOutDate=2026-08-21&adultCount=2&roomCount=1');

    const filterButton = page.locator('.mobile-filter');
    await expect(filterButton).toBeVisible();
    expect((await filterButton.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await filterButton.click();
    await expect(page.locator('#mobile-filter-drawer')).toBeVisible();

    const filterRows = page.locator('#mobile-filter-drawer .check-row, #mobile-filter-drawer .radio-row');
    expect(await filterRows.first().evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Escape');
    await expect(page.locator('#mobile-filter-drawer')).toHaveCount(0);
  });

  test('mobile hotel detail keeps gallery and room controls usable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/hotel/501?checkInDate=2026-08-20&checkOutDate=2026-08-21&adultCount=2&roomCount=1');

    const gallery = page.locator('.gallery-rail');
    await expect(gallery).toBeVisible();
    await expect(gallery.getByRole('button')).toHaveCount(3);
    expect((await gallery.getByRole('button').first().boundingBox())?.height).toBeGreaterThanOrEqual(44);

    const quantity = page.locator('.room-quantity-select').first();
    await expect(quantity).toBeVisible();
    expect((await quantity.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await quantity.selectOption('1');
    const mobileBookingBar = page.locator('.mobile-booking-bar');
    await expect(mobileBookingBar).toBeVisible();
    await expect(mobileBookingBar).toContainText('537.500');
    expect((await mobileBookingBar.getByRole('button').boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });

  test('mobile checkout keeps the authoritative total and submit action visible', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/booking/901?hotelId=501&roomTypeName=Deluxe&checkIn=2099-08-20&checkOut=2099-08-21&adultCount=2&childCount=0&quantity=1');

    const checkoutBar = page.locator('.mobile-checkout-bar');
    await expect(checkoutBar).toBeVisible();
    await expect(checkoutBar).toContainText('537.500');
    await expect(checkoutBar.getByRole('button')).toBeDisabled();
    await page.getByLabel('Họ').fill('Nguyễn');
    await page.getByLabel('Tên').fill('An');
    await page.getByLabel('Số điện thoại').fill('0901234567');
    await page.getByLabel('Email').fill('an@example.com');
    await expect(checkoutBar.getByRole('button')).toBeEnabled();
    expect((await checkoutBar.getByRole('button').boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    await checkoutBar.getByRole('button').click();
    await expect(page.getByRole('heading', { name: /đặt phòng thành công/i })).toBeVisible();
    await expect(page.getByText('LS-MOBILE-7001')).toBeVisible();
    await expect(page.getByRole('status')).toContainText('an@example.com');
    await expect(checkoutBar).toHaveCount(0);
  });

  test('mobile checkout remains recoverable when booking creation fails', async ({ page }) => {
    await page.route('**/api/reservations/book', route => route.fulfill({ status: 503, json: { message: 'Cổng đặt phòng đang tạm gián đoạn.' } }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/booking/901?hotelId=501&roomTypeName=Deluxe&checkIn=2099-08-20&checkOut=2099-08-21&adultCount=2&childCount=0&quantity=1');

    await page.getByLabel('Họ').fill('Nguyễn');
    await page.getByLabel('Tên').fill('An');
    await page.getByLabel('Số điện thoại').fill('0901234567');
    await page.getByLabel('Email').fill('an@example.com');
    const checkoutBar = page.locator('.mobile-checkout-bar');
    await checkoutBar.getByRole('button').click();

    await expect(page.getByRole('alert')).toContainText('Cổng đặt phòng đang tạm gián đoạn.');
    await expect(checkoutBar).toBeVisible();
    await expect(checkoutBar.getByRole('button')).toBeEnabled();
  });

  test('mobile payment result shows the authoritative booking and opens trip management', async ({ page }) => {
    const sessionId = '11111111-1111-1111-1111-111111111111';
    await page.route(/\/api\/payments\/sessions\/[^/?]+/, route => route.fulfill({ json: {
      sessionId, reservationId: 7001, bookingCode: 'LS-MOBILE-7001', provider: 'VNPAY',
      amount: 537500, currency: 'VND', status: 'SUCCEEDED', expiresAt: '2026-08-20T13:00:00Z',
      reconciliationRequired: false, confirmationEmailStatus: 'SENT',
      confirmationEmailRecipient: 'an@example.com', confirmationEmailSent: true,
    } }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(({ id }) => {
      sessionStorage.setItem(`hotel:payment:access:${id}`, 'mobile-booking-access');
    }, { id: sessionId });

    const paymentResponse = page.waitForResponse(response => response.url().includes(`/api/payments/sessions/${sessionId}`));
    await page.goto(`/payment-result?session=${sessionId}&provider=VNPAY`);
    expect((await (await paymentResponse).json()).status).toBe('SUCCEEDED');

    const result = page.locator('.payment-result-card');
    await expect(page.getByRole('heading', { name: /thanh toán đã xác nhận/i })).toBeVisible({ timeout: 15000 });
    await expect(result).toHaveAttribute('aria-busy', 'false');
    await expect(result).toContainText('LS-MOBILE-7001');
    await expect(result).toContainText('an@example.com');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);

    await result.getByRole('button', { name: /xem lịch sử đặt phòng/i }).click();
    await expect(page).toHaveURL(/\/booking\/manage\/LS-MOBILE-7001$/);
  });

  test('mobile payment result exits polling and remains actionable after an authoritative failure', async ({ page }) => {
    const sessionId = '22222222-2222-2222-2222-222222222222';
    await page.route(/\/api\/payments\/sessions\/[^/?]+/, route => route.fulfill({ json: {
      sessionId, reservationId: 7002, bookingCode: 'LS-MOBILE-7002', provider: 'VNPAY',
      amount: 537500, currency: 'VND', status: 'FAILED', expiresAt: '2026-08-20T13:00:00Z',
      reconciliationRequired: false, failureCode: 'PROVIDER_DECLINED',
    } }));
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(`/payment-result?session=${sessionId}&provider=VNPAY`);

    const result = page.locator('.payment-result-card');
    await expect(page.getByRole('heading', { name: /thanh toán chưa hoàn tất/i })).toBeVisible({ timeout: 15000 });
    await expect(result).toHaveAttribute('aria-busy', 'false');
    await expect(result).toContainText('LS-MOBILE-7002');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    await expect(result.getByRole('button', { name: /xem lịch sử đặt phòng/i })).toBeEnabled();
  });

  test('mobile payment result keeps reconciliation distinct from confirmed success', async ({ page }) => {
    const sessionId = '33333333-3333-3333-3333-333333333333';
    await page.route(/\/api\/payments\/sessions\/[^/?]+/, route => route.fulfill({ json: {
      sessionId, reservationId: 7003, bookingCode: 'LS-MOBILE-7003', provider: 'VNPAY',
      amount: 537500, currency: 'VND', status: 'SUCCEEDED', expiresAt: '2026-08-20T13:00:00Z',
      reconciliationRequired: true, confirmationEmailStatus: 'PENDING',
      confirmationEmailRecipient: 'an@example.com', confirmationEmailSent: false,
    } }));
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(`/payment-result?session=${sessionId}&provider=VNPAY`);

    const result = page.locator('.payment-result-card');
    await expect(page.getByRole('heading', { name: /giao dịch cần đối soát/i })).toBeVisible({ timeout: 15000 });
    await expect(result).toHaveAttribute('aria-busy', 'false');
    await expect(result).toContainText('LS-MOBILE-7003');
    await expect(result).toContainText(/đối soát/i);
    await expect(page.getByRole('heading', { name: /thanh toán đã xác nhận/i })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });

  test('mobile guest trip renders an authoritative booking from its browser capability', async ({ page }) => {
    const bookingCode = 'LS-MOBILE-GUEST-7004';
    await page.route(/\/api\/reservations\/guest\/LS-MOBILE-GUEST-7004$/, route => route.fulfill({ json: {
      id: 'reservation-7004', bookingCode, checkInDate: '2026-09-01', checkOutDate: '2026-09-03',
      adults: 2, children: 1, quantity: 1, guests: 3, totalAmount: 2_400_000,
      status: 'CONFIRMED', paymentMethod: 'VNPAY', canSelfCancel: true,
      confirmationEmailStatus: 'NOT_CONFIGURED', property: { id: 501, name: 'Luxe Bay', address: 'Đà Nẵng' },
    } }));
    await page.route(/\/api\/reservations\/guest\/LS-MOBILE-GUEST-7004\/cancel$/, route => route.fulfill({ json: {
      id: 'reservation-7004', bookingCode, checkInDate: '2026-09-01', checkOutDate: '2026-09-03',
      adults: 2, children: 1, quantity: 1, guests: 3, totalAmount: 2_400_000,
      status: 'CANCELLED', paymentMethod: 'VNPAY', canSelfCancel: false,
      confirmationEmailStatus: 'NOT_CONFIGURED', property: { id: 501, name: 'Luxe Bay', address: 'Đà Nẵng' },
    } }));
    await page.addInitScript(({ code }) => {
      sessionStorage.setItem(`hotel:booking:access:${code}`, 'guest-mobile-access');
    }, { code: bookingCode });
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(`/booking/manage/${bookingCode}`);

    const trip = page.locator('.trip-card');
    await expect(trip.getByRole('heading', { name: bookingCode })).toBeVisible({ timeout: 15000 });
    await expect(trip).toContainText('Luxe Bay');
    await expect(trip).toContainText('2.400.000 ₫');
    await expect(trip.getByRole('button', { name: 'Hủy booking' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);

    await trip.getByRole('button', { name: 'Hủy booking' }).click();
    const cancelDialog = trip.getByRole('dialog', { name: 'Bạn muốn hủy booking này?' });
    await expect(cancelDialog).toHaveAttribute('aria-modal', 'true');
    await page.keyboard.press('Escape');
    await expect(cancelDialog).toHaveCount(0);
    await trip.getByRole('button', { name: 'Hủy booking' }).click();
    await cancelDialog.getByRole('button', { name: 'Xác nhận hủy booking' }).click();
    await expect(trip.locator('.status')).toHaveText('Đã hủy');
    await expect(trip.locator('.cancel-panel')).toHaveCount(0);
  });

  test('mobile guest trip recovers a missing browser capability with verified contact data', async ({ page }) => {
    const bookingCode = 'LS-MOBILE-RECOVER-7005';
    await page.route(/\/api\/reservations\/guest\/access$/, route => route.fulfill({ json: {
      id: 'reservation-7005', bookingCode, guestAccessKey: 'recovered-mobile-access',
      checkInDate: '2026-10-01', checkOutDate: '2026-10-03', adults: 2, children: 0,
      quantity: 1, guests: 2, totalAmount: 1_800_000, status: 'CONFIRMED', paymentMethod: 'VNPAY',
      canSelfCancel: false, cancellationBlockReason: 'Đã qua thời hạn tự hủy.',
      confirmationEmailStatus: 'SENT', property: { id: 501, name: 'Luxe Riverside', address: 'Tiền Giang' },
    } }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/booking/manage/${bookingCode}`);

    const recovery = page.locator('.recovery-card');
    await expect(recovery.getByRole('heading', { name: 'Nhận lại quyền truy cập booking' })).toBeVisible();
    await expect(recovery.locator('form')).toHaveAttribute('aria-busy', 'false');
    await recovery.getByLabel('Email đặt phòng').fill('an@example.com');
    await recovery.getByLabel('Số điện thoại đặt phòng').fill('0901234567');
    await recovery.getByRole('button', { name: 'Mở booking của tôi' }).click();

    const trip = page.locator('.trip-card');
    await expect(trip.getByRole('heading', { name: bookingCode })).toBeVisible();
    await expect(trip).toContainText('Luxe Riverside');
    expect(await page.evaluate(code => sessionStorage.getItem(`hotel:booking:access:${code}`), bookingCode)).toBe('recovered-mobile-access');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });

  test('mobile guest trip keeps recovery form open when contact verification fails', async ({ page }) => {
    const bookingCode = 'LS-MOBILE-RECOVER-7006';
    await page.route(/\/api\/reservations\/guest\/access$/, route => route.fulfill({ status: 404, json: {
      message: 'Không tìm thấy booking khớp với email và số điện thoại đã nhập.',
    } }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/booking/manage/${bookingCode}`);

    const recovery = page.locator('.recovery-card');
    await recovery.getByLabel('Email đặt phòng').fill('wrong@example.com');
    await recovery.getByLabel('Số điện thoại đặt phòng').fill('0900000000');
    await recovery.getByRole('button', { name: 'Mở booking của tôi' }).click();

    await expect(recovery.getByRole('alert')).toContainText('Không tìm thấy booking');
    await expect(recovery).toBeVisible();
    await expect(page.locator('.trip-card')).toHaveCount(0);
    expect(await page.evaluate(code => sessionStorage.getItem(`hotel:booking:access:${code}`), bookingCode)).toBeNull();
  });

  test('property claim uses an accessible dialog and inline confirmation', async ({ page }) => {
    await page.goto('/hotel/501');
    const trigger = page.getByRole('button', { name: 'Xác nhận là chủ sở hữu' });
    await trigger.click();

    const dialog = page.getByRole('dialog', { name: 'Xác nhận quyền sở hữu' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Thông tin xác minh').fill('owner@luxestay.vn');
    await dialog.getByRole('button', { name: 'Gửi yêu cầu' }).click();
    await expect(dialog.getByRole('status')).toContainText('đã được gửi');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});
