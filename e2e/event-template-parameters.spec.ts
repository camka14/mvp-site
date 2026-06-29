import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import {
  AUTH_STORAGE,
  acceptTermsIfNeeded,
  seedLocationStorage,
} from "./utils/event";
import {
  SEED_FIELD,
  SEED_IMAGE,
  SEED_ORG,
  SEED_SPORT,
  SEED_USERS,
} from "./fixtures/seed-data";

test.use({ storageState: AUTH_STORAGE.host });

type CreateEventParams = {
  eventId: string;
  event: Record<string, unknown>;
  newFields?: Array<Record<string, unknown>>;
  timeSlots?: Array<Record<string, unknown>>;
};

const buildDivisionId = (eventId: string, token: string) =>
  `${eventId}__division__${token}`;

const resolveDatabaseUrl = () => {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  const env = readFileSync(".env", "utf8");
  const line = env.split(/\n/).find((entry) => entry.startsWith("DATABASE_URL="));
  if (!line) {
    throw new Error("DATABASE_URL is not set.");
  }
  return line.replace(/^DATABASE_URL=/, "").replace(/^['"]|['"]$/g, "");
};

const markSlotAsRentalBacked = (
  slotId: string,
  bookingId: string,
  bookingItemId: string,
) => {
  const script = `
    import { PrismaClient } from "./src/generated/prisma/client";
    import { PrismaPg } from "@prisma/adapter-pg";
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    const prisma = new PrismaClient({ adapter });
    (async () => {
      await prisma.timeSlots.update({
        where: { id: process.env.SLOT_ID },
        data: {
          sourceType: "RENTAL_BOOKING",
          rentalBookingId: process.env.BOOKING_ID,
          rentalBookingItemId: process.env.BOOKING_ITEM_ID,
          rentalLocked: true,
          price: 2500,
        },
      });
      await prisma.$disconnect();
    })().catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
  `;

  execFileSync("npx", ["tsx", "-e", script], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: resolveDatabaseUrl(),
      SLOT_ID: slotId,
      BOOKING_ID: bookingId,
      BOOKING_ITEM_ID: bookingItemId,
    },
    stdio: "inherit",
  });
};

const createEventInBrowser = async (
  page: Page,
  params: CreateEventParams,
) => {
  const response = await page.evaluate(async (payload) => {
    const res = await fetch("/api/events", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: payload.eventId,
        event: payload.event,
        ...(payload.newFields?.length ? { newFields: payload.newFields } : {}),
        ...(payload.timeSlots?.length ? { timeSlots: payload.timeSlots } : {}),
      }),
    });
    const body = await res.json().catch(() => null);
    return {
      ok: res.ok,
      status: res.status,
      body,
    };
  }, params);

  expect(
    response.ok,
    `event create failed (${response.status}): ${JSON.stringify(response.body)}`,
  ).toBeTruthy();
};

const getEventTemplateInBrowser = async (
  page: Page,
  templateId: string,
) => {
  const response = await page.evaluate(async (id) => {
    const res = await fetch(`/api/event-templates/${encodeURIComponent(id)}`, {
      credentials: "include",
    });
    const body = await res.json().catch(() => null);
    return {
      ok: res.ok,
      status: res.status,
      body,
    };
  }, templateId);

  expect(
    response.ok,
    `template load failed (${response.status}): ${JSON.stringify(response.body)}`,
  ).toBeTruthy();
  return response.body?.template;
};

