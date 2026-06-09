/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {};
const requireSessionMock = jest.fn();
const canAccessTeamFinanceMock = jest.fn();
const createTeamStaffLaborEntryMock = jest.fn();

const normalizeId = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

class MockFinanceMutationError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: (...args: any[]) => requireSessionMock(...args) }));
jest.mock('@/server/finance/financeAccess', () => ({
  canAccessTeamFinance: (...args: any[]) => canAccessTeamFinanceMock(...args),
}));
jest.mock('@/server/finance/financeMutations', () => ({
  FinanceMutationError: MockFinanceMutationError,
  createTeamStaffLaborEntry: (...args: any[]) => createTeamStaffLaborEntryMock(...args),
}));
jest.mock('@/server/teams/teamMembership', () => ({ normalizeId }));

import { POST } from '@/app/api/teams/[id]/finance/staff/route';

describe('POST /api/teams/[id]/finance/staff', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
    canAccessTeamFinanceMock.mockResolvedValue(true);
    createTeamStaffLaborEntryMock.mockResolvedValue({
      id: 'team_staff_labor_1',
      teamId: 'team_1',
      eventTeamId: 'event_team_1',
      userId: 'coach_1',
      actualMinutes: 90,
    });
  });

  it('creates team staff labor for team finance managers', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/teams/team_1/finance/staff', {
        method: 'POST',
        body: JSON.stringify({
          userId: 'coach_1',
          eventTeamId: 'event_team_1',
          actualMinutes: 90,
          status: 'ACTUAL',
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'team_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(canAccessTeamFinanceMock).toHaveBeenCalledWith(
      'team_1',
      expect.objectContaining({ userId: 'manager_1' }),
      prismaMock,
    );
    expect(createTeamStaffLaborEntryMock).toHaveBeenCalledWith(expect.objectContaining({
      teamId: 'team_1',
      userId: 'coach_1',
      eventTeamId: 'event_team_1',
      actualMinutes: 90,
      actingUserId: 'manager_1',
    }), prismaMock);
    expect(payload.laborEntry.id).toBe('team_staff_labor_1');
  });

  it('rejects viewers without team finance access', async () => {
    canAccessTeamFinanceMock.mockResolvedValue(false);

    const response = await POST(
      new NextRequest('http://localhost/api/teams/team_1/finance/staff', {
        method: 'POST',
        body: JSON.stringify({ userId: 'coach_1' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'team_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Forbidden');
    expect(createTeamStaffLaborEntryMock).not.toHaveBeenCalled();
  });
});
