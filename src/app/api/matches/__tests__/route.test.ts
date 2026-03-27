/** @jest-environment node */

import { NextRequest } from 'next/server';

const matchesFindManyMock = jest.fn();
const eventsFindManyMock = jest.fn();
const withLegacyListMock = jest.fn((rows: any[]) => rows.map((row) => ({ ...row, $id: row.id })));
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

jest.mock('@/server/legacyFormat', () => ({
  withLegacyList: (rows: any[]) => withLegacyListMock(rows),
  parseDateInput: (value: string | null) => parseDateInputMock(value),
}));

import { GET } from '@/app/api/matches/route';

describe('/api/matches GET', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns matches for eventIds with optional field/range filters and hides template events', async () => {
    matchesFindManyMock.mockResolvedValue([
      { id: 'm1', eventId: 'event_1', fieldId: 'field_1' },
      { id: 'm2', eventId: 'event_2', fieldId: 'field_1' },
    ]);
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
        NOT: { state: 'TEMPLATE' },
      },
      select: { id: true },
    });
    expect(json.matches).toEqual([{ id: 'm1', eventId: 'event_1', fieldId: 'field_1', $id: 'm1' }]);
  });

  it('returns 400 when eventIds are missing', async () => {
    const response = await GET(new NextRequest('http://localhost/api/matches'));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain('eventIds');
    expect(matchesFindManyMock).not.toHaveBeenCalled();
  });
});
