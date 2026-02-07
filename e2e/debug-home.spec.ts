import { test } from '@playwright/test';
import { AUTH_STORAGE } from './utils/event';

test.use({ storageState: AUTH_STORAGE.host });

test('debug home page', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  const probe = await page.evaluate(() => 1 + 1);
  console.log('probe', probe);
});
