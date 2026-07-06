/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import {
  listOrganizationFinancialLineItemCategories,
  loadEventFinanceSummary,
  loadOrganizationFinanceSummary,
} from '@/server/finance/financeRepository';

describe('loadEventFinanceSummary', () => {
  it('resolves event staff costs from overrides, staff rates, role defaults, and salary rates', async () => {
    const client: any = {
      events: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'event_1',
          organizationId: 'org_1',
          start: new Date('2026-06-01T12:00:00.000Z'),
          price: 0,
          maxParticipants: 0,
        }),
      },
      bills: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      eventRegistrations: {
        count: jest.fn().mockResolvedValue(0),
      },
      eventStaffAssignments: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'staff_rate_assignment',
            eventId: 'event_1',
            staffMemberId: 'staff_1',
            organizationRoleId: 'role_1',
            userId: 'user_1',
            actualStart: new Date('2026-06-01T12:00:00.000Z'),
            actualMinutes: 60,
            status: 'ACTUAL',
          },
          {
            id: 'role_rate_assignment',
            eventId: 'event_1',
            staffMemberId: 'staff_2',
            organizationRoleId: 'role_2',
            userId: 'user_2',
            actualStart: new Date('2026-06-01T13:00:00.000Z'),
            actualMinutes: 120,
            status: 'ACTUAL',
          },
          {
            id: 'override_assignment',
            eventId: 'event_1',
            staffMemberId: 'staff_3',
            organizationRoleId: 'role_3',
            userId: 'user_3',
            actualStart: new Date('2026-06-01T14:00:00.000Z'),
            actualMinutes: 60,
            rateOverrideType: 'FLAT_PER_EVENT',
            rateOverrideCents: 9000,
            status: 'ACTUAL',
          },
          {
            id: 'salary_assignment',
            eventId: 'event_1',
            staffMemberId: 'staff_4',
            organizationRoleId: 'role_4',
            userId: 'user_4',
            actualStart: new Date('2026-06-01T15:00:00.000Z'),
            actualMinutes: 120,
            status: 'ACTUAL',
          },
        ]),
      },
      staffMembers: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'staff_1', userId: 'user_1', roleId: 'role_1' },
          { id: 'staff_2', userId: 'user_2', roleId: 'role_2' },
          { id: 'staff_3', userId: 'user_3', roleId: 'role_3' },
          { id: 'staff_4', userId: 'user_4', roleId: 'role_4' },
        ]),
      },
      staffCompensationRates: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'staff_hourly_rate',
            organizationId: 'org_1',
            staffMemberId: 'staff_1',
            wageType: 'HOURLY',
            amountCents: 3500,
            effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
            effectiveTo: null,
          },
          {
            id: 'staff_salary_rate',
            organizationId: 'org_1',
            staffMemberId: 'staff_4',
            wageType: 'SALARY',
            amountCents: 10400000,
            effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
            effectiveTo: null,
          },
        ]),
      },
      organizationRoleCompensationRates: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'role_hourly_rate',
            organizationId: 'org_1',
            organizationRoleId: 'role_2',
            wageType: 'HOURLY',
            amountCents: 2000,
            effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
            effectiveTo: null,
          },
          {
            id: 'ignored_role_rate',
            organizationId: 'org_1',
            organizationRoleId: 'role_3',
            wageType: 'HOURLY',
            amountCents: 1000,
            effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
            effectiveTo: null,
          },
        ]),
      },
      userData: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'user_1', firstName: 'Staff', lastName: 'Specific', userName: 'specific' },
          { id: 'user_2', firstName: 'Role', lastName: 'Default', userName: 'roledefault' },
          { id: 'user_3', firstName: 'Flat', lastName: 'Override', userName: 'override' },
          { id: 'user_4', firstName: 'Salary', lastName: 'Staff', userName: 'salary' },
        ]),
      },
      financialLineItems: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const summary = await loadEventFinanceSummary('event_1', client);

    expect(summary).not.toBeNull();
    expect(summary?.actualCostCents).toBe(26500);
    expect(summary?.actualProfitCents).toBe(-26500);
    expect(summary?.warnings).toEqual([]);
    expect(summary?.lineItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'labor:staff_rate_assignment',
        label: 'Staff Specific',
        amountCents: -3500,
      }),
      expect.objectContaining({
        id: 'labor:role_rate_assignment',
        label: 'Role Default',
        amountCents: -4000,
      }),
      expect.objectContaining({
        id: 'labor:override_assignment',
        label: 'Flat Override',
        amountCents: -9000,
      }),
      expect.objectContaining({
        id: 'labor:salary_assignment',
        label: 'Salary Staff',
        amountCents: -10000,
      }),
    ]));
  });
});

