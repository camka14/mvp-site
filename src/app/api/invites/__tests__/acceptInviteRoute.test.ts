/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  invites: {
    findUnique: jest.fn(),
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
      update: jest.fn(),
    },
    invites: {
      delete: jest.fn(),
    },
    userData: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof txMock) => unknown) => fn(txMock));
  });

  it('handles missing headCoachId column by retrying with coachIds fallback', async () => {
    prismaMock.invites.findUnique.mockResolvedValue({
      id: 'invite_1',
      type: 'team_head_coach',
      teamId: 'team_1',
      userId: 'user_1',
    });

    txMock.teams.findUnique.mockResolvedValue({
      id: 'team_1',
      playerIds: ['captain_1'],
      pending: [],
      coachIds: ['assistant_existing'],
    });
    txMock.teams.update
      .mockRejectedValueOnce(new Error('Unknown argument `headCoachId`. Available options are marked with ?.'))
      .mockResolvedValueOnce({
        id: 'team_1',
      });
    txMock.userData.findUnique.mockResolvedValue({
      id: 'user_1',
      teamIds: [],
    });
    txMock.userData.update.mockResolvedValue({ id: 'user_1' });
    txMock.invites.delete.mockResolvedValue({ id: 'invite_1' });

    const response = await POST(
      postRequest(),
      { params: Promise.resolve({ id: 'invite_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(txMock.teams.update).toHaveBeenCalledTimes(2);

    const firstUpdateCall = txMock.teams.update.mock.calls[0][0];
    expect(firstUpdateCall.data.headCoachId).toBe('user_1');

    const secondUpdateCall = txMock.teams.update.mock.calls[1][0];
    expect(secondUpdateCall.data.headCoachId).toBeUndefined();
    expect(secondUpdateCall.data.coachIds).toEqual(['assistant_existing', 'user_1']);
  });

  it('returns 400 when invite type is not a team membership role', async () => {
    prismaMock.invites.findUnique.mockResolvedValue({
      id: 'invite_1',
      type: 'host',
      teamId: 'team_1',
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
