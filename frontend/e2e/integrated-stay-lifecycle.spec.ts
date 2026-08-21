import { createHmac } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';

const apiRoot = (process.env.LUXESTAY_E2E_API_URL || '').replace(/\/$/, '');
const hashSecret = 'SECRETKEYVNPAYSAASHOTEL2026';

interface AuthResponse { accessToken: string; activePropertyId?: string }

async function login(request: APIRequestContext, username: string, password: string): Promise<AuthResponse> {
  const response = await request.post(`${apiRoot}/auth/login`, { data: { usernameOrEmail: username, password } });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json() as Promise<AuthResponse>;
}

function vnpaySignature(values: Record<string, string>): string {
  const raw = Object.entries(values)
    .filter(([key, value]) => key.startsWith('vnp_') && key !== 'vnp_SecureHash' && key !== 'vnp_SecureHashType' && value)
    .sort(([left], [right]) => left.localeCompare(right, 'en-US'))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return createHmac('sha512', hashSecret).update(raw).digest('hex');
}

test.describe('Integrated guest stay lifecycle on the real WebApi', () => {
  test.skip(!apiRoot, 'Set LUXESTAY_E2E_API_URL to run the integrated lifecycle.');

  test('keeps one reservation identity from search through invoice and dirty room', async ({ request }) => {
    const customer = await login(
      request,
      process.env.LUXESTAY_E2E_CUSTOMER_USERNAME!,
      process.env.LUXESTAY_E2E_CUSTOMER_PASSWORD!,
    );
    const owner = await login(
      request,
      process.env.LUXESTAY_E2E_OWNER_USERNAME!,
      process.env.LUXESTAY_E2E_OWNER_PASSWORD!,
    );
    const customerHeaders = { Authorization: `Bearer ${customer.accessToken}` };
    const ownerHeaders = { Authorization: `Bearer ${owner.accessToken}` };
    const checkIn = new Date().toISOString().slice(0, 10);
    const checkOutDate = new Date();
    checkOutDate.setUTCDate(checkOutDate.getUTCDate() + 1);
    const checkOut = checkOutDate.toISOString().slice(0, 10);

    const searchResponse = await request.get(`${apiRoot}/public/properties/search`, {
      params: { keyword: 'LuxeStay Sài Gòn', checkInDate: checkIn, checkOutDate: checkOut, adultCount: 2, roomCount: 1 },
    });
    expect(searchResponse.ok(), await searchResponse.text()).toBe(true);
    const search = await searchResponse.json() as { content: Array<{ id: string; name: string }> };
    const property = search.content.find(item => item.name.includes('LuxeStay Sài Gòn'));
    expect(property).toBeTruthy();

    const typesResponse = await request.get(`${apiRoot}/room-types/public/hotel/${property!.id}`, {
      params: { checkIn, checkOut, guests: 2 },
    });
    expect(typesResponse.ok(), await typesResponse.text()).toBe(true);
    const roomTypes = await typesResponse.json() as Array<{ id: string; availableRooms: number }>;
    expect(roomTypes[0]?.availableRooms).toBeGreaterThan(0);
    const roomTypeId = roomTypes[0].id;

    const holdResponse = await request.post(`${apiRoot}/reservations/hold`, {
      headers: { 'Idempotency-Key': `journey-hold-${Date.now()}` },
      data: { tenantId: property!.id, roomTypeId, checkInDate: checkIn, checkOutDate: checkOut, quantity: 1 },
    });
    expect(holdResponse.ok(), await holdResponse.text()).toBe(true);
    const holdEnvelope = await holdResponse.json() as { data: { holdToken: string } };

    const bookingResponse = await request.post(`${apiRoot}/reservations/book`, {
      headers: { ...customerHeaders, 'Idempotency-Key': `journey-book-${Date.now()}` },
      data: {
        roomTypeId, checkInDate: checkIn, checkOutDate: checkOut, guests: 2, adults: 2, children: 0,
        firstName: 'Journey', lastName: 'Guest', phone: '0901234567', email: 'customer@gmail.com',
        paymentMethod: 'VNPAY', quantity: 1, holdToken: holdEnvelope.data.holdToken,
      },
    });
    expect(bookingResponse.ok(), await bookingResponse.text()).toBe(true);
    const booking = await bookingResponse.json() as { id: string; bookingCode: string; status: string };
    expect(booking.status).toBe('PENDING_PAYMENT');

    const sessionResponse = await request.post(`${apiRoot}/payments/sessions`, {
      headers: { ...customerHeaders, 'Idempotency-Key': `journey-payment-${Date.now()}` },
      data: { reservationId: booking.id, provider: 'VNPAY' },
    });
    expect(sessionResponse.ok(), await sessionResponse.text()).toBe(true);
    const session = await sessionResponse.json() as { sessionId: string; reservationId: string; amount: number };
    expect(session.reservationId).toBe(booking.id);

    const ipnValues: Record<string, string> = {
      vnp_TxnRef: session.sessionId,
      vnp_Amount: String(Math.round(session.amount * 100)),
      vnp_ResponseCode: '00',
      vnp_TransactionNo: `E2E${Date.now()}`,
    };
    const ipnResponse = await request.get(`${apiRoot}/payments/vnpay-ipn`, {
      params: { ...ipnValues, vnp_SecureHash: vnpaySignature(ipnValues) },
    });
    expect(ipnResponse.ok(), await ipnResponse.text()).toBe(true);
    expect(await ipnResponse.json()).toMatchObject({ rspCode: '00' });

    const roomsResponse = await request.get(`${apiRoot}/rooms`, { headers: ownerHeaders });
    expect(roomsResponse.ok(), await roomsResponse.text()).toBe(true);
    const rooms = await roomsResponse.json() as Array<{ id: string; roomTypeId: string; status: string }>;
    const assignedRoom = rooms.find(room => room.roomTypeId === roomTypeId && room.status === 'AVAILABLE');
    expect(assignedRoom).toBeTruthy();

    const checkInResponse = await request.post(`${apiRoot}/frontdesk/check-in`, {
      headers: ownerHeaders,
      data: { reservationId: booking.id, assignedRoomIds: [assignedRoom!.id], guestIdentityCard: 'E2E-ID' },
    });
    expect(checkInResponse.ok(), await checkInResponse.text()).toBe(true);

    const checkOutResponse = await request.post(`${apiRoot}/frontdesk/check-out`, {
      headers: ownerHeaders,
      data: { reservationId: booking.id, additionalPayment: 0, paymentMethod: 'CASH' },
    });
    expect(checkOutResponse.ok(), await checkOutResponse.text()).toBe(true);

    const invoiceResponse = await request.get(`${apiRoot}/management/reservations/${booking.id}/invoice`, { headers: ownerHeaders });
    expect(invoiceResponse.ok(), await invoiceResponse.text()).toBe(true);
    const invoice = await invoiceResponse.json() as { reservationId: string; status: string; balanceAmount: number };
    expect(invoice).toMatchObject({ reservationId: booking.id, status: 'FINALIZED', balanceAmount: 0 });

    const finalRoomsResponse = await request.get(`${apiRoot}/rooms`, { headers: ownerHeaders });
    const finalRooms = await finalRoomsResponse.json() as Array<{ id: string; status: string }>;
    expect(finalRooms.find(room => room.id === assignedRoom!.id)?.status).toBe('DIRTY');
  });
});
