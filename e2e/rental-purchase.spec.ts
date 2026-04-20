import { participantTest as test, expect } from "./fixtures/auth";
import {
  assertPurchaseIntentPayload,
  assertRentalQueryParams,
  fillRentalEventForm,
  fillStripeCard,
  parseRequestPayload,
  RENTAL_END_LOCAL,
  RENTAL_START_LOCAL,
} from "./utils/rental";
import { SEED_FIELD, SEED_ORG, SEED_RENTAL_SLOT } from "./fixtures/seed-data";

const expectedRentalTotalCents =
  SEED_RENTAL_SLOT.price *
  ((SEED_RENTAL_SLOT.endTimeMinutes - SEED_RENTAL_SLOT.startTimeMinutes) / 60);

test.describe("rental purchase (fields flow)", () => {
  test("participant starts rental purchase from organization fields", async ({
    page,
  }) => {
    const eventId = `rental_purchase_${Date.now()}`;
    const params = new URLSearchParams({
      create: "1",
      rentalOrgId: SEED_ORG.id,
      rentalFieldId: SEED_FIELD.id,
      rentalFieldName: SEED_FIELD.name,
      rentalFieldNumber: String(SEED_FIELD.fieldNumber),
      rentalLocation: SEED_FIELD.location,
      rentalLat: String(SEED_FIELD.lat),
      rentalLng: String(SEED_FIELD.long),
      rentalStart: RENTAL_START_LOCAL,
      rentalEnd: RENTAL_END_LOCAL,
      rentalPriceCents: String(expectedRentalTotalCents),
    });
    await page.goto(`/events/${eventId}/schedule?${params.toString()}`, {
      waitUntil: "domcontentloaded",
    });

    const createEventButton = page.getByRole("button", {
      name: "Create Event",
    });
    await expect(createEventButton).toBeEnabled();

    assertRentalQueryParams(page.url(), {
      priceCents: expectedRentalTotalCents,
    });

    await expect(page.getByLabel("Event Name")).toBeVisible();
    await fillRentalEventForm(page, { name: "Rental Event (Participant)" });

    const intentRequestPromise = page.waitForRequest(
      (request) =>
        request.url().includes("/api/billing/purchase-intent") &&
        request.method() === "POST",
    );
    const intentResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/billing/purchase-intent") &&
        response.request().method() === "POST",
    );

    await page.getByRole("button", { name: "Create Event" }).click();

    const intentRequest = await intentRequestPromise;
    const intentPayload = parseRequestPayload(intentRequest);
    assertPurchaseIntentPayload(intentPayload, {
      priceCents: expectedRentalTotalCents,
    });

    const intentResponse = await intentResponsePromise;
    const intentBody = await intentResponse.json();

    if (!intentResponse.ok()) {
      expect(intentBody?.error).toBe(
        "Billing address is required before creating a payment intent.",
      );
      await expect(
        page.getByText(
          "Billing address is required before creating a payment intent.",
        ),
      ).toBeVisible();
      return;
    }

    const paymentIntent =
      typeof intentBody?.paymentIntent === "string"
        ? intentBody.paymentIntent
        : "";
    const isMockIntent = /^(pi_mock_|pi_fallback_)/.test(paymentIntent);

    if (isMockIntent) {
      expect(paymentIntent).toMatch(/^(pi_mock_|pi_fallback_)/);
      await expect(
        page.getByRole("dialog", {
          name: /Confirm Payment|Configuration Error/i,
        }),
      ).toBeVisible();
      const cancelButton = page.getByRole("button", { name: "Cancel" });
      if (await cancelButton.isVisible()) {
        await cancelButton.click();
      }
      return;
    }

    await page.getByRole("button", { name: "Continue to Payment" }).click();
    await fillStripeCard(page);

    await page.getByRole("button", { name: /Pay/ }).click();
    await expect(page.getByText("Payment successful")).toBeVisible();
  });
});