test("creates templates from complex event parameters and handles rental resources", async ({
  page,
}) => {
  test.setTimeout(120000);

  await seedLocationStorage(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const unique = Date.now();
  const sourceEventId = `e2e_template_params_source_${unique}`;
  const sourceDivisionId = buildDivisionId(sourceEventId, "open");
  const sourceEventName = `E2E Template Params ${unique}`;
  const reusableFieldId = `${sourceEventId}_practice_field`;
  const normalSlotId = `${sourceEventId}_normal_slot`;
  const rentalSlotId = `${sourceEventId}_rental_slot`;
  const sourceDayOffset = Math.floor(unique / 1000) % 365;
  const sourceDate = new Date(Date.UTC(2026, 0, 1 + sourceDayOffset, 0, 0, 0, 0));
  const sourceIsoAt = (hour: number, minute = 0) =>
    new Date(Date.UTC(
      sourceDate.getUTCFullYear(),
      sourceDate.getUTCMonth(),
      sourceDate.getUTCDate(),
      hour,
      minute,
      0,
      0,
    )).toISOString();
  const sourceDayOfWeek = sourceDate.getUTCDay();
  const sourceStart = sourceIsoAt(18);
  const sourceEnd = sourceIsoAt(22);
  const normalSlotStart = sourceIsoAt(18);
  const normalSlotEnd = sourceIsoAt(19, 30);
  const rentalSlotStart = sourceIsoAt(20);
  const rentalSlotEnd = sourceIsoAt(21, 30);
  const seededStartDate = new Date();
  seededStartDate.setHours(0, 0, 0, 0);
  seededStartDate.setDate(seededStartDate.getDate() + 2);
  if (
    seededStartDate.getFullYear() === sourceDate.getUTCFullYear() &&
    seededStartDate.getMonth() === sourceDate.getUTCMonth() &&
    seededStartDate.getDate() === sourceDate.getUTCDate()
  ) {
    seededStartDate.setDate(seededStartDate.getDate() + 1);
  }
  const seededStartDateButtonLabel = seededStartDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  await createEventInBrowser(page, {
    eventId: sourceEventId,
    event: {
      name: sourceEventName,
      description: "Complex template source event",
      start: sourceStart,
      end: sourceEnd,
      timeZone: "UTC",
      location: SEED_ORG.location,
      address: SEED_ORG.location,
      coordinates: SEED_ORG.coordinates,
      price: 4200,
      registrationPaymentMode: "MANUAL",
      manualPaymentLinks: [
        {
          label: "Front desk",
          url: "https://example.test/pay-front-desk",
        },
      ],
      manualPaymentInstructions: "Pay the organizer before the first match.",
      teamSizeLimit: 4,
      maxParticipants: 16,
      teamSignup: true,
      singleDivision: true,
      state: "PUBLISHED",
      eventType: "EVENT",
      sportId: SEED_SPORT.id,
      imageId: SEED_IMAGE.id,
      hostId: SEED_USERS.host.id,
      organizationId: SEED_ORG.id,
      officialSchedulingMode: "SCHEDULE",
      officialPositions: [
        {
          id: "referee",
          name: "Referee",
          count: 1,
          assignmentMode: "USER",
        },
      ],
      divisions: [sourceDivisionId],
      divisionDetails: [
        {
          id: sourceDivisionId,
          key: "open",
          name: "Open",
          price: 4200,
          maxParticipants: 16,
          allowPaymentPlans: true,
          installmentCount: 2,
          installmentAmounts: [2100, 2100],
          installmentDueRelativeDays: [0, 14],
          teamIds: [],
        },
      ],
      fieldIds: [reusableFieldId, SEED_FIELD.id],
      timeSlotIds: [normalSlotId, rentalSlotId],
      allowPaymentPlans: true,
      installmentCount: 2,
      installmentAmounts: [2100, 2100],
      installmentDueRelativeDays: [0, 14],
      allowTeamSplitDefault: true,
      requiredTemplateIds: [],
      noFixedEndDateTime: false,
      cancellationRefundHours: 24,
      registrationCutoffHours: 12,
    },
    newFields: [
      {
        id: reusableFieldId,
        name: "Practice Court",
        location: SEED_ORG.location,
        lat: SEED_FIELD.lat,
        long: SEED_FIELD.long,
        divisions: [sourceDivisionId],
      },
    ],
    timeSlots: [
      {
        id: normalSlotId,
        startDate: normalSlotStart,
        endDate: normalSlotEnd,
        timeZone: "UTC",
        repeating: false,
        dayOfWeek: sourceDayOfWeek,
        daysOfWeek: [sourceDayOfWeek],
        startTimeMinutes: 18 * 60,
        endTimeMinutes: 19 * 60 + 30,
        scheduledFieldId: reusableFieldId,
        scheduledFieldIds: [reusableFieldId],
        divisions: [sourceDivisionId],
      },
      {
        id: rentalSlotId,
        startDate: rentalSlotStart,
        endDate: rentalSlotEnd,
        timeZone: "UTC",
        repeating: false,
        dayOfWeek: sourceDayOfWeek,
        daysOfWeek: [sourceDayOfWeek],
        startTimeMinutes: 20 * 60,
        endTimeMinutes: 21 * 60 + 30,
        scheduledFieldId: SEED_FIELD.id,
        scheduledFieldIds: [SEED_FIELD.id],
        divisions: [sourceDivisionId],
      },
    ],
  });
  markSlotAsRentalBacked(
    rentalSlotId,
    `rental_booking_${unique}`,
    `rental_item_${unique}`,
  );

  await page.goto(`/events/${sourceEventId}/schedule?mode=edit`, {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByRole("heading", { name: sourceEventName }).first(),
  ).toBeVisible({ timeout: 30000 });
  await page.evaluate(async (organizationId) => {
    const response = await fetch(
      `/api/event-templates?organizationId=${encodeURIComponent(organizationId)}`,
      { credentials: "include" },
    );
    if (!response.ok) {
      throw new Error(`Template API prewarm failed: ${response.status}`);
    }
  }, SEED_ORG.id);

  const templateCreateRequest = page.waitForRequest((req) => {
    const url = new URL(req.url());
    return url.pathname === "/api/event-templates" && req.method() === "POST";
  });
  const templateCreateResponse = page.waitForResponse(
    (res) => {
      const url = new URL(res.url());
      return url.pathname === "/api/event-templates" &&
        res.request().method() === "POST";
    },
  );

  await page.getByRole("button", { name: /^more$/i }).click();
  await page.getByRole("menuitem", { name: /create template/i }).click();

  const templateRequest = await templateCreateRequest;
  const templateResponse = await templateCreateResponse;
  expect(templateResponse.ok()).toBeTruthy();

  const templatePayload = templateRequest.postDataJSON() as {
    sourceEventId?: string;
    id?: string;
    $id?: string;
    event?: Record<string, unknown>;
  };
  expect(templatePayload).toEqual({ sourceEventId });
  expect(templatePayload.id).toBeUndefined();
  expect(templatePayload.$id).toBeUndefined();
  expect(templatePayload.event).toBeUndefined();

  const templateResponseBody = await templateResponse.json();
  const templateId = templateResponseBody?.template?.id as string;
  expect(templateId).toBeTruthy();

  const persistedTemplate = await getEventTemplateInBrowser(page, templateId);
  expect(persistedTemplate).toEqual(expect.objectContaining({
    id: templateId,
    name: sourceEventName,
    sourceEventId,
    organizationId: SEED_ORG.id,
    registrationPaymentMode: "MANUAL",
    allowPaymentPlans: true,
    installmentCount: 2,
    allowTeamSplitDefault: true,
    price: 4200,
  }));
  expect(persistedTemplate.state).toBeUndefined();
  expect(persistedTemplate.teamIds).toBeUndefined();
  expect(persistedTemplate.userIds).toBeUndefined();
  expect(persistedTemplate.matches).toBeUndefined();
  expect(persistedTemplate.manualPaymentInstructions).toBe(
    "Pay the organizer before the first match.",
  );
  expect(persistedTemplate.manualPaymentLinks).toEqual([
    expect.objectContaining({
      label: "Front desk",
      url: "https://example.test/pay-front-desk",
    }),
  ]);
  expect(persistedTemplate.officialPositions).toEqual([
    expect.objectContaining({
      id: "referee",
      name: "Referee",
      count: 1,
    }),
  ]);
  expect(persistedTemplate.installmentAmounts).toEqual([2100, 2100]);

  const templateDivisionDetails = persistedTemplate.divisionDetails as
    | Array<Record<string, unknown>>
    | undefined;
  expect(templateDivisionDetails?.[0]).toEqual(
    expect.objectContaining({
      allowPaymentPlans: true,
      installmentCount: 2,
      installmentAmounts: [2100, 2100],
      maxParticipants: 16,
      teamIds: [],
    }),
  );

  expect(persistedTemplate.resources).toHaveLength(1);
  expect(persistedTemplate.resources[0]).toEqual(expect.objectContaining({
    sourceResourceId: reusableFieldId,
    name: "Practice Court",
  }));
  expect(persistedTemplate.resources.map((resource: Record<string, unknown>) =>
    resource.sourceResourceId,
  )).not.toContain(SEED_FIELD.id);
  const templateSlots = persistedTemplate.timeSlots as Array<Record<string, unknown>>;
  expect(templateSlots).toHaveLength(2);

  const rentalTemplateSlot = templateSlots.find((slot) => (
    Array.isArray(slot.rentalResourceHintIds) &&
      slot.rentalResourceHintIds.length > 0
  ));
  expect(rentalTemplateSlot).toBeTruthy();
  expect(rentalTemplateSlot).toEqual(
    expect.objectContaining({
      templateResourceIds: [],
      price: null,
    }),
  );
  expect(persistedTemplate.rentalResourceHints).toEqual(expect.arrayContaining([
    expect.objectContaining({ sourceResourceId: SEED_FIELD.id }),
  ]));

  const seededEventId = `e2e_template_params_seeded_${unique}`;
  await page.goto(
    `/events/${seededEventId}/schedule?create=1&mode=edit&orgId=${SEED_ORG.id}&templateId=${templateId}`,
    { waitUntil: "domcontentloaded" },
  );

  await acceptTermsIfNeeded(page);
  await expect(
    page.getByText(/choose the new event start date before applying this template/i),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole("button", { name: /use template/i })).toBeDisabled();
  await page.getByLabel("New event start date").click();
  await page.getByRole("button", { name: seededStartDateButtonLabel }).click();
  await expect(page.getByRole("button", { name: /use template/i })).toBeEnabled();
  await page.getByRole("button", { name: /use template/i }).click();

  await expect(
    page.getByText(/create a new rental for the resource/i),
  ).toBeVisible({ timeout: 30000 });
  await expect(
    page.getByRole("link", { name: /open rentals/i }),
  ).toHaveAttribute("href", /(rentals|facilities)/);

  await expect(page.getByPlaceholder("Enter event name")).toHaveValue(
    sourceEventName,
    { timeout: 30000 },
  );
  await acceptTermsIfNeeded(page);

  const seededCreateRequest = page.waitForRequest(
    (req) =>
      req.url().includes("/api/events/schedule") && req.method() === "POST",
  );
  const seededCreateResponse = page.waitForResponse(
    (res) =>
      res.url().includes("/api/events/schedule") &&
      res.request().method() === "POST",
  );

  await page.getByRole("button", { name: /^create event$/i }).click();

  const seededRequest = await seededCreateRequest;
  const seededResponse = await seededCreateResponse;
  expect(seededResponse.ok()).toBeTruthy();

  const seededPayload = seededRequest.postDataJSON() as {
    eventDocument?: Record<string, unknown>;
  };
  const seededDocument = seededPayload.eventDocument ?? {};
  const seededSlots = seededDocument.timeSlots as
    | Array<Record<string, unknown>>
    | undefined;
  const seededDivisionDetails = seededDocument.divisionDetails as
    | Array<Record<string, unknown>>
    | undefined;

  expect(seededDocument.id).toBe(seededEventId);
  expect(seededDocument.$id).toBeUndefined();
  expect(seededDocument.name).toBe(sourceEventName);
  expect((seededDocument.teamIds as string[] | undefined) ?? []).toEqual([]);
  expect((seededDocument.matches as Array<unknown> | undefined) ?? []).toEqual([]);
  expect((seededDivisionDetails?.[0]?.teamIds as string[] | undefined) ?? []).toEqual([]);
  expect(seededSlots).toHaveLength(2);
  expect(
    seededSlots?.every((slot) => !Object.prototype.hasOwnProperty.call(slot, "$id")) ??
      true,
  ).toBe(true);
  expect(seededSlots?.some((slot) => slot.startDate === rentalSlotStart)).toBe(
    false,
  );
  const seededRentalSlot = seededSlots?.find((slot) =>
    String(slot.sourceType ?? "").startsWith(
      "BRACKETIQ_TEMPLATE_RENTAL_RESOURCE:",
    ),
  );
  expect(seededRentalSlot).toEqual(
    expect.objectContaining({
      scheduledFieldIds: [],
      rentalBookingId: null,
      rentalBookingItemId: null,
      rentalLocked: false,
    }),
  );
});
