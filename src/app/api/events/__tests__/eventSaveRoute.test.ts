/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  events: {
    findUnique: jest.fn(),
  },
  divisions: {
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

prismaMock.$transaction.mockImplementation(
  async (callback: (tx: typeof prismaMock) => Promise<unknown> | unknown) => callback(prismaMock),
);

const requireSessionMock = jest.fn();

const upsertEventFromPayloadMock = jest.fn();
const loadEventWithRelationsMock = jest.fn();
const deleteMatchesByEventMock = jest.fn();
const saveMatchesMock = jest.fn();
const saveEventScheduleMock = jest.fn();
const notifySocialAudienceOfEventCreationMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/repositories/events', () => ({
  upsertEventFromPayload: (...args: any[]) => upsertEventFromPayloadMock(...args),
  loadEventWithRelations: (...args: any[]) => loadEventWithRelationsMock(...args),
  deleteMatchesByEvent: (...args: any[]) => deleteMatchesByEventMock(...args),
  saveMatches: (...args: any[]) => saveMatchesMock(...args),
  saveEventSchedule: (...args: any[]) => saveEventScheduleMock(...args),
}));
jest.mock('@/server/eventCreationNotifications', () => ({
  notifySocialAudienceOfEventCreation: (...args: any[]) => notifySocialAudienceOfEventCreationMock(...args),
}));

import { POST as eventsPost } from '@/app/api/events/route';

const postRequest = (url: string, body: any) =>
  new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('event save route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    notifySocialAudienceOfEventCreationMock.mockResolvedValue(undefined);
  });

  it('creates an event and returns divisionFieldIds for the saved response', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    upsertEventFromPayloadMock.mockResolvedValueOnce('event_1');
    loadEventWithRelationsMock.mockResolvedValueOnce({ eventType: 'EVENT' });
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      name: 'Saved Event',
      hostId: 'host_1',
      divisions: ['open'],
      fieldIds: ['field_1'],
      state: 'UNPUBLISHED',
      start: new Date('2026-01-01T00:00:00.000Z'),
      end: new Date('2026-02-01T00:00:00.000Z'),
    });
    prismaMock.divisions.findMany.mockResolvedValueOnce([
      { key: 'open', fieldIds: ['field_1'] },
    ]);

    const res = await eventsPost(
      postRequest('http://localhost/api/events', {
        event: {
          id: 'event_1',
          name: 'Saved Event',
          eventType: 'EVENT',
          divisions: ['open'],
          fieldIds: ['field_1'],
          start: '2026-01-01T00:00:00.000Z',
          end: '2026-02-01T00:00:00.000Z',
        },
      }),
    );

    expect(res.status).toBe(201);
    expect(upsertEventFromPayloadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'event_1',
        hostId: 'host_1',
      }),
      prismaMock,
    );
    expect(loadEventWithRelationsMock).toHaveBeenCalledWith('event_1', prismaMock);

    const json = await res.json();
    expect(json.event.$id).toBe('event_1');
    expect(json.event.divisionFieldIds).toEqual({ open: ['field_1'] });
    expect(notifySocialAudienceOfEventCreationMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_1',
      hostId: 'host_1',
      eventName: 'Saved Event',
    }));
  });
});
