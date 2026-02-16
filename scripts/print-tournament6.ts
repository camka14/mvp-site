import { canonicalizeMatches } from '../e2e/utils/scheduler';
import {
  SEED_DIVISION,
  SEED_END,
  SEED_FIELD,
  SEED_IMAGE,
  SEED_ORG,
  SEED_START,
  SEED_TEAM_IDS,
  SEED_USERS,
} from '../e2e/fixtures/seed-data';

const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

const baseEventDocument = () => ({
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
  refereeIds: [],
  allowPaymentPlans: false,
  installmentCount: 0,
  installmentDueDates: [],
  installmentAmounts: [],
  allowTeamSplitDefault: false,
  requiredTemplateIds: [],
});

const buildTournamentDocument = (overrides: Record<string, any>) => ({
  eventType: 'TOURNAMENT',
  price: 0,
  state: 'PUBLISHED',
  winnerSetCount: 2,
  loserSetCount: 1,
  winnerBracketPointsToVictory: [21],
  loserBracketPointsToVictory: [15],
  doubleElimination: false,
  fieldCount: 1,
  ...baseEventDocument(),
  ...overrides,
});

const run = async () => {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: SEED_USERS.host.email, password: SEED_USERS.host.password }),
  });
  if (!login.ok) {
    console.error('Login failed', await login.text());
    process.exit(1);
  }
  const loginBody = await login.json();
  const token = loginBody?.token;
  if (!token) {
    console.error('Missing token');
    process.exit(1);
  }

  const eventDocument = buildTournamentDocument({
    $id: 'event_tournament_6',
    name: 'Tournament 6 Teams',
    teamIds: SEED_TEAM_IDS.slice(0, 6),
    doubleElimination: false,
  });

  const response = await fetch(`${baseUrl}/api/events/schedule`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ eventDocument }),
  });
  const body = await response.json();
  const canonical = canonicalizeMatches(body.matches ?? []);
  console.log(JSON.stringify(canonical, null, 2));
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
