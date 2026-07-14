/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  teams: { findUnique: jest.fn() },
  events: { findUnique: jest.fn() },
  organizations: { findUnique: jest.fn() },
  invites: { findFirst: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(),
};
const requireSessionMock = jest.fn();
const canManageEventMock = jest.fn();
const canManageOrganizationMock = jest.fn();
const ensureUserMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: (...args: any[]) => requireSessionMock(...args) }));
jest.mock('@/server/accessControl', () => ({
  canManageEvent: (...args: any[]) => canManageEventMock(...args),
  canManageOrganization: (...args: any[]) => canManageOrganizationMock(...args),
}));
jest.mock('@/server/inviteUsers', () => ({
  ensureAuthUserAndUserDataByEmail: (...args: any[]) => ensureUserMock(...args),
}));
jest.mock('@/server/inviteEmails', () => ({ sendInviteEmails: async (rows: any[]) => rows }));
jest.mock('@/server/legacyFormat', () => ({ withLegacyFields: (row: any) => ({ ...row, $id: row.id }) }));

import { POST } from '@/app/api/users/invite/route';

const request = (body: unknown) => new NextRequest('http://localhost/api/users/invite', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('POST /api/users/invite authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
    prismaMock.invites.findFirst.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({}));
    ensureUserMock.mockResolvedValue({ userId: 'invited_1', authUserExisted: true });
    prismaMock.invites.create.mockImplementation(async ({ data }) => data);
  });

  it('rejects an invite to a team the caller does not manage', async () => {
    prismaMock.teams.findUnique.mockResolvedValue({
      captainId: 'captain_2',
      managerId: 'manager_2',
      headCoachId: null,
      coachIds: [],
    });

    const response = await POST(request({
      inviterId: 'spoofed_actor',
      invites: [{ email: 'player@test.com', type: 'player', teamId: 'team_2' }],
    }));
    const payload = await response.json();

    expect(payload.failed).toEqual([{ email: 'player@test.com', reason: 'forbidden_scope' }]);
    expect(prismaMock.invites.create).not.toHaveBeenCalled();
  });

  it('rejects an official invite to an event the caller does not manage', async () => {
    prismaMock.events.findUnique.mockResolvedValue({
      hostId: 'host_2',
      assistantHostIds: [],
      organizationId: null,
    });
    canManageEventMock.mockResolvedValue(false);

    const response = await POST(request({
      inviterId: 'spoofed_actor',
      invites: [{ email: 'official@test.com', type: 'official', eventId: 'event_2' }],
    }));
    const payload = await response.json();

    expect(payload.failed).toEqual([{ email: 'official@test.com', reason: 'forbidden_scope' }]);
    expect(prismaMock.invites.create).not.toHaveBeenCalled();
  });

  it('rejects an official invite to an organization the caller does not manage', async () => {
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_2', ownerId: 'owner_2' });
    canManageOrganizationMock.mockResolvedValue(false);

    const response = await POST(request({
      inviterId: 'spoofed_actor',
      invites: [{ email: 'official@test.com', type: 'official', organizationId: 'org_2' }],
    }));
    const payload = await response.json();

    expect(payload.failed).toEqual([{ email: 'official@test.com', reason: 'forbidden_scope' }]);
    expect(prismaMock.invites.create).not.toHaveBeenCalled();
  });

  it('uses the authenticated caller as createdBy for an authorized team invite', async () => {
    prismaMock.teams.findUnique.mockResolvedValue({
      captainId: 'captain_1',
      managerId: 'manager_1',
      headCoachId: null,
      coachIds: [],
    });

    const response = await POST(request({
      inviterId: 'spoofed_actor',
      invites: [{ email: 'player@test.com', type: 'player', teamId: 'team_1' }],
    }));

    expect(response.status).toBe(200);
    expect(prismaMock.invites.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        createdBy: 'manager_1',
        teamId: 'team_1',
        type: 'TEAM',
        status: 'PENDING',
      }),
    }));
    expect(prismaMock.invites.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ type: 'TEAM' }),
    }));
  });
});
