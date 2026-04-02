/** @jest-environment node */

import { NextRequest } from 'next/server';

const findUniqueMock = jest.fn();
const updateMock = jest.fn();
const findManyMock = jest.fn();
const eventsFindManyMock = jest.fn();
const organizationFindFirstMock = jest.fn();
const staffMemberFindUniqueMock = jest.fn();
const inviteFindFirstMock = jest.fn();

const txClientMock = {
  teams: {
    update: (...args: any[]) => updateMock(...args),
    findMany: (...args: any[]) => findManyMock(...args),
  },
  events: {
    findMany: (...args: any[]) => eventsFindManyMock(...args),
  },
};

const prismaMock = {
  teams: {
    findUnique: (...args: any[]) => findUniqueMock(...args),
    update: (...args: any[]) => updateMock(...args),
    findMany: (...args: any[]) => findManyMock(...args),
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

import { PATCH } from '@/app/api/teams/[id]/route';

const patchJson = (body: unknown) => new NextRequest('http://localhost/api/teams/team_1', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('/api/teams/[id] PATCH', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'captain_1', isAdmin: false });
    organizationFindFirstMock.mockResolvedValue(null);
    staffMemberFindUniqueMock.mockResolvedValue(null);
    inviteFindFirstMock.mockResolvedValue(null);
    findManyMock.mockResolvedValue([]);
    eventsFindManyMock.mockResolvedValue([]);
    findUniqueMock.mockResolvedValue({
      id: 'team_1',
      name: 'Team One',
      division: 'Open',
      divisionTypeId: 'open',
      divisionTypeName: 'Open',
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
      divisionTypeName: data.divisionTypeName ?? 'Open',
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
});
