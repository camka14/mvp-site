/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  invites: {
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn(),
};

const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));

import { POST } from '@/app/api/invites/[id]/accept/route';

const postRequest = () =>
  new NextRequest('http://localhost/api/invites/invite_1/accept', {
    method: 'POST',
  });

describe('POST /api/invites/[id]/accept', () => {
  const txMock = {
    teams: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    invites: {
      delete: jest.fn(),
    },
    userData: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    events: {
      findMany: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof txMock) => unknown) => fn(txMock));
    txMock.teams.findMany.mockResolvedValue([]);
    txMock.events.findMany.mockResolvedValue([]);
    txMock.userData.findUnique.mockResolvedValue({ id: 'user_1', teamIds: [] });
    txMock.userData.update.mockResolvedValue({ id: 'user_1' });
    txMock.invites.delete.mockResolvedValue({ id: 'invite_1' });
    prismaMock.invites.delete.mockResolvedValue({ id: 'invite_1' });
  });

  it('accepts a STAFF invite by deleting it without a transaction', async () => {
    prismaMock.invites.findUnique.mockResolvedValue({
      id: 'invite_1',
      type: 'STAFF',
      organizationId: 'org_1',
      userId: 'user_1',
    });

    const response = await POST(
      postRequest(),
      { params: Promise.resolve({ id: 'invite_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(prismaMock.invites.delete).toHaveBeenCalledWith({ where: { id: 'invite_1' } });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('accepts a TEAM player invite by moving the user out of pending and deleting the invite', async () => {
    prismaMock.invites.findUnique.mockResolvedValue({
      id: 'invite_1',
      type: 'TEAM',
      teamId: 'team_1',
      userId: 'user_1',
    });

    txMock.teams.findUnique.mockResolvedValue({
      id: 'team_1',
      playerIds: ['captain_1'],
      pending: ['user_1'],
    });

    txMock.teams.update.mockResolvedValue({ id: 'team_1' });

    const response = await POST(
      postRequest(),
      { params: Promise.resolve({ id: 'invite_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(txMock.teams.update).toHaveBeenCalledWith({
      where: { id: 'team_1' },
      data: {
        playerIds: ['captain_1', 'user_1'],
        pending: [],
        updatedAt: expect.any(Date),
      },
    });
    expect(txMock.userData.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: {
        teamIds: ['team_1'],
        updatedAt: expect.any(Date),
      },
    });
    expect(txMock.invites.delete).toHaveBeenCalledWith({ where: { id: 'invite_1' } });
  });

  it('keeps profile teamIds canonical when active child event slots exist', async () => {
    prismaMock.invites.findUnique.mockResolvedValue({
      id: 'invite_1',
      type: 'TEAM',
      teamId: 'team_1',
      userId: 'user_1',
    });

    txMock.teams.findUnique.mockResolvedValue({
      id: 'team_1',
      playerIds: ['captain_1'],
      pending: ['user_1'],
    });

    txMock.teams.findMany.mockResolvedValue([
      { id: 'slot_1', playerIds: ['captain_1'] },
    ]);
    txMock.events.findMany.mockResolvedValue([
      { teamIds: ['slot_1'] },
    ]);
    txMock.userData.findUnique.mockResolvedValue({
      id: 'user_1',
      teamIds: ['existing_parent_team'],
    });
    txMock.teams.update.mockResolvedValue({ id: 'team_1' });

    const response = await POST(
      postRequest(),
      { params: Promise.resolve({ id: 'invite_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(txMock.userData.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: {
        teamIds: ['existing_parent_team', 'team_1'],
        updatedAt: expect.any(Date),
      },
    });
  });

  it('returns 400 when invite type is not a staff or team invite', async () => {
    prismaMock.invites.findUnique.mockResolvedValue({
      id: 'invite_1',
      type: 'EVENT',
      eventId: 'event_1',
      userId: 'user_1',
    });

    const response = await POST(
      postRequest(),
      { params: Promise.resolve({ id: 'invite_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Invalid invite');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
