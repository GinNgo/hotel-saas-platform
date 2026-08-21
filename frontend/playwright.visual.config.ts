import { defineConfig, devices } from '@playwright/test';
import baseConfig from './playwright.config';

const visualUrl = process.env.LUXESTAY_VISUAL_WEB_URL || 'http://127.0.0.1:4317';

export default defineConfig({
  ...baseConfig,
  testMatch: ['visual-regression.spec.ts'],
  fullyParallel: false,
  retries: 0,
  workers: 1,
  snapshotPathTemplate: 'e2e/visual-baselines/{testFileName}/{arg}{ext}',
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.015,
      scale: 'css',
    },
  },
  projects: [{
    name: 'chromium',
    use: { ...devices['Desktop Chrome'], colorScheme: 'light', reducedMotion: 'reduce' },
  }],
  use: { ...baseConfig.use, baseURL: visualUrl },
  webServer: {
    command: 'npm run start -- --host 127.0.0.1 --port 4317',
    url: visualUrl,
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
});
