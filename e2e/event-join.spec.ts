import { test, expect } from '@playwright/test';
import { AUTH_STORAGE, ensureDobVerified, openEventFromDiscover, seedLocationStorage } from './utils/event';
import { SEED_EVENTS, SEED_USERS } from './fixtures/seed-data';

test.use({ storageState: AUTH_STORAGE.participant });

test('joins the seeded free event via self registration', async ({ page }) => {
  await seedLocationStorage(page);
  await ensureDobVerified(page.request, SEED_USERS.participant.id);

  await page.goto('/discover', { waitUntil: 'domcontentloaded' });
  await openEventFromDiscover(page, SEED_EVENTS.free.name);

  const registrationRequestPromise = page.waitForRequest((req) =>
    req.url().includes(`/api/events/${SEED_EVENTS.free.id}/registrations/self`) && req.method() === 'POST'
  );
  const registrationResponsePromise = page.waitForResponse((res) =>
    res.url().includes(`/api/events/${SEED_EVENTS.free.id}/registrations/self`) && res.request().method() === 'POST'
  );

  await page.getByRole('button', { name: /^Join Event$/ }).click();

  const registrationRequest = await registrationRequestPromise;
  const registrationResponse = await registrationResponsePromise;
  expect(registrationResponse.ok()).toBeTruthy();

  const registrationPayload = registrationRequest.postDataJSON() as { eventId?: string };
  expect(registrationPayload.eventId).toBe(SEED_EVENTS.free.id);

  const participantsRequest = await page
    .waitForRequest(
      (req) =>
        req.url().includes(`/api/events/${SEED_EVENTS.free.id}/participants`) && req.method() === 'POST',
      { timeout: 2000 },
    )
    .catch(() => null);

  if (participantsRequest) {
    const participantsPayload = participantsRequest.postDataJSON() as { user?: { $id?: string; id?: string } };
    const userId = participantsPayload.user?.$id ?? participantsPayload.user?.id;
    expect(userId).toBe(SEED_USERS.participant.id);
  }

  await expect(page.getByText(/Failed to join event/i)).toHaveCount(0);
});

test('joins the seeded paid event and asserts payment intent payload', async ({ page }) => {
  await seedLocationStorage(page);
  await ensureDobVerified(page.request, SEED_USERS.participant.id);

  await page.goto('/discover', { waitUntil: 'domcontentloaded' });
  await openEventFromDiscover(page, SEED_EVENTS.paid.name);

  const registrationRequestPromise = page.waitForRequest((req) =>
    req.url().includes(`/api/events/${SEED_EVENTS.paid.id}/registrations/self`) && req.method() === 'POST'
  );
  const purchaseRequestPromise = page.waitForRequest((req) =>
    req.url().includes('/api/billing/purchase-intent') && req.method() === 'POST'
  );

  await page.getByRole('button', { name: /Join Event -/ }).click();

  const registrationRequest = await registrationRequestPromise;
  const registrationPayload = registrationRequest.postDataJSON() as { eventId?: string };
  expect(registrationPayload.eventId).toBe(SEED_EVENTS.paid.id);

  const purchaseRequest = await purchaseRequestPromise;
  const purchasePayload = purchaseRequest.postDataJSON() as {
    user?: { $id?: string; id?: string };
    event?: { $id?: string; id?: string };
  };
  const purchaseUserId = purchasePayload.user?.$id ?? purchasePayload.user?.id;
  const purchaseEventId = purchasePayload.event?.$id ?? purchasePayload.event?.id;
  expect(purchaseUserId).toBe(SEED_USERS.participant.id);
  expect(purchaseEventId).toBe(SEED_EVENTS.paid.id);

  const paymentModal = page.getByRole('dialog');
  await expect(paymentModal).toBeVisible();

  const hasConfirm = await paymentModal.getByText('Confirm Payment').isVisible().catch(() => false);
  const hasConfigError = await paymentModal.getByText('Configuration Error').isVisible().catch(() => false);
  expect(hasConfirm || hasConfigError).toBeTruthy();
});
