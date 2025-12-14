import { Event, LeagueScoringConfig, Sport, Team, TimeSlot, UserData } from '@/types';
import { createLeagueScoringConfig, createSport } from '@/types/defaults';

let userCounter = 0;
let teamCounter = 0;
let eventCounter = 0;
let slotCounter = 0;

export const buildUser = (overrides: Partial<UserData> = {}): UserData => {
  userCounter += 1;
  const id = overrides.$id ?? `user_${userCounter}`;

  return {
    $id: id,
    firstName: 'Test',
    lastName: `User${userCounter}`,
    teamIds: [],
    friendIds: [],
    friendRequestIds: [],
    friendRequestSentIds: [],
    followingIds: [],
    userName: `test.user${userCounter}`,
    uploadedImages: [],
    fullName: `Test User${userCounter}`,
    avatarUrl: `https://example.com/avatar/${id}.png`,
    ...overrides,
  };
};

export const buildTeam = (overrides: Partial<Team> = {}): Team => {
  teamCounter += 1;
  const id = overrides.$id ?? `team_${teamCounter}`;

  return {
    $id: id,
    name: `Team ${teamCounter}`,
    seed: 1,
    division: 'Recreational',
    sport: 'Volleyball',
    wins: 0,
    losses: 0,
    playerIds: [],
    captainId: 'user_captain',
    pending: [],
    teamSize: 6,
    winRate: 0,
    currentSize: 0,
    isFull: false,
    avatarUrl: `https://example.com/team/${id}.png`,
    ...overrides,
  };
};

export const buildTimeSlot = (overrides: Partial<TimeSlot> = {}): TimeSlot => {
  slotCounter += 1;
  return {
    $id: overrides.$id ?? `slot_${slotCounter}`,
    dayOfWeek: 1,
    startTimeMinutes: 9 * 60,
    endTimeMinutes: 10 * 60,
    repeating: overrides.repeating ?? true,
    scheduledFieldId: overrides.scheduledFieldId ?? 'field_1',
    ...overrides,
  };
};

export const buildEvent = (overrides: Partial<Event> = {}): Event => {
  eventCounter += 1;
  const { sport: overrideSport, leagueScoringConfig: overrideLeagueConfig, ...restOverrides } = overrides;
  const id = overrides.$id ?? `event_${eventCounter}`;
  const normalizeSport = (value: Partial<Event>['sport']) => {
    if (!value) {
      return createSport({ $id: 'volleyball', name: 'Volleyball' });
    }
    if (typeof value === 'string') {
      return createSport({ $id: value, name: value });
    }
    if (typeof value === 'object') {
      return createSport({
        ...(value as Partial<Sport>),
        $id: (value as Sport).$id ?? (value as any).name ?? '',
        name: (value as Sport).name ?? (value as any).$id ?? '',
      });
    }
    return createSport({ $id: 'volleyball', name: 'Volleyball' });
  };

  const leagueConfigOverrides = overrideLeagueConfig as Partial<LeagueScoringConfig> | undefined;
  const leagueScoringConfig = createLeagueScoringConfig(leagueConfigOverrides);
  if (!leagueScoringConfig.$id) {
    leagueScoringConfig.$id = `league_scoring_${eventCounter}`;
  }

  return {
    $id: id,
    name: `Event ${eventCounter}`,
    description: 'Sample event description',
    start: new Date().toISOString(),
    end: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    location: 'Sports Center',
    coordinates: [0, 0],
    fieldType: 'INDOOR',
    price: 25,
    rating: 5,
    imageId: 'image_1',
    hostId: 'user_host',
    state: 'PUBLISHED',
    maxParticipants: 24,
    teamSizeLimit: 6,
    restTimeMinutes: 10,
    teamSignup: true,
    singleDivision: false,
    waitListIds: [],
    freeAgentIds: [],
    playerIds: [],
    teamIds: [],
    waitList: [],
    freeAgents: [],
    cancellationRefundHours: 24,
    registrationCutoffHours: 2,
    seedColor: 0,
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
    eventType: 'LEAGUE',
    sport: normalizeSport(overrideSport),
    leagueScoringConfig,
    divisions: [],
    matches: [],
    teams: [],
    players: [],
    attendees: 0,
    timeSlots: [],
    ...restOverrides,
  };
};
