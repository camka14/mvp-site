/** @jest-environment node */

import { generateKeyPairSync } from 'crypto';
import { NextRequest } from 'next/server';

const prismaMock = {
  authUser: {
    findUnique: jest.fn(),
    deleteMany: jest.fn(),
  },
  userData: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  sensitiveUserData: {
    findFirst: jest.fn(),
    deleteMany: jest.fn(),
  },
  bills: {
    findMany: jest.fn(),
  },
  refundRequests: {
    findMany: jest.fn(),
  },
  subscriptions: {
    updateMany: jest.fn(),
  },
  invites: {
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  parentChildLinks: {
    updateMany: jest.fn(),
  },
  teams: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  organizations: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  events: {
    findMany: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  eventOfficials: {
    deleteMany: jest.fn(),
  },
  staffMembers: {
    deleteMany: jest.fn(),
  },
  pushDeviceTarget: {
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const permissionsMock = {
  requireSession: jest.fn(),
};

const authServerMock = {
  setAuthCookie: jest.fn(),
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => permissionsMock);
jest.mock('@/lib/authServer', () => authServerMock);

import { DELETE } from '@/app/api/auth/account/route';

const buildDeleteRequest = (body: unknown): NextRequest => (
  new NextRequest('http://localhost/api/auth/account', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
);

describe('DELETE /api/auth/account', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    process.env = {
      ...originalEnv,
      APPLE_MOBILE_BUNDLE_ID: 'com.razumly.mvp',
      APPLE_TEAM_ID: 'TEAM123456',
      APPLE_KEY_ID: 'KEY123456',
      APPLE_PRIVATE_KEY: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    };
    permissionsMock.requireSession.mockResolvedValue({
      userId: 'user_1',
      isAdmin: false,
      rawToken: 'token_1',
    });

    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(prismaMock));
    prismaMock.userData.findUnique.mockResolvedValue({
      id: 'user_1',
      firstName: 'Taylor',
      lastName: 'User',
      userName: 'taylor_user',
      dateOfBirth: new Date('2000-01-01T00:00:00.000Z'),
    });
    prismaMock.authUser.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com',
      appleSubject: null,
    });
    prismaMock.sensitiveUserData.findFirst.mockResolvedValue({
      id: 'sensitive_1',
      email: 'user@example.com',
      appleRefreshToken: null,
    });
    prismaMock.bills.findMany.mockResolvedValue([]);
    prismaMock.refundRequests.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.userData.findMany
      .mockResolvedValueOnce([
        {
          id: 'friend_1',
          friendIds: ['user_1'],
          followingIds: ['user_1'],
          friendRequestIds: ['user_1'],
          friendRequestSentIds: ['user_1'],
        },
      ]);
    prismaMock.teams.findMany.mockResolvedValue([
      {
        id: 'team_1',
        playerIds: ['user_1', 'user_2'],
        coachIds: [],
        pending: ['user_1'],
        captainId: 'user_1',
        managerId: 'user_1',
        headCoachId: null,
      },
    ]);
    prismaMock.organizations.findMany.mockResolvedValue([
      {
        id: 'org_1',
        hostIds: ['user_1', 'user_2'],
        officialIds: ['user_1'],
      },
    ]);
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_1',
        assistantHostIds: ['user_1'],
        officialIds: ['user_1'],
        waitListIds: ['user_1'],
        freeAgentIds: ['user_1'],
      },
    ]);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('rejects the request when the confirmation text does not match', async () => {
    const response = await DELETE(buildDeleteRequest({ confirmationText: 'wrong phrase' }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(String(json.error)).toContain('delete my account');
    expect(permissionsMock.requireSession).not.toHaveBeenCalled();
  });

  it('blocks deletion when the user still owes money or has pending refunds', async () => {
    prismaMock.bills.findMany.mockResolvedValue([
      {
        id: 'bill_1',
        status: 'OPEN',
        totalAmountCents: 2500,
        paidAmountCents: 0,
      },
    ]);

    const response = await DELETE(buildDeleteRequest({ confirmationText: 'delete my account' }));
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.blockers.openBills).toBe(1);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('scrubs account access, cancels active records, and clears the auth cookie on success', async () => {
    const response = await DELETE(buildDeleteRequest({ confirmationText: 'delete my account' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(prismaMock.subscriptions.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'user_1' }),
      data: expect.objectContaining({ status: 'CANCELLED' }),
    }));
    expect(prismaMock.teams.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'team_1' },
      data: expect.objectContaining({
        playerIds: ['user_2'],
        pending: [],
        captainId: 'user_2',
        managerId: 'user_2',
      }),
    }));
    expect(prismaMock.userData.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user_1' },
      data: expect.objectContaining({
        userName: 'taylor_user',
        friendIds: [],
        followingIds: [],
        teamIds: [],
      }),
    }));
    expect(prismaMock.authUser.deleteMany).toHaveBeenCalledWith({ where: { id: 'user_1' } });
    expect(prismaMock.sensitiveUserData.deleteMany).toHaveBeenCalled();
    expect(authServerMock.setAuthCookie).toHaveBeenCalledWith(response, '');
  });

  it('blocks Apple-linked deletion when no refresh token is stored', async () => {
    prismaMock.authUser.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com',
      appleSubject: 'apple-user-1',
    });

    const response = await DELETE(buildDeleteRequest({ confirmationText: 'delete my account' }));
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(String(json.error)).toContain('re-authenticate');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('revokes the Apple refresh token before deleting Apple-linked accounts', async () => {
    prismaMock.authUser.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com',
      appleSubject: 'apple-user-1',
    });
    prismaMock.sensitiveUserData.findFirst.mockResolvedValue({
      id: 'sensitive_1',
      email: 'user@example.com',
      appleRefreshToken: 'apple_refresh_token',
    });

    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      expect(url).toBe('https://appleid.apple.com/auth/revoke');
      expect(init?.method).toBe('POST');
      const body = String(init?.body ?? '');
      expect(body).toContain('client_id=com.razumly.mvp');
      expect(body).toContain('token=apple_refresh_token');
      expect(body).toContain('token_type_hint=refresh_token');
      expect(body).toContain('client_secret=');
      return {
        ok: true,
        json: async () => ({}),
      };
    });
    (globalThis as any).fetch = fetchMock;

    const response = await DELETE(buildDeleteRequest({ confirmationText: 'delete my account' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.$transaction).toHaveBeenCalled();
  });
});
