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
});
