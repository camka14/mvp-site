import { test } from '@playwright/test';
import { AUTH_STORAGE, seedLocationStorage } from './utils/event';
import { SEED_ORG } from './fixtures/seed-data';

test.use({ storageState: AUTH_STORAGE.host });

test('debug event create page', async ({ page }) => {
  await seedLocationStorage(page);
  await page.goto(`/events/debug/schedule?create=1&mode=edit&tab=details&orgId=${SEED_ORG.id}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(3000);

  const loadingUser = await page.getByText('Loading user...').isVisible({ timeout: 1000 }).catch(() => false);
  const loadingSchedule = await page.getByText('Loading schedule...').isVisible({ timeout: 1000 }).catch(() => false);
  const redirecting = await page.getByText('Redirecting to login...').isVisible({ timeout: 1000 }).catch(() => false);
  const createButtonVisible = await page.getByRole('button', { name: 'Create Event' }).isVisible({ timeout: 1000 }).catch(() => false);

  console.log('loadingUser', loadingUser);
  console.log('loadingSchedule', loadingSchedule);
  console.log('redirecting', redirecting);
  console.log('createButtonVisible', createButtonVisible);
});