describe('loadOrganizationFinanceSummary', () => {
  it('loads event capacity and registered team counts for projected org profit', async () => {
    const eventRow = {
      id: 'event_1',
      name: 'Grass Tournament',
      organizationId: 'org_1',
      start: new Date('2026-07-11T23:00:00.000Z'),
      archivedAt: null,
      state: 'PUBLISHED',
      eventType: 'TOURNAMENT',
      price: 10000,
      maxParticipants: 16,
      singleDivision: true,
      teamSignup: true,
    };
    const client: any = {
      organizations: {
        findUnique: jest.fn().mockResolvedValue({ id: 'org_1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      events: {
        findMany: jest.fn((args: any) => {
          if (args?.where?.organizationId === 'org_1' && !args?.where?.id) {
            return Promise.resolve([eventRow]);
          }
          if (args?.where?.id?.in) {
            return Promise.resolve([{ id: 'event_1', name: 'Grass Tournament' }]);
          }
          return Promise.resolve([]);
        }),
      },
      bills: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'bill_1',
            organizationId: 'org_1',
            ownerType: 'TEAM',
            ownerId: 'team_1',
            eventId: 'event_1',
            slotId: null,
            sourceType: null,
            sourceId: null,
            totalAmountCents: 10000,
            paidAmountCents: 10000,
            createdAt: new Date('2026-07-01T12:00:00.000Z'),
          },
        ]),
      },
      billPayments: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'payment_1',
            billId: 'bill_1',
            amountCents: 10000,
            status: 'PAID',
            paidAt: new Date('2026-07-02T12:00:00.000Z'),
            stripeProcessingFeeCents: 320,
            stripeTaxServiceFeeCents: 96,
          },
        ]),
      },
      financialLineItems: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      divisions: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'div_mens',
            key: 'mens_a',
            name: 'Mens A+',
            eventId: 'event_1',
            price: 10000,
            maxParticipants: 16,
            divisionTypeId: null,
          },
        ]),
      },
      teams: {
        findMany: jest.fn((args: any) => {
          if (args?.where?.eventId) {
            return Promise.resolve(Array.from({ length: 5 }, (_value, index) => ({
              id: `event_team_${index + 1}`,
              eventId: 'event_1',
              division: 'div_mens',
              divisionTypeId: null,
            })));
          }
          return Promise.resolve([{ id: 'team_1', name: 'Harbor Strikers', parentTeamId: 'team_1' }]);
        }),
      },
      eventRegistrations: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      eventStaffAssignments: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      teamStaffLaborEntries: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      staffScheduleAssignments: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      userData: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      canonicalTeams: {
        findMany: jest.fn().mockResolvedValue([{ id: 'team_1', name: 'Harbor Strikers' }]),
      },
      timeSlots: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      fields: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const summary = await loadOrganizationFinanceSummary('org_1', client, {
      from: '2026-07-01',
      to: '2026-07-31',
    });

    expect(summary).not.toBeNull();
    expect(summary?.actualProfitCents).toBe(9584);
    expect(summary?.potentialRevenueCents).toBe(105424);
    expect(summary?.projectedProfitCents).toBe(115008);
    expect(client.divisions.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        eventId: { in: ['event_1'] },
      }),
    }));
    expect(client.teams.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        eventId: { in: ['event_1'] },
        kind: 'REGISTERED',
      }),
    }));
  });
});

describe('listOrganizationFinancialLineItemCategories', () => {
  it('returns sorted unique non-void custom line item categories', async () => {
    const client: any = {
      financialLineItems: {
        findMany: jest.fn().mockResolvedValue([
          { category: 'Rentals' },
          { category: 'operations' },
          { category: 'Operations' },
          { category: '  Supplies  ' },
          { category: '' },
          { category: null },
        ]),
      },
    };

    const categories = await listOrganizationFinancialLineItemCategories('org_1', client);

    expect(client.financialLineItems.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org_1',
        status: { not: 'VOID' },
      },
      select: { category: true },
      orderBy: { category: 'asc' },
    });
    expect(categories).toEqual(['operations', 'Rentals', 'Supplies']);
  });
});
