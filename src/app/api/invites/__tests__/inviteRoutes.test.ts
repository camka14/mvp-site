/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  $transaction: jest.fn(),
  invites: {
    create: jest.fn(),
  },
  authUser: {
    findUnique: jest.fn(),
  },
  sensitiveUserData: {
    findFirst: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const sendInviteEmailsMock = jest.fn();
const ensureAuthUserAndUserDataByEmailMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/inviteEmails', () => ({ sendInviteEmails: (...args: any[]) => sendInviteEmailsMock(...args) }));
jest.mock('@/server/inviteUsers', () => ({
  ensureAuthUserAndUserDataByEmail: (...args: any[]) => ensureAuthUserAndUserDataByEmailMock(...args),
}));

import { POST } from '@/app/api/invites/route';

const jsonRequest = (body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest('http://localhost/api/invites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

describe('/api/invites', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.authUser.findUnique.mockResolvedValue(null);
    prismaMock.sensitiveUserData.findFirst.mockResolvedValue(null);
  });

  it('returns a consistent { invites: [] } response shape even for a single invite', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'inviter_1', isAdmin: false });
    ensureAuthUserAndUserDataByEmailMock.mockResolvedValue({ userId: 'user_1', authUserExisted: true });

    const createdAt = new Date('2020-01-01T00:00:00.000Z');
    prismaMock.invites.create.mockResolvedValue({
      id: 'invite_1',
      type: 'player',
      email: 'test@example.com',
      status: 'pending',
      eventId: null,
      organizationId: null,
      teamId: null,
      userId: 'user_1',
      createdBy: 'inviter_1',
      firstName: 'Test',
      lastName: 'User',
      createdAt,
      updatedAt: createdAt,
    });
    sendInviteEmailsMock.mockResolvedValue([]);

    const res = await POST(
      jsonRequest({
        invites: [{ type: 'player', email: 'test@example.com', firstName: 'Test', lastName: 'User' }],
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(Array.isArray(json.invites)).toBe(true);
    expect(json.invites).toHaveLength(1);
    expect(json.invites[0].$id).toBe('invite_1');
    expect(json.invites[0].$createdAt).toBe('2020-01-01T00:00:00.000Z');

    expect(ensureAuthUserAndUserDataByEmailMock).toHaveBeenCalledWith(
      prismaMock,
      'test@example.com',
      expect.any(Date),
    );
    expect(prismaMock.invites.create).toHaveBeenCalledTimes(1);
    expect(sendInviteEmailsMock).toHaveBeenCalledWith([], 'http://localhost');
  });

  it('sends email when a userId invite targets an invite-placeholder auth account', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'captain_1', isAdmin: false });
    prismaMock.authUser.findUnique.mockResolvedValue({
      id: 'user_placeholder',
      email: 'placeholder@example.com',
      passwordHash: '__NO_PASSWORD__',
      lastLogin: null,
      emailVerifiedAt: null,
    });

    const createdAt = new Date('2020-01-01T00:00:00.000Z');
    const createdInvite = {
      id: 'invite_placeholder',
      type: 'player',
      email: 'placeholder@example.com',
      status: 'pending',
      eventId: null,
      organizationId: null,
      teamId: 'team_1',
      userId: 'user_placeholder',
      createdBy: 'captain_1',
      firstName: null,
      lastName: null,
      createdAt,
      updatedAt: createdAt,
    };
    prismaMock.invites.create.mockResolvedValue(createdInvite);
    sendInviteEmailsMock.mockResolvedValue([createdInvite]);

    const res = await POST(
      jsonRequest({
        invites: [{ type: 'player', teamId: 'team_1', userId: 'user_placeholder' }],
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.invites[0].$id).toBe('invite_placeholder');
    expect(ensureAuthUserAndUserDataByEmailMock).not.toHaveBeenCalled();
    expect(sendInviteEmailsMock).toHaveBeenCalledWith([createdInvite], 'http://localhost');
  });

  it('uses forwarded request origin when sending invite emails', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'inviter_1', isAdmin: false });
    ensureAuthUserAndUserDataByEmailMock.mockResolvedValue({ userId: 'user_1', authUserExisted: false });

    const createdAt = new Date('2020-01-01T00:00:00.000Z');
    const createdInvite = {
      id: 'invite_forwarded',
      type: 'player',
      email: 'forwarded@example.com',
      status: 'pending',
      eventId: null,
      organizationId: null,
      teamId: null,
      userId: 'user_1',
      createdBy: 'inviter_1',
      firstName: null,
      lastName: null,
      createdAt,
      updatedAt: createdAt,
    };
    prismaMock.invites.create.mockResolvedValue(createdInvite);
    sendInviteEmailsMock.mockResolvedValue([createdInvite]);

    const res = await POST(
      jsonRequest(
        { invites: [{ type: 'player', email: 'forwarded@example.com' }] },
        { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'mvp.razumly.com' },
      ),
    );

    expect(res.status).toBe(201);
    expect(sendInviteEmailsMock).toHaveBeenCalledWith([createdInvite], 'https://mvp.razumly.com');
  });
});
