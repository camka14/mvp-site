/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  $executeRaw: jest.fn().mockResolvedValue(1),
  fields: {
    findMany: jest.fn(),
  },
  timeSlots: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
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
import { PATCH } from '@/app/api/time-slots/[id]/route';

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
      requiredTemplateIds: [],
      rentalDocumentTemplateId: 'tmpl_rental_doc',
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
      rentalDocumentTemplateId: 'tmpl_rental_doc',
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
          rentalDocumentTemplateId: 'tmpl_rental_doc',
        }),
      }),
    );
    expect(json).toEqual(expect.objectContaining({
      id: 'slot_create',
      dayOfWeek: 1,
      daysOfWeek: [1, 3],
      scheduledFieldId: 'field_2',
      scheduledFieldIds: ['field_2', 'field_1', 'field_3'],
      rentalDocumentTemplateId: 'tmpl_rental_doc',
    }));
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
      requiredTemplateIds: [],
      rentalDocumentTemplateId: 'tmpl_patch_doc',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await PATCH(
      jsonRequest('http://localhost/api/time-slots/slot_patch', {
        slot: {
          daysOfWeek: [4, 2, 4],
          scheduledFieldIds: ['field_a', 'field_b', 'field_a'],
          rentalDocumentTemplateId: '  tmpl_patch_doc  ',
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
          rentalDocumentTemplateId: 'tmpl_patch_doc',
        }),
      }),
    );
    expect(json).toEqual(expect.objectContaining({
      id: 'slot_patch',
      dayOfWeek: 2,
      daysOfWeek: [2, 4],
      scheduledFieldId: 'field_a',
      scheduledFieldIds: ['field_a', 'field_b'],
      rentalDocumentTemplateId: 'tmpl_patch_doc',
    }));
  });

  it('PATCH strips legacy and immutable fields before prisma update', async () => {
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
      rentalDocumentTemplateId: null,
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
});
