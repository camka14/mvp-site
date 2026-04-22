import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const useProdServer = process.env.E2E_WEB_SERVER !== 'dev';
const webServerEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
);
const webServerCommand = useProdServer
  ? 'npm run build && npm run start'
  : 'npm run dev';

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
    env: {
      ...webServerEnv,
      NEXT_PUBLIC_DISABLE_CHAT: '1',
      NEXT_PUBLIC_E2E: '1',
    },
    url: baseURL,
    reuseExistingServer: !useProdServer,
    timeout: 180000,
  },
});
