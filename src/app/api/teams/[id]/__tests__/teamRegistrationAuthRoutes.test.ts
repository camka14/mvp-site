/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();

const prismaMock = {
  userData: {
    findUnique: jest.fn(),
  },
  parentChildLinks: {
    findFirst: jest.fn(),
  },
  sensitiveUserData: {
    findFirst: jest.fn(),
  },
  invites: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  canonicalTeams: {
    findUnique: jest.fn(),
  },
  templateDocuments: {
    findMany: jest.fn(),
  },
  signedDocuments: {
    findMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  teamRegistrations: {
    findFirst: jest.fn(),
  },
  authUser: {
    findUnique: jest.fn(),
  },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({
  requireSession: (...args: any[]) => requireSessionMock(...args),
}));
jest.mock('@/lib/age', () => ({
  calculateAgeOnDate: jest.fn(),
}));
jest.mock('@/server/legacyFormat', () => ({
  withLegacyFields: (value: any) => value,
}));
jest.mock('@/server/teams/teamMembership', () => ({
  loadCanonicalTeamById: jest.fn(),
}));
jest.mock('@/server/teams/teamOpenRegistration', () => ({
  leaveTeam: jest.fn(),
  findTeamRegistration: jest.fn(),
  reserveTeamRegistrationSlot: jest.fn(),
}));
jest.mock('@/server/teams/teamRegistrationDocuments', () => ({
  dispatchRequiredTeamDocuments: jest.fn(),
  getTeamRegistrationSignatureState: jest.fn(),
}));
jest.mock('@/lib/boldsignServer', () => ({
  getEmbeddedSignLink: jest.fn(),
  getTemplateRoles: jest.fn(),
  isBoldSignConfigured: jest.fn(),
  sendDocumentFromTemplate: jest.fn(),
}));
jest.mock('@/lib/signRedirect', () => ({
  resolveBoldSignRedirectUrl: jest.fn((value: string | undefined) => value ?? 'http://localhost'),
}));
jest.mock('@/lib/boldsignSyncOperations', () => ({
  BOLDSIGN_OPERATION_STATUSES: {
    PENDING_WEBHOOK: 'PENDING_WEBHOOK',
    PENDING_RECONCILE: 'PENDING_RECONCILE',
    CONFIRMED: 'CONFIRMED',
    FAILED: 'FAILED',
    TIMED_OUT: 'TIMED_OUT',
  },
}));
jest.mock('@/lib/templateSignerTypes', () => ({
  getRequiredSignerTypeLabel: jest.fn(),
  normalizeRequiredSignerType: jest.fn(),
  normalizeSignerContext: jest.fn((value: unknown, fallback: string) => {
    if (typeof value !== 'string') {
      return fallback;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : fallback;
  }),
  templateMatchesSignerContext: jest.fn(),
}));

import { DELETE, POST as postSelf } from '@/app/api/teams/[id]/registrations/self/route';
import { POST as postChild } from '@/app/api/teams/[id]/registrations/child/route';
import { POST as postSign } from '@/app/api/teams/[id]/sign/route';
import { calculateAgeOnDate } from '@/lib/age';

const calculateAgeOnDateMock = calculateAgeOnDate as jest.Mock;
const teamMembershipMock = jest.requireMock('@/server/teams/teamMembership') as {
  loadCanonicalTeamById: jest.Mock;
};
const teamOpenRegistrationMock = jest.requireMock('@/server/teams/teamOpenRegistration') as {
  reserveTeamRegistrationSlot: jest.Mock;
};

describe('team registration auth route handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockRejectedValue(new Response('Unauthorized', { status: 401 }));
  });

  it('returns 401 json when self registration is unauthorized', async () => {
    const response = await postSelf(
      new NextRequest('http://localhost/api/teams/team_1/registrations/self', { method: 'POST' }),
      { params: Promise.resolve({ id: 'team_1' }) },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 json when leaving a team is unauthorized', async () => {
    const response = await DELETE(
      new NextRequest('http://localhost/api/teams/team_1/registrations/self', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'team_1' }) },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 json when child registration is unauthorized', async () => {
    const response = await postChild(
      new NextRequest('http://localhost/api/teams/team_1/registrations/child', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childId: 'child_1' }),
      }),
      { params: Promise.resolve({ id: 'team_1' }) },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 json when team signing is unauthorized', async () => {
    const response = await postSign(
      new NextRequest('http://localhost/api/teams/team_1/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signerContext: 'participant' }),
      }),
      { params: Promise.resolve({ id: 'team_1' }) },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('creates a parent approval request for minor self team registration without reserving a slot', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'child_1', isAdmin: false });
    teamMembershipMock.loadCanonicalTeamById.mockResolvedValue({
      id: 'team_1',
      name: 'Open Team',
      playerIds: [],
      pending: [],
      teamSize: 8,
      registrationPriceCents: 0,
    });
    prismaMock.userData.findUnique.mockResolvedValue({
      dateOfBirth: new Date('2014-05-20T00:00:00.000Z'),
      firstName: 'Alex',
      lastName: 'Lee',
    });
    calculateAgeOnDateMock.mockReturnValue(11);
    prismaMock.parentChildLinks.findFirst.mockResolvedValue({ parentId: 'parent_1' });
    prismaMock.authUser.findUnique.mockResolvedValue({ email: 'child@example.com' });
    prismaMock.sensitiveUserData.findFirst.mockResolvedValue(null);
    prismaMock.invites.findFirst.mockResolvedValue(null);
    prismaMock.invites.create.mockResolvedValue({
      id: 'invite_1',
      type: 'TEAM',
      email: 'child@example.com',
      status: 'PENDING',
      teamId: 'team_1',
      userId: 'child_1',
      createdBy: 'child_1',
    });

    const response = await postSelf(
      new NextRequest('http://localhost/api/teams/team_1/registrations/self', { method: 'POST' }),
      { params: Promise.resolve({ id: 'team_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.requiresParentApproval).toBe(true);
    expect(payload.invite).toEqual(expect.objectContaining({
      id: 'invite_1',
      type: 'TEAM',
      userId: 'child_1',
    }));
    expect(prismaMock.invites.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: 'TEAM',
        teamId: 'team_1',
        userId: 'child_1',
        createdBy: 'child_1',
        status: 'PENDING',
      }),
    }));
    expect(teamOpenRegistrationMock.reserveTeamRegistrationSlot).not.toHaveBeenCalled();
  });

  it('blocks unverified adults from paid self team registration', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    teamMembershipMock.loadCanonicalTeamById.mockResolvedValue({
      id: 'team_1',
      name: 'Paid Team',
      playerIds: [],
      pending: [],
      teamSize: 8,
      registrationPriceCents: 2500,
    });
    prismaMock.userData.findUnique.mockResolvedValue({
      dateOfBirth: new Date('1990-05-20T00:00:00.000Z'),
      firstName: 'Sam',
      lastName: 'Player',
    });
    calculateAgeOnDateMock.mockReturnValue(36);
    prismaMock.authUser.findUnique.mockResolvedValue({ emailVerifiedAt: null });

    const response = await postSelf(
      new NextRequest('http://localhost/api/teams/team_1/registrations/self', { method: 'POST' }),
      { params: Promise.resolve({ id: 'team_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual(expect.objectContaining({
      code: 'EMAIL_VERIFICATION_REQUIRED',
      error: 'Verify your email before registering for paid events or teams.',
    }));
    expect(teamOpenRegistrationMock.reserveTeamRegistrationSlot).not.toHaveBeenCalled();
  });

  it('blocks unverified parents from paid child team registration', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'parent_1', isAdmin: false });
    teamMembershipMock.loadCanonicalTeamById.mockResolvedValue({
      id: 'team_1',
      name: 'Paid Team',
      playerIds: [],
      pending: [],
      teamSize: 8,
      registrationPriceCents: 2500,
    });
    prismaMock.userData.findUnique.mockResolvedValue({
      dateOfBirth: new Date('1990-05-20T00:00:00.000Z'),
    });
    calculateAgeOnDateMock.mockReturnValue(36);
    prismaMock.parentChildLinks.findFirst.mockResolvedValue({ id: 'link_1' });
    prismaMock.authUser.findUnique.mockResolvedValue({ emailVerifiedAt: null });

    const response = await postChild(
      new NextRequest('http://localhost/api/teams/team_1/registrations/child', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childId: 'child_1' }),
      }),
      { params: Promise.resolve({ id: 'team_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual(expect.objectContaining({
      code: 'EMAIL_VERIFICATION_REQUIRED',
      error: 'Verify your email before registering for paid events or teams.',
    }));
    expect(teamOpenRegistrationMock.reserveTeamRegistrationSlot).not.toHaveBeenCalled();
  });
});
