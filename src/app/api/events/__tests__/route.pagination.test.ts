/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  events: {
    findMany: jest.fn(),
  },
  authUser: {
    findUnique: jest.fn(),
  },
  userData: {
    findUnique: jest.fn(),
  },
  organizations: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  divisions: {
    findMany: jest.fn(),
  },
};
const getTokenFromRequestMock = jest.fn();
const verifySessionTokenMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/authServer', () => ({
  getTokenFromRequest: (...args: unknown[]) => getTokenFromRequestMock(...args),
  verifySessionToken: (...args: unknown[]) => verifySessionTokenMock(...args),
}));
jest.mock('@/lib/permissions', () => ({ requireSession: jest.fn() }));
jest.mock('@/server/accessControl', () => ({
  canManageEvent: jest.fn(),
  hasOrgPermission: jest.fn(),
}));
jest.mock('@/server/authSessions', () => ({ isSessionTokenCurrent: jest.fn() }));
jest.mock('@/app/api/events/participantCounts', () => ({
  withEventAttendeeCounts: async (events: unknown[]) => events,
}));
jest.mock('@/server/events/eventRegistrations', () => ({
  withDerivedEventParticipantIds: async (events: unknown[]) => events,
}));
jest.mock('@/server/officials/eventOfficials', () => ({
  getEventOfficialIdsByEventIds: async () => new Map(),
}));
jest.mock('@/server/repositories/events', () => ({
  deleteMatchesByEvent: jest.fn(),
  isEventFieldConflictError: jest.fn(),
  isLeaguePlayoffTeamCountValidationError: jest.fn(),
  isRentalBookingReservationError: jest.fn(),
  loadEventWithRelations: jest.fn(),
  persistScheduledRosterTeams: jest.fn(),
  saveEventSchedule: jest.fn(),
  saveMatches: jest.fn(),
  upsertEventFromPayload: jest.fn(),
}));
jest.mock('@/server/repositories/locks', () => ({ acquireEventLock: jest.fn() }));
jest.mock('@/server/scheduler/scheduleEvent', () => ({
  scheduleEvent: jest.fn(),
  ScheduleError: class ScheduleError extends Error {},
}));
jest.mock('@/server/legacyFormat', () => ({
  parseDateInput: jest.fn(),
  withLegacyFields: (row: Record<string, unknown>) => ({ ...row }),
}));
jest.mock('@/server/eventCreationNotifications', () => ({ notifySocialAudienceOfEventCreation: jest.fn() }));
jest.mock('@/server/contentFilter', () => ({
  assertEventContentAllowed: jest.fn(),
  EventContentFilterError: class EventContentFilterError extends Error {},
}));
jest.mock('@/server/officials/config', () => ({
  buildEventOfficialPositionsFromTemplates: jest.fn(),
  normalizeEventOfficialPositions: jest.fn(),
  normalizeOfficialSchedulingMode: jest.fn(),
  normalizeSportOfficialPositionTemplates: jest.fn(),
}));
jest.mock('@/server/emailVerificationGate', () => ({
  buildEmailVerificationRequiredResponse: jest.fn(),
  isUserEmailVerified: jest.fn(),
}));
jest.mock('@/server/adminNotifications', () => ({ sendAdminEventCreatedNotification: jest.fn() }));
jest.mock('@/server/eventTags', () => ({ getEventTagsForEventIds: async () => new Map() }));
jest.mock('@/server/broadcast/presentation', () => ({ refreshBroadcastPresentationForEvent: jest.fn() }));
jest.mock('@/lib/manualRegistrationPayments', () => ({
  normalizeManualPaymentInstructions: jest.fn((value) => value ?? ''),
  normalizeManualPaymentLinks: jest.fn(() => []),
  normalizeRegistrationPaymentMode: jest.fn(() => 'STRIPE'),
}));

import { GET } from '@/app/api/events/route';

const event = (id: string) => ({
  id,
  start: new Date(`2026-07-0${id.at(-1)}T09:00:00.000Z`),
  organizationId: 'organization_1',
  eventType: 'EVENT',
  fieldIds: [],
  timeSlotIds: [],
  userIds: [],
  teamSignup: false,
});

describe('GET /api/events pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getTokenFromRequestMock.mockReturnValue(null);
    verifySessionTokenMock.mockReturnValue(null);
    prismaMock.divisions.findMany.mockResolvedValue([]);
    prismaMock.organizations.findMany.mockResolvedValue([]);
  });

  it('uses a stable offset page and exposes only page rows with truthful metadata', async () => {
    prismaMock.events.findMany.mockResolvedValue([event('event_1'), event('event_2'), event('event_3')]);

    const response = await GET(new NextRequest(
      'http://localhost/api/events?organizationId=organization_1&limit=2&offset=3',
    ));

    expect(response.status).toBe(200);
    expect(prismaMock.events.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: 'organization_1' }),
      skip: 3,
      take: 3,
      orderBy: [{ start: 'asc' }, { id: 'asc' }],
    }));
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      events: [expect.objectContaining({ id: 'event_1' }), expect.objectContaining({ id: 'event_2' })],
      pagination: {
        limit: 2,
        offset: 3,
        nextOffset: 5,
        hasMore: true,
      },
    }));
  });

  it('normalizes malformed limits and negative offsets without removing existing list access', async () => {
    prismaMock.events.findMany.mockResolvedValue([event('event_1')]);

    const response = await GET(new NextRequest(
      'http://localhost/api/events?organizationId=organization_1&limit=not-a-number&offset=-10',
    ));

    expect(response.status).toBe(200);
    expect(prismaMock.events.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 0,
      take: 101,
      orderBy: [{ start: 'asc' }, { id: 'asc' }],
    }));
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      pagination: {
        limit: 100,
        offset: 0,
        nextOffset: 1,
        hasMore: false,
      },
    }));
  });
});
