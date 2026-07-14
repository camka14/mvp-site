/** @jest-environment node */

import { NextRequest } from 'next/server';

const matchesFindManyMock = jest.fn();
const eventsFindManyMock = jest.fn();
const parseDateInputMock = jest.fn((value: string | null) => (value ? new Date(value) : null));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    matches: {
      findMany: (...args: any[]) => matchesFindManyMock(...args),
    },
    events: {
      findMany: (...args: any[]) => eventsFindManyMock(...args),
    },
  },
}));

import { GET } from '@/app/api/matches/route';

describe('/api/matches GET', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns matches for public eventIds with optional field/range filters', async () => {
    const storedMatches = [
      {
        id: 'm1',
        eventId: 'event_1',
        fieldId: 'field_1',
        start: new Date('2026-03-01T10:00:00.000Z'),
        end: new Date('2026-03-01T11:00:00.000Z'),
      },
      {
        id: 'm2',
        eventId: 'event_2',
        fieldId: 'field_1',
        start: new Date('2026-03-01T12:00:00.000Z'),
        end: new Date('2026-03-01T13:00:00.000Z'),
      },
    ];
    matchesFindManyMock.mockImplementation(({ where }: { where: { eventId: { in: string[] } } }) => (
      storedMatches.filter((match) => where.eventId.in.includes(match.eventId))
    ));
    eventsFindManyMock.mockResolvedValue([{ id: 'event_1' }]);

    const request = new NextRequest(
      'http://localhost/api/matches?eventIds=event_1,event_2&fieldIds=field_1&start=2026-03-01T00:00:00.000Z&end=2026-03-02T00:00:00.000Z',
    );
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(matchesFindManyMock).toHaveBeenCalledTimes(1);
    expect(eventsFindManyMock).toHaveBeenCalledWith({
      where: {
        id: { in: ['event_1', 'event_2'] },
        archivedAt: null,
      },
      select: {
        id: true,
        state: true,
        archivedAt: true,
        hostId: true,
        assistantHostIds: true,
        organizationId: true,
      },
    });
    expect(json.matches).toEqual([expect.objectContaining({
      id: 'm1',
      eventId: 'event_1',
      fieldId: 'field_1',
      id: 'm1',
      start: '2026-03-01T10:00:00.000Z',
      end: '2026-03-01T11:00:00.000Z',
    })]);
  });

  it('does not query matches for an anonymous request containing only private events', async () => {
    eventsFindManyMock.mockResolvedValueOnce([
      { id: 'event_private', state: 'PRIVATE', hostId: 'host_1', assistantHostIds: [], organizationId: null },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/matches?eventIds=event_private'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ matches: [] });
    expect(matchesFindManyMock).not.toHaveBeenCalled();
  });

  it('returns 400 when eventIds are missing', async () => {
    const response = await GET(new NextRequest('http://localhost/api/matches'));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain('eventIds');
    expect(matchesFindManyMock).not.toHaveBeenCalled();
  });
});
