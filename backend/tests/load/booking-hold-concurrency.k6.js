import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    competing_holds: {
      executor: 'per-vu-iterations',
      vus: Number(__ENV.VUS || 20),
      iterations: 1,
      maxDuration: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
  },
};

export default function () {
  const baseUrl = __ENV.BASE_URL || 'http://127.0.0.1:5122';
  const payload = JSON.stringify({
    tenantId: __ENV.TENANT_ID,
    roomTypeId: __ENV.ROOM_TYPE_ID,
    checkInDate: __ENV.CHECK_IN,
    checkOutDate: __ENV.CHECK_OUT,
    quantity: 1,
  });
  const response = http.post(`${baseUrl}/api/reservations/hold`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `k6-hold-${__VU}-${Date.now()}`,
    },
    responseCallback: http.expectedStatuses(200, 409),
  });

  check(response, {
    'hold succeeds or loses inventory race cleanly': result => result.status === 200 || result.status === 409,
  });
}
