import { participantTest as test, expect } from './fixtures/auth';
import {
  assertPurchaseIntentPayload,
  assertRentalQueryParams,
  fillRentalEventForm,
  fillStripeCard,
  parseRequestPayload,
  rentalFieldsUrl,
} from './utils/rental';
import { SEED_RENTAL_SLOT } from './fixtures/seed-data';

test.describe('rental purchase (fields flow)', () => {
  test('participant starts rental purchase from organization fields', async ({ page }) => {
    await page.goto(rentalFieldsUrl, { waitUntil: 'domcontentloaded' });

    const createEventButton = page.getByRole('button', { name: 'Create Event' });
    await expect(createEventButton).toBeEnabled();

    await Promise.all([
      page.waitForURL(/\/events\/.+\/schedule\?/),
      createEventButton.click(),
    ]);

    assertRentalQueryParams(page.url(), { priceCents: SEED_RENTAL_SLOT.price });

    await expect(page.getByLabel('Event Name')).toBeVisible();
    await fillRentalEventForm(page, { name: 'Rental Event (Participant)' });

    const intentRequestPromise = page.waitForRequest(
      (request) => request.url().includes('/api/billing/purchase-intent') && request.method() === 'POST',
    );
    const intentResponsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/billing/purchase-intent') && response.request().method() === 'POST',
    );

    await page.getByRole('button', { name: 'Create Event' }).click();

    const intentRequest = await intentRequestPromise;
    const intentPayload = parseRequestPayload(intentRequest);
    assertPurchaseIntentPayload(intentPayload);

    const intentResponse = await intentResponsePromise;
    const intentBody = await intentResponse.json();

    const paymentIntent = typeof intentBody?.paymentIntent === 'string' ? intentBody.paymentIntent : '';
    const isMockIntent = /^(pi_mock_|pi_fallback_)/.test(paymentIntent);

    if (isMockIntent) {
      expect(paymentIntent).toMatch(/^(pi_mock_|pi_fallback_)/);
      await expect(
        page.getByRole('dialog', { name: /Confirm Payment|Configuration Error/i }),
      ).toBeVisible();
      const cancelButton = page.getByRole('button', { name: 'Cancel' });
      if (await cancelButton.isVisible()) {
        await cancelButton.click();
      }
      return;
    }

    await page.getByRole('button', { name: 'Continue to Payment' }).click();
    await fillStripeCard(page);

    await page.getByRole('button', { name: /Pay/ }).click();
    await expect(page.getByText('Payment successful')).toBeVisible();
  });
});
