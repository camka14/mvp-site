/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import {
  createCompensationRate,
  createEventStaffAssignment,
  createFinancialLineItem,
  createTeamStaffLaborEntry,
  FinanceMutationError,
} from '@/server/finance/financeMutations';

const txClient = () => {
  const client: any = {
    $transaction: jest.fn((callback: (tx: any) => unknown) => callback(client)),
    organizationRoles: {
      findFirst: jest.fn(),
    },
    organizationRoleCompensationRates: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    staffCompensationRates: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    staffMembers: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    events: {
      findUnique: jest.fn(),
    },
    eventStaffAssignments: {
      create: jest.fn(),
    },
    canonicalTeams: {
      findUnique: jest.fn(),
    },
    teams: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    teamStaffAssignments: {
      findFirst: jest.fn(),
    },
    eventTeamStaffAssignments: {
      findFirst: jest.fn(),
    },
    teamStaffLaborEntries: {
      create: jest.fn(),
    },
    financialLineItems: {
      create: jest.fn(),
    },
  };
  return client;
};

describe('financeMutations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('closes the previous open role compensation rate before creating a new one', async () => {
    const client = txClient();
    const effectiveFrom = new Date('2026-06-01T00:00:00.000Z');
    client.organizationRoles.findFirst.mockResolvedValue({ id: 'role_1' });
    client.organizationRoleCompensationRates.findMany.mockResolvedValue([
      { id: 'rate_old', effectiveFrom: new Date('2026-01-01T00:00:00.000Z') },
    ]);
    client.organizationRoleCompensationRates.create.mockImplementation(async ({ data }: any) => data);

    const rate = await createCompensationRate({
      organizationId: 'org_1',
      targetType: 'ROLE',
      targetId: 'role_1',
      wageType: 'HOURLY',
      amountCents: 2500,
      effectiveFrom,
      actingUserId: 'owner_1',
    }, client);

    expect(client.organizationRoleCompensationRates.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: 'org_1',
        organizationRoleId: 'role_1',
      }),
      data: expect.objectContaining({
        effectiveTo: effectiveFrom,
        updatedBy: 'owner_1',
      }),
    }));
    expect(rate).toMatchObject({
      organizationId: 'org_1',
      organizationRoleId: 'role_1',
      wageType: 'HOURLY',
      amountCents: 2500,
      effectiveFrom,
      createdBy: 'owner_1',
    });
  });

  it('rejects compensation rates that overlap an existing future rate', async () => {
    const client = txClient();
    client.organizationRoles.findFirst.mockResolvedValue({ id: 'role_1' });
    client.organizationRoleCompensationRates.findMany.mockResolvedValue([
      { id: 'rate_future', effectiveFrom: new Date('2026-07-01T00:00:00.000Z') },
    ]);

    await expect(createCompensationRate({
      organizationId: 'org_1',
      targetType: 'ROLE',
      targetId: 'role_1',
      wageType: 'HOURLY',
      amountCents: 2500,
      effectiveFrom: new Date('2026-06-01T00:00:00.000Z'),
      actingUserId: 'owner_1',
    }, client)).rejects.toMatchObject({
      status: 409,
    });
    expect(client.organizationRoleCompensationRates.create).not.toHaveBeenCalled();
  });

  it('creates event staff labor only for staff in the event organization', async () => {
    const client = txClient();
    client.events.findUnique.mockResolvedValue({
      id: 'event_1',
      organizationId: 'org_1',
    });
    client.staffMembers.findFirst.mockResolvedValue({
      id: 'staff_1',
      userId: 'user_1',
      roleId: 'role_1',
    });
    client.eventStaffAssignments.create.mockImplementation(async ({ data }: any) => data);

    const assignment = await createEventStaffAssignment({
      eventId: 'event_1',
      staffMemberId: 'staff_1',
      plannedMinutes: 120,
      status: 'PLANNED',
      actingUserId: 'host_1',
    }, client);

    expect(client.staffMembers.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'staff_1',
        organizationId: 'org_1',
      },
    }));
    expect(assignment).toMatchObject({
      organizationId: 'org_1',
      eventId: 'event_1',
      staffMemberId: 'staff_1',
      userId: 'user_1',
      plannedMinutes: 120,
    });
  });

  it('resolves team staff labor through organization staff data when available', async () => {
    const client = txClient();
    client.canonicalTeams.findUnique.mockResolvedValue({
      id: 'team_1',
      organizationId: 'org_1',
    });
    client.teams.findFirst.mockResolvedValue({
      id: 'event_team_1',
      eventId: 'event_1',
      parentTeamId: 'team_1',
    });
    client.events.findUnique.mockResolvedValue({
      id: 'event_1',
      organizationId: 'org_1',
    });
    client.staffMembers.findUnique.mockResolvedValue({ id: 'staff_1' });
    client.teamStaffLaborEntries.create.mockImplementation(async ({ data }: any) => data);

    const laborEntry = await createTeamStaffLaborEntry({
      teamId: 'team_1',
      eventTeamId: 'event_team_1',
      userId: 'coach_1',
      actualMinutes: 90,
      status: 'ACTUAL',
      actingUserId: 'manager_1',
    }, client);

    expect(client.staffMembers.findUnique).toHaveBeenCalledWith({
      where: {
        organizationId_userId: {
          organizationId: 'org_1',
          userId: 'coach_1',
        },
      },
      select: { id: true },
    });
    expect(laborEntry).toMatchObject({
      organizationId: 'org_1',
      teamId: 'team_1',
      eventTeamId: 'event_team_1',
      eventId: 'event_1',
      staffMemberId: 'staff_1',
      userId: 'coach_1',
      actualMinutes: 90,
    });
  });

  it('attaches event-team line items to the event and canonical team parent', async () => {
    const client = txClient();
    client.teams.findUnique.mockResolvedValue({
      id: 'event_team_1',
      eventId: 'event_1',
      parentTeamId: 'team_1',
    });
    client.events.findUnique.mockResolvedValue({
      id: 'event_1',
      organizationId: 'org_1',
    });
    client.financialLineItems.create.mockImplementation(async ({ data }: any) => data);

    const lineItem = await createFinancialLineItem({
      organizationId: 'org_1',
      scope: 'EVENT_TEAM',
      eventTeamId: 'event_team_1',
      category: 'Travel',
      title: 'Coach mileage',
      amountCents: 4500,
      actingUserId: 'owner_1',
    }, client);

    expect(lineItem).toMatchObject({
      organizationId: 'org_1',
      scope: 'EVENT_TEAM',
      eventId: 'event_1',
      teamId: 'team_1',
      eventTeamId: 'event_team_1',
      category: 'Travel',
      title: 'Coach mileage',
      amountCents: 4500,
    });
  });

  it('rejects reversed labor time ranges', async () => {
    const client = txClient();
    client.events.findUnique.mockResolvedValue({
      id: 'event_1',
      organizationId: 'org_1',
    });
    client.staffMembers.findFirst.mockResolvedValue({
      id: 'staff_1',
      userId: 'user_1',
      roleId: 'role_1',
    });

    await expect(createEventStaffAssignment({
      eventId: 'event_1',
      staffMemberId: 'staff_1',
      plannedStart: '2026-06-01T12:00:00.000Z',
      plannedEnd: '2026-06-01T11:00:00.000Z',
      actingUserId: 'host_1',
    }, client)).rejects.toBeInstanceOf(FinanceMutationError);
    expect(client.eventStaffAssignments.create).not.toHaveBeenCalled();
  });
});
