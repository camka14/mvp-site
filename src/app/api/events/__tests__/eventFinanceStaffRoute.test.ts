/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  events: {
    findUnique: jest.fn(),
  },
};
const requireSessionMock = jest.fn();
const canManageEventMock = jest.fn();
const createEventStaffAssignmentMock = jest.fn();

class MockFinanceMutationError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: (...args: any[]) => requireSessionMock(...args) }));
jest.mock('@/server/accessControl', () => ({
  canManageEvent: (...args: any[]) => canManageEventMock(...args),
}));
jest.mock('@/server/finance/financeMutations', () => ({
  FinanceMutationError: MockFinanceMutationError,
  createEventStaffAssignment: (...args: any[]) => createEventStaffAssignmentMock(...args),
}));

import { POST } from '@/app/api/events/[eventId]/finance/staff/route';

describe('POST /api/events/[eventId]/finance/staff', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    canManageEventMock.mockResolvedValue(true);
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: 'org_1',
    });
    createEventStaffAssignmentMock.mockResolvedValue({
      id: 'event_staff_labor_1',
      eventId: 'event_1',
      staffMemberId: 'staff_1',
      plannedMinutes: 120,
    });
  });

  it('creates event staff labor for event managers', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/events/event_1/finance/staff', {
        method: 'POST',
        body: JSON.stringify({
          staffMemberId: 'staff_1',
          plannedMinutes: 120,
          status: 'PLANNED',
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(canManageEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'host_1' }),
      expect.objectContaining({ id: 'event_1' }),
      prismaMock,
    );
    expect(createEventStaffAssignmentMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_1',
      staffMemberId: 'staff_1',
      plannedMinutes: 120,
      actingUserId: 'host_1',
    }), prismaMock);
    expect(payload.assignment.id).toBe('event_staff_labor_1');
  });

  it('rejects viewers who cannot manage the event', async () => {
    canManageEventMock.mockResolvedValue(false);

    const response = await POST(
      new NextRequest('http://localhost/api/events/event_1/finance/staff', {
        method: 'POST',
        body: JSON.stringify({ staffMemberId: 'staff_1' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Forbidden');
    expect(createEventStaffAssignmentMock).not.toHaveBeenCalled();
  });
});
