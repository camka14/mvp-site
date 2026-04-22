import { test, expect } from '@playwright/test';
import { AUTH_STORAGE, seedLocationStorage } from './utils/event';
import { SEED_ORG } from './fixtures/seed-data';
import { E2E_EVENT_IDS } from './fixtures/test-ids';

const hasGoogleMapsKey = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);

test.describe('google maps integration', () => {
  test.skip(!hasGoogleMapsKey, 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set');

  test.use({ storageState: AUTH_STORAGE.host });

  test('loads Maps JS API and renders the LocationSelector map', async ({ page }) => {
    const eventId = E2E_EVENT_IDS.googleMaps;

    await seedLocationStorage(page);
    await page.goto(`/events/${eventId}/schedule?create=1&orgId=${SEED_ORG.id}`, {
      waitUntil: 'domcontentloaded',
    });

    await page.getByPlaceholder('Enter event name').waitFor({ state: 'visible' });

    const showMapButton = page.getByRole('button', { name: /show map/i }).first();
    await showMapButton.click();

    await expect(page.getByRole('button', { name: /hide map/i })).toBeVisible();
    await page.waitForFunction(() => Boolean((window as any).google?.maps), null, { timeout: 20000 });
    await expect(page.getByPlaceholder('Search for an address or place')).toBeVisible();
  });
});
