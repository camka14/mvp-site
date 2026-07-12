/** @jest-environment node */

import { NextRequest } from 'next/server';

const findUniqueMock = jest.fn();
const updateMock = jest.fn();
const deleteMock = jest.fn();
const findManyMock = jest.fn();
const eventsFindManyMock = jest.fn();
const teamRegistrationsUpdateManyMock = jest.fn();
const countMock = jest.fn();
const billsFindManyMock = jest.fn();
const eventTeamStaffAssignmentsUpdateManyMock = jest.fn();
const organizationFindFirstMock = jest.fn();
const staffMemberFindUniqueMock = jest.fn();
const inviteFindFirstMock = jest.fn();
const evaluateRazumlyAdminAccessMock = jest.fn();

const txClientMock = {
  teams: {
    update: (...args: any[]) => updateMock(...args),
    delete: (...args: any[]) => deleteMock(...args),
    findMany: (...args: any[]) => findManyMock(...args),
  },
  events: {
    findMany: (...args: any[]) => eventsFindManyMock(...args),
  },
  teamRegistrations: {
    updateMany: (...args: any[]) => teamRegistrationsUpdateManyMock(...args),
  },
  eventTeamStaffAssignments: {
    updateMany: (...args: any[]) => eventTeamStaffAssignmentsUpdateManyMock(...args),
  },
};

const prismaMock = {
  teams: {
    findUnique: (...args: any[]) => findUniqueMock(...args),
    update: (...args: any[]) => updateMock(...args),
    delete: (...args: any[]) => deleteMock(...args),
    findMany: (...args: any[]) => findManyMock(...args),
  },
  bills: {
    findMany: (...args: any[]) => billsFindManyMock(...args),
  },
  billPayments: {
    count: (...args: any[]) => countMock(...args),
  },
  billPaymentProofs: {
    count: (...args: any[]) => countMock(...args),
  },
  eventRegistrations: {
    count: (...args: any[]) => countMock(...args),
  },
  matches: {
    count: (...args: any[]) => countMock(...args),
  },
  matchSegments: {
    count: (...args: any[]) => countMock(...args),
  },
  matchIncidents: {
    count: (...args: any[]) => countMock(...args),
  },
  refundRequests: {
    count: (...args: any[]) => countMock(...args),
  },
  signedDocuments: {
    count: (...args: any[]) => countMock(...args),
  },
  eventTeamStaffAssignments: {
    count: (...args: any[]) => countMock(...args),
  },
  boldSignSyncOperations: {
    count: (...args: any[]) => countMock(...args),
  },
  events: {
    count: (...args: any[]) => countMock(...args),
  },
  divisions: {
    count: (...args: any[]) => countMock(...args),
  },
  chatGroup: {
    count: (...args: any[]) => countMock(...args),
  },
  organizations: {
    findFirst: (...args: any[]) => organizationFindFirstMock(...args),
  },
  staffMembers: {
    findUnique: (...args: any[]) => staffMemberFindUniqueMock(...args),
  },
  invites: {
    findFirst: (...args: any[]) => inviteFindFirstMock(...args),
  },
  $transaction: jest.fn(async (handler: any) => handler(txClientMock)),
};

const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: (...args: any[]) => requireSessionMock(...args) }));
jest.mock('@/server/legacyFormat', () => ({
  withLegacyFields: (row: any) => ({ ...row, $id: row.id }),
}));
jest.mock('@/server/razumlyAdmin', () => ({
  evaluateRazumlyAdminAccess: (...args: any[]) => evaluateRazumlyAdminAccessMock(...args),
}));

import { DELETE, PATCH } from '@/app/api/teams/[id]/route';

