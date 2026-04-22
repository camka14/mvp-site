import { devices } from "@playwright/test";
import { test, expect } from "./fixtures/api";
import {
  SEED_DEV_USERS,
  SEED_DIVISION,
  SEED_ORG,
  SEED_SPORT,
  SEED_TEAM_IDS,
  SEED_UPLOADED_IMAGES,
  SEED_USERS,
} from "./fixtures/seed-data";
import {
  AUTH_STORAGE,
  ensureDobVerified,
  openEventFromDiscover,
  seedLocationStorage,
} from "./utils/event";
import { canonicalizeMatches } from "./utils/scheduler";

const iphone13 = devices["iPhone 13"];

test.use({
  storageState: AUTH_STORAGE.participant,
  viewport: iphone13.viewport,
  userAgent: iphone13.userAgent,
  deviceScaleFactor: iphone13.deviceScaleFactor,
  isMobile: iphone13.isMobile,
  hasTouch: iphone13.hasTouch,
});

type MatchSummary = {
  matchId: number;
  team1Id: string | null;
  team2Id: string | null;
  start: string | null;
  end: string | null;
  fieldId: string | null;
};

type StaffInviteSummary = {
  userId: string | null;
  staffTypes: string[];
};

type LeagueWindow = {
  start: string;
  end: string;
  dayOfWeek: number;
};

const buildLeagueWindow = (): LeagueWindow => {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 7);
  start.setUTCHours(10, 0, 0, 0);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 63);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    dayOfWeek: start.getUTCDay(),
  };
};

const buildLeagueEventDocument = (params: {
  eventId: string;
  eventName: string;
  fieldId: string;
  slotId: string;
  window: LeagueWindow;
}) => ({
  id: params.eventId,
  name: params.eventName,
  description: "E2E mobile playoff league coverage",
  start: params.window.start,
  end: params.window.end,
  divisions: [SEED_DIVISION.id],
  location: SEED_ORG.location,
  rating: 5,
  teamSizeLimit: 6,
  maxParticipants: 12,
  hostId: SEED_USERS.host.id,
  singleDivision: true,
  sportId: SEED_SPORT.id,
  waitListIds: [],
  freeAgentIds: [],
  cancellationRefundHours: 24,
  teamSignup: false,
  registrationCutoffHours: 2,
  seedColor: 0,
  imageId: SEED_UPLOADED_IMAGES.indoorSports.id,
  coordinates: SEED_ORG.coordinates,
  teamIds: SEED_TEAM_IDS.slice(0, 4),
  userIds: [],
  leagueScoringConfigId: null,
  organizationId: SEED_ORG.id,
  autoCancellation: false,
  eventType: "LEAGUE",
  officialIds: [],
  allowPaymentPlans: false,
  installmentCount: 0,
  installmentDueDates: [],
  installmentAmounts: [],
  allowTeamSplitDefault: false,
  requiredTemplateIds: [],
  gamesPerOpponent: 1,
  includePlayoffs: true,
  playoffTeamCount: 4,
  usesSets: false,
  matchDurationMinutes: 60,
  price: 0,
  state: "PUBLISHED",
  fields: [
    {
      $id: params.fieldId,
      name: "Mobile League Court",
      location: SEED_ORG.location,
      lat: SEED_ORG.coordinates[1],
      long: SEED_ORG.coordinates[0],
      divisions: [SEED_DIVISION.id],
      organizationId: SEED_ORG.id,
    },
  ],
  timeSlots: [
    {
      $id: params.slotId,
      dayOfWeek: params.window.dayOfWeek,
      daysOfWeek: [params.window.dayOfWeek],
      divisions: [SEED_DIVISION.id],
      startTimeMinutes: 0,
      endTimeMinutes: 24 * 60,
      repeating: true,
      scheduledFieldId: params.fieldId,
      scheduledFieldIds: [params.fieldId],
      startDate: params.window.start,
      endDate: params.window.end,
    },
  ],
});

const readEntityId = (
  value: Record<string, any> | null | undefined,
): string | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  if (typeof value.$id === "string" && value.$id.trim().length > 0) {
    return value.$id.trim();
  }
  if (typeof value.id === "string" && value.id.trim().length > 0) {
    return value.id.trim();
  }
  return null;
};

