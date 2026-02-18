/** @jest-environment node */

import { NextRequest } from 'next/server';

const eventsMock = {
  findUnique: jest.fn(),
  update: jest.fn(),
};

const timeSlotsMock = {
  upsert: jest.fn(),
  deleteMany: jest.fn(),
};

const fieldsMock = {
  upsert: jest.fn(),
  deleteMany: jest.fn(),
};

const matchesMock = {
  deleteMany: jest.fn(),
};

const divisionsMock = {
  findMany: jest.fn(),
  deleteMany: jest.fn(),
  upsert: jest.fn(),
};

const executeRawMock = jest.fn();

const prismaMock = {
  events: eventsMock,
  timeSlots: timeSlotsMock,
  divisions: divisionsMock,
  $transaction: jest.fn(async (callback: any) => callback({
    events: eventsMock,
    timeSlots: timeSlotsMock,
    fields: fieldsMock,
    matches: matchesMock,
    divisions: divisionsMock,
    $executeRaw: executeRawMock,
  })),
};

const requireSessionMock = jest.fn();
const scheduleEventMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/scheduler/scheduleEvent', () => ({
  scheduleEvent: (...args: any[]) => scheduleEventMock(...args),
  ScheduleError: class ScheduleError extends Error {},
}));

import { PATCH as eventPatch } from '@/app/api/events/[eventId]/route';

