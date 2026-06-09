/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  organizations: {
    findUnique: jest.fn(),
  },
};
const requireSessionMock = jest.fn();
const hasOrgPermissionMock = jest.fn();
const canManageCanonicalTeamMock = jest.fn();
const loadCanonicalTeamByIdMock = jest.fn();
const loadTeamFinanceSummaryMock = jest.fn();

const normalizeId = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: (...args: any[]) => requireSessionMock(...args) }));
jest.mock('@/server/accessControl', () => ({ hasOrgPermission: (...args: any[]) => hasOrgPermissionMock(...args) }));
jest.mock('@/server/teams/teamMembership', () => ({
  canManageCanonicalTeam: (...args: any[]) => canManageCanonicalTeamMock(...args),
  loadCanonicalTeamById: (...args: any[]) => loadCanonicalTeamByIdMock(...args),
  normalizeId,
}));
jest.mock('@/server/finance/financeRepository', () => ({
  loadTeamFinanceSummary: (...args: any[]) => loadTeamFinanceSummaryMock(...args),
}));

import { GET } from '@/app/api/teams/[id]/finance/route';

describe('GET /api/teams/[id]/finance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
    loadCanonicalTeamByIdMock.mockResolvedValue({
      id: 'team_1',
      organizationId: 'org_1',
    });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
    });
    hasOrgPermissionMock.mockResolvedValue(false);
    canManageCanonicalTeamMock.mockResolvedValue(true);
    loadTeamFinanceSummaryMock.mockResolvedValue({
      teamId: 'team_1',
      actualProfitCents: -12000,
      lineItems: [],
      warnings: [],
    });
  });

  it('returns team finance for team managers', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/teams/team_1/finance'),
      { params: Promise.resolve({ id: 'team_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(canManageCanonicalTeamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team_1',
        userId: 'manager_1',
      }),
      prismaMock,
    );
    expect(loadTeamFinanceSummaryMock).toHaveBeenCalledWith('team_1', prismaMock, { eventTeamId: null });
    expect(payload.finance).toMatchObject({
      teamId: 'team_1',
      actualProfitCents: -12000,
    });
  });

  it('returns team finance for organization payment managers', async () => {
    canManageCanonicalTeamMock.mockResolvedValue(false);
    hasOrgPermissionMock.mockResolvedValueOnce(true);

    const response = await GET(
      new NextRequest('http://localhost/api/teams/team_1/finance?eventTeamId=event_team_1'),
      { params: Promise.resolve({ id: 'team_1' }) },
    );

    expect(response.status).toBe(200);
    expect(loadTeamFinanceSummaryMock).toHaveBeenCalledWith('team_1', prismaMock, { eventTeamId: 'event_team_1' });
  });

  it('rejects viewers without organization or team finance access', async () => {
    canManageCanonicalTeamMock.mockResolvedValue(false);

    const response = await GET(
      new NextRequest('http://localhost/api/teams/team_1/finance'),
      { params: Promise.resolve({ id: 'team_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Forbidden');
    expect(loadTeamFinanceSummaryMock).not.toHaveBeenCalled();
  });
});
