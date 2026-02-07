import { test, expect } from '@playwright/test';
import { AUTH_STORAGE, seedLocationStorage } from './utils/event';
import { SEED_IMAGE, SEED_ORG, SEED_SPORT, SEED_USERS } from './fixtures/seed-data';

test.use({ storageState: AUTH_STORAGE.host });

test('creates an event from the schedule create flow', async ({ page }) => {
  const eventId = `event_create_${Date.now()}`;

  page.on('pageerror', (err) => console.log('[pageerror]', err.message));
  page.on('console', (msg) => {
    console.log(`[console:${msg.type()}]`, msg.text());
  });
  page.on('request', (req) => {
    if (req.url().includes('/api/auth/me')) {
      console.log('[e2e] auth request', req.url());
    }
    if (req.resourceType() === 'script' && req.url().includes('/_next/')) {
      console.log('[e2e] script request', req.url());
    }
  });
  page.on('response', (res) => {
    if (res.request().resourceType() === 'script' && !res.ok()) {
      console.log('[e2e] script response error', res.status(), res.url());
    }
    if (res.url().includes('/api/')) {
      console.log('[e2e] api response', res.status(), res.request().method(), res.url());
    }
  });
  page.on('requestfailed', (req) => {
    console.log('[e2e] request failed', req.url(), req.failure()?.errorText);
  });
  page.on('crash', () => {
    console.log('[e2e] page crashed');
  });
  page.on('close', () => {
    console.log('[e2e] page closed');
  });
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      console.log('[e2e] navigated', frame.url());
    }
  });

  await seedLocationStorage(page);
  await page.goto(
    `/events/${eventId}/schedule?create=1&orgId=${SEED_ORG.id}`,
    {
      waitUntil: 'domcontentloaded',
    },
  );
  console.log('[e2e] url after goto', page.url());
  await page.waitForTimeout(5000);
  console.log('[e2e] url after 5s', page.url());

  await page.getByText('Loading...').waitFor({ state: 'detached', timeout: 10000 }).catch(() => null);

  const eventNameInput = page.getByPlaceholder('Enter event name');
  await expect(eventNameInput).toBeVisible({ timeout: 30000 });

  await eventNameInput.fill('E2E Create Event');

  const locationInput = page.getByLabel('Location');
  await expect(locationInput).not.toHaveValue('');

  const selectImageButton = page.getByRole('button', { name: /select image/i }).first();
  await selectImageButton.click();
  const uploadedImage = page.getByAltText('Uploaded').first();
  await expect(uploadedImage).toBeVisible({ timeout: 10000 });
  await uploadedImage.click();
  await expect(page.getByAltText('Selected image')).toBeVisible();

  const sportInput = page.getByLabel('Sport');
  await expect(sportInput).toBeEnabled();
  await sportInput.click();
  await page.getByRole('option', { name: /volleyball/i }).click();

  const divisionsInput = page.getByLabel('Divisions');
  await divisionsInput.click();
  await page.getByRole('option', { name: /open/i }).click();

  const scheduleRequestPromise = page.waitForRequest((req) =>
    req.url().includes('/api/events/schedule') && req.method() === 'POST'
  );
  const scheduleResponsePromise = page.waitForResponse((res) =>
    res.url().includes('/api/events/schedule') && res.request().method() === 'POST'
  );

  const createEventButton = page.getByRole('button', { name: /create event/i }).first();
  await createEventButton.waitFor({ state: 'attached' });
  await createEventButton.click({ force: true });

  const scheduleRequest = await scheduleRequestPromise;
  const scheduleResponse = await scheduleResponsePromise;
  expect(scheduleResponse.ok()).toBeTruthy();

  const payload = scheduleRequest.postDataJSON() as { eventDocument?: Record<string, unknown> };
  const eventDocument = payload.eventDocument ?? {};
  const payloadId = (eventDocument.id ?? eventDocument.$id) as string | undefined;

  expect(payloadId).toBe(eventId);
  expect(eventDocument.hostId).toBe(SEED_USERS.host.id);
  expect(eventDocument.sportId).toBe(SEED_SPORT.id);
  expect(eventDocument.eventType).toBe('EVENT');
  expect(eventDocument.imageId).toBe(SEED_IMAGE.id);
  if (Array.isArray(eventDocument.divisions)) {
    expect(eventDocument.divisions).toContain('open');
  }
  expect(eventDocument.teamSizeLimit).toBe(2);
  expect(eventDocument.organizationId).toBe(SEED_ORG.id);

  const normalizedFieldIds = Array.isArray(eventDocument.fieldIds) ? eventDocument.fieldIds : [];
  const normalizedTimeSlotIds = Array.isArray(eventDocument.timeSlotIds) ? eventDocument.timeSlotIds : [];
  expect(normalizedFieldIds).toHaveLength(0);
  expect(normalizedTimeSlotIds).toHaveLength(0);

  await expect(page.getByRole('heading', { name: 'E2E Create Event' })).toBeVisible();
});
