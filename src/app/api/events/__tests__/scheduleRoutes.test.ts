/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  $transaction: jest.fn(),
  matches: {
    deleteMany: jest.fn(),
    upsert: jest.fn(),
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
const saveEventScheduleMock = jest.fn();
const saveMatchesMock = jest.fn();
const upsertEventFromPayloadMock = jest.fn();
const deleteMatchesByEventMock = jest.fn();
const saveTeamRecordsMock = jest.fn();
const acquireEventLockMock = jest.fn();
const scheduleEventMock = jest.fn();
const serializeEventLegacyMock = jest.fn();
const serializeMatchesLegacyMock = jest.fn();
const rescheduleEventMatchesPreservingLocksMock = jest.fn();
const applyMatchUpdatesMock = jest.fn();
const finalizeMatchMock = jest.fn();
const isScheduleWindowExceededErrorMock = jest.fn();
const sendPushToUsersMock = jest.fn();
const isEmailEnabledMock = jest.fn();
const sendEmailMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));

jest.mock('@/server/repositories/events', () => ({
  loadEventWithRelations: (...args: any[]) => loadEventWithRelationsMock(...args),
  saveEventSchedule: (...args: any[]) => saveEventScheduleMock(...args),
  saveMatches: (...args: any[]) => saveMatchesMock(...args),
  upsertEventFromPayload: (...args: any[]) => upsertEventFromPayloadMock(...args),
  deleteMatchesByEvent: (...args: any[]) => deleteMatchesByEventMock(...args),
  saveTeamRecords: (...args: any[]) => saveTeamRecordsMock(...args),
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
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.organizations.findUnique.mockResolvedValue(null);
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
      eventDocument: { $id: 'event_1' },
    }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(scheduleEventMock).toHaveBeenCalled();
    expect(deleteMatchesByEventMock).toHaveBeenCalledWith('event_1', prismaMock);
    expect(saveMatchesMock).toHaveBeenCalled();
    expect(json.event.$id).toBe('event_1');
    expect(json.matches[0].$id).toBe('match_1');
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
      }),
      prismaMock,
    );
    expect(scheduleEventMock).toHaveBeenCalled();
    expect(deleteMatchesByEventMock).toHaveBeenCalledWith('event_1', prismaMock);
    expect(saveMatchesMock).toHaveBeenCalled();
    expect(json.event.$id).toBe('event_1');
    expect(json.matches[0].$id).toBe('match_1');
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
      patchRequest('http://localhost/api/events/event_1/matches/match_1', { teamRefereeId: 'team_1', locked: true }),
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
          { id: 'match_1', teamRefereeId: 'team_1', locked: true },
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
          teamReferee: null,
          referee: null,
        },
      },
      teams: {},
      referees: [],
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
