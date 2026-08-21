import { defineConfig, devices } from '@playwright/test';

const webUrl = process.env.LUXESTAY_E2E_WEB_URL || 'http://localhost:4420';
const webPort = new URL(webUrl).port || '4420';
const webHost = new URL(webUrl).hostname;

export default defineConfig({
  testDir: './e2e',
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [['line']],
  timeout: 60_000,
  use: {
    baseURL: webUrl,
    screenshot: 'only-on-failure',
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run start -- --host ${webHost} --port ${webPort}`,
    url: webUrl,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
