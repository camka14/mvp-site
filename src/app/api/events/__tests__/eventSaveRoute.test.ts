/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  authUser: {
    findUnique: jest.fn(),
  },
  events: {
    findUnique: jest.fn(),
  },
  organizations: {
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
const hasOrgPermissionMock = jest.fn();
const canManageEventMock = jest.fn();

const upsertEventFromPayloadMock = jest.fn();
const loadEventWithRelationsMock = jest.fn();
const deleteMatchesByEventMock = jest.fn();
const saveMatchesMock = jest.fn();
const saveEventScheduleMock = jest.fn();
const notifySocialAudienceOfEventCreationMock = jest.fn();
const sendAdminEventCreatedNotificationMock = jest.fn();
const isEventFieldConflictErrorMock = jest.fn(() => false);
const isLeaguePlayoffTeamCountValidationErrorMock = jest.fn(() => false);
const isRentalBookingReservationErrorMock = jest.fn(() => false);
const acquireEventLockMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({
  canManageEvent: (...args: any[]) => canManageEventMock(...args),
  hasOrgPermission: (...args: any[]) => hasOrgPermissionMock(...args),
}));
jest.mock('@/server/repositories/events', () => ({
  upsertEventFromPayload: (...args: any[]) => upsertEventFromPayloadMock(...args),
  loadEventWithRelations: (...args: any[]) => loadEventWithRelationsMock(...args),
  deleteMatchesByEvent: (...args: any[]) => deleteMatchesByEventMock(...args),
  saveMatches: (...args: any[]) => saveMatchesMock(...args),
  saveEventSchedule: (...args: any[]) => saveEventScheduleMock(...args),
  isEventFieldConflictError: (...args: any[]) => isEventFieldConflictErrorMock(...args),
  isLeaguePlayoffTeamCountValidationError: (...args: any[]) => isLeaguePlayoffTeamCountValidationErrorMock(...args),
  isRentalBookingReservationError: (...args: any[]) => isRentalBookingReservationErrorMock(...args),
}));
jest.mock('@/server/eventCreationNotifications', () => ({
  notifySocialAudienceOfEventCreation: (...args: any[]) => notifySocialAudienceOfEventCreationMock(...args),
}));
jest.mock('@/server/adminNotifications', () => ({
  sendAdminEventCreatedNotification: (...args: any[]) => sendAdminEventCreatedNotificationMock(...args),
}));
jest.mock('@/server/repositories/locks', () => ({
  acquireEventLock: (...args: any[]) => acquireEventLockMock(...args),
}));

import { POST as eventsPost } from '@/app/api/events/route';

const ORIGIN_ENV_KEYS = ['PUBLIC_WEB_BASE_URL', 'NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_WEB_BASE_URL'] as const;

const clearOriginEnv = () => {
  for (const key of ORIGIN_ENV_KEYS) {
    delete process.env[key];
  }
};

const postRequest = (url: string, body: any, headers: Record<string, string> = {}) =>
  new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

