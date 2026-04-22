/** @jest-environment node */

import { NextRequest } from 'next/server';

const organizationsFindUniqueMock = jest.fn();
const fieldsFindManyMock = jest.fn();
const timeSlotsFindManyMock = jest.fn();
const prismaTransactionMock = jest.fn();
const requireSessionMock = jest.fn();
const assertNoEventFieldSchedulingConflictsMock = jest.fn();
const txEventsFindUniqueMock = jest.fn();
const txEventsCreateMock = jest.fn();
const txTimeSlotsCreateMock = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    organizations: {
      findUnique: (...args: any[]) => organizationsFindUniqueMock(...args),
    },
    fields: {
      findMany: (...args: any[]) => fieldsFindManyMock(...args),
    },
    timeSlots: {
      findMany: (...args: any[]) => timeSlotsFindManyMock(...args),
    },
    $transaction: (...args: any[]) => prismaTransactionMock(...args),
  },
}));

jest.mock('@/lib/permissions', () => ({
  requireSession: (...args: any[]) => requireSessionMock(...args),
}));

class MockEventFieldConflictError extends Error {
  conflicts: unknown;

  constructor(message: string, conflicts?: unknown) {
    super(message);
    this.conflicts = conflicts;
  }
}

jest.mock('@/server/repositories/events', () => ({
  EventFieldConflictError: MockEventFieldConflictError,
  assertNoEventFieldSchedulingConflicts: (...args: any[]) => (
    assertNoEventFieldSchedulingConflictsMock(...args)
  ),
}));

import { POST } from '@/app/api/public/organizations/[slug]/rental-orders/route';

const createRequest = (body: unknown) => new NextRequest('http://localhost/api/public/organizations/summit/rental-orders', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const params = Promise.resolve({ slug: 'summit' });

const baseSelection = {
  scheduledFieldIds: ['field_1'],
  startDate: '2026-04-21T17:00:00.000Z',
  endDate: '2026-04-21T18:00:00.000Z',
};

describe('/api/public/organizations/[slug]/rental-orders POST', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    timeSlotsFindManyMock.mockResolvedValue([]);
    assertNoEventFieldSchedulingConflictsMock.mockResolvedValue(undefined);
    txEventsFindUniqueMock.mockResolvedValue(null);
    txEventsCreateMock.mockResolvedValue({});
    txTimeSlotsCreateMock.mockResolvedValue({});
    prismaTransactionMock.mockImplementation(async (callback: any) => callback({
      events: {
        findUnique: txEventsFindUniqueMock,
        create: txEventsCreateMock,
      },
      timeSlots: {
        create: txTimeSlotsCreateMock,
      },
    }));
  });

  it('returns 400 when the organization has no configured sports', async () => {
    organizationsFindUniqueMock.mockResolvedValue({
      id: 'org_1',
      name: 'Summit',
      sports: [],
      location: null,
      address: null,
      coordinates: null,
      ownerId: 'owner_1',
      publicPageEnabled: true,
    });

    const response = await POST(createRequest({
      eventId: 'event_1',
      selections: [baseSelection],
      sportId: null,
    }), { params });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toMatch(/at least one sport configured/i);
    expect(fieldsFindManyMock).not.toHaveBeenCalled();
  });

  it('returns 400 when sport is omitted for a rental-only order', async () => {
    organizationsFindUniqueMock.mockResolvedValue({
      id: 'org_1',
      name: 'Summit',
      sports: ['Indoor Volleyball'],
      location: null,
      address: null,
      coordinates: null,
      ownerId: 'owner_1',
      publicPageEnabled: true,
    });

    const response = await POST(createRequest({
      eventId: 'event_1',
      selections: [baseSelection],
      sportId: null,
    }), { params });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toMatch(/select a sport/i);
    expect(fieldsFindManyMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the requested sport is not configured for the organization', async () => {
    organizationsFindUniqueMock.mockResolvedValue({
      id: 'org_1',
      name: 'Summit',
      sports: ['Indoor Volleyball'],
      location: null,
      address: null,
      coordinates: null,
      ownerId: 'owner_1',
      publicPageEnabled: true,
    });

    const response = await POST(createRequest({
      eventId: 'event_1',
      selections: [baseSelection],
      sportId: 'Indoor Soccer',
    }), { params });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toMatch(/not available/i);
    expect(fieldsFindManyMock).not.toHaveBeenCalled();
  });

  it('creates the private rental event with the organization logo as the event image', async () => {
    organizationsFindUniqueMock.mockResolvedValue({
      id: 'org_1',
      name: 'Summit',
      logoId: 'file_logo_1',
      sports: ['Indoor Volleyball'],
      location: 'Main Gym',
      address: '123 Main St',
      coordinates: [-122.4, 37.8],
      ownerId: 'owner_1',
      publicPageEnabled: true,
    });
    fieldsFindManyMock.mockResolvedValue([
      {
        id: 'field_1',
        name: 'Court 1',
        rentalSlotIds: ['slot_1'],
        location: 'Main Gym',
        long: -122.4,
        lat: 37.8,
      },
    ]);
    timeSlotsFindManyMock.mockResolvedValue([
      {
        id: 'slot_1',
        startDate: '2026-04-21T16:00:00.000Z',
        endDate: '2026-04-21T19:00:00.000Z',
        repeating: false,
        price: 0,
        requiredTemplateIds: [],
        hostRequiredTemplateIds: [],
      },
    ]);

    const response = await POST(createRequest({
      eventId: 'event_1',
      selections: [baseSelection],
      sportId: 'Indoor Volleyball',
    }), { params });
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({
      eventId: 'event_1',
      totalCents: 0,
    });
    expect(txEventsCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        id: 'event_1',
        imageId: 'file_logo_1',
        organizationId: 'org_1',
      }),
    }));
  });
});
