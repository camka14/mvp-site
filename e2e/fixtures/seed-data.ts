export const SEED_USERS = {
  host: {
    id: 'user_host',
    email: 'host@example.com',
    password: 'password123!',
    firstName: 'Host',
    lastName: 'User',
    userName: 'hostuser',
  },
  participant: {
    id: 'user_participant',
    email: 'player@example.com',
    password: 'password123!',
    firstName: 'Player',
    lastName: 'User',
    userName: 'playeruser',
  },
} as const;

export const SEED_DIVISION = {
  id: 'division_open',
  name: 'Open',
} as const;

export const SEED_SPORT = {
  id: 'volleyball',
  name: 'Volleyball',
} as const;

export const SEED_ORG = {
  id: 'org_1',
  name: 'Test Organization',
  location: 'Test City',
  ownerId: SEED_USERS.host.id,
  coordinates: [-122.4194, 37.7749] as [number, number],
  hasStripeAccount: true,
} as const;

export const SEED_FIELD = {
  id: 'field_1',
  name: 'Court A',
  fieldNumber: 1,
  type: 'INDOOR',
  location: 'Test City',
  lat: 37.7749,
  long: -122.4194,
  divisions: [SEED_DIVISION.id],
} as const;

export const SEED_RENTAL_SLOT = {
  id: 'slot_rental_1',
  scheduledFieldId: SEED_FIELD.id,
  price: 2500,
  repeating: false,
  dayOfWeek: 4,
  startDate: '2026-03-06T18:00:00Z',
  endDate: '2026-03-06T20:00:00Z',
  startTimeMinutes: 18 * 60,
  endTimeMinutes: 20 * 60,
} as const;

export const SEED_IMAGE = {
  id: 'image_1',
  filename: 'seed-image.png',
  mimeType: 'image/png',
} as const;

export const SEED_EVENTS = {
  free: {
    id: 'event_free_1',
    name: 'Free Pickup Night',
    price: 0,
  },
  paid: {
    id: 'event_paid_1',
    name: 'Paid Pickup Night',
    price: 2500,
  },
  scheduler: {
    tournament8: {
      id: 'event_tournament_8',
      name: 'Tournament 8 Teams',
    },
    tournament6: {
      id: 'event_tournament_6',
      name: 'Tournament 6 Teams',
    },
    tournamentDoubleElim: {
      id: 'event_tournament_de',
      name: 'Tournament Double Elimination',
    },
    leagueNoSlots: {
      id: 'event_league_no_slots',
      name: 'League No Slots',
    },
    leagueSameDay: {
      id: 'event_league_same_day',
      name: 'League Same Day',
    },
  },
} as const;

export const SEED_TEAM_IDS = Array.from({ length: 8 }, (_, index) => `team_${index + 1}`) as ReadonlyArray<string>;

export const SEED_START = '2026-03-05T18:00:00Z';
export const SEED_END = '2026-03-05T20:00:00Z';
