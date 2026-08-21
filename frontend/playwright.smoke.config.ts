import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

const smokeUrl = process.env.LUXESTAY_SMOKE_WEB_URL || 'http://127.0.0.1:4318';

export default defineConfig({
  ...baseConfig,
  testMatch: [
    'access-token-session.spec.ts',
    'operations-smoke.spec.ts',
    'search-booking-flow.spec.ts',
    'property-booking-payment.spec.ts',
    'stay-checkout-invoice.spec.ts',
    'customer-invoice-smoke.spec.ts',
    'admin-core-management.spec.ts',
    'room-type-image-lifecycle.spec.ts',
    'ai-approval-inbox.spec.ts',
    'platform-admin-workflows.spec.ts',
  ],
  retries: 0,
  use: { ...baseConfig.use, baseURL: smokeUrl },
  webServer: {
    command: 'npm run start -- --host 127.0.0.1 --port 4318',
    url: smokeUrl,
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
});
