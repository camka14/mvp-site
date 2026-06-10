/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import { createDraftStaffPayRun } from '@/server/finance/staffPayRuns';

const createClient = () => {
  const tx = {
    staffPayRun: {
      create: jest.fn(async ({ data }) => data),
    },
    staffPayRunItem: {
      create: jest.fn(async ({ data }) => data),
    },
  };

  return {
    organizations: {
      findUnique: jest.fn().mockResolvedValue({ id: 'org_1' }),
    },
    eventStaffAssignments: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'event_labor_1',
          organizationId: 'org_1',
          eventId: 'event_1',
          staffMemberId: 'staff_1',
          organizationRoleId: 'role_1',
          userId: 'user_1',
          actualStart: new Date('2026-06-01T16:00:00.000Z'),
          actualMinutes: 60,
          status: 'ACTUAL',
        },
      ]),
    },
    teamStaffLaborEntries: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'team_labor_1',
          organizationId: 'org_1',
          teamId: 'team_1',
          eventTeamId: null,
          eventId: 'event_1',
          staffMemberId: 'staff_2',
          userId: 'user_2',
          plannedStart: new Date('2026-06-02T16:00:00.000Z'),
          plannedMinutes: 30,
          status: 'PLANNED',
        },
      ]),
    },
    events: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'event_1', start: new Date('2026-06-01T16:00:00.000Z') },
      ]),
    },
    staffMembers: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'staff_1', userId: 'user_1', roleId: 'role_1' },
        { id: 'staff_2', userId: 'user_2', roleId: 'role_2' },
      ]),
    },
    staffCompensationRates: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'staff_rate_1',
          organizationId: 'org_1',
          staffMemberId: 'staff_1',
          wageType: 'HOURLY',
          amountCents: 3000,
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
          effectiveTo: null,
        },
        {
          id: 'staff_rate_2',
          organizationId: 'org_1',
          staffMemberId: 'staff_2',
          wageType: 'HOURLY',
          amountCents: 4000,
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
          effectiveTo: null,
        },
      ]),
    },
    organizationRoleCompensationRates: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    userData: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'user_1', firstName: 'Alex', lastName: 'Rivera', userName: 'alex' },
        { id: 'user_2', firstName: 'Casey', lastName: 'Coach', userName: 'casey' },
      ]),
    },
    staffPayRunItem: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn((callback) => callback(tx)),
    tx,
  };
};

describe('createDraftStaffPayRun', () => {
  it('creates draft pay run items from unpaid event and team labor', async () => {
    const client = createClient();

    const payRun = await createDraftStaffPayRun({
      organizationId: 'org_1',
      periodStart: '2026-06-01T00:00:00.000Z',
      periodEnd: '2026-06-30T23:59:59.999Z',
      title: 'June payroll',
      actingUserId: 'owner_1',
    }, client);

    expect(payRun.title).toBe('June payroll');
    expect(payRun.totalAmountCents).toBe(5000);
    expect(payRun.itemCount).toBe(2);
    expect(client.tx.staffPayRunItem.create).toHaveBeenCalledTimes(2);
    expect(client.tx.staffPayRunItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        eventStaffAssignmentId: 'event_labor_1',
        teamStaffLaborEntryId: null,
        label: 'Alex Rivera',
        amountCents: 3000,
        paidMinutes: 60,
      }),
    }));
    expect(client.tx.staffPayRunItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        eventStaffAssignmentId: null,
        teamStaffLaborEntryId: 'team_labor_1',
        label: 'Casey Coach',
        amountCents: 2000,
        paidMinutes: 30,
      }),
    }));
  });

  it('does not include labor already linked to a pay-run item', async () => {
    const client = createClient();
    client.staffPayRunItem.findMany.mockResolvedValue([
      {
        eventStaffAssignmentId: 'event_labor_1',
        teamStaffLaborEntryId: 'team_labor_1',
      },
    ]);

    await expect(createDraftStaffPayRun({
      organizationId: 'org_1',
      periodStart: '2026-06-01T00:00:00.000Z',
      periodEnd: '2026-06-30T23:59:59.999Z',
      actingUserId: 'owner_1',
    }, client)).rejects.toMatchObject({
      status: 400,
      message: 'No unpaid staff labor was found for this pay period.',
    });
  });
});
