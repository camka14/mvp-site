import fs from 'node:fs';
import path from 'node:path';
import type { APIRequestContext } from '@playwright/test';
import { test, expect } from './fixtures/api';
import {
  SEED_DIVISION,
  SEED_END,
  SEED_EVENTS,
  SEED_FIELD,
  SEED_IMAGE,
  SEED_ORG,
  SEED_RENTAL_SLOT,
  SEED_START,
  SEED_TEAM_IDS,
  SEED_USERS,
} from './fixtures/seed-data';
import { canonicalizeMatches, type CanonicalMatch } from './utils/scheduler';

// NOTE: Fixtures mirror bracket ordering from the Python reference implementation in mvp-build-bracket/src/brackets.py.

type EventDocument = Record<string, any>;

type SchedulerFixture = CanonicalMatch[];

const fixtureDir = path.resolve(__dirname, 'fixtures', 'scheduler');

const loadFixture = (name: string): SchedulerFixture => {
  const target = path.join(fixtureDir, `${name}.json`);
  return JSON.parse(fs.readFileSync(target, 'utf-8')) as SchedulerFixture;
};

const baseEventDocument = (): EventDocument => ({
  description: 'Seeded event for E2E tests',
  start: SEED_START,
  end: SEED_END,
  divisions: [SEED_DIVISION.id],
  location: SEED_ORG.location,
  rating: 5,
  teamSizeLimit: 6,
  hostId: SEED_USERS.host.id,
  singleDivision: true,
  waitListIds: [],
  freeAgentIds: [],
  cancellationRefundHours: 24,
  teamSignup: false,
  registrationCutoffHours: 2,
  seedColor: 0,
  imageId: SEED_IMAGE.id,
  coordinates: SEED_ORG.coordinates,
  fieldIds: [SEED_FIELD.id],
  timeSlotIds: [],
  teamIds: [],
  userIds: [],
  registrationIds: [],
  leagueScoringConfigId: null,
  organizationId: SEED_ORG.id,
  autoCancellation: false,
  fieldType: 'INDOOR',
  refereeIds: [],
  allowPaymentPlans: false,
  installmentCount: 0,
  installmentDueDates: [],
  installmentAmounts: [],
  allowTeamSplitDefault: false,
  requiredTemplateIds: [],
});

const buildEventDocument = (overrides: EventDocument): EventDocument => {
  const id = overrides.$id ?? overrides.id;
  const base = baseEventDocument();
  const next = { ...base, ...overrides } as EventDocument;
  if (id) {
    next.$id = id;
    next.id = id;
  }
  return next;
};

const buildTournamentDocument = (overrides: EventDocument): EventDocument =>
  buildEventDocument({
    eventType: 'TOURNAMENT',
    teamIds: [],
    timeSlotIds: [],
    price: 0,
    state: 'PUBLISHED',
    winnerSetCount: 2,
    loserSetCount: 1,
    winnerBracketPointsToVictory: [21],
    loserBracketPointsToVictory: [15],
    doubleElimination: false,
    fieldCount: 1,
    ...overrides,
  });

const buildLeagueDocument = (overrides: EventDocument): EventDocument =>
  buildEventDocument({
    eventType: 'LEAGUE',
    teamIds: [],
    timeSlotIds: [],
    gamesPerOpponent: 1,
    includePlayoffs: false,
    price: 0,
    state: 'PUBLISHED',
    ...overrides,
  });

const scheduleWithDocument = async (hostApi: APIRequestContext, eventDocument: EventDocument) => {
  return hostApi.post('/api/events/schedule', {
    data: {
      eventDocument,
    },
  });
};

test.describe('scheduler parity', () => {
  test('tournament 8 teams matches fixture', async ({ hostApi }) => {
    const eventDocument = buildTournamentDocument({
      $id: SEED_EVENTS.scheduler.tournament8.id,
      name: SEED_EVENTS.scheduler.tournament8.name,
      teamIds: SEED_TEAM_IDS.slice(0, 8),
      doubleElimination: false,
    });

    const response = await scheduleWithDocument(hostApi, eventDocument);
    expect(response.ok()).toBeTruthy();

    const payload = await response.json();
    const canonical = canonicalizeMatches(payload.matches ?? []);
    const expected = loadFixture('tournament-8');

    expect(canonical).toEqual(expected);
  });

  test('tournament 6 teams (byes) matches fixture', async ({ hostApi }) => {
    const eventDocument = buildTournamentDocument({
      $id: SEED_EVENTS.scheduler.tournament6.id,
      name: SEED_EVENTS.scheduler.tournament6.name,
      teamIds: SEED_TEAM_IDS.slice(0, 6),
      doubleElimination: false,
    });

    const response = await scheduleWithDocument(hostApi, eventDocument);
    expect(response.ok()).toBeTruthy();

    const payload = await response.json();
    const canonical = canonicalizeMatches(payload.matches ?? []);
    const expected = loadFixture('tournament-6');

    expect(canonical).toEqual(expected);
  });

  test('tournament double elimination matches fixture', async ({ hostApi }) => {
    const eventDocument = buildTournamentDocument({
      $id: SEED_EVENTS.scheduler.tournamentDoubleElim.id,
      name: SEED_EVENTS.scheduler.tournamentDoubleElim.name,
      teamIds: SEED_TEAM_IDS.slice(0, 8),
      doubleElimination: true,
    });

    const response = await scheduleWithDocument(hostApi, eventDocument);
    expect(response.ok()).toBeTruthy();

    const payload = await response.json();
    const canonical = canonicalizeMatches(payload.matches ?? []);
    const expected = loadFixture('tournament-double-elim');

    expect(canonical).toEqual(expected);
  });

  test('league scheduling without slots returns expected error', async ({ hostApi }) => {
    const eventDocument = buildLeagueDocument({
      $id: SEED_EVENTS.scheduler.leagueNoSlots.id,
      name: SEED_EVENTS.scheduler.leagueNoSlots.name,
      teamIds: SEED_TEAM_IDS.slice(0, 4),
      timeSlotIds: [],
    });

    const response = await scheduleWithDocument(hostApi, eventDocument);
    expect(response.status()).toBe(400);

    const payload = await response.json();
    expect(payload.error).toBe(
      'Unable to schedule league because no recurring time slots are configured. Add weekly field availability to continue.',
    );
  });

  test('league same-day schedules extend end date', async ({ hostApi }) => {
    const eventDocument = buildLeagueDocument({
      $id: SEED_EVENTS.scheduler.leagueSameDay.id,
      name: SEED_EVENTS.scheduler.leagueSameDay.name,
      teamIds: SEED_TEAM_IDS.slice(0, 4),
      start: '2026-04-01T10:00:00Z',
      end: '2026-04-01T10:00:00Z',
      timeSlotIds: [SEED_RENTAL_SLOT.id],
    });

    const response = await scheduleWithDocument(hostApi, eventDocument);
    expect(response.ok()).toBeTruthy();

    const payload = await response.json();
    const start = new Date(payload.event?.start ?? eventDocument.start).getTime();
    const end = new Date(payload.event?.end ?? eventDocument.end).getTime();

    expect(end).toBeGreaterThan(start);
    expect(Array.isArray(payload.matches)).toBeTruthy();
    expect(payload.matches.length).toBeGreaterThan(0);
  });
});
