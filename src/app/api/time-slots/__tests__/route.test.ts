/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  $executeRaw: jest.fn().mockResolvedValue(1),
  $transaction: jest.fn(async (callback: (tx: typeof prismaMock) => Promise<unknown>) => callback(prismaMock)),
  fields: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  organizations: {
    findUnique: jest.fn(),
  },
  timeSlots: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  events: {
    count: jest.fn(),
  },
  bills: {
    findMany: jest.fn(),
  },
  billPayments: {
    count: jest.fn(),
  },
  billPaymentProofs: {
    count: jest.fn(),
  },
  rentalBookingItems: {
    count: jest.fn(),
  },
  staffScheduleAssignments: {
    count: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const canManageScheduledFieldsMock = jest.fn();
const canManageTimeSlotMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/timeSlotAccess', () => ({
  canManageScheduledFields: (...args: unknown[]) => canManageScheduledFieldsMock(...args),
  canManageTimeSlot: (...args: unknown[]) => canManageTimeSlotMock(...args),
}));
jest.mock('@/server/legacyFormat', () => ({
  parseDateInput: (value: unknown) => {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const parsed = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  },
  stripLegacyFieldsDeep: (value: unknown) => {
    if (Array.isArray(value)) {
      return value.map((entry) => (entry && typeof entry === 'object'
        ? Object.fromEntries(Object.entries(entry).filter(([key]) => !key.startsWith('$')))
        : entry));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter(([key]) => !key.startsWith('$')),
      );
    }
    return value;
  },
  withLegacyFields: (value: any) => ({ ...value, $id: value.id ?? value.$id ?? null }),
}));

import { GET, POST } from '@/app/api/time-slots/route';
import { DELETE, PATCH } from '@/app/api/time-slots/[id]/route';

