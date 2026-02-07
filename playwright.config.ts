import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const useProdServer = process.env.E2E_WEB_SERVER !== 'dev';
const webServerCommand = useProdServer
  ? 'NEXT_PUBLIC_DISABLE_CHAT=1 NEXT_PUBLIC_E2E=1 npm run build && NEXT_PUBLIC_DISABLE_CHAT=1 NEXT_PUBLIC_E2E=1 npm run start'
  : 'NEXT_PUBLIC_DISABLE_CHAT=1 NEXT_PUBLIC_E2E=1 npm run dev';

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  globalSetup: './e2e/global-setup',
  use: {
    baseURL,
    timezoneId: 'UTC',
    navigationTimeout: 60000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
  webServer: {
    command: webServerCommand,
    url: baseURL,
    reuseExistingServer: !useProdServer,
    timeout: 180000,
  },
});