const patchRequest = (url: string, body: any) =>
  new NextRequest(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('event PATCH route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('strips legacy $-prefixed fields and ignores unsupported keys (no legacy mapping)', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique
      .mockResolvedValueOnce({ id: 'event_1', hostId: 'host_1' })
      .mockResolvedValueOnce({ id: 'event_1', hostId: 'host_1' });
    prismaMock.events.update.mockResolvedValueOnce({ id: 'event_1', hostId: 'host_1' });
    divisionsMock.findMany.mockResolvedValue([]);

    const res = await eventPatch(
      patchRequest('http://localhost/api/events/event_1', {
        event: {
          $id: 'event_1',
          $createdAt: '2020-01-01T00:00:00.000Z',
          $updatedAt: '2020-01-02T00:00:00.000Z',
          id: 'event_1',
          playerIds: ['user_1'],
          players: [{ $id: 'user_2' }],
          organization: 'org_1',
          sport: { $id: 'sport_1', name: 'Volleyball' },
          state: 'PUBLISHED',
        },
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(200);
    expect(prismaMock.events.update).toHaveBeenCalledTimes(1);

    const updateArg = prismaMock.events.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: 'event_1' });
    expect(updateArg.data.$id).toBeUndefined();
    expect(updateArg.data.$createdAt).toBeUndefined();
    expect(updateArg.data.$updatedAt).toBeUndefined();
    expect(updateArg.data.id).toBeUndefined();
    expect(updateArg.data.playerIds).toBeUndefined();
    expect(updateArg.data.players).toBeUndefined();
    expect(updateArg.data.organization).toBeUndefined();
    expect(updateArg.data.sport).toBeUndefined();
    expect(updateArg.data.organizationId).toBeUndefined();
    expect(updateArg.data.sportId).toBeUndefined();
    expect(updateArg.data.userIds).toBeUndefined();
    expect(updateArg.data.state).toBe('PUBLISHED');
    expect(updateArg.data.updatedAt).toBeInstanceOf(Date);
  });

  it('updates userIds when provided (preferred field name)', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique
      .mockResolvedValueOnce({ id: 'event_1', hostId: 'host_1' })
      .mockResolvedValueOnce({ id: 'event_1', hostId: 'host_1' });
    prismaMock.events.update.mockResolvedValueOnce({ id: 'event_1', hostId: 'host_1' });
    divisionsMock.findMany.mockResolvedValue([]);

    const res = await eventPatch(
      patchRequest('http://localhost/api/events/event_1', {
        event: {
          userIds: ['user_1'],
        },
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(200);
    expect(prismaMock.events.update).toHaveBeenCalledTimes(1);

    const updateArg = prismaMock.events.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: 'event_1' });
    expect(updateArg.data.userIds).toEqual(['user_1']);
  });

  it('syncs division field mappings when divisionFieldIds are provided', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        divisions: ['open'],
        fieldIds: ['field_1'],
        eventType: 'EVENT',
        sportId: 'sport_1',
        organizationId: 'org_1',
        start: new Date('2026-01-01T00:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        divisions: ['advanced'],
        fieldIds: ['field_1', 'field_2'],
        eventType: 'EVENT',
      });
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      hostId: 'host_1',
      divisions: ['advanced'],
      fieldIds: ['field_1', 'field_2'],
      eventType: 'EVENT',
      sportId: 'sport_1',
      organizationId: 'org_1',
      start: new Date('2026-01-01T00:00:00.000Z'),
    });
    divisionsMock.findMany
      .mockResolvedValueOnce([]) // currentDivisionFieldMap lookup
      .mockResolvedValueOnce([]) // stale divisions lookup in syncEventDivisions
      .mockResolvedValueOnce([{ key: 'advanced', fieldIds: ['field_2'] }]); // response divisionFieldIds
    divisionsMock.deleteMany.mockResolvedValue({ count: 0 });
    divisionsMock.upsert.mockResolvedValue({});

    const res = await eventPatch(
      patchRequest('http://localhost/api/events/event_1', {
        event: {
          divisions: ['Advanced'],
          fieldIds: ['field_1', 'field_2'],
          divisionFieldIds: { advanced: ['field_2'] },
        },
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(200);
    expect(divisionsMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event_1__division__advanced' },
      }),
    );

    const json = await res.json();
    expect(json.divisionFieldIds).toEqual({ advanced: ['field_2'] });
    expect(json.divisions).toEqual(['advanced']);
  });

  it('forces slot divisions to all selected event divisions when singleDivision is enabled', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        eventType: 'EVENT',
        divisions: ['beginner', 'advanced'],
        fieldIds: ['field_1'],
        start: new Date('2026-01-01T00:00:00.000Z'),
        timeSlotIds: ['slot_old'],
        singleDivision: false,
      })
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        eventType: 'EVENT',
        divisions: ['beginner', 'advanced'],
      });
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      hostId: 'host_1',
      eventType: 'EVENT',
      divisions: ['beginner', 'advanced'],
    });
    divisionsMock.findMany.mockResolvedValue([]);
    timeSlotsMock.upsert.mockResolvedValue({});
    timeSlotsMock.deleteMany.mockResolvedValue({ count: 0 });

    const res = await eventPatch(
      patchRequest('http://localhost/api/events/event_1', {
        event: {
          singleDivision: true,
          divisions: ['beginner', 'advanced'],
          timeSlots: [
            {
              $id: 'slot_1',
              dayOfWeek: 1,
              daysOfWeek: [1],
              scheduledFieldId: 'field_1',
              startTimeMinutes: 540,
              endTimeMinutes: 600,
              divisions: ['beginner'],
            },
          ],
        },
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(200);
    expect(timeSlotsMock.upsert).toHaveBeenCalledTimes(1);
    expect(executeRawMock).toHaveBeenCalled();
    expect(executeRawMock.mock.calls[0]?.[1]).toEqual(['beginner', 'advanced']);
  });

  it('fans out multi-day + multi-field slots and removes local fields that were unassigned', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        eventType: 'EVENT',
        divisions: ['beginner'],
        fieldIds: ['field_old', 'field_keep'],
        timeSlotIds: ['slot_legacy'],
        start: new Date('2026-01-01T00:00:00.000Z'),
        singleDivision: false,
        organizationId: null,
      })
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        eventType: 'EVENT',
        divisions: ['beginner'],
        fieldIds: ['field_keep', 'field_new'],
      });
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      hostId: 'host_1',
      eventType: 'EVENT',
      divisions: ['beginner'],
      fieldIds: ['field_keep', 'field_new'],
    });
    divisionsMock.findMany.mockResolvedValue([]);
    timeSlotsMock.upsert.mockResolvedValue({});
    timeSlotsMock.deleteMany.mockResolvedValue({ count: 1 });
    fieldsMock.upsert.mockResolvedValue({});
    fieldsMock.deleteMany.mockResolvedValue({ count: 1 });
    matchesMock.deleteMany.mockResolvedValue({ count: 2 });

    const res = await eventPatch(
      patchRequest('http://localhost/api/events/event_1', {
        event: {
          fields: [
            { $id: 'field_keep', fieldNumber: 1, name: 'Field Keep' },
            { $id: 'field_new', fieldNumber: 2, name: 'Field New' },
          ],
          timeSlots: [
            {
              $id: 'slot_multi',
              daysOfWeek: [1, 3],
              startTimeMinutes: 540,
              endTimeMinutes: 600,
              divisions: ['beginner'],
              scheduledFieldIds: ['field_keep', 'field_new'],
            },
          ],
        },
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(200);
    expect(timeSlotsMock.upsert).toHaveBeenCalledTimes(4);
    expect(
      timeSlotsMock.upsert.mock.calls.map((call) => call[0].where.id).sort(),
    ).toEqual([
      'slot_multi__d1__ffield_keep',
      'slot_multi__d1__ffield_new',
      'slot_multi__d3__ffield_keep',
      'slot_multi__d3__ffield_new',
    ]);
    expect(fieldsMock.upsert).toHaveBeenCalledTimes(2);
    expect(matchesMock.deleteMany).toHaveBeenCalledWith({
      where: {
        eventId: 'event_1',
        fieldId: { in: ['field_old'] },
      },
    });
    expect(fieldsMock.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['field_old'] },
        organizationId: null,
      },
    });

    const updateArg = prismaMock.events.update.mock.calls[0][0];
    expect(updateArg.data.fieldIds.sort()).toEqual(['field_keep', 'field_new']);
  });

  it('does not auto-reschedule leagues on regular PATCH saves', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        eventType: 'LEAGUE',
        noFixedEndDateTime: true,
        divisions: ['open'],
        fieldIds: ['field_1'],
        timeSlotIds: ['slot_1'],
        start: new Date('2026-01-01T00:00:00.000Z'),
        singleDivision: true,
      })
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        eventType: 'LEAGUE',
        noFixedEndDateTime: true,
        divisions: ['open'],
      });
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      hostId: 'host_1',
      eventType: 'LEAGUE',
      noFixedEndDateTime: true,
      divisions: ['open'],
    });
    divisionsMock.findMany.mockResolvedValue([]);
    timeSlotsMock.upsert.mockResolvedValue({});
    timeSlotsMock.deleteMany.mockResolvedValue({ count: 0 });

    const res = await eventPatch(
      patchRequest('http://localhost/api/events/event_1', {
        event: {
          eventType: 'LEAGUE',
          timeSlots: [
            {
              $id: 'slot_1',
              dayOfWeek: 5,
              daysOfWeek: [5],
              scheduledFieldIds: ['field_1', 'field_2'],
              startTimeMinutes: 1020,
              endTimeMinutes: 1260,
              repeating: true,
              divisions: ['open'],
            },
          ],
        },
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(200);
    expect(scheduleEventMock).not.toHaveBeenCalled();
  });
});
