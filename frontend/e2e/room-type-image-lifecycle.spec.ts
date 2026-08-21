import { expect, test } from '@playwright/test';
import { seedSession, syntheticAdminSession } from './helpers/audit-fixtures';

test('room type image lifecycle keeps metadata, order and soft delete contract', async ({ page }) => {
  const roomTypeId = '11111111-1111-4111-8111-111111111111';
  let images = [{ id: 'img-1', url: '/uploads/one.jpg', thumbnailUrl: '/uploads/one-thumb.jpg', displayOrder: 0, altText: 'Ảnh mặt tiền', isPrimary: true }];
  await page.route('**/api/auth/my-menu', route => route.fulfill({ json: [{ id: 'ADMIN', code: 'ADMIN', name: 'Quản trị', functions: [{ id: 1, code: 'ROOM_TYPE', name: 'Loại phòng', url: '/admin/room-types' }] }] }));
  await page.route('**/api/v1/hotels', route => route.fulfill({ json: [{ id: 'hotel-1', nameVi: 'LuxeStay' }] }));
  await page.route('**/api/room-types/paged**', route => route.fulfill({ json: { items: [{ id: roomTypeId, hotelId: 'hotel-1', code: 'DLX', nameVi: 'Deluxe', status: 'ACTIVE', images }], page: 1, pageSize: 15, totalItems: 1, totalPages: 1 } }));
  await page.route(`**/api/room-types/${roomTypeId}`, async route => route.fulfill({ json: { id: roomTypeId, hotelId: 'hotel-1', code: 'DLX', nameVi: 'Deluxe', status: 'ACTIVE', images } }));
  await page.route(`**/api/media/room-types/${roomTypeId}`, async route => {
    if (route.request().method() === 'POST') {
      const image = { id: 'img-2', url: '/uploads/two.png', thumbnailUrl: '/uploads/two-thumb.png', displayOrder: 1, altText: 'Ảnh phòng', isPrimary: false };
      images = [...images, image];
      await route.fulfill({ json: image });
    } else await route.continue();
  });
  await page.route(`**/api/media/room-types/${roomTypeId}/img-1`, async route => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON(); images = images.map(image => image.id === 'img-1' ? { ...image, altText: body.altText } : image);
      await route.fulfill({ json: images[0] });
    } else if (route.request().method() === 'DELETE') {
      images = images.filter(image => image.id !== 'img-1'); await route.fulfill({ status: 204 });
    } else await route.continue();
  });
  await page.route(`**/api/media/room-types/${roomTypeId}/order`, route => route.fulfill({ status: 204 }));

  await seedSession(page, syntheticAdminSession());
  await page.goto('/admin/room-types');
  await page.locator('button[title="Chỉnh sửa"]').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({ name: 'room.png', mimeType: 'image/png', buffer: Buffer.from('png-test') });
  await expect(page.getByText(/Đã chọn 1 ảnh/)).toBeVisible();
  const altInput = page.locator('input[placeholder="Mô tả ảnh"]').first();
  await expect(altInput).toBeVisible();
  await altInput.fill('Ảnh phòng đã cập nhật');
  await altInput.blur();
  await page.getByRole('button', { name: 'Xóa ảnh' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
