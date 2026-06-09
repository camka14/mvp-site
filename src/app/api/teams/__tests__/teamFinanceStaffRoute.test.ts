/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  canonicalTeams: {
    findUnique: jest.fn(),
  },
  staffMembers: {
    findMany: jest.fn(),
  },
  userData: {
    findMany: jest.fn(),
  },
};
const requireSessionMock = jest.fn();
const canAccessTeamFinanceMock = jest.fn();
const createTeamStaffLaborEntryMock = jest.fn();
const ensureDefaultOrganizationRolesMock = jest.fn();

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
jest.mock('@/server/organizationRoles', () => ({
  ensureDefaultOrganizationRoles: (...args: any[]) => ensureDefaultOrganizationRolesMock(...args),
}));
jest.mock('@/server/teams/teamMembership', () => ({ normalizeId }));

import { GET, POST } from '@/app/api/teams/[id]/finance/staff/route';

describe('/api/teams/[id]/finance/staff', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
    canAccessTeamFinanceMock.mockResolvedValue(true);
    prismaMock.canonicalTeams.findUnique.mockResolvedValue({
      id: 'team_1',
      organizationId: 'org_1',
    });
    prismaMock.staffMembers.findMany.mockResolvedValue([
      {
        id: 'staff_1',
        userId: 'coach_1',
        roleId: 'role_coach',
        types: ['STAFF'],
      },
    ]);
    prismaMock.userData.findMany.mockResolvedValue([
      {
        id: 'coach_1',
        firstName: 'Casey',
        lastName: 'Coach',
        userName: 'casey.coach',
      },
    ]);
    ensureDefaultOrganizationRolesMock.mockResolvedValue([
      {
        id: 'role_coach',
        organizationId: 'org_1',
        name: 'Coach',
        kind: 'STAFF',
        systemKey: 'COACH',
        isSystem: true,
        isDefault: true,
        permissions: [],
      },
    ]);
    createTeamStaffLaborEntryMock.mockResolvedValue({
      id: 'team_staff_labor_1',
      teamId: 'team_1',
      eventTeamId: 'event_team_1',
      userId: 'coach_1',
      actualMinutes: 90,
    });
  });

  it('returns staff options for team finance managers', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/teams/team_1/finance/staff'),
      { params: Promise.resolve({ id: 'team_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(canAccessTeamFinanceMock).toHaveBeenCalledWith(
      'team_1',
      expect.objectContaining({ userId: 'manager_1' }),
      prismaMock,
    );
    expect(prismaMock.canonicalTeams.findUnique).toHaveBeenCalledWith({
      where: { id: 'team_1' },
      select: {
        id: true,
        organizationId: true,
      },
    });
    expect(prismaMock.staffMembers.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: 'org_1' },
    }));
    expect(ensureDefaultOrganizationRolesMock).toHaveBeenCalledWith(prismaMock, 'org_1');
    expect(payload.staffMembers).toEqual([
      expect.objectContaining({
        id: 'staff_1',
        userId: 'coach_1',
        roleName: 'Coach',
        displayName: 'Casey Coach',
      }),
    ]);
    expect(payload.staffRoles).toEqual([
      expect.objectContaining({
        id: 'role_coach',
        name: 'Coach',
      }),
    ]);
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
