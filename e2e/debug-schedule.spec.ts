import { test } from '@playwright/test';
import { AUTH_STORAGE, seedLocationStorage } from './utils/event';
import { SEED_ORG } from './fixtures/seed-data';

test.use({ storageState: AUTH_STORAGE.host });

test('debug schedule evaluate', async ({ page }) => {
  await seedLocationStorage(page);
  await page.goto(`http://localhost:3001/events/debug/schedule?create=1&mode=edit&tab=details&orgId=${SEED_ORG.id}`, { waitUntil: 'domcontentloaded' });
  const probe = await page.evaluate(() => 1 + 1);
  console.log('probe', probe);
});
