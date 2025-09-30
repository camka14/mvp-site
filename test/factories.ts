import { Event, Team, TimeSlot, UserData } from '@/types';

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
    teamInvites: [],
    eventInvites: [],
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
    startTime: 9 * 60,
    endTime: 10 * 60,
    timezone: 'UTC',
    field: overrides.field ?? 'field_1',
    ...overrides,
  };
};

export const buildEvent = (overrides: Partial<Event> = {}): Event => {
  eventCounter += 1;
  const id = overrides.$id ?? `event_${eventCounter}`;

  return {
    $id: id,
    name: `Event ${eventCounter}`,
    description: 'Sample event description',
    start: new Date().toISOString(),
    end: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    location: 'Sports Center',
    coordinates: [0, 0],
    fieldType: 'Indoor',
    price: 25,
    rating: 5,
    imageId: 'image_1',
    hostId: 'user_host',
    maxParticipants: 24,
    teamSizeLimit: 6,
    teamSignup: true,
    singleDivision: false,
    waitListIds: [],
    freeAgentIds: [],
    cancellationRefundHours: 24,
    registrationCutoffHours: 2,
    seedColor: 0,
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
    eventType: 'league',
    sport: 'Volleyball',
    divisions: [],
    attendees: 0,
    category: 'Volleyball',
    timeSlots: [],
    ...overrides,
  };
};

