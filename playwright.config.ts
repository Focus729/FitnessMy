import { defineConfig, devices } from '@playwright/test';

/**
 * Раздел 19.5: три сквозных сценария — добавление еды из «частого»,
 * проведение тренировки от начала до конца, экспорт и импорт копии.
 *
 * Проверяем собранное приложение, а не dev-сервер: офлайн-поведение и
 * Service Worker имеют смысл только в сборке.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    ...devices['Pixel 7'],
    // Язык интерфейса берётся из navigator.language (8.1), поэтому сценарии
    // прогоняются с русской локалью — она основная.
    locale: 'ru-RU',
    // Если в окружении уже стоит Chromium, берём его: скачивать браузер заново
    // при каждом прогоне незачем. Локально переменная не нужна.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
