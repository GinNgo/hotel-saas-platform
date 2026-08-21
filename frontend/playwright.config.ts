import { defineConfig, devices } from '@playwright/test';

const e2eWebUrl = process.env.LUXESTAY_E2E_WEB_URL || 'http://localhost:4200';
const e2eWebPort = new URL(e2eWebUrl).port || '4200';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : 2,
  reporter: [['html', { open: 'never' }]],
  timeout: 30000,
  use: {
    baseURL: e2eWebUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run start -- --port ${e2eWebPort}`,
    url: e2eWebUrl,
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
});
