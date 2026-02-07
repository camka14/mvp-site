import { hostTest as test, expect } from './fixtures/auth';
import { SEED_FIELD, SEED_RENTAL_SLOT } from './fixtures/seed-data';
import {
  assertRentalQueryParams,
  fillRentalEventForm,
  parseRequestPayload,
  rentalFieldsUrl,
  RENTAL_END_LOCAL,
  RENTAL_START_LOCAL,
} from './utils/rental';

test.describe('rental creation (fields flow)', () => {
  test('host creates a rental event from organization fields', async ({ page }) => {
    await page.route('**/api/time-slots**', async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      if (Array.isArray(payload?.timeSlots)) {
        payload.timeSlots = payload.timeSlots.map((slot: Record<string, any>) => {
          const slotId = slot.$id ?? slot.id;
          if (slotId === SEED_RENTAL_SLOT.id) {
            return { ...slot, price: 0 };
          }
          return slot;
        });
      }
      await route.fulfill({ response, json: payload });
    });

    await page.goto(rentalFieldsUrl, { waitUntil: 'domcontentloaded' });
    const createEventButton = page.getByRole('button', { name: 'Create Event' });
    await expect(createEventButton).toBeEnabled();

    await Promise.all([
      page.waitForURL(/\/events\/.+\/schedule\?/),
      createEventButton.click(),
    ]);

    assertRentalQueryParams(page.url());

    await expect(page.getByLabel('Event Name')).toBeVisible();
    await fillRentalEventForm(page, { name: 'Rental Event (Host)' });

    const scheduleRequestPromise = page.waitForRequest(
      (request) => request.url().includes('/api/events/schedule') && request.method() === 'POST',
    );

    await Promise.all([
      scheduleRequestPromise,
      page.getByRole('button', { name: 'Create Event' }).click(),
    ]);

    const scheduleRequest = await scheduleRequestPromise;
    const body = parseRequestPayload(scheduleRequest);
    const eventDocument = body.eventDocument ?? {};

    expect(eventDocument.start).toBe(RENTAL_START_LOCAL);
    expect(eventDocument.end).toBe(RENTAL_END_LOCAL);

    const fieldIds = Array.isArray(eventDocument.fieldIds) ? eventDocument.fieldIds : [];
    if (fieldIds.length) {
      expect(fieldIds).toContain(SEED_FIELD.id);
    } else if (Array.isArray(eventDocument.fields)) {
      const ids = eventDocument.fields
        .map((field: Record<string, any>) => field.$id ?? field.id)
        .filter(Boolean);
      expect(ids).toContain(SEED_FIELD.id);
    }
  });
});
