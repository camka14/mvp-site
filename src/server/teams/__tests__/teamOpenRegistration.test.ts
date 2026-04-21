/** @jest-environment node */

const prismaMock = {
  $transaction: jest.fn(),
};

const syncTeamChatInTxMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/stripeConnectAccounts', () => ({
  resolveConnectedAccountId: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/server/teamChatSync', () => ({
  getTeamChatBaseMemberIds: jest.fn().mockReturnValue([]),
  syncTeamChatInTx: (...args: any[]) => syncTeamChatInTxMock(...args),
}));
jest.mock('@/server/teams/teamMembership', () => {
  const actual = jest.requireActual('@/server/teams/teamMembership');
  return {
    ...actual,
    loadCanonicalTeamById: jest.fn(),
  };
});

import { reserveTeamRegistrationSlot } from '@/server/teams/teamOpenRegistration';

describe('reserveTeamRegistrationSlot', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('reuses an existing STARTED team registration when checkout is retried', async () => {
    const teamRegistrationsFindManyMock = jest.fn().mockResolvedValue([]);
    const teamRegistrationsFindUniqueMock = jest.fn().mockResolvedValue({
      id: 'team_1__user_1',
      status: 'STARTED',
      jerseyNumber: null,
      position: null,
      isCaptain: false,
      createdAt: new Date('2026-04-21T18:00:00.000Z'),
      createdBy: 'user_1',
    });
    const teamRegistrationsCreateMock = jest.fn();
    const teamRegistrationsUpdateMock = jest.fn();
    const teamRegistrationsDeleteManyMock = jest.fn();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{
        id: 'team_1',
        teamSize: 1,
        openRegistration: true,
        registrationPriceCents: 2500,
        organizationId: 'org_1',
        createdBy: 'host_1',
      }]),
      teamRegistrations: {
        findMany: teamRegistrationsFindManyMock,
        findUnique: teamRegistrationsFindUniqueMock,
        create: teamRegistrationsCreateMock,
        update: teamRegistrationsUpdateMock,
        deleteMany: teamRegistrationsDeleteManyMock,
      },
    };
    prismaMock.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));

    const result = await reserveTeamRegistrationSlot({
      teamId: 'team_1',
      userId: 'user_1',
      actorUserId: 'user_1',
      status: 'STARTED',
      now: new Date('2026-04-21T18:02:00.000Z'),
    });

    expect(result).toEqual({
      ok: true,
      registrationId: 'team_1__user_1',
      status: 'STARTED',
    });
    expect(teamRegistrationsCreateMock).not.toHaveBeenCalled();
    expect(teamRegistrationsUpdateMock).not.toHaveBeenCalled();
    expect(teamRegistrationsDeleteManyMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'team_1__user_1' }),
      }),
    );
    expect(syncTeamChatInTxMock).not.toHaveBeenCalled();
  });
});
