import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { SEED_ORG, SEED_USERS } from "../fixtures/seed-data";
import { storageStatePath } from "../fixtures/auth";

export const AUTH_STORAGE = {
  host: storageStatePath("host"),
  participant: storageStatePath("participant"),
};

const SEED_USER_BY_ID = new Map(
  Object.values(SEED_USERS).map((user) => [user.id, user] as const),
);

type LocationPayload = {
  loc: { lat: number; lng: number };
  info: {
    lat: number;
    lng: number;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
};

export const seedLocationStorage = async (
  page: Page,
  overrides?: Partial<LocationPayload>,
) => {
  const [lng, lat] = SEED_ORG.coordinates;
  const payload: LocationPayload = {
    loc: {
      lat,
      lng,
      ...(overrides?.loc ?? {}),
    },
    info: {
      lat,
      lng,
      city: "Test City",
      state: "CA",
      zipCode: "94105",
      country: "US",
      ...(overrides?.info ?? {}),
    },
  };

  await page.addInitScript((value: LocationPayload) => {
    localStorage.setItem("user-location", JSON.stringify(value.loc));
    localStorage.setItem("user-location-info", JSON.stringify(value.info));
  }, payload);
};

export const ensureDobVerified = async (
  request: APIRequestContext,
  userId = SEED_USERS.participant.id,
) => {
  const patchDobVerified = async (headers?: Record<string, string>) =>
    request.patch(`/api/users/${userId}`, {
      data: {
        data: {
          dobVerified: true,
          dobVerifiedAt: new Date().toISOString(),
        },
      },
      headers,
    });

  let response = await patchDobVerified();

  if (!response.ok()) {
    const seedUser = SEED_USER_BY_ID.get(userId);
    if (seedUser) {
      const loginResponse = await request.post("/api/auth/login", {
        data: {
          email: seedUser.email,
          password: seedUser.password,
        },
      });

      if (loginResponse.ok()) {
        const payload = (await loginResponse.json().catch(() => ({}))) as {
          token?: string;
        };
        if (typeof payload.token === "string" && payload.token.length > 0) {
          response = await patchDobVerified({
            Authorization: `Bearer ${payload.token}`,
          });
        }
      }
    }
  }

  const responseBody = await response.text().catch(() => "");
  expect(
    response.ok(),
    `DOB verification failed for ${userId} (${response.status()}): ${responseBody}`,
  ).toBeTruthy();
};

export const openEventFromDiscover = async (
  page: Page,
  eventName: string,
  options?: { eventId?: string },
) => {
  await page.getByLabel("Search events").fill(eventName);
  await page.waitForTimeout(600);

  const cardHeading = page.getByRole("heading", { name: eventName }).first();
  const cardVisible = await cardHeading.isVisible().catch(() => false);

  if (cardVisible) {
    await cardHeading.click();
  } else if (options?.eventId) {
    await page.goto(`/events/${options.eventId}`, {
      waitUntil: "domcontentloaded",
    });
  } else {
    throw new Error(`Unable to find discover card for ${eventName}.`);
  }

  await page.waitForURL(/\/events\/[^/?#]+/);
  await expect(
    page.getByRole("heading", { name: eventName }).first(),
  ).toBeVisible();
};

export const acceptTermsIfNeeded = async (page: Page) => {
  const termsHeading = page.getByRole("heading", {
    name: "Agree to the Terms and EULA",
  });
  const termsVisible = await termsHeading.isVisible().catch(() => false);
  if (!termsVisible) {
    return;
  }

  await page.getByRole("button", { name: "Agree" }).click();
  await expect(termsHeading).toBeHidden();
};
