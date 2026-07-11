/** @jest-environment node */

const prismaMock = {
  $transaction: jest.fn(),
};

const syncTeamChatInTxMock = jest.fn();
const syncCanonicalTeamFutureEventSnapshotsMock = jest.fn();

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
jest.mock('@/server/teams/teamEventSnapshotSync', () => ({
  syncCanonicalTeamFutureEventSnapshots: (...args: any[]) => syncCanonicalTeamFutureEventSnapshotsMock(...args),
}));

import {
  activateStartedTeamRegistration,
  markTeamRegistrationPaymentPending,
  requestTeamRegistrationRefund,
  reserveTeamRegistrationSlot,
} from '@/server/teams/teamOpenRegistration';

describe('reserveTeamRegistrationSlot', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    syncCanonicalTeamFutureEventSnapshotsMock.mockResolvedValue([]);
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
      registrationHoldExpiresAt: new Date('2026-04-21T18:10:00.000Z'),
    });
    expect(teamRegistrationsCreateMock).not.toHaveBeenCalled();
    expect(teamRegistrationsUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'team_1__user_1' },
        data: expect.objectContaining({
          updatedAt: new Date('2026-04-21T18:02:00.000Z'),
        }),
      }),
    );
    expect(teamRegistrationsDeleteManyMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'team_1__user_1' }),
      }),
    );
    expect(syncTeamChatInTxMock).not.toHaveBeenCalled();
    expect(syncCanonicalTeamFutureEventSnapshotsMock).not.toHaveBeenCalled();
  });

  it('marks a started team registration as pending when async payment is processing', async () => {
    const teamRegistrationsFindUniqueMock = jest.fn().mockResolvedValue({
      id: 'team_1__user_1',
      teamId: 'team_1',
      userId: 'user_1',
      status: 'STARTED',
    });
    const teamRegistrationsUpdateMock = jest.fn();
    const tx = {
      teamRegistrations: {
        findUnique: teamRegistrationsFindUniqueMock,
        update: teamRegistrationsUpdateMock,
      },
    };
    prismaMock.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));

    const result = await markTeamRegistrationPaymentPending({
      teamId: 'team_1',
      userId: 'user_1',
      registrationId: 'team_1__user_1',
      now: new Date('2026-04-21T18:03:00.000Z'),
    });

    expect(result).toEqual({ applied: true });
    expect(teamRegistrationsUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'team_1__user_1' },
        data: expect.objectContaining({
          status: 'PENDING',
          updatedAt: new Date('2026-04-21T18:03:00.000Z'),
        }),
      }),
    );
    expect(syncTeamChatInTxMock).toHaveBeenCalledTimes(1);
    expect(syncCanonicalTeamFutureEventSnapshotsMock).toHaveBeenCalledWith({
      tx,
      canonicalTeamId: 'team_1',
      createdBy: 'user_1',
      now: new Date('2026-04-21T18:03:00.000Z'),
    });
  });

  it('activates a pending team registration when async payment succeeds', async () => {
    const teamRegistrationsFindManyMock = jest.fn().mockResolvedValue([
      { id: 'team_1__user_1', createdAt: new Date('2026-04-21T18:00:00.000Z') },
    ]);
    const teamRegistrationsFindUniqueMock = jest.fn().mockResolvedValue({
      id: 'team_1__user_1',
      teamId: 'team_1',
      userId: 'user_1',
      status: 'PENDING',
    });
    const teamRegistrationsUpdateMock = jest.fn();
    const teamRegistrationsDeleteManyMock = jest.fn();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{
        id: 'team_1',
        teamSize: 1,
      }]),
      teamRegistrations: {
        findMany: teamRegistrationsFindManyMock,
        findUnique: teamRegistrationsFindUniqueMock,
        update: teamRegistrationsUpdateMock,
        deleteMany: teamRegistrationsDeleteManyMock,
      },
    };
    prismaMock.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));

    const result = await activateStartedTeamRegistration({
      teamId: 'team_1',
      userId: 'user_1',
      registrationId: 'team_1__user_1',
      now: new Date('2026-04-21T18:04:00.000Z'),
    });

    expect(result).toEqual({ applied: true });
    expect(teamRegistrationsUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'team_1__user_1' },
        data: expect.objectContaining({
          status: 'ACTIVE',
          updatedAt: new Date('2026-04-21T18:04:00.000Z'),
        }),
      }),
    );
    expect(teamRegistrationsDeleteManyMock).not.toHaveBeenCalled();
    expect(syncTeamChatInTxMock).toHaveBeenCalledTimes(1);
    expect(syncCanonicalTeamFutureEventSnapshotsMock).toHaveBeenCalledWith({
      tx,
      canonicalTeamId: 'team_1',
      createdBy: 'user_1',
      now: new Date('2026-04-21T18:04:00.000Z'),
    });
  });

  it('creates an immutable payment scope before removing a paid open-registration member', async () => {
    const teamRegistrationsUpdateMock = jest.fn();
    const refundRequestsCreateMock = jest.fn().mockResolvedValue({ id: 'refund_1' });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{
        id: 'team_1',
        openRegistration: true,
        joinPolicy: 'OPEN_REGISTRATION',
        registrationPriceCents: 2500,
        organizationId: 'org_1',
        createdBy: 'host_1',
      }]),
      teamRegistrations: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'team_1__user_1',
          status: 'ACTIVE',
          isCaptain: false,
        }),
        update: teamRegistrationsUpdateMock,
      },
      teamStaffAssignments: {
        findFirst: jest.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ userId: 'host_1' }),
      },
      refundRequests: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: refundRequestsCreateMock,
      },
      teams: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'team_1',
          captainId: 'captain_1',
          managerId: 'host_1',
          headCoachId: null,
          coachIds: [],
          playerIds: ['captain_1', 'user_1'],
          parentTeamId: null,
        }),
      },
      bills: {
        findMany: jest.fn()
          .mockResolvedValueOnce([{ id: 'team_bill_1' }])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
      },
      billPayments: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'payment_1',
          billId: 'team_bill_1',
          amountCents: 2500,
          refundedAmountCents: 0,
          paymentIntentId: 'pi_1',
          payerUserId: 'user_1',
        }]),
      },
    };
    prismaMock.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));

    const result = await requestTeamRegistrationRefund({
      teamId: 'team_1',
      userId: 'user_1',
      reason: 'Moving away',
      now: new Date('2026-07-10T12:00:00.000Z'),
    });

    expect(result).toEqual({ ok: true, refundId: 'refund_1', refundAlreadyPending: false });
    expect(refundRequestsCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        requestedByUserId: 'user_1',
        billIds: ['team_bill_1'],
        paymentIds: ['payment_1'],
        requestedAmountCents: 2500,
        policyDecision: 'HOST_REVIEW_REQUIRED',
        scopeVersion: 1,
        scopeHash: expect.any(String),
      }),
    }));
    expect(teamRegistrationsUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'LEFT' }),
    }));
  });

  it('keeps the registration active when no refundable payment can be snapshotted', async () => {
    const teamRegistrationsUpdateMock = jest.fn();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{
        id: 'team_1',
        openRegistration: true,
        joinPolicy: 'OPEN_REGISTRATION',
        registrationPriceCents: 2500,
        organizationId: 'org_1',
        createdBy: 'host_1',
      }]),
      teamRegistrations: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'team_1__user_1',
          status: 'ACTIVE',
          isCaptain: false,
        }),
        update: teamRegistrationsUpdateMock,
      },
      teamStaffAssignments: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      refundRequests: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      teams: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'team_1',
          captainId: 'captain_1',
          managerId: 'host_1',
          headCoachId: null,
          coachIds: [],
          playerIds: ['captain_1', 'user_1'],
          parentTeamId: null,
        }),
      },
      bills: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      billPayments: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    prismaMock.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));

    const result = await requestTeamRegistrationRefund({
      teamId: 'team_1',
      userId: 'user_1',
      now: new Date('2026-07-10T12:00:00.000Z'),
    });

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      status: 409,
      error: 'No refundable payment was found for this team registration.',
    }));
    expect(teamRegistrationsUpdateMock).not.toHaveBeenCalled();
    expect(tx.refundRequests.create).not.toHaveBeenCalled();
  });
});
