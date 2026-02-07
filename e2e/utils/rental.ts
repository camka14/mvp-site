import type { Page, Request } from '@playwright/test';
import { expect } from '@playwright/test';
import {
  SEED_FIELD,
  SEED_IMAGE,
  SEED_ORG,
  SEED_RENTAL_SLOT,
  SEED_USERS,
} from '../fixtures/seed-data';

const stripIsoSuffix = (value: string): string =>
  value.replace(/\.\d{3}Z$/, '').replace(/Z$/, '');

export const toLocalDateTimeString = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return stripIsoSuffix(parsed.toISOString());
};

export const RENTAL_START_LOCAL = toLocalDateTimeString(SEED_RENTAL_SLOT.startDate);
export const RENTAL_END_LOCAL = toLocalDateTimeString(SEED_RENTAL_SLOT.endDate);

export const rentalFieldsUrl = `/organizations/${SEED_ORG.id}?tab=fields`;

export const stripeEnvReady = Boolean(
  process.env.STRIPE_SECRET_KEY &&
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY &&
  process.env.STRIPE_WEBHOOK_SECRET,
);

export const parseRequestPayload = (request: Request): Record<string, any> => {
  const postData = request.postData();
  if (!postData) return {};
  try {
    return JSON.parse(postData) as Record<string, any>;
  } catch {
    return {};
  }
};

export const extractId = (value: any): string | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    return value.$id ?? value.id ?? undefined;
  }
  return undefined;
};

export const assertRentalQueryParams = (
  urlValue: string | URL,
  options?: { priceCents?: number },
): void => {
  const url = typeof urlValue === 'string' ? new URL(urlValue) : urlValue;
  expect(url.searchParams.get('create')).toBe('1');
  expect(url.searchParams.get('rentalOrgId')).toBe(SEED_ORG.id);
  expect(url.searchParams.get('rentalFieldId')).toBe(SEED_FIELD.id);
  expect(url.searchParams.get('rentalFieldName')).toBe(SEED_FIELD.name);
  expect(url.searchParams.get('rentalFieldNumber')).toBe(String(SEED_FIELD.fieldNumber));
  expect(url.searchParams.get('rentalFieldType')).toBe(SEED_FIELD.type);
  expect(url.searchParams.get('rentalLocation')).toBe(SEED_FIELD.location);
  expect(url.searchParams.get('rentalLat')).toBe(String(SEED_FIELD.lat));
  expect(url.searchParams.get('rentalLng')).toBe(String(SEED_FIELD.long));
  expect(url.searchParams.get('rentalStart')).toBe(RENTAL_START_LOCAL);
  expect(url.searchParams.get('rentalEnd')).toBe(RENTAL_END_LOCAL);
  if (typeof options?.priceCents === 'number') {
    expect(url.searchParams.get('rentalPriceCents')).toBe(String(options.priceCents));
  }
};

const selectComboboxOption = async (
  page: Page,
  label: string,
  optionMatcher?: RegExp,
): Promise<void> => {
  const input = page.getByLabel(label);
  await input.scrollIntoViewIfNeeded();
  await input.click();

  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();

  const firstOption = listbox.getByRole('option').first();
  await expect(firstOption).toBeVisible();

  if (optionMatcher) {
    await listbox.getByRole('option', { name: optionMatcher }).click();
    return;
  }

  await firstOption.click();
};

const ensureSeedImageSelected = async (page: Page): Promise<void> => {
  const existingPreview = page.getByRole('img', { name: 'Selected image' });
  if (await existingPreview.count()) {
    return;
  }

  const selectButton = page.getByRole('button', { name: /select image/i });
  await selectButton.scrollIntoViewIfNeeded();
  await selectButton.click();

  const modal = page.getByRole('dialog', { name: /select image/i });
  await expect(modal).toBeVisible();

  const uploaded = modal.locator('img[alt="Uploaded"]');
  const count = await uploaded.count();
  if (!count) {
    throw new Error(
      `No uploaded images available for selection. Ensure seed user includes ${SEED_IMAGE.id} in uploadedImages.`,
    );
  }

  await uploaded.first().click();
  await expect(modal).toBeHidden();
};

export const fillRentalEventForm = async (
  page: Page,
  options?: { name?: string },
): Promise<void> => {
  await page.getByLabel('Event Name').fill(options?.name ?? 'Rental Event');
  await selectComboboxOption(page, 'Sport');
  await selectComboboxOption(page, 'Divisions', /Open/i);
  await ensureSeedImageSelected(page);
};

export const assertPurchaseIntentPayload = (payload: Record<string, any>): void => {
  const userId = extractId(payload.user);
  expect(userId).toBe(SEED_USERS.participant.id);

  const orgId = extractId(payload.organization);
  expect(orgId).toBe(SEED_ORG.id);

  const timeSlot = payload.timeSlot ?? {};
  expect(timeSlot.scheduledFieldId ?? timeSlot.fieldId).toBe(SEED_FIELD.id);
  expect(timeSlot.startDate).toBe(RENTAL_START_LOCAL);
  expect(timeSlot.endDate).toBe(RENTAL_END_LOCAL);
  expect(timeSlot.price).toBe(SEED_RENTAL_SLOT.price);
};

export const fillStripeCard = async (page: Page): Promise<void> => {
  const stripeFrames = page.frameLocator('iframe[name^="__privateStripeFrame"]');

  const cardNumber = stripeFrames.locator('input[placeholder*="1234"]');
  await expect(cardNumber).toBeVisible({ timeout: 15000 });
  await cardNumber.fill('4242 4242 4242 4242');

  const expiry = stripeFrames.locator('input[placeholder*="MM"]');
  await expiry.fill('12 / 34');

  const cvc = stripeFrames.locator('input[placeholder*="CVC"]');
  await cvc.fill('123');

  const postal = stripeFrames.locator('input[placeholder*="ZIP"], input[placeholder*="Postal"]');
  if (await postal.count()) {
    await postal.first().fill('94103');
  }
};
