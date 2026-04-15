/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  $transaction: jest.fn(),
  matches: {
    deleteMany: jest.fn(),
    upsert: jest.fn(),
  },
  teams: {
    create: jest.fn(),
  },
  divisions: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  events: {
    update: jest.fn(),
    findUnique: jest.fn(),
  },
  organizations: {
    findUnique: jest.fn(),
  },
  userData: {
    findUnique: jest.fn(),
  },
  sensitiveUserData: {
    findFirst: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const loadEventWithRelationsMock = jest.fn();
const persistScheduledRosterTeamsMock = jest.fn();
const saveEventScheduleMock = jest.fn();
const saveMatchesMock = jest.fn();
const upsertEventFromPayloadMock = jest.fn();
const deleteMatchesByEventMock = jest.fn();
const acquireEventLockMock = jest.fn();
const isEventFieldConflictErrorMock = jest.fn();
const scheduleEventMock = jest.fn();
const serializeEventLegacyMock = jest.fn();
const serializeMatchesLegacyMock = jest.fn();
const rescheduleEventMatchesPreservingLocksMock = jest.fn();
const applyMatchUpdatesMock = jest.fn();
const applyPersistentAutoLockMock = jest.fn();
const finalizeMatchMock = jest.fn();
const isScheduleWindowExceededErrorMock = jest.fn();
const sendPushToUsersMock = jest.fn();
const isEmailEnabledMock = jest.fn();
const sendEmailMock = jest.fn();
const extractRentalCheckoutWindowMock = jest.fn();
const releaseRentalCheckoutLocksMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));

jest.mock('@/server/repositories/events', () => ({
  loadEventWithRelations: (...args: any[]) => loadEventWithRelationsMock(...args),
  persistScheduledRosterTeams: (...args: any[]) => persistScheduledRosterTeamsMock(...args),
  saveEventSchedule: (...args: any[]) => saveEventScheduleMock(...args),
  saveMatches: (...args: any[]) => saveMatchesMock(...args),
  upsertEventFromPayload: (...args: any[]) => upsertEventFromPayloadMock(...args),
  deleteMatchesByEvent: (...args: any[]) => deleteMatchesByEventMock(...args),
  isEventFieldConflictError: (...args: any[]) => isEventFieldConflictErrorMock(...args),
}));

jest.mock('@/server/repositories/locks', () => ({
  acquireEventLock: (...args: any[]) => acquireEventLockMock(...args),
}));

jest.mock('@/server/scheduler/scheduleEvent', () => ({
  scheduleEvent: (...args: any[]) => scheduleEventMock(...args),
  ScheduleError: class ScheduleError extends Error {},
}));

jest.mock('@/server/scheduler/serialize', () => ({
  serializeEventLegacy: (...args: any[]) => serializeEventLegacyMock(...args),
  serializeMatchesLegacy: (...args: any[]) => serializeMatchesLegacyMock(...args),
}));

jest.mock('@/server/scheduler/reschedulePreservingLocks', () => ({
  rescheduleEventMatchesPreservingLocks: (...args: any[]) => rescheduleEventMatchesPreservingLocksMock(...args),
}));

jest.mock('@/server/scheduler/updateMatch', () => ({
  applyMatchUpdates: (...args: any[]) => applyMatchUpdatesMock(...args),
  applyPersistentAutoLock: (...args: any[]) => applyPersistentAutoLockMock(...args),
  finalizeMatch: (...args: any[]) => finalizeMatchMock(...args),
  isScheduleWindowExceededError: (...args: any[]) => isScheduleWindowExceededErrorMock(...args),
}));
jest.mock('@/server/pushNotifications', () => ({
  sendPushToUsers: (...args: any[]) => sendPushToUsersMock(...args),
}));
jest.mock('@/server/email', () => ({
  isEmailEnabled: (...args: any[]) => isEmailEnabledMock(...args),
  sendEmail: (...args: any[]) => sendEmailMock(...args),
}));
jest.mock('@/server/repositories/rentalCheckoutLocks', () => ({
  extractRentalCheckoutWindow: (...args: any[]) => extractRentalCheckoutWindowMock(...args),
  releaseRentalCheckoutLocks: (...args: any[]) => releaseRentalCheckoutLocksMock(...args),
}));

import { POST as schedulePost } from '@/app/api/events/schedule/route';
import { POST as scheduleByIdPost } from '@/app/api/events/[eventId]/schedule/route';
import { PATCH as matchPatch } from '@/app/api/events/[eventId]/matches/[matchId]/route';
import { PATCH as matchesPatch } from '@/app/api/events/[eventId]/matches/route';

