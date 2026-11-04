import { defineConfig } from '@playwright/test';

// Exercise storage modules against native IndexedDB without exposing fixture hooks in the app.
export default defineConfig({
  testDir: './scripts/browser',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4175',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 4175',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
  },
});
