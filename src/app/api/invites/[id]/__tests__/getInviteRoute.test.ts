/** @jest-environment node */

import { NextRequest } from 'next/server';

const findUniqueMock = jest.fn();
const requireSessionMock = jest.fn();
const listActiveChildIdsForParentMock = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    invites: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
    },
  },
}));
jest.mock('@/lib/permissions', () => ({
  requireSession: (...args: unknown[]) => requireSessionMock(...args),
}));
jest.mock('@/server/teams/teamGuardianInvites', () => ({
  listActiveChildIdsForParent: (...args: unknown[]) => listActiveChildIdsForParentMock(...args),
}));
jest.mock('@/server/accessControl', () => ({
  canManageEvent: jest.fn(),
  canManageOrganization: jest.fn(),
}));
jest.mock('@/server/teams/teamInviteEventSync', () => ({
  removeCanonicalPendingInvitee: jest.fn(),
  rollbackTeamInviteEventSyncs: jest.fn(),
}));

import { GET } from '@/app/api/invites/[id]/route';

const request = () => new NextRequest('http://localhost/api/invites/invite_1');
const params = { params: Promise.resolve({ id: 'invite_1' }) };

describe('GET /api/invites/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listActiveChildIdsForParentMock.mockResolvedValue([]);
    findUniqueMock.mockResolvedValue({
      id: 'invite_1',
      type: 'TEAM',
      status: 'PENDING',
      email: 'player@example.test',
      userId: 'player_1',
      teamId: 'team_from_server',
      eventId: null,
      organizationId: null,
      createdBy: 'captain_1',
    });
  });

  it('returns the canonical invitation to its direct recipient', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'player_1', isAdmin: false });

    const response = await GET(request(), params);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.invite).toEqual(expect.objectContaining({
      id: 'invite_1',
      id: 'invite_1',
      teamId: 'team_from_server',
      userId: 'player_1',
    }));
    expect(listActiveChildIdsForParentMock).not.toHaveBeenCalled();
  });

  it('does not reveal an invitation to an unrelated account', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'attacker_1', isAdmin: false });

    const response = await GET(request(), params);
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe('Not found');
    expect(listActiveChildIdsForParentMock).toHaveBeenCalledWith(expect.anything(), 'attacker_1');
  });

  it('allows a linked guardian to refresh a pending child team invitation', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'guardian_1', isAdmin: false });
    findUniqueMock.mockResolvedValue({
      id: 'invite_1',
      type: 'TEAM',
      status: 'PENDING',
      email: 'child@example.test',
      userId: 'child_1',
      teamId: 'team_from_server',
      eventId: null,
      organizationId: null,
      createdBy: 'captain_1',
    });
    listActiveChildIdsForParentMock.mockResolvedValue(['child_1']);

    const response = await GET(request(), params);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.invite).toEqual(expect.objectContaining({
      id: 'invite_1',
      userId: 'child_1',
    }));
  });
});
