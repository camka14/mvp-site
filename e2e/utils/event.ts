import type { APIRequestContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { SEED_ORG, SEED_USERS } from '../fixtures/seed-data';
import { storageStatePath } from '../fixtures/auth';

export const AUTH_STORAGE = {
  host: storageStatePath('host'),
  participant: storageStatePath('participant'),
};

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
      city: 'Test City',
      state: 'CA',
      zipCode: '94105',
      country: 'US',
      ...(overrides?.info ?? {}),
    },
  };

  await page.addInitScript((value: LocationPayload) => {
    localStorage.setItem('user-location', JSON.stringify(value.loc));
    localStorage.setItem('user-location-info', JSON.stringify(value.info));
  }, payload);
};

export const ensureDobVerified = async (request: APIRequestContext, userId = SEED_USERS.participant.id) => {
  const response = await request.patch(`/api/users/${userId}`, {
    data: {
      data: {
        dobVerified: true,
        dobVerifiedAt: new Date().toISOString(),
      },
    },
  });
  expect(response.ok()).toBeTruthy();
};

export const openEventFromDiscover = async (page: Page, eventName: string) => {
  await page.getByLabel('Search events').fill(eventName);
  await page.waitForTimeout(600);
  await page.getByRole('heading', { name: eventName }).click();
  await expect(page.getByRole('heading', { name: 'Event Details' })).toBeVisible();
};