const patchJson = (body: unknown) => new NextRequest('http://localhost/api/teams/team_1', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('/api/teams/[id] PATCH', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'captain_1', isAdmin: false });
    evaluateRazumlyAdminAccessMock.mockResolvedValue({ allowed: false, email: null, verified: false });
    organizationFindFirstMock.mockResolvedValue(null);
    staffMemberFindUniqueMock.mockResolvedValue(null);
    inviteFindFirstMock.mockResolvedValue(null);
    findManyMock.mockResolvedValue([]);
    eventsFindManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    billsFindManyMock.mockResolvedValue([]);
    deleteMock.mockResolvedValue({});
    eventTeamStaffAssignmentsUpdateManyMock.mockResolvedValue({ count: 0 });
    findUniqueMock.mockResolvedValue({
      id: 'team_1',
      name: 'Team One',
      division: 'Open',
      divisionTypeId: 'open',
      sport: 'Indoor Volleyball',
      playerIds: ['captain_1', 'user_2'],
      captainId: 'captain_1',
      managerId: 'manager_1',
      headCoachId: 'coach_1',
      coachIds: ['assistant_1', 'assistant_2'],
      pending: [],
      teamSize: 6,
      profileImageId: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    updateMock.mockImplementation(async ({ data }: any) => ({
      id: 'team_1',
      name: data.name ?? 'Team One',
      division: data.division ?? 'Open',
      divisionTypeId: data.divisionTypeId ?? 'open',
      sport: data.sport ?? 'Indoor Volleyball',
      playerIds: data.playerIds ?? ['captain_1', 'user_2'],
      captainId: data.captainId ?? 'captain_1',
      managerId: data.managerId ?? 'manager_1',
      headCoachId: Object.prototype.hasOwnProperty.call(data, 'headCoachId') ? data.headCoachId : 'coach_1',
      coachIds: data.coachIds ?? ['assistant_1', 'assistant_2'],
      pending: data.pending ?? [],
      teamSize: data.teamSize ?? 6,
      profileImageId: data.profileImageId ?? null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: data.updatedAt ?? new Date('2026-01-02T00:00:00.000Z'),
    }));
  });

  it('clears manager when managerId is patched to an empty string', async () => {
    const response = await PATCH(
      patchJson({ team: { managerId: '' } }),
      { params: Promise.resolve({ id: 'team_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'team_1' },
      data: expect.objectContaining({ managerId: '' }),
    }));
    expect(payload.managerId).toBe('');
  });

  it('fails closed when legacy team storage rejects a requested patch field', async () => {
    updateMock.mockRejectedValueOnce(
      new Error('Unknown argument `name` for type VolleyBallTeamsUpdateInput.'),
    );

    const response = await PATCH(
      patchJson({ team: { name: 'Renamed Team' } }),
      { params: Promise.resolve({ id: 'team_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'team_1' },
      data: expect.objectContaining({ name: 'Renamed Team' }),
    }));
    expect(payload).toEqual(expect.objectContaining({
      code: 'PRISMA_SCHEMA_CONTRACT_MISMATCH',
      field: 'name',
    }));
  });

  it('clears head coach when headCoachId is patched to null', async () => {
    const response = await PATCH(
      patchJson({ team: { headCoachId: null } }),
      { params: Promise.resolve({ id: 'team_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'team_1' },
      data: expect.objectContaining({ headCoachId: null }),
    }));
    expect(payload.headCoachId).toBeNull();
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,external-registration',
    'https://user:password@partner.example.com/register',
  ])('rejects unsafe affiliate registration URL %s before updating a team', async (affiliateUrl) => {
    const response = await PATCH(
      patchJson({ team: { affiliateUrl } }),
      { params: Promise.resolve({ id: 'team_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.details.fieldErrors.affiliateUrl).toContain('Enter a valid external registration link.');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('canonicalizes a safe affiliate registration URL before updating a team', async () => {
    const response = await PATCH(
      patchJson({ team: { affiliateUrl: ' HTTPS://Partner.Example.com/register ' } }),
      { params: Promise.resolve({ id: 'team_1' }) },
    );

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ affiliateUrl: 'https://partner.example.com/register' }),
    }));
  });

  it('accepts mobile roster registration metadata while removing a player', async () => {
    const response = await PATCH(
      patchJson({
        team: {
          playerIds: ['captain_1'],
          captainId: 'captain_1',
          playerRegistrations: [
            {
              id: 'team_1__captain_1',
              teamId: 'team_1',
              userId: 'captain_1',
              registrantId: 'captain_1',
              parentId: null,
              registrantType: 'SELF',
              rosterRole: 'PARTICIPANT',
              status: 'ACTIVE',
              jerseyNumber: '12',
              position: null,
              isCaptain: true,
              consentDocumentId: null,
              consentStatus: null,
              createdBy: 'manager_1',
            },
          ],
        },
      }),
      { params: Promise.resolve({ id: 'team_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'team_1' },
      data: expect.objectContaining({
        playerIds: ['captain_1'],
        captainId: 'captain_1',
      }),
    }));
    expect(teamRegistrationsUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        teamId: 'team_1',
        userId: 'captain_1',
      },
      data: expect.objectContaining({
        registrantType: 'SELF',
        rosterRole: 'PARTICIPANT',
        jerseyNumber: '12',
        createdBy: 'manager_1',
      }),
    }));
    expect(payload.playerIds).toEqual(['captain_1']);
  });

  it('rejects blank team names in patch payloads', async () => {
    const response = await PATCH(
      patchJson({ team: { name: '   ' } }),
      { params: Promise.resolve({ id: 'team_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Invalid input');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('hard deletes an unreferenced event team', async () => {
    const response = await DELETE(
      new NextRequest('http://localhost/api/teams/team_1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'team_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(expect.objectContaining({
      deleted: true,
      archived: false,
      action: 'deleted',
      entityType: 'team',
      entityId: 'team_1',
    }));
    expect(deleteMock).toHaveBeenCalledWith({ where: { id: 'team_1' } });
    expect(updateMock).not.toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'team_1' },
      data: expect.objectContaining({ archivedAt: expect.any(Date) }),
    }));
  });

  it('archives a referenced event team', async () => {
    countMock.mockImplementation(async ({ where }: any) => {
      if (where?.OR?.some?.((entry: Record<string, unknown>) => entry.team1Id === 'team_1')) {
        return 1;
      }
      return 0;
    });

    const response = await DELETE(
      new NextRequest('http://localhost/api/teams/team_1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'team_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(expect.objectContaining({
      deleted: false,
      archived: true,
      action: 'archived',
      entityType: 'team',
      entityId: 'team_1',
      references: [{ type: 'matches', count: 1 }],
    }));
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'team_1' },
      data: expect.objectContaining({
        archivedAt: expect.any(Date),
        archivedByUserId: 'captain_1',
        archiveReason: 'delete_requested',
        updatedAt: expect.any(Date),
      }),
    });
    expect(eventTeamStaffAssignmentsUpdateManyMock).toHaveBeenCalledWith({
      where: { eventTeamId: 'team_1' },
      data: {
        status: 'CANCELLED',
        updatedAt: expect.any(Date),
      },
    });
    expect(deleteMock).not.toHaveBeenCalled();
  });
});
