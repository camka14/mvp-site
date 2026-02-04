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
const applyMatchUpdatesMock = jest.fn();
const finalizeMatchMock = jest.fn();

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

jest.mock('@/server/scheduler/updateMatch', () => ({
  applyMatchUpdates: (...args: any[]) => applyMatchUpdatesMock(...args),
  finalizeMatch: (...args: any[]) => finalizeMatchMock(...args),
}));

import { POST as schedulePost } from '@/app/api/events/schedule/route';
import { PATCH as matchPatch } from '@/app/api/events/[eventId]/matches/[matchId]/route';

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
  });

  it('schedules an event from an event document payload', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
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

  it('rejects match updates when user is not host', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
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
    loadEventWithRelationsMock.mockResolvedValue({
      id: 'event_1',
      eventType: 'TOURNAMENT',
      hostId: 'host_1',
      matches: { match_1: { id: 'match_1' } },
      teams: {},
    });
    serializeMatchesLegacyMock.mockReturnValue([{ $id: 'match_1' }]);

    const res = await matchPatch(
      patchRequest('http://localhost/api/events/event_1/matches/match_1', { teamRefereeId: 'team_1' }),
      { params: Promise.resolve({ eventId: 'event_1', matchId: 'match_1' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(applyMatchUpdatesMock).toHaveBeenCalled();
    expect(saveMatchesMock).toHaveBeenCalled();
    expect(json.match.$id).toBe('match_1');
  });
});