const jsonRequest = (url: string, body: unknown, method: 'POST' | 'PATCH' = 'POST') =>
  new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('time-slots routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    canManageScheduledFieldsMock.mockResolvedValue(true);
    canManageTimeSlotMock.mockResolvedValue(true);
    prismaMock.fields.findMany.mockResolvedValue([]);
    prismaMock.fields.update.mockResolvedValue({});
    prismaMock.organizations.findUnique.mockResolvedValue(null);
    prismaMock.timeSlots.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      startDate: new Date('2026-01-05T00:00:00.000Z'),
      endDate: null,
      timeZone: 'UTC',
      repeating: true,
      scheduledFieldId: null,
      scheduledFieldIds: [],
    }));
    prismaMock.events.count.mockResolvedValue(0);
    prismaMock.bills.findMany.mockResolvedValue([]);
    prismaMock.billPayments.count.mockResolvedValue(0);
    prismaMock.billPaymentProofs.count.mockResolvedValue(0);
    prismaMock.rentalBookingItems.count.mockResolvedValue(0);
    prismaMock.staffScheduleAssignments.count.mockResolvedValue(0);
    prismaMock.timeSlots.delete.mockResolvedValue({});
    prismaMock.timeSlots.update.mockResolvedValue({});
  });

  it('GET applies array-aware field/day filters and returns canonical arrays with legacy aliases', async () => {
    prismaMock.timeSlots.findMany.mockResolvedValueOnce([
      {
        id: 'slot_1',
        dayOfWeek: 1,
        daysOfWeek: [1, 3],
        scheduledFieldId: 'field_1',
        scheduledFieldIds: ['field_1', 'field_2'],
        divisions: ['open'],
        startDate: new Date('2026-01-05T00:00:00.000Z'),
        endDate: null,
        repeating: true,
        startTimeMinutes: 540,
        endTimeMinutes: 600,
      },
    ]);

    const res = await GET(new NextRequest('http://localhost/api/time-slots?fieldId=field_2&dayOfWeek=3'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(prismaMock.timeSlots.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { archivedAt: null },
            {
              OR: [
                { scheduledFieldId: { in: ['field_2'] } },
                { scheduledFieldIds: { hasSome: ['field_2'] } },
              ],
            },
            {
              OR: [
                { dayOfWeek: 3 },
                { daysOfWeek: { has: 3 } },
              ],
            },
          ],
        },
      }),
    );
    expect(json.timeSlots[0]).toEqual(expect.objectContaining({
      id: 'slot_1',
      dayOfWeek: 1,
      daysOfWeek: [1, 3],
      scheduledFieldId: 'field_1',
      scheduledFieldIds: ['field_1', 'field_2'],
    }));
  });

  it('GET accepts fieldIds csv and filters across scalar and array field references', async () => {
    prismaMock.timeSlots.findMany.mockResolvedValueOnce([]);

    const res = await GET(new NextRequest('http://localhost/api/time-slots?fieldIds=field_1,field_2'));

    expect(res.status).toBe(200);
    expect(prismaMock.timeSlots.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { archivedAt: null },
            {
              OR: [
                { scheduledFieldId: { in: ['field_1', 'field_2'] } },
                { scheduledFieldIds: { hasSome: ['field_1', 'field_2'] } },
              ],
            },
          ],
        },
      }),
    );
  });

  it('GET with rentalOnly scopes field lookups to field.rentalSlotIds', async () => {
    prismaMock.fields.findMany.mockResolvedValueOnce([
      { rentalSlotIds: ['slot_rental'] },
    ]);
    prismaMock.timeSlots.findMany.mockResolvedValueOnce([
      {
        id: 'slot_rental',
        dayOfWeek: 1,
        daysOfWeek: [1],
        scheduledFieldId: 'field_1',
        scheduledFieldIds: ['field_1'],
        divisions: ['open'],
        startDate: new Date('2026-01-05T00:00:00.000Z'),
        endDate: null,
        repeating: true,
        startTimeMinutes: 540,
        endTimeMinutes: 600,
      },
    ]);

    const res = await GET(new NextRequest('http://localhost/api/time-slots?fieldId=field_1&rentalOnly=1'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(prismaMock.fields.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['field_1'] } },
      select: { rentalSlotIds: true },
    });
    expect(prismaMock.timeSlots.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { archivedAt: null },
            {
              OR: [
                { scheduledFieldId: { in: ['field_1'] } },
                { scheduledFieldIds: { hasSome: ['field_1'] } },
              ],
            },
            { id: { in: ['slot_rental'] } },
          ],
        },
      }),
    );
    expect(json.timeSlots).toHaveLength(1);
    expect(json.timeSlots[0].id).toBe('slot_rental');
  });

  it('POST persists canonical field/day arrays and keeps scalar aliases', async () => {
    prismaMock.timeSlots.create.mockResolvedValueOnce({
      id: 'slot_create',
      dayOfWeek: 1,
      daysOfWeek: [1, 3],
      scheduledFieldId: 'field_2',
      scheduledFieldIds: ['field_2', 'field_1', 'field_3'],
      divisions: ['open'],
      startDate: new Date('2026-01-05T00:00:00.000Z'),
      endDate: null,
      repeating: true,
      startTimeMinutes: 540,
      endTimeMinutes: 600,
      price: null,
      requiredTemplateIds: ['tmpl_rental_doc'],
      hostRequiredTemplateIds: ['tmpl_host_contract'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await POST(jsonRequest('http://localhost/api/time-slots', {
      id: 'slot_create',
      dayOfWeek: 3,
      daysOfWeek: [3, 1, 3],
      scheduledFieldId: 'field_3',
      scheduledFieldIds: ['field_2', 'field_1', 'field_2'],
      startTimeMinutes: 540,
      endTimeMinutes: 600,
      repeating: true,
      divisions: ['Open'],
      requiredTemplateIds: ['tmpl_rental_doc', 'tmpl_rental_doc'],
      hostRequiredTemplateIds: ['tmpl_host_contract', 'tmpl_host_contract'],
      startDate: '2026-01-05T00:00:00.000Z',
      endDate: null,
    }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(prismaMock.timeSlots.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dayOfWeek: 1,
          daysOfWeek: [1, 3],
          scheduledFieldId: 'field_2',
          scheduledFieldIds: ['field_2', 'field_1', 'field_3'],
          requiredTemplateIds: ['tmpl_rental_doc'],
          hostRequiredTemplateIds: ['tmpl_host_contract'],
        }),
      }),
    );
    expect(json).toEqual(expect.objectContaining({
      id: 'slot_create',
      dayOfWeek: 1,
      daysOfWeek: [1, 3],
      scheduledFieldId: 'field_2',
      scheduledFieldIds: ['field_2', 'field_1', 'field_3'],
      requiredTemplateIds: ['tmpl_rental_doc'],
      hostRequiredTemplateIds: ['tmpl_host_contract'],
    }));
  });

  it('POST rejects a caller who cannot manage the requested field inventory', async () => {
    canManageScheduledFieldsMock.mockResolvedValueOnce(false);

    const res = await POST(jsonRequest('http://localhost/api/time-slots', {
      id: 'slot_forbidden_create',
      scheduledFieldId: 'field_other_org',
      dayOfWeek: 1,
      startDate: '2026-01-05T00:00:00.000Z',
      repeating: true,
    }));

    expect(res.status).toBe(403);
    expect(prismaMock.timeSlots.create).not.toHaveBeenCalled();
  });

  it('POST converts offset-less rental slot times using the selected field timezone', async () => {
    prismaMock.fields.findMany.mockResolvedValueOnce([
      { id: 'field_1', lat: 37.8, long: -122.4, organizationId: null },
    ]);
    prismaMock.timeSlots.create.mockResolvedValueOnce({
      id: 'slot_timezone',
      dayOfWeek: 4,
      daysOfWeek: [4],
      scheduledFieldId: 'field_1',
      scheduledFieldIds: ['field_1'],
      divisions: [],
      startDate: new Date('2026-05-01T16:00:00.000Z'),
      endDate: new Date('2026-05-02T04:00:00.000Z'),
      timeZone: 'America/Los_Angeles',
      repeating: false,
      startTimeMinutes: 9 * 60,
      endTimeMinutes: 21 * 60,
      price: null,
      requiredTemplateIds: [],
      hostRequiredTemplateIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await POST(jsonRequest('http://localhost/api/time-slots', {
      id: 'slot_timezone',
      dayOfWeek: 4,
      scheduledFieldId: 'field_1',
      startTimeMinutes: 9 * 60,
      endTimeMinutes: 21 * 60,
      repeating: false,
      startDate: '2026-05-01T09:00:00',
      endDate: '2026-05-01T21:00:00',
    }));

    expect(res.status).toBe(201);
    expect(prismaMock.timeSlots.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          timeZone: 'America/Los_Angeles',
          startDate: new Date('2026-05-01T16:00:00.000Z'),
          endDate: new Date('2026-05-02T04:00:00.000Z'),
        }),
      }),
    );
  });

  it('PATCH persists canonical arrays while preserving legacy aliases in the response', async () => {
    prismaMock.timeSlots.update.mockResolvedValueOnce({
      id: 'slot_patch',
      dayOfWeek: 2,
      daysOfWeek: [2, 4],
      scheduledFieldId: 'field_a',
      scheduledFieldIds: ['field_a', 'field_b'],
      divisions: ['open'],
      startDate: new Date('2026-01-05T00:00:00.000Z'),
      endDate: null,
      repeating: true,
      startTimeMinutes: 540,
      endTimeMinutes: 600,
      price: null,
      requiredTemplateIds: ['tmpl_patch_doc'],
      hostRequiredTemplateIds: ['tmpl_patch_host_doc'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await PATCH(
      jsonRequest('http://localhost/api/time-slots/slot_patch', {
        slot: {
          daysOfWeek: [4, 2, 4],
          scheduledFieldIds: ['field_a', 'field_b', 'field_a'],
          requiredTemplateIds: ['tmpl_patch_doc', 'tmpl_patch_doc'],
          hostRequiredTemplateIds: ['tmpl_patch_host_doc', 'tmpl_patch_host_doc'],
        },
      }, 'PATCH'),
      { params: Promise.resolve({ id: 'slot_patch' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(prismaMock.timeSlots.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'slot_patch' },
        data: expect.objectContaining({
          dayOfWeek: 2,
          daysOfWeek: [2, 4],
          scheduledFieldId: 'field_a',
          scheduledFieldIds: ['field_a', 'field_b'],
          requiredTemplateIds: ['tmpl_patch_doc'],
          hostRequiredTemplateIds: ['tmpl_patch_host_doc'],
        }),
      }),
    );
    expect(json).toEqual(expect.objectContaining({
      id: 'slot_patch',
      dayOfWeek: 2,
      daysOfWeek: [2, 4],
      scheduledFieldId: 'field_a',
      scheduledFieldIds: ['field_a', 'field_b'],
      requiredTemplateIds: ['tmpl_patch_doc'],
      hostRequiredTemplateIds: ['tmpl_patch_host_doc'],
    }));
  });

  it('PATCH rejects a caller who cannot manage the existing time slot', async () => {
    canManageTimeSlotMock.mockResolvedValueOnce(false);

    const res = await PATCH(
      jsonRequest('http://localhost/api/time-slots/slot_forbidden_patch', {
        slot: { price: 2500 },
      }, 'PATCH'),
      { params: Promise.resolve({ id: 'slot_forbidden_patch' }) },
    );

    expect(res.status).toBe(403);
    expect(prismaMock.timeSlots.update).not.toHaveBeenCalled();
  });

  it('PATCH rejects reassignment to a field the caller cannot manage', async () => {
    canManageScheduledFieldsMock.mockResolvedValueOnce(false);

    const res = await PATCH(
      jsonRequest('http://localhost/api/time-slots/slot_forbidden_reassignment', {
        slot: { scheduledFieldId: 'field_other_org' },
      }, 'PATCH'),
      { params: Promise.resolve({ id: 'slot_forbidden_reassignment' }) },
    );

    expect(res.status).toBe(403);
    expect(prismaMock.timeSlots.update).not.toHaveBeenCalled();
  });

  it('PATCH strips legacy and immutable fields before prisma update', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'user_1', isAdmin: true });
    prismaMock.timeSlots.update.mockResolvedValueOnce({
      id: 'slot_patch_guard',
      dayOfWeek: 2,
      daysOfWeek: [2],
      scheduledFieldId: 'field_a',
      scheduledFieldIds: ['field_a'],
      divisions: ['open'],
      startDate: new Date('2026-01-05T00:00:00.000Z'),
      endDate: null,
      repeating: true,
      startTimeMinutes: 540,
      endTimeMinutes: 600,
      price: null,
      requiredTemplateIds: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const res = await PATCH(
      jsonRequest('http://localhost/api/time-slots/slot_patch_guard', {
        slot: {
          $id: 'slot_patch_guard',
          id: 'slot_patch_guard',
          createdAt: '2026-01-01T00:00:00.000Z',
          dayOfWeek: 2,
          daysOfWeek: [2],
          scheduledFieldId: 'field_a',
          scheduledFieldIds: ['field_a'],
        },
      }, 'PATCH'),
      { params: Promise.resolve({ id: 'slot_patch_guard' }) },
    );

    expect(res.status).toBe(200);
    const updateCallArg = prismaMock.timeSlots.update.mock.calls.at(-1)?.[0] as {
      data: Record<string, unknown>;
    };
    expect(updateCallArg.data).not.toHaveProperty('$id');
    expect(updateCallArg.data).not.toHaveProperty('id');
    expect(updateCallArg.data).not.toHaveProperty('createdAt');
    expect(updateCallArg.data).toHaveProperty('updatedAt');
  });

  it('DELETE hard deletes an unreferenced slot and removes it from field rentalSlotIds', async () => {
    prismaMock.timeSlots.findUnique.mockResolvedValueOnce({
      id: 'slot_delete',
      archivedAt: null,
      archivedByUserId: null,
      archiveReason: null,
    });
    prismaMock.fields.findMany.mockResolvedValueOnce([
      { id: 'field_1', rentalSlotIds: ['slot_keep', 'slot_delete'] },
    ]);

    const res = await DELETE(
      new NextRequest('http://localhost/api/time-slots/slot_delete', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'slot_delete' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(expect.objectContaining({
      deleted: true,
      archived: false,
      action: 'deleted',
      entityType: 'timeSlot',
      entityId: 'slot_delete',
    }));
    expect(prismaMock.fields.update).toHaveBeenCalledWith({
      where: { id: 'field_1' },
      data: {
        rentalSlotIds: ['slot_keep'],
        updatedAt: expect.any(Date),
      },
    });
    expect(prismaMock.timeSlots.delete).toHaveBeenCalledWith({ where: { id: 'slot_delete' } });
    expect(prismaMock.timeSlots.update).not.toHaveBeenCalled();
  });

  it('DELETE rejects a caller who cannot manage the time slot', async () => {
    canManageTimeSlotMock.mockResolvedValueOnce(false);
    prismaMock.timeSlots.findUnique.mockResolvedValueOnce({
      id: 'slot_forbidden_delete',
      scheduledFieldId: 'field_other_org',
      scheduledFieldIds: ['field_other_org'],
      archivedAt: null,
      archivedByUserId: null,
      archiveReason: null,
    });

    const res = await DELETE(
      new NextRequest('http://localhost/api/time-slots/slot_forbidden_delete', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'slot_forbidden_delete' }) },
    );

    expect(res.status).toBe(403);
    expect(prismaMock.timeSlots.delete).not.toHaveBeenCalled();
    expect(prismaMock.timeSlots.update).not.toHaveBeenCalled();
  });

  it('DELETE archives a referenced slot', async () => {
    prismaMock.timeSlots.findUnique.mockResolvedValueOnce({
      id: 'slot_archive',
      archivedAt: null,
      archivedByUserId: null,
      archiveReason: null,
    });
    prismaMock.rentalBookingItems.count.mockResolvedValueOnce(1);

    const res = await DELETE(
      new NextRequest('http://localhost/api/time-slots/slot_archive', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'slot_archive' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(expect.objectContaining({
      deleted: false,
      archived: true,
      action: 'archived',
      entityType: 'timeSlot',
      entityId: 'slot_archive',
      references: [{ type: 'rental_booking_items', count: 1 }],
    }));
    expect(prismaMock.timeSlots.update).toHaveBeenCalledWith({
      where: { id: 'slot_archive' },
      data: expect.objectContaining({
        archivedAt: expect.any(Date),
        archivedByUserId: 'user_1',
        archiveReason: 'delete_requested',
        updatedAt: expect.any(Date),
      }),
    });
    expect(prismaMock.timeSlots.delete).not.toHaveBeenCalled();
  });
});