describe('event save route', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    clearOriginEnv();
    jest.resetAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof prismaMock) => Promise<unknown> | unknown) => callback(prismaMock),
    );
    notifySocialAudienceOfEventCreationMock.mockResolvedValue(undefined);
    isEventFieldConflictErrorMock.mockReturnValue(false);
    isLeaguePlayoffTeamCountValidationErrorMock.mockReturnValue(false);
    isRentalBookingReservationErrorMock.mockReturnValue(false);
    prismaMock.authUser.findUnique.mockResolvedValue({ emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z') });
    sendAdminEventCreatedNotificationMock.mockResolvedValue(undefined);
    hasOrgPermissionMock.mockResolvedValue(true);
    canManageEventMock.mockResolvedValue(true);
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_1', ownerId: 'host_1' });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('blocks event creation when the session user has not verified email', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.authUser.findUnique.mockResolvedValueOnce({ emailVerifiedAt: null });

    const res = await eventsPost(
      postRequest('http://localhost/api/events', {
        id: 'event_1',
        event: {
          name: 'Saved Event',
          eventType: 'EVENT',
          start: '2026-01-01T00:00:00.000Z',
          end: '2026-02-01T00:00:00.000Z',
        },
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json).toEqual(expect.objectContaining({
      code: 'EMAIL_VERIFICATION_REQUIRED',
      error: 'Verify your email before creating an event.',
    }));
    expect(upsertEventFromPayloadMock).not.toHaveBeenCalled();
  });

  it('creates an event and returns divisionFieldIds for the saved response', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    upsertEventFromPayloadMock.mockResolvedValueOnce('event_1');
    loadEventWithRelationsMock.mockResolvedValueOnce({ eventType: 'EVENT' });
    prismaMock.events.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
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
        id: 'event_1',
        event: {
          name: 'Saved Event',
          eventType: 'EVENT',
          divisions: ['open'],
          fieldIds: ['field_1'],
          start: '2026-01-01T00:00:00.000Z',
          end: '2026-02-01T00:00:00.000Z',
        },
        newFields: [
          {
            id: 'field_inline_1',
            name: 'Inline Field',
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
      }),
    );

    expect(res.status).toBe(201);
    expect(upsertEventFromPayloadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'event_1',
        hostId: 'host_1',
        fields: [
          expect.objectContaining({
            id: 'field_inline_1',
            divisions: ['open'],
          }),
        ],
        timeSlots: [
          expect.objectContaining({
            id: 'slot_inline_1',
            scheduledFieldId: 'field_inline_1',
            scheduledFieldIds: ['field_inline_1'],
            daysOfWeek: [1, 3],
          }),
        ],
      }),
      prismaMock,
    );
    expect(prismaMock.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        maxWait: 10_000,
        timeout: 20_000,
      }),
    );
    expect(loadEventWithRelationsMock).toHaveBeenCalledWith('event_1', prismaMock);
    expect(acquireEventLockMock).toHaveBeenCalledWith(prismaMock, 'event_1');
    expect(acquireEventLockMock.mock.invocationCallOrder[0]).toBeLessThan(
      upsertEventFromPayloadMock.mock.invocationCallOrder[0],
    );

    const json = await res.json();
    expect(json.event.id).toBe('event_1');
    expect(json.event).not.toHaveProperty('$id');
    expect(json.event.divisionFieldIds).toEqual({ open: ['field_1'] });
    expect(notifySocialAudienceOfEventCreationMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_1',
      hostId: 'host_1',
      eventName: 'Saved Event',
    }));
    expect(sendAdminEventCreatedNotificationMock).toHaveBeenCalledWith({
      event: expect.objectContaining({
        id: 'event_1',
        name: 'Saved Event',
        hostId: 'host_1',
      }),
      baseUrl: 'http://localhost',
    });
  });

  it('uses the canonical origin for creation notifications when request host headers are hostile', async () => {
    process.env.PUBLIC_WEB_BASE_URL = 'https://bracket-iq.com';
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    upsertEventFromPayloadMock.mockResolvedValueOnce('event_1');
    loadEventWithRelationsMock.mockResolvedValueOnce({ eventType: 'EVENT' });
    prismaMock.events.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'event_1',
        name: 'Canonical Event',
        hostId: 'host_1',
        divisions: [],
        fieldIds: [],
        state: 'UNPUBLISHED',
        start: new Date('2026-01-01T00:00:00.000Z'),
        end: new Date('2026-02-01T00:00:00.000Z'),
      });
    prismaMock.divisions.findMany.mockResolvedValueOnce([]);

    const res = await eventsPost(postRequest(
      'https://internal.service.local/api/events',
      {
        id: 'event_1',
        event: {
          name: 'Canonical Event',
          eventType: 'EVENT',
          start: '2026-01-01T00:00:00.000Z',
          end: '2026-02-01T00:00:00.000Z',
        },
      },
      {
        host: 'poisoned-host.example.com',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'attacker.example.com',
      },
    ));

    expect(res.status).toBe(201);
    expect(notifySocialAudienceOfEventCreationMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_1',
      baseUrl: 'https://bracket-iq.com',
    }));
    expect(sendAdminEventCreatedNotificationMock).toHaveBeenCalledWith({
      event: expect.objectContaining({ id: 'event_1' }),
      baseUrl: 'https://bracket-iq.com',
    });
    const notificationCalls = JSON.stringify([
      ...notifySocialAudienceOfEventCreationMock.mock.calls,
      ...sendAdminEventCreatedNotificationMock.mock.calls,
    ]);
    expect(notificationCalls).not.toContain('attacker.example.com');
    expect(notificationCalls).not.toContain('poisoned-host.example.com');
  });

  it('returns 500 when upsert fails and does not emit creation notifications', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValueOnce(null);
    upsertEventFromPayloadMock.mockRejectedValueOnce(new Error('upsert failed'));

    const res = await eventsPost(
      postRequest('http://localhost/api/events', {
        id: 'event_1',
        event: {
          name: 'Broken Event',
          eventType: 'EVENT',
          start: '2026-01-01T00:00:00.000Z',
          end: '2026-02-01T00:00:00.000Z',
        },
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual(expect.objectContaining({ error: 'Internal Server Error' }));
    expect(loadEventWithRelationsMock).not.toHaveBeenCalled();
    expect(saveMatchesMock).not.toHaveBeenCalled();
    expect(saveEventScheduleMock).not.toHaveBeenCalled();
    expect(notifySocialAudienceOfEventCreationMock).not.toHaveBeenCalled();
  });

  it('derives the host from the authenticated session for non-admin event creation', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    upsertEventFromPayloadMock.mockResolvedValueOnce('event_1');
    loadEventWithRelationsMock.mockResolvedValueOnce({ eventType: 'EVENT' });
    prismaMock.events.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'event_1', name: 'Safe Event', hostId: 'host_1', divisions: [], fieldIds: [],
        state: 'UNPUBLISHED', start: new Date(), end: new Date(),
      });
    prismaMock.divisions.findMany.mockResolvedValue([]);

    const res = await eventsPost(postRequest('http://localhost/api/events', {
      id: 'event_1',
      event: { name: 'Safe Event', hostId: 'victim_1', eventType: 'EVENT' },
    }));

    expect(res.status).toBe(201);
    expect(upsertEventFromPayloadMock).toHaveBeenCalledWith(
      expect.objectContaining({ hostId: 'host_1' }),
      prismaMock,
    );
  });

  it('rejects creating an event under an organization the caller cannot manage', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValueOnce(null);
    prismaMock.organizations.findUnique.mockResolvedValueOnce({ id: 'org_2', ownerId: 'owner_2' });
    hasOrgPermissionMock.mockResolvedValueOnce(false);

    const res = await eventsPost(postRequest('http://localhost/api/events', {
      id: 'event_1',
      event: { name: 'Spoofed Org Event', organizationId: 'org_2', eventType: 'EVENT' },
    }));

    expect(res.status).toBe(403);
    expect(upsertEventFromPayloadMock).not.toHaveBeenCalled();
  });

  it('returns 400 when a new event has no selected or created fields', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValueOnce(null);
    upsertEventFromPayloadMock.mockRejectedValueOnce(
      new Error('Select or create at least one field for this event.'),
    );

    const res = await eventsPost(
      postRequest('http://localhost/api/events', {
        id: 'event_1',
        event: {
          name: 'Org Event',
          eventType: 'EVENT',
          organizationId: 'org_1',
          start: '2026-01-01T00:00:00.000Z',
          end: '2026-02-01T00:00:00.000Z',
        },
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual(expect.objectContaining({
      error: 'Select or create at least one field for this event.',
    }));
    expect(loadEventWithRelationsMock).not.toHaveBeenCalled();
    expect(notifySocialAudienceOfEventCreationMock).not.toHaveBeenCalled();
  });
});