const jsonRequest = (url: string, body: any) => new NextRequest(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const patchRequest = (url: string, body: any) => new NextRequest(url, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('schedule routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    applyPersistentAutoLockMock.mockReturnValue(false);
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.organizations.findUnique.mockResolvedValue(null);
    persistScheduledRosterTeamsMock.mockResolvedValue([]);
    isEmailEnabledMock.mockReturnValue(false);
    sendPushToUsersMock.mockResolvedValue(undefined);
    sendEmailMock.mockResolvedValue(undefined);
    isScheduleWindowExceededErrorMock.mockImplementation(
      (error: unknown) =>
        error instanceof Error
          && error.message.toLowerCase().includes('no available time slots remaining for scheduling'),
    );
    prismaMock.userData.findUnique.mockResolvedValue({ firstName: 'Host', lastName: 'User', userName: 'host_user' });
    prismaMock.sensitiveUserData.findFirst.mockResolvedValue({ email: 'host@example.test' });
    prismaMock.divisions.findMany.mockResolvedValue([]);
    prismaMock.divisions.update.mockResolvedValue(null);
    isEventFieldConflictErrorMock.mockReturnValue(false);
    extractRentalCheckoutWindowMock.mockReturnValue({
      ok: false,
      status: 400,
      error: 'not_rental_checkout',
    });
    releaseRentalCheckoutLocksMock.mockResolvedValue(undefined);
  });

  it('schedules an event from an event document payload', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
    });
    upsertEventFromPayloadMock.mockResolvedValue('event_1');
    loadEventWithRelationsMock.mockResolvedValue({
      id: 'event_1',
      eventType: 'LEAGUE',
      hostId: 'host_1',
      matches: {},
    });
    scheduleEventMock.mockReturnValue({
      preview: false,
      event: { id: 'event_1' },
      matches: [{ id: 'match_1' }],
    });
    serializeEventLegacyMock.mockReturnValue({ $id: 'event_1' });
    serializeMatchesLegacyMock.mockReturnValue([{ $id: 'match_1' }]);

    const res = await schedulePost(jsonRequest('http://localhost/api/events/schedule', {
      eventDocument: {
        $id: 'event_1',
        fields: [
          {
            id: 'field_inline_1',
            fieldNumber: 1,
            divisions: ['open'],
          },
        ],
        timeSlots: [
          {
            id: 'slot_inline_1',
            dayOfWeek: 1,
            daysOfWeek: [1, 3],
            startTimeMinutes: 600,
            endTimeMinutes: 660,
            startDate: '2026-01-01T00:00:00.000Z',
            repeating: true,
            scheduledFieldId: 'field_inline_1',
            scheduledFieldIds: ['field_inline_1'],
          },
        ],
      },
    }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(upsertEventFromPayloadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: [
          expect.objectContaining({
            id: 'field_inline_1',
            fieldNumber: 1,
            divisions: ['open'],
          }),
        ],
        timeSlots: [
          expect.objectContaining({
            id: 'slot_inline_1',
            scheduledFieldId: 'field_inline_1',
            scheduledFieldIds: ['field_inline_1'],
          }),
        ],
      }),
      prismaMock,
    );
    expect(scheduleEventMock).toHaveBeenCalled();
    expect(deleteMatchesByEventMock).toHaveBeenCalledWith('event_1', prismaMock);
    expect(saveMatchesMock).toHaveBeenCalled();
    expect(json.event.$id).toBe('event_1');
    expect(json.matches[0].$id).toBe('match_1');
    expect(prismaMock.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        maxWait: 10_000,
        timeout: 20_000,
      }),
    );
  });

  it('schedules an existing event id using the provided event document payload', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
    });
    loadEventWithRelationsMock
      .mockResolvedValueOnce({
        id: 'event_1',
        eventType: 'LEAGUE',
        hostId: 'host_1',
        matches: {},
      })
      .mockResolvedValueOnce({
        id: 'event_1',
        eventType: 'LEAGUE',
        hostId: 'host_1',
        matches: {},
      });
    upsertEventFromPayloadMock.mockResolvedValue('event_1');
    scheduleEventMock.mockReturnValue({
      preview: false,
      event: { id: 'event_1' },
      matches: [{ id: 'match_1' }],
    });
    serializeEventLegacyMock.mockReturnValue({ $id: 'event_1' });
    serializeMatchesLegacyMock.mockReturnValue([{ $id: 'match_1' }]);

    const res = await scheduleByIdPost(
      jsonRequest('http://localhost/api/events/event_1/schedule', {
        eventDocument: {
          maxParticipants: 5,
          teamIds: [],
          fields: [
            {
              id: 'field_inline_2',
              fieldNumber: 2,
              divisions: ['open'],
            },
          ],
          timeSlots: [
            {
              id: 'slot_inline_2',
              dayOfWeek: 2,
              daysOfWeek: [2],
              startTimeMinutes: 700,
              endTimeMinutes: 760,
              startDate: '2026-01-01T00:00:00.000Z',
              repeating: true,
              scheduledFieldId: 'field_inline_2',
              scheduledFieldIds: ['field_inline_2'],
            },
          ],
        },
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(upsertEventFromPayloadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'event_1',
        $id: 'event_1',
        maxParticipants: 5,
        fields: [
          expect.objectContaining({
            id: 'field_inline_2',
            fieldNumber: 2,
            divisions: ['open'],
          }),
        ],
        timeSlots: [
          expect.objectContaining({
            id: 'slot_inline_2',
            scheduledFieldId: 'field_inline_2',
            scheduledFieldIds: ['field_inline_2'],
          }),
        ],
      }),
      prismaMock,
    );
    expect(scheduleEventMock).toHaveBeenCalled();
    expect(deleteMatchesByEventMock).toHaveBeenCalledWith('event_1', prismaMock);
    expect(saveMatchesMock).toHaveBeenCalled();
    expect(json.event.$id).toBe('event_1');
    expect(json.matches[0].$id).toBe('match_1');
    expect(prismaMock.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        maxWait: 10_000,
        timeout: 20_000,
      }),
    );
  });

  it('returns 409 when event field conflicts are raised during scheduling', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
    });
    const conflictError = {
      message: 'Selected fields and time range conflict with existing reservations.',
      conflicts: [
        {
          fieldId: 'field_1',
          parentId: 'event_existing',
          start: new Date('2026-04-01T13:30:00.000Z'),
          end: new Date('2026-04-01T15:00:00.000Z'),
        },
      ],
    };
    upsertEventFromPayloadMock.mockRejectedValue(conflictError);
    isEventFieldConflictErrorMock.mockImplementation((error: unknown) => error === conflictError);

    const res = await schedulePost(jsonRequest('http://localhost/api/events/schedule', {
      eventDocument: {
        $id: 'event_1',
        eventType: 'EVENT',
      },
    }));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(String(json.error ?? '')).toContain('conflict');
    expect(json.conflicts).toEqual([
      expect.objectContaining({
        fieldId: 'field_1',
        parentId: 'event_existing',
      }),
    ]);
  });

  it('returns 500 when schedule upsert fails before persistence work starts', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    upsertEventFromPayloadMock.mockRejectedValueOnce(new Error('upsert failed'));

    const res = await schedulePost(
      jsonRequest('http://localhost/api/events/schedule', {
        eventDocument: { $id: 'event_1' },
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual(expect.objectContaining({ error: 'Internal Server Error' }));
    expect(scheduleEventMock).not.toHaveBeenCalled();
    expect(deleteMatchesByEventMock).not.toHaveBeenCalled();
    expect(saveMatchesMock).not.toHaveBeenCalled();
    expect(saveEventScheduleMock).not.toHaveBeenCalled();
  });

  it('returns 500 when schedule match persistence fails in eventId schedule route', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
    });
    loadEventWithRelationsMock.mockResolvedValue({
      id: 'event_1',
      eventType: 'LEAGUE',
      hostId: 'host_1',
      matches: {},
    });
    scheduleEventMock.mockReturnValue({
      preview: false,
      event: { id: 'event_1' },
      matches: [{ id: 'match_1' }],
    });
    saveMatchesMock.mockRejectedValueOnce(new Error('save matches failed'));

    const res = await scheduleByIdPost(
      jsonRequest('http://localhost/api/events/event_1/schedule', {}),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual(expect.objectContaining({ error: 'Internal Server Error' }));
    expect(scheduleEventMock).toHaveBeenCalled();
    expect(deleteMatchesByEventMock).toHaveBeenCalledWith('event_1', prismaMock);
    expect(saveMatchesMock).toHaveBeenCalledWith('event_1', [{ id: 'match_1' }], prismaMock);
    expect(saveEventScheduleMock).not.toHaveBeenCalled();
  });

  it('preserves locked matches during event reschedule and returns warnings', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
    });
    loadEventWithRelationsMock.mockResolvedValue({
      id: 'event_1',
      eventType: 'LEAGUE',
      hostId: 'host_1',
      matches: {
        match_locked: { id: 'match_locked', locked: true },
      },
    });
    rescheduleEventMatchesPreservingLocksMock.mockReturnValue({
      event: { id: 'event_1' },
      matches: [{ id: 'match_locked', locked: true }],
      warnings: [
        {
          code: 'LOCKED_MATCH_OUTSIDE_WINDOW',
          message: 'Locked match is outside the updated start/time-slot window and was preserved.',
          matchIds: ['match_locked'],
        },
      ],
    });
    serializeEventLegacyMock.mockReturnValue({ $id: 'event_1' });
    serializeMatchesLegacyMock.mockReturnValue([{ $id: 'match_locked', locked: true }]);

    const res = await scheduleByIdPost(
      jsonRequest('http://localhost/api/events/event_1/schedule', {}),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(rescheduleEventMatchesPreservingLocksMock).toHaveBeenCalled();
    expect(scheduleEventMock).not.toHaveBeenCalled();
    expect(deleteMatchesByEventMock).not.toHaveBeenCalled();
    expect(saveMatchesMock).toHaveBeenCalledWith('event_1', [{ id: 'match_locked', locked: true }], prismaMock);
    expect(json.warnings).toEqual([
      {
        code: 'LOCKED_MATCH_OUTSIDE_WINDOW',
        message: 'Locked match is outside the updated start/time-slot window and was preserved.',
        matchIds: ['match_locked'],
      },
    ]);
    expect(prismaMock.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        maxWait: 10_000,
        timeout: 20_000,
      }),
    );
  });

  it('preserves populated unlocked matches during event reschedule', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
    });
    loadEventWithRelationsMock.mockResolvedValue({
      id: 'event_1',
      eventType: 'LEAGUE',
      hostId: 'host_1',
      matches: {
        match_1: { id: 'match_1', locked: false, team1: 'team_a', team2: 'team_b', score1: 3, score2: 2 },
      },
    });
    rescheduleEventMatchesPreservingLocksMock.mockReturnValue({
      event: { id: 'event_1' },
      matches: [{ id: 'match_1', locked: false, team1: 'team_a', team2: 'team_b', score1: 3, score2: 2 }],
      warnings: [],
    });
    serializeEventLegacyMock.mockReturnValue({ $id: 'event_1' });
    serializeMatchesLegacyMock.mockReturnValue([{ $id: 'match_1', team1: 'team_a', team2: 'team_b', score1: 3, score2: 2 }]);

    const res = await scheduleByIdPost(
      jsonRequest('http://localhost/api/events/event_1/schedule', {}),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(rescheduleEventMatchesPreservingLocksMock).toHaveBeenCalled();
    expect(scheduleEventMock).not.toHaveBeenCalled();
    expect(deleteMatchesByEventMock).not.toHaveBeenCalled();
    expect(saveMatchesMock).toHaveBeenCalledWith(
      'event_1',
      [{ id: 'match_1', locked: false, team1: 'team_a', team2: 'team_b', score1: 3, score2: 2 }],
      prismaMock,
    );
    expect(json.warnings).toEqual([]);
  });

  it('rejects match updates when user is not host', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
    });
    loadEventWithRelationsMock.mockResolvedValue({
      id: 'event_1',
      eventType: 'TOURNAMENT',
      hostId: 'host_1',
      matches: { match_1: { id: 'match_1' } },
      teams: {},
    });

    const res = await matchPatch(
      patchRequest('http://localhost/api/events/event_1/matches/match_1', {}),
      { params: Promise.resolve({ eventId: 'event_1', matchId: 'match_1' }) },
    );

    expect(res.status).toBe(403);
  });

  it('allows an event team member to swap into official when enabled', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'player_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
    });
    const team1 = { id: 'team_1', captainId: 'captain_1', playerIds: ['player_1'] };
    const team2 = { id: 'team_2', captainId: 'captain_2', playerIds: ['player_2'] };
    const team3 = { id: 'team_3', captainId: 'captain_3', playerIds: ['player_1'] };
    loadEventWithRelationsMock.mockResolvedValue({
      id: 'event_1',
      eventType: 'TOURNAMENT',
      hostId: 'host_1',
      doTeamsOfficiate: true,
      teamOfficialsMaySwap: true,
      matches: {
        match_1: {
          id: 'match_1',
          team1,
          team2,
          teamOfficial: team2,
          official: null,
          officialCheckedIn: false,
        },
      },
      teams: {
        team_1: team1,
        team_2: team2,
        team_3: team3,
      },
      officials: [],
      divisions: [],
      fields: {},
      timeSlots: [],
    });
    serializeMatchesLegacyMock.mockReturnValue([{ $id: 'match_1', teamOfficialId: 'team_3', officialCheckedIn: false }]);

    const res = await matchPatch(
      patchRequest('http://localhost/api/events/event_1/matches/match_1', {
        teamOfficialId: 'team_3',
        officialCheckedIn: true,
      }),
      { params: Promise.resolve({ eventId: 'event_1', matchId: 'match_1' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(applyMatchUpdatesMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        teamOfficialId: 'team_3',
        officialCheckedIn: false,
      }),
    );
    expect(saveMatchesMock).toHaveBeenCalled();
    expect(json.match.$id).toBe('match_1');
  });

  it('rejects swap attempts that include non-swap fields', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'player_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
    });
    const team1 = { id: 'team_1', captainId: 'captain_1', playerIds: ['player_1'] };
    const team2 = { id: 'team_2', captainId: 'captain_2', playerIds: ['player_2'] };
    loadEventWithRelationsMock.mockResolvedValue({
      id: 'event_1',
      eventType: 'TOURNAMENT',
      hostId: 'host_1',
      doTeamsOfficiate: true,
      teamOfficialsMaySwap: true,
      matches: {
        match_1: {
          id: 'match_1',
          team1,
          team2,
          teamOfficial: team2,
          official: null,
          officialCheckedIn: false,
        },
      },
      teams: {
        team_1: team1,
        team_2: team2,
      },
      officials: [],
      divisions: [],
      fields: {},
      timeSlots: [],
    });

    const res = await matchPatch(
      patchRequest('http://localhost/api/events/event_1/matches/match_1', {
        teamOfficialId: 'team_1',
        officialCheckedIn: true,
        team1Points: [1],
      }),
      { params: Promise.resolve({ eventId: 'event_1', matchId: 'match_1' }) },
    );

    expect(res.status).toBe(403);
    expect(applyMatchUpdatesMock).not.toHaveBeenCalled();
  });

  it('updates a match when user is host', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
    });
    loadEventWithRelationsMock.mockResolvedValue({
      id: 'event_1',
      eventType: 'TOURNAMENT',
      hostId: 'host_1',
      matches: { match_1: { id: 'match_1' } },
      teams: {},
    });
    serializeMatchesLegacyMock.mockReturnValue([{ $id: 'match_1' }]);

    const res = await matchPatch(
      patchRequest('http://localhost/api/events/event_1/matches/match_1', { teamOfficialId: 'team_1', locked: true }),
      { params: Promise.resolve({ eventId: 'event_1', matchId: 'match_1' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(applyMatchUpdatesMock).toHaveBeenCalled();
    expect(applyMatchUpdatesMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ locked: true }),
    );
    expect(saveMatchesMock).toHaveBeenCalled();
    expect(json.match.$id).toBe('match_1');
  });

  it('locks a single match immediately when official check-in is saved', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
    });
    loadEventWithRelationsMock.mockResolvedValue({
      id: 'event_1',
      eventType: 'TOURNAMENT',
      hostId: 'host_1',
      matches: {
        match_1: {
          id: 'match_1',
          locked: false,
          officialCheckedIn: false,
        },
      },
      teams: {},
      officials: [],
      divisions: [],
      fields: {},
      timeSlots: [],
    });
    serializeMatchesLegacyMock.mockReturnValue([{ $id: 'match_1', locked: true, officialCheckedIn: true }]);

    const res = await matchPatch(
      patchRequest('http://localhost/api/events/event_1/matches/match_1', { officialCheckedIn: true }),
      { params: Promise.resolve({ eventId: 'event_1', matchId: 'match_1' }) },
    );

    expect(res.status).toBe(200);
    expect(saveMatchesMock).toHaveBeenCalledWith(
      'event_1',
      [expect.objectContaining({ id: 'match_1', locked: true })],
      prismaMock,
    );
  });

  it('bulk updates matches atomically when user is host', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
    });
    loadEventWithRelationsMock.mockResolvedValue({
      id: 'event_1',
      eventType: 'TOURNAMENT',
      hostId: 'host_1',
      matches: {
        match_1: { id: 'match_1' },
        match_2: { id: 'match_2' },
      },
      teams: {},
    });
    serializeMatchesLegacyMock.mockReturnValue([{ $id: 'match_1' }, { $id: 'match_2' }]);

    const res = await matchesPatch(
      patchRequest('http://localhost/api/events/event_1/matches', {
        matches: [
          { id: 'match_1', teamOfficialId: 'team_1', locked: true },
          { id: 'match_2', fieldId: 'field_2' },
        ],
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(applyMatchUpdatesMock).toHaveBeenCalledTimes(2);
    expect(applyMatchUpdatesMock.mock.calls.some((call) => call[2]?.locked === true)).toBe(true);
    expect(saveMatchesMock).toHaveBeenCalledTimes(1);
    expect(json.matches).toHaveLength(2);
  });

  it('locks bulk-updated matches immediately when official check-in is saved', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
    });
    loadEventWithRelationsMock.mockResolvedValue({
      id: 'event_1',
      eventType: 'TOURNAMENT',
      hostId: 'host_1',
      matches: {
        match_1: { id: 'match_1', locked: false, officialCheckedIn: false },
      },
      teams: {},
      officials: [],
      divisions: [],
      fields: {},
      timeSlots: [],
    });
    serializeMatchesLegacyMock.mockReturnValue([{ $id: 'match_1', locked: true, officialCheckedIn: true }]);

    const res = await matchesPatch(
      patchRequest('http://localhost/api/events/event_1/matches', {
        matches: [
          { id: 'match_1', officialCheckedIn: true },
        ],
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(200);
    expect(saveMatchesMock).toHaveBeenCalledWith(
      'event_1',
      [expect.objectContaining({ id: 'match_1', locked: true })],
      prismaMock,
    );
  });

  it('returns 404 when a bulk match update targets a missing match', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
    });
    loadEventWithRelationsMock.mockResolvedValue({
      id: 'event_1',
      eventType: 'TOURNAMENT',
      hostId: 'host_1',
      matches: {
        match_1: { id: 'match_1' },
      },
      teams: {},
    });

    const res = await matchesPatch(
      patchRequest('http://localhost/api/events/event_1/matches', {
        matches: [{ id: 'match_2', fieldId: 'field_2' }],
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(404);
    expect(saveMatchesMock).not.toHaveBeenCalled();
  });

  it('bulk deletes matches and clears dangling links in one transaction', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
    });
    const deletedMatch = { id: 'match_1', matchId: 1, winnerNextMatch: { id: 'match_2' }, loserNextMatch: null, previousLeftMatch: null, previousRightMatch: null };
    const remainingMatch = { id: 'match_2', matchId: 2, winnerNextMatch: null, loserNextMatch: null, previousLeftMatch: deletedMatch, previousRightMatch: null };
    loadEventWithRelationsMock.mockResolvedValue({
      id: 'event_1',
      eventType: 'TOURNAMENT',
      hostId: 'host_1',
      restTimeMinutes: 0,
      teamSizeLimit: 2,
      maxParticipants: 8,
      registeredTeamIds: [],
      divisions: [{ id: 'open', name: 'Open' }],
      matches: {
        match_1: deletedMatch,
        match_2: remainingMatch,
      },
      teams: {},
      officials: [],
      fields: {},
      timeSlots: [],
    });
    serializeMatchesLegacyMock.mockImplementation((items: any[]) => items.map((item) => ({ $id: item.id })));

    const res = await matchesPatch(
      patchRequest('http://localhost/api/events/event_1/matches', {
        deletes: ['match_1'],
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(prismaMock.matches.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventId: 'event_1',
          id: { in: ['match_1'] },
        }),
      }),
    );
    expect(saveMatchesMock).toHaveBeenCalledTimes(1);
    expect(saveMatchesMock.mock.calls[0]?.[1]).toHaveLength(1);
    expect(json.deleted).toEqual(['match_1']);
  });

  it('bulk creates tournament bracket match with placeholder team and maxParticipants increment', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
    });
    loadEventWithRelationsMock.mockResolvedValue({
      id: 'event_1',
      eventType: 'TOURNAMENT',
      hostId: 'host_1',
      restTimeMinutes: 0,
      teamSizeLimit: 2,
      maxParticipants: 8,
      registeredTeamIds: ['team_existing'],
      divisions: [{ id: 'open', name: 'Open' }],
      matches: {
        match_final: {
          id: 'match_final',
          matchId: 1,
          winnerNextMatch: null,
          loserNextMatch: null,
          previousLeftMatch: null,
          previousRightMatch: null,
        },
      },
      teams: {},
      officials: [],
      fields: {},
      timeSlots: [],
    });
    serializeMatchesLegacyMock.mockImplementation((matches: Array<any>) =>
      matches.map((match) => ({
        $id: match.id,
        start: match.start ?? null,
        end: match.end ?? null,
      })),
    );

    const res = await matchesPatch(
      patchRequest('http://localhost/api/events/event_1/matches', {
        creates: [
          {
            clientId: 'new_1',
            creationContext: 'bracket',
            start: null,
            end: null,
            fieldId: null,
            winnerNextMatchId: 'match_final',
          },
        ],
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(prismaMock.teams.create).toHaveBeenCalledTimes(1);
    const createdTeamId = prismaMock.teams.create.mock.calls[0][0]?.data?.id;
    expect(typeof createdTeamId).toBe('string');
    expect(prismaMock.events.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event_1' },
        data: expect.objectContaining({
          maxParticipants: 9,
          teamIds: expect.arrayContaining(['team_existing', createdTeamId]),
        }),
      }),
    );
    expect(json.created?.new_1).toEqual(expect.any(String));
  });

  it('rejects schedule-context create without field and time', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
    });
    loadEventWithRelationsMock.mockResolvedValue({
      id: 'event_1',
      eventType: 'TOURNAMENT',
      hostId: 'host_1',
      restTimeMinutes: 0,
      teamSizeLimit: 2,
      maxParticipants: 8,
      registeredTeamIds: [],
      divisions: [{ id: 'open', name: 'Open' }],
      matches: {
        match_final: {
          id: 'match_final',
          matchId: 1,
          winnerNextMatch: null,
          loserNextMatch: null,
          previousLeftMatch: null,
          previousRightMatch: null,
        },
      },
      teams: {},
      officials: [],
      fields: {},
      timeSlots: [],
    });

    const res = await matchesPatch(
      patchRequest('http://localhost/api/events/event_1/matches', {
        creates: [
          {
            clientId: 'new_1',
            creationContext: 'schedule',
            winnerNextMatchId: 'match_final',
            start: null,
            end: null,
            fieldId: null,
          },
        ],
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(400);
    expect(saveMatchesMock).not.toHaveBeenCalled();
  });

  it('rejects create when target would have more than two incoming links', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
    });
    loadEventWithRelationsMock.mockResolvedValue({
      id: 'event_1',
      eventType: 'TOURNAMENT',
      hostId: 'host_1',
      restTimeMinutes: 0,
      teamSizeLimit: 2,
      maxParticipants: 8,
      registeredTeamIds: [],
      divisions: [{ id: 'open', name: 'Open' }],
      matches: {
        m1: { id: 'm1', matchId: 1, winnerNextMatch: { id: 'm3' }, loserNextMatch: null, previousLeftMatch: null, previousRightMatch: null },
        m2: { id: 'm2', matchId: 2, winnerNextMatch: { id: 'm3' }, loserNextMatch: null, previousLeftMatch: null, previousRightMatch: null },
        m3: { id: 'm3', matchId: 3, winnerNextMatch: null, loserNextMatch: null, previousLeftMatch: null, previousRightMatch: null },
      },
      teams: {},
      officials: [],
      fields: {},
      timeSlots: [],
    });

    const res = await matchesPatch(
      patchRequest('http://localhost/api/events/event_1/matches', {
        creates: [
          {
            clientId: 'new_1',
            winnerNextMatchId: 'm3',
          },
        ],
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(400);
    expect(saveMatchesMock).not.toHaveBeenCalled();
  });

  it('rejects create graph cycle and resolves mixed persisted + client refs when valid', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
    });
    loadEventWithRelationsMock.mockResolvedValue({
      id: 'event_1',
      eventType: 'TOURNAMENT',
      hostId: 'host_1',
      restTimeMinutes: 0,
      teamSizeLimit: 2,
      maxParticipants: 8,
      registeredTeamIds: [],
      divisions: [{ id: 'open', name: 'Open' }],
      matches: {
        root: { id: 'root', matchId: 1, winnerNextMatch: null, loserNextMatch: null, previousLeftMatch: null, previousRightMatch: null },
      },
      teams: {},
      officials: [],
      fields: {},
      timeSlots: [],
    });
    serializeMatchesLegacyMock.mockReturnValue([{ $id: 'placeholder' }]);

    const cycleRes = await matchesPatch(
      patchRequest('http://localhost/api/events/event_1/matches', {
        matches: [{ id: 'root', winnerNextMatchId: 'root' }],
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    expect(cycleRes.status).toBe(400);

    const validRes = await matchesPatch(
      patchRequest('http://localhost/api/events/event_1/matches', {
        creates: [
          {
            clientId: 'a',
            winnerNextMatchId: 'root',
          },
          {
            clientId: 'b',
            winnerNextMatchId: 'client:a',
          },
        ],
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const validJson = await validRes.json();
    expect(validRes.status).toBe(200);
    expect(validJson.created).toEqual(
      expect.objectContaining({
        a: expect.any(String),
        b: expect.any(String),
      }),
    );
  });

  it('rejects bulk create when official assignments reference an unknown position', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
    });
    loadEventWithRelationsMock.mockResolvedValue({
      id: 'event_1',
      eventType: 'TOURNAMENT',
      hostId: 'host_1',
      restTimeMinutes: 0,
      teamSizeLimit: 2,
      maxParticipants: 8,
      registeredTeamIds: [],
      divisions: [{ id: 'open', name: 'Open' }],
      matches: {},
      teams: {},
      officials: [{ id: 'official_1' }],
      officialPositions: [{ id: 'referee', name: 'Referee', count: 1, order: 0 }],
      eventOfficials: [
        {
          id: 'event_official_1',
          userId: 'official_1',
          positionIds: ['referee'],
          fieldIds: [],
          isActive: true,
        },
      ],
      fields: {
        field_1: { id: 'field_1', fieldNumber: 1, name: 'Court 1' },
      },
      timeSlots: [],
    });

    const res = await matchesPatch(
      patchRequest('http://localhost/api/events/event_1/matches', {
        creates: [
          {
            clientId: 'new_1',
            start: '2026-01-02T09:00:00.000Z',
            end: '2026-01-02T10:00:00.000Z',
            fieldId: 'field_1',
            officialIds: [
              {
                positionId: 'unknown_position',
                slotIndex: 0,
                holderType: 'OFFICIAL',
                userId: 'official_1',
                eventOfficialId: 'event_official_1',
              },
            ],
          },
        ],
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(400);
    expect(saveMatchesMock).not.toHaveBeenCalled();
  });

  it('rejects single-match updates when official assignments duplicate the same slot', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
    });
    loadEventWithRelationsMock.mockResolvedValue({
      id: 'event_1',
      eventType: 'TOURNAMENT',
      hostId: 'host_1',
      noFixedEndDateTime: true,
      restTimeMinutes: 0,
      officialPositions: [{ id: 'referee', name: 'Referee', count: 1, order: 0 }],
      eventOfficials: [
        {
          id: 'event_official_1',
          userId: 'official_1',
          positionIds: ['referee'],
          fieldIds: [],
          isActive: true,
        },
      ],
      matches: {
        match_1: {
          id: 'match_1',
          start: new Date('2026-01-02T09:00:00.000Z'),
          end: new Date('2026-01-02T10:00:00.000Z'),
          division: { id: 'open', name: 'Open' },
          field: { id: 'field_1', fieldNumber: 1, name: 'Court 1' },
          teamOfficial: null,
          official: null,
          officialAssignments: [],
        },
      },
      teams: {},
      officials: [{ id: 'official_1' }],
      divisions: [{ id: 'open', name: 'Open' }],
      fields: {
        field_1: { id: 'field_1', fieldNumber: 1, name: 'Court 1' },
      },
      timeSlots: [],
    });

    const res = await matchPatch(
      patchRequest('http://localhost/api/events/event_1/matches/match_1', {
        officialIds: [
          {
            positionId: 'referee',
            slotIndex: 0,
            holderType: 'OFFICIAL',
            userId: 'official_1',
            eventOfficialId: 'event_official_1',
          },
          {
            positionId: 'referee',
            slotIndex: 0,
            holderType: 'OFFICIAL',
            userId: 'official_1',
            eventOfficialId: 'event_official_1',
          },
        ],
      }),
      { params: Promise.resolve({ eventId: 'event_1', matchId: 'match_1' }) },
    );

    expect(res.status).toBe(400);
    expect(saveMatchesMock).not.toHaveBeenCalled();
  });

  it('notifies the host when auto-reschedule fails because fixed end time was reached', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
    });
    loadEventWithRelationsMock.mockResolvedValue({
      id: 'event_1',
      name: 'Fixed Window Tournament',
      eventType: 'TOURNAMENT',
      hostId: 'host_1',
      noFixedEndDateTime: false,
      start: new Date('2026-02-01T10:00:00.000Z'),
      end: new Date('2026-02-10T10:00:00.000Z'),
      matches: {
        match_1: {
          id: 'match_1',
          teamOfficial: null,
          official: null,
        },
      },
      teams: {},
      officials: [],
      divisions: [],
      fields: {},
      timeSlots: [],
    });
    finalizeMatchMock.mockImplementation(() => {
      throw new Error('No available time slots remaining for scheduling');
    });

    const res = await matchPatch(
      patchRequest('http://localhost/api/events/event_1/matches/match_1', { finalize: true }),
      { params: Promise.resolve({ eventId: 'event_1', matchId: 'match_1' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe('AUTO_RESCHEDULE_END_LIMIT');
    expect(sendPushToUsersMock).toHaveBeenCalledWith(expect.objectContaining({
      userIds: ['host_1'],
      data: expect.objectContaining({
        eventId: 'event_1',
        matchId: 'match_1',
      }),
    }));
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