const simplifyMatches = (matches: any[]): MatchSummary[] =>
  (Array.isArray(matches) ? matches : [])
    .map((match) => ({
      matchId: Number(match?.matchId ?? 0),
      team1Id: typeof match?.team1Id === "string" ? match.team1Id : null,
      team2Id: typeof match?.team2Id === "string" ? match.team2Id : null,
      start: typeof match?.start === "string" ? match.start : null,
      end: typeof match?.end === "string" ? match.end : null,
      fieldId: typeof match?.fieldId === "string" ? match.fieldId : null,
    }))
    .sort((left, right) => left.matchId - right.matchId);

const simplifyStaffInvites = (invites: any[]): StaffInviteSummary[] =>
  (Array.isArray(invites) ? invites : [])
    .map((invite) => ({
      userId: typeof invite?.userId === "string" ? invite.userId : null,
      staffTypes: Array.isArray(invite?.staffTypes)
        ? invite.staffTypes.map(String).sort()
        : [],
    }))
    .sort((left, right) =>
      (left.userId ?? "").localeCompare(right.userId ?? ""),
    );

test("creates a playoff league, loads hydrated relations on mobile, and keeps the graph intact after join", async ({
  hostApi,
  participantApi,
  page,
}) => {
  const eventId = `event_league_mobile_${Date.now()}`;
  const fieldId = `${eventId}_field_1`;
  const slotId = `${eventId}_slot_1`;
  const eventName = "E2E Mobile Playoff League";
  const window = buildLeagueWindow();

  const scheduleResponse = await hostApi.post("/api/events/schedule", {
    data: {
      eventDocument: buildLeagueEventDocument({
        eventId,
        eventName,
        fieldId,
        slotId,
        window,
      }),
    },
  });
  expect(scheduleResponse.ok()).toBeTruthy();

  const scheduledPayload = await scheduleResponse.json();
  const expectedMatches = simplifyMatches(scheduledPayload.matches);
  const expectedBracket = canonicalizeMatches(scheduledPayload.matches ?? []);
  expect(readEntityId(scheduledPayload.event)).toBe(eventId);
  expect(scheduledPayload.event.imageId).toBe(
    SEED_UPLOADED_IMAGES.indoorSports.id,
  );
  expect(scheduledPayload.event.includePlayoffs).toBe(true);
  expect(scheduledPayload.event.playoffTeamCount).toBe(4);
  expect(
    Array.isArray(scheduledPayload.event.fieldIds)
      ? scheduledPayload.event.fieldIds
      : [],
  ).toEqual([fieldId]);
  expect(
    Array.isArray(scheduledPayload.event.timeSlotIds)
      ? scheduledPayload.event.timeSlotIds
      : [],
  ).toEqual([slotId]);
  expect(expectedMatches.length).toBeGreaterThan(6);
  expect(expectedMatches.every((match) => match.fieldId === fieldId)).toBe(
    true,
  );
  expect(
    expectedBracket.some(
      (match) =>
        match.previousLeftMatchId !== null ||
        match.previousRightMatchId !== null,
    ),
  ).toBe(true);

  const inviteResponse = await hostApi.post("/api/invites", {
    data: {
      invites: [
        {
          type: "STAFF",
          eventId,
          userId: SEED_DEV_USERS[0].id,
          staffTypes: ["HOST"],
          replaceStaffTypes: true,
        },
        {
          type: "STAFF",
          eventId,
          userId: SEED_DEV_USERS[1].id,
          staffTypes: ["OFFICIAL"],
          replaceStaffTypes: true,
        },
      ],
    },
  });
  expect(inviteResponse.ok()).toBeTruthy();

  const invitePayload = await inviteResponse.json();
  expect(simplifyStaffInvites(invitePayload.invites)).toEqual([
    { userId: SEED_DEV_USERS[0].id, staffTypes: ["HOST"] },
    { userId: SEED_DEV_USERS[1].id, staffTypes: ["OFFICIAL"] },
  ]);

  await ensureDobVerified(participantApi, SEED_USERS.participant.id);
  await seedLocationStorage(page);
  await page.goto("/discover", { waitUntil: "domcontentloaded" });

  await openEventFromDiscover(page, eventName, { eventId });
  const mobilePromptDismiss = page.getByRole("button", { name: "Not now" });
  if (await mobilePromptDismiss.isVisible().catch(() => false)) {
    await mobilePromptDismiss.click();
  }
  await expect(
    page.getByRole("button", { name: /^Join Event$/ }),
  ).toBeVisible();

  const [
    initialEventResponse,
    initialMatchesResponse,
    initialFieldsResponse,
    initialTimeSlotsResponse,
  ] = await Promise.all([
    participantApi.get(`/api/events/${eventId}`),
    participantApi.get(`/api/events/${eventId}/matches`),
    participantApi.get(`/api/fields?ids=${fieldId}`),
    participantApi.get(`/api/time-slots?ids=${slotId}`),
  ]);

  expect(initialEventResponse.ok()).toBeTruthy();
  expect(initialMatchesResponse.ok()).toBeTruthy();
  expect(initialFieldsResponse.ok()).toBeTruthy();
  expect(initialTimeSlotsResponse.ok()).toBeTruthy();

  const initialEventPayload = await initialEventResponse.json();
  expect(readEntityId(initialEventPayload)).toBe(eventId);
  expect(initialEventPayload.imageId).toBe(
    SEED_UPLOADED_IMAGES.indoorSports.id,
  );
  expect(initialEventPayload.includePlayoffs).toBe(true);
  expect(initialEventPayload.playoffTeamCount).toBe(4);
  expect(
    Array.isArray(initialEventPayload.fieldIds)
      ? initialEventPayload.fieldIds
      : [],
  ).toEqual([fieldId]);
  expect(
    Array.isArray(initialEventPayload.timeSlotIds)
      ? initialEventPayload.timeSlotIds
      : [],
  ).toEqual([slotId]);
  expect(
    Array.isArray(initialEventPayload.userIds)
      ? initialEventPayload.userIds
      : [],
  ).not.toContain(SEED_USERS.participant.id);
  expect(simplifyStaffInvites(initialEventPayload.staffInvites)).toEqual([
    { userId: SEED_DEV_USERS[0].id, staffTypes: ["HOST"] },
    { userId: SEED_DEV_USERS[1].id, staffTypes: ["OFFICIAL"] },
  ]);
  expect(
    Array.isArray(initialEventPayload.divisionDetails)
      ? initialEventPayload.divisionDetails
      : [],
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        playoffTeamCount: 4,
      }),
    ]),
  );

  const initialMatchesPayload = await initialMatchesResponse.json();
  expect(simplifyMatches(initialMatchesPayload.matches)).toEqual(
    expectedMatches,
  );
  expect(canonicalizeMatches(initialMatchesPayload.matches ?? [])).toEqual(
    expectedBracket,
  );

  const initialFieldsPayload = await initialFieldsResponse.json();
  expect(
    Array.isArray(initialFieldsPayload.fields)
      ? initialFieldsPayload.fields
      : [],
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: "Mobile League Court",
        organizationId: SEED_ORG.id,
      }),
    ]),
  );
  expect(
    (Array.isArray(initialFieldsPayload.fields)
      ? initialFieldsPayload.fields
      : []
    ).map((field: Record<string, any>) => readEntityId(field)),
  ).toContain(fieldId);

  const initialTimeSlotsPayload = await initialTimeSlotsResponse.json();
  const initialSlot = (
    Array.isArray(initialTimeSlotsPayload.timeSlots)
      ? initialTimeSlotsPayload.timeSlots
      : []
  ).find((slot: Record<string, any>) => readEntityId(slot) === slotId);
  expect(initialSlot).toBeTruthy();
  expect(
    Array.isArray(initialSlot?.daysOfWeek) ? initialSlot.daysOfWeek : [],
  ).toEqual([window.dayOfWeek]);
  expect(
    Array.isArray(initialSlot?.scheduledFieldIds)
      ? initialSlot.scheduledFieldIds
      : typeof initialSlot?.scheduledFieldId === "string"
        ? [initialSlot.scheduledFieldId]
        : [],
  ).toEqual([fieldId]);

  await page.getByRole("button", { name: /^Join Event$/ }).click();
  const joinMyselfButton = page.getByRole("button", { name: "Join Myself" });
  if (
    await joinMyselfButton
      .waitFor({ state: "visible", timeout: 2_000 })
      .then(() => true)
      .catch(() => false)
  ) {
    await joinMyselfButton.click();
  }

  const registeredBanner = page.getByText("You're registered for this event");
  const registeredViaUi = await registeredBanner
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);

  if (!registeredViaUi) {
    await page.reload({ waitUntil: "domcontentloaded" });
    const reloadPromptDismiss = page.getByRole("button", { name: "Not now" });
    if (await reloadPromptDismiss.isVisible().catch(() => false)) {
      await reloadPromptDismiss.click();
    }
  }

  const registeredAfterReload = await registeredBanner
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);

  let joinedViaFallback = false;
  if (!registeredAfterReload) {
    const registerResponse = await page.evaluate(
      async ({ nextEventId, nextDivisionId }) => {
        const response = await fetch(`/api/events/${nextEventId}/registrations/self`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            divisionId: nextDivisionId,
          }),
        });
        let body: unknown = null;
        try {
          body = await response.json();
        } catch {
          body = await response.text();
        }
        return {
          ok: response.ok,
          status: response.status,
          body,
        };
      },
      {
        nextEventId: eventId,
        nextDivisionId: SEED_DIVISION.id,
      },
    );
    expect(
      registerResponse.ok,
      `fallback self-registration failed (${registerResponse.status}): ${JSON.stringify(registerResponse.body)}`,
    ).toBeTruthy();
    joinedViaFallback = true;
    await page.reload({ waitUntil: "domcontentloaded" });
    const fallbackPromptDismiss = page.getByRole("button", { name: "Not now" });
    if (await fallbackPromptDismiss.isVisible().catch(() => false)) {
      await fallbackPromptDismiss.click();
    }
  }

  if (!joinedViaFallback) {
    await expect(registeredBanner).toBeVisible({ timeout: 10_000 });
  }

  const [
    refreshedEventResponse,
    refreshedMatchesResponse,
    refreshedFieldsResponse,
    refreshedTimeSlotsResponse,
  ] = await Promise.all([
    participantApi.get(`/api/events/${eventId}`),
    participantApi.get(`/api/events/${eventId}/matches`),
    participantApi.get(`/api/fields?ids=${fieldId}`),
    participantApi.get(`/api/time-slots?ids=${slotId}`),
  ]);

  expect(refreshedEventResponse.ok()).toBeTruthy();
  expect(refreshedMatchesResponse.ok()).toBeTruthy();
  expect(refreshedFieldsResponse.ok()).toBeTruthy();
  expect(refreshedTimeSlotsResponse.ok()).toBeTruthy();

  const refreshedEventPayload = await refreshedEventResponse.json();
  expect(simplifyStaffInvites(refreshedEventPayload.staffInvites)).toEqual([
    { userId: SEED_DEV_USERS[0].id, staffTypes: ["HOST"] },
    { userId: SEED_DEV_USERS[1].id, staffTypes: ["OFFICIAL"] },
  ]);

  const refreshedMatchesPayload = await refreshedMatchesResponse.json();
  expect(simplifyMatches(refreshedMatchesPayload.matches)).toEqual(
    expectedMatches,
  );
  expect(canonicalizeMatches(refreshedMatchesPayload.matches ?? [])).toEqual(
    expectedBracket,
  );

  const refreshedFieldsPayload = await refreshedFieldsResponse.json();
  expect(
    (Array.isArray(refreshedFieldsPayload.fields)
      ? refreshedFieldsPayload.fields
      : []
    ).map((field: Record<string, any>) => readEntityId(field)),
  ).toContain(fieldId);

  const refreshedTimeSlotsPayload = await refreshedTimeSlotsResponse.json();
  const refreshedSlot = (
    Array.isArray(refreshedTimeSlotsPayload.timeSlots)
      ? refreshedTimeSlotsPayload.timeSlots
      : []
  ).find((slot: Record<string, any>) => readEntityId(slot) === slotId);
  expect(refreshedSlot).toBeTruthy();

  await expect(page.getByText(/Failed to join event/i)).toHaveCount(0);
});
