/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  events: { findMany: jest.fn() },
  matches: { findMany: jest.fn() },
};
const requireSessionMock = jest.fn();
const loadProfileScheduleScopeMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/profile/scheduleScope', () => ({
  loadProfileScheduleScope: loadProfileScheduleScopeMock,
}));

import { GET } from '@/app/api/profile/schedule/next-action/route';

describe('GET /api/profile/schedule/next-action', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-13T12:00:00Z'));
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    loadProfileScheduleScopeMock.mockResolvedValue({
      userId: 'user_1',
      relevantTeamIds: ['team_1'],
      involvedEventIds: ['event_1'],
      involvementFilters: [{ hostId: 'user_1' }, { id: { in: ['event_1'] } }],
    });
    prismaMock.matches.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns one narrow match shortcut without schedule hydration data', async () => {
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_1',
        name: 'Summer League',
        imageId: 'image_1',
        state: 'PUBLISHED',
        start: new Date('2026-07-13T10:00:00Z'),
        end: new Date('2026-07-13T18:00:00Z'),
      },
    ]);
    prismaMock.matches.findMany.mockResolvedValue([
      {
        id: 'match_1',
        eventId: 'event_1',
        matchId: 4,
        start: new Date('2026-07-13T12:30:00Z'),
        end: new Date('2026-07-13T13:30:00Z'),
        status: 'SCHEDULED',
        resultStatus: null,
        actualStart: null,
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/profile/schedule/next-action'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      contractVersion: 1,
      generatedAt: '2026-07-13T12:00:00.000Z',
      action: {
        type: 'MATCH',
        eventId: 'event_1',
        matchId: 'match_1',
        eventName: 'Summer League',
        eventImageId: 'image_1',
      },
    });
    expect(json).not.toHaveProperty('events');
    expect(json).not.toHaveProperty('matches');
    expect(json).not.toHaveProperty('teams');
    expect(json).not.toHaveProperty('fields');
    expect(prismaMock.events.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ noFixedEndDateTime: true }),
      take: 501,
      orderBy: [{ start: 'asc' }, { id: 'asc' }],
    }));
    expect(prismaMock.matches.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: {
        id: true,
        eventId: true,
        matchId: true,
        start: true,
        end: true,
        status: true,
        resultStatus: true,
        actualStart: true,
      },
      take: 201,
      orderBy: [{ start: 'asc' }, { matchId: 'asc' }, { id: 'asc' }],
    }));
  });

  it('returns a current match from an older open-ended event', async () => {
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_open',
        name: 'Ongoing League',
        imageId: 'image_open',
        state: 'PUBLISHED',
        start: new Date('2025-01-01T10:00:00Z'),
        end: new Date('2025-02-01T10:00:00Z'),
        noFixedEndDateTime: true,
      },
    ]);
    prismaMock.matches.findMany.mockResolvedValue([
      {
        id: 'match_live',
        eventId: 'event_open',
        matchId: 8,
        start: new Date('2026-07-13T11:45:00Z'),
        end: new Date('2026-07-13T12:45:00Z'),
        status: 'IN_PROGRESS',
        resultStatus: null,
        actualStart: new Date('2026-07-13T11:50:00Z'),
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/profile/schedule/next-action'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.action).toEqual({
      type: 'MATCH',
      eventId: 'event_open',
      matchId: 'match_live',
      eventName: 'Ongoing League',
      eventImageId: 'image_open',
    });
    expect(prismaMock.events.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          expect.objectContaining({
            OR: expect.arrayContaining([{ noFixedEndDateTime: true }, { end: null }]),
          }),
        ]),
      }),
    }));
    expect(prismaMock.matches.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ eventId: { in: ['event_open'] } }),
    }));
  });

  it('ignores terminal matches and falls back to the nearest eligible event', async () => {
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_2',
        name: 'Later Event',
        imageId: null,
        state: 'PUBLISHED',
        start: new Date('2026-07-13T15:00:00Z'),
        end: new Date('2026-07-13T17:00:00Z'),
      },
      {
        id: 'event_1',
        name: 'Current Event',
        imageId: 'image_1',
        state: 'PUBLISHED',
        start: new Date('2026-07-13T10:00:00Z'),
        end: new Date('2026-07-13T18:00:00Z'),
      },
    ]);
    prismaMock.matches.findMany.mockResolvedValue([
      {
        id: 'match_1',
        eventId: 'event_1',
        matchId: 1,
        start: new Date('2026-07-13T12:15:00Z'),
        end: new Date('2026-07-13T13:15:00Z'),
        status: 'COMPLETE',
        resultStatus: 'FINAL',
        actualStart: new Date('2026-07-13T11:00:00Z'),
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/profile/schedule/next-action'));
    const json = await response.json();

    expect(json.action).toEqual({
      type: 'EVENT',
      eventId: 'event_1',
      eventName: 'Current Event',
      eventImageId: 'image_1',
    });
  });

  it('returns create-event without querying matches when there is no candidate event', async () => {
    prismaMock.events.findMany.mockResolvedValue([]);

    const response = await GET(new NextRequest('http://localhost/api/profile/schedule/next-action'));
    const json = await response.json();

    expect(json.action).toEqual({ type: 'CREATE_EVENT' });
    expect(prismaMock.matches.findMany).not.toHaveBeenCalled();
  });

  it('does not expose a live-match shortcut for a terminal event', async () => {
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_cancelled',
        name: 'Cancelled Event',
        imageId: null,
        state: 'CANCELLED',
        start: new Date('2026-07-13T10:00:00Z'),
        end: new Date('2026-07-13T18:00:00Z'),
        noFixedEndDateTime: false,
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/profile/schedule/next-action'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.action).toEqual({ type: 'CREATE_EVENT' });
    expect(prismaMock.matches.findMany).not.toHaveBeenCalled();
  });

  it('fails closed when the bounded event candidate query overflows', async () => {
    prismaMock.events.findMany.mockResolvedValue(
      Array.from({ length: 501 }, (_, index) => ({
        id: `event_${index}`,
        name: `Event ${index}`,
        imageId: null,
        state: 'PUBLISHED',
        start: new Date('2026-07-13T10:00:00Z'),
        end: new Date('2026-07-13T18:00:00Z'),
        noFixedEndDateTime: false,
      })),
    );

    const response = await GET(new NextRequest('http://localhost/api/profile/schedule/next-action'));
    const json = await response.json();

    expect(response.status).toBe(413);
    expect(json.code).toBe('SCHEDULE_NEXT_ACTION_EVENT_LIMIT');
    expect(prismaMock.matches.findMany).not.toHaveBeenCalled();
  });

  it('fails closed when the bounded match candidate query overflows', async () => {
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_1',
        name: 'Current Event',
        imageId: null,
        state: 'PUBLISHED',
        start: new Date('2026-07-13T10:00:00Z'),
        end: new Date('2026-07-13T18:00:00Z'),
        noFixedEndDateTime: false,
      },
    ]);
    prismaMock.matches.findMany.mockResolvedValue(
      Array.from({ length: 201 }, (_, index) => ({
        id: `match_${index}`,
        eventId: 'event_1',
        matchId: index,
        start: new Date('2026-07-13T12:15:00Z'),
        end: new Date('2026-07-13T13:15:00Z'),
        status: 'SCHEDULED',
        resultStatus: null,
        actualStart: null,
      })),
    );

    const response = await GET(new NextRequest('http://localhost/api/profile/schedule/next-action'));
    const json = await response.json();

    expect(response.status).toBe(413);
    expect(json.code).toBe('SCHEDULE_NEXT_ACTION_MATCH_LIMIT');
  });
});
