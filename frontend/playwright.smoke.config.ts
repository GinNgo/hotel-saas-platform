import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

export default defineConfig({
  ...baseConfig,
  testMatch: [
    'access-token-session.spec.ts',
    'operations-smoke.spec.ts',
    'search-booking-flow.spec.ts',
    'customer-invoice-smoke.spec.ts',
    'admin-core-management.spec.ts',
    'room-type-image-lifecycle.spec.ts',
    'ai-approval-inbox.spec.ts',
  ],
  retries: 0,
});
