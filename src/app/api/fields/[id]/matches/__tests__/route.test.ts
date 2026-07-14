/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  matches: { findMany: jest.fn() },
  events: { findMany: jest.fn() },
};
const getVisibleEventIdsMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/server/eventVisibility', () => ({
  getVisibleEventIds: (...args: unknown[]) => getVisibleEventIdsMock(...args),
}));
jest.mock('@/server/matches/instantPayloads', () => ({
  serializeMatchRecords: (matches: unknown[]) => matches,
}));

import { GET } from '@/app/api/fields/[id]/matches/route';

describe('GET /api/fields/[id]/matches', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not disclose a private event match through an anonymous field schedule request', async () => {
    prismaMock.matches.findMany.mockResolvedValueOnce([
      { id: 'match_public', eventId: 'event_public', fieldId: 'field_1' },
      { id: 'match_private', eventId: 'event_private', fieldId: 'field_1' },
    ]);
    prismaMock.events.findMany.mockResolvedValueOnce([
      { id: 'event_public', state: 'PUBLISHED' },
      { id: 'event_private', state: 'PRIVATE' },
    ]);
    getVisibleEventIdsMock.mockResolvedValueOnce(new Set(['event_public']));

    const response = await GET(
      new NextRequest('http://localhost/api/fields/field_1/matches'),
      { params: Promise.resolve({ id: 'field_1' }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      matches: [{ id: 'match_public', eventId: 'event_public', fieldId: 'field_1' }],
    });
    expect(getVisibleEventIdsMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.arrayContaining([expect.objectContaining({ id: 'event_private', state: 'PRIVATE' })]),
    );
  });
});
