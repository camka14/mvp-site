/** @jest-environment node */

import { NextRequest } from 'next/server';

const organizationsFindUniqueMock = jest.fn();
const fieldsFindManyMock = jest.fn();
const requireSessionMock = jest.fn();
const assertNoEventFieldSchedulingConflictsMock = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    organizations: {
      findUnique: (...args: any[]) => organizationsFindUniqueMock(...args),
    },
    fields: {
      findMany: (...args: any[]) => fieldsFindManyMock(...args),
    },
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
});
