/** @jest-environment node */

import {
  buildEventFinanceSummary,
  buildOrganizationFinanceSummary,
  buildTeamFinanceSummary,
  type FinanceBill,
} from '@/server/finance/financeAnalysis';

const teamRegistrationBill: FinanceBill = {
  id: 'bill_team_registration',
  ownerType: 'TEAM',
  ownerId: 'team_1',
  eventId: 'event_1',
  payments: [
    {
      id: 'payment_1',
      amountCents: 20000,
      status: 'PAID',
      refundedAmountCents: 5000,
      stripeProcessingFeeCents: 700,
      stripeTaxServiceFeeCents: 100,
    },
  ],
};

describe('buildEventFinanceSummary', () => {
  it('classifies paid team registration bills as event revenue', () => {
    const summary = buildEventFinanceSummary({
      eventId: 'event_1',
      eventPriceCents: 2500,
      maxParticipants: 16,
      confirmedParticipantCount: 10,
      bills: [teamRegistrationBill],
      staffLabor: [
        {
          id: 'event_staff_1',
          eventId: 'event_1',
          label: 'Alex Rivera',
          actualMinutes: 120,
          rate: { wageType: 'HOURLY', amountCents: 3000 },
          status: 'ACTUAL',
        },
      ],
      customLineItems: [
        {
          id: 'event_cost_1',
          eventId: 'event_1',
          title: 'Awards',
          category: 'supplies',
          amountCents: 1000,
        },
      ],
    });

    expect(summary.actualRevenueCents).toBe(14200);
    expect(summary.actualCostCents).toBe(7000);
    expect(summary.actualProfitCents).toBe(7200);
    expect(summary.futureCostCents).toBe(0);
    expect(summary.potentialRevenueCents).toBe(15000);
    expect(summary.projectedProfitCents).toBe(22200);
    expect(summary.lineItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'bill:bill_team_registration:paid',
        label: 'Team registration payment',
        amountCents: 20000,
        classification: 'revenue',
      }),
      expect.objectContaining({
        id: 'bill:bill_team_registration:refund',
        amountCents: -5000,
        classification: 'refund',
      }),
      expect.objectContaining({
        id: 'bill:bill_team_registration:fees',
        amountCents: -800,
        classification: 'fee',
      }),
      expect.objectContaining({
        id: 'labor:event_staff_1',
        amountCents: -6000,
        classification: 'labor_cost',
      }),
      expect.objectContaining({
        id: 'potential:event:event_1:open-spots',
        amountCents: 15000,
        classification: 'potential_revenue',
      }),
    ]));
  });

  it('uses source and customer names for generated bill and refund labels when available', () => {
    const summary = buildEventFinanceSummary({
      eventId: 'event_1',
      bills: [
        {
          ...teamRegistrationBill,
          sourceName: 'Summer League',
          sourceEntityType: 'event',
          sourceEntityId: 'event_1',
          customerType: 'teams',
          customerId: 'team_1',
          customerName: 'Harbor Strikers',
        },
      ],
    });

    expect(summary.lineItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'bill:bill_team_registration:paid',
        label: 'Summer League - Harbor Strikers',
        sourceName: 'Summer League',
        sourceEntityType: 'event',
        sourceEntityId: 'event_1',
        customerType: 'teams',
        customerId: 'team_1',
        customerName: 'Harbor Strikers',
        quantity: 1,
        unitLabel: 'team registration',
      }),
      expect.objectContaining({
        id: 'bill:bill_team_registration:refund',
        label: 'Summer League - Harbor Strikers',
        quantity: 1,
        unitLabel: 'refund',
      }),
    ]));
  });

  it('keeps future event costs separate while counting past-dated costs as actual losses', () => {
    const summary = buildEventFinanceSummary({
      eventId: 'event_future',
      eventStart: '2026-07-01T18:00:00.000Z',
      eventPriceCents: 1000,
      maxParticipants: 10,
      confirmedParticipantCount: 8,
      asOf: '2026-06-09T12:00:00.000Z',
      staffLabor: [
        {
          id: 'future_staff',
          eventId: 'event_future',
          label: 'Future Staff',
          plannedStart: '2026-07-01T18:00:00.000Z',
          plannedEnd: '2026-07-01T20:00:00.000Z',
          rate: { wageType: 'HOURLY', amountCents: 3000 },
          status: 'PLANNED',
        },
      ],
      customLineItems: [
        {
          id: 'past_event_cost',
          eventId: 'event_future',
          title: 'Permit deposit',
          category: 'permits',
          amountCents: 2000,
          serviceStartAt: '2026-06-01T00:00:00.000Z',
        },
        {
          id: 'future_event_cost',
          eventId: 'event_future',
          title: 'Cleanup crew',
          category: 'operations',
          amountCents: 5000,
          serviceStartAt: '2026-07-01T20:00:00.000Z',
        },
      ],
    });

    expect(summary.actualCostCents).toBe(2000);
    expect(summary.futureCostCents).toBe(11000);
    expect(summary.actualProfitCents).toBe(-2000);
    expect(summary.potentialRevenueCents).toBe(2000);
    expect(summary.projectedProfitCents).toBe(-11000);
    expect(summary.lineItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'custom:past_event_cost',
        timing: 'ACTUAL',
        amountCents: -2000,
      }),
      expect.objectContaining({
        id: 'custom:future_event_cost',
        timing: 'FUTURE',
        amountCents: -5000,
      }),
      expect.objectContaining({
        id: 'labor:future_staff',
        timing: 'FUTURE',
        amountCents: -6000,
      }),
    ]));
  });

  it('prorates salary labor using annual work hours', () => {
    const summary = buildEventFinanceSummary({
      eventId: 'event_salary',
      staffLabor: [
        {
          id: 'salary_staff',
          eventId: 'event_salary',
          label: 'Salary Manager',
          actualMinutes: 120,
          rate: { wageType: 'SALARY', amountCents: 10400000 },
          status: 'ACTUAL',
        },
      ],
    });

    expect(summary.actualCostCents).toBe(10000);
    expect(summary.actualProfitCents).toBe(-10000);
    expect(summary.lineItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'labor:salary_staff',
        amountCents: -10000,
        classification: 'labor_cost',
      }),
    ]));
  });
});

describe('buildTeamFinanceSummary', () => {
  it('classifies paid team registration bills as team costs', () => {
    const summary = buildTeamFinanceSummary({
      teamId: 'team_1',
      bills: [teamRegistrationBill],
      staffLabor: [
        {
          id: 'team_staff_1',
          teamId: 'team_1',
          label: 'Coach Taylor',
          actualMinutes: 90,
          rate: { wageType: 'HOURLY', amountCents: 4000 },
          status: 'ACTUAL',
        },
        {
          id: 'team_staff_2',
          teamId: 'team_1',
          label: 'Tournament Coach',
          rate: { wageType: 'FLAT_PER_EVENT', amountCents: 7500 },
          status: 'ACTUAL',
        },
      ],
      customLineItems: [
        {
          id: 'team_cost_1',
          teamId: 'team_1',
          title: 'Uniforms',
          category: 'equipment',
          amountCents: 2500,
        },
      ],
    });

    expect(summary.actualRevenueCents).toBe(0);
    expect(summary.eventRegistrationCostCents).toBe(15000);
    expect(summary.staffCostCents).toBe(13500);
    expect(summary.futureCostCents).toBe(0);
    expect(summary.actualCostCents).toBe(31800);
    expect(summary.actualProfitCents).toBe(-31800);
    expect(summary.projectedProfitCents).toBe(-31800);
    expect(summary.lineItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'team-bill:bill_team_registration:paid',
        amountCents: -20000,
        classification: 'team_registration_cost',
      }),
      expect.objectContaining({
        id: 'team-bill:bill_team_registration:refund',
        amountCents: 5000,
        classification: 'refund',
      }),
      expect.objectContaining({
        id: 'team-bill:bill_team_registration:fees',
        amountCents: -800,
        classification: 'fee',
      }),
      expect.objectContaining({
        id: 'labor:team_staff_1',
        amountCents: -6000,
        classification: 'labor_cost',
      }),
      expect.objectContaining({
        id: 'labor:team_staff_2',
        amountCents: -7500,
        classification: 'labor_cost',
      }),
      expect.objectContaining({
        id: 'custom:team_cost_1',
        amountCents: -2500,
        classification: 'custom_cost',
      }),
    ]));
  });

  it('keeps event-team snapshot bills attached to the canonical team report', () => {
    const summary = buildTeamFinanceSummary({
      teamId: 'team_parent',
      eventTeamId: 'event_team_1',
      bills: [
        {
          id: 'bill_event_team',
          ownerType: 'TEAM',
          ownerId: 'event_team_1',
          eventId: 'event_1',
          payments: [{ amountCents: 12000, status: 'PAID' }],
        },
      ],
    });

    expect(summary.eventRegistrationCostCents).toBe(12000);
    expect(summary.lineItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'team-bill:bill_event_team:paid',
        scope: 'EVENT_TEAM',
        amountCents: -12000,
      }),
    ]));
  });

  it('returns a warning instead of zeroing missing team staff wages', () => {
    const summary = buildTeamFinanceSummary({
      teamId: 'team_1',
      staffLabor: [
        {
          id: 'team_staff_missing_rate',
          teamId: 'team_1',
          label: 'Assistant Coach',
          actualMinutes: 60,
          rate: null,
        },
      ],
    });

    expect(summary.actualCostCents).toBe(0);
    expect(summary.futureCostCents).toBe(0);
    expect(summary.warnings).toEqual([
      expect.objectContaining({
        code: 'missing_labor_rate',
        sourceId: 'team_staff_missing_rate',
      }),
    ]);
    expect(summary.lineItems).toEqual([
      expect.objectContaining({
        id: 'warning:labor:team_staff_missing_rate',
        classification: 'warning',
        amountCents: 0,
      }),
    ]);
  });

  it('tracks future team staff and line item costs separately from actual costs', () => {
    const summary = buildTeamFinanceSummary({
      teamId: 'team_1',
      asOf: '2026-06-09T12:00:00.000Z',
      staffLabor: [
        {
          id: 'future_team_staff',
          teamId: 'team_1',
          label: 'Future Coach',
          plannedStart: '2026-07-02T16:00:00.000Z',
          plannedEnd: '2026-07-02T17:00:00.000Z',
          rate: { wageType: 'HOURLY', amountCents: 4000 },
          status: 'PLANNED',
        },
      ],
      customLineItems: [
        {
          id: 'future_team_cost',
          teamId: 'team_1',
          title: 'Tournament lodging',
          category: 'travel',
          amountCents: 2500,
          serviceStartAt: '2026-07-01T00:00:00.000Z',
        },
      ],
    });

    expect(summary.actualCostCents).toBe(0);
    expect(summary.futureCostCents).toBe(6500);
    expect(summary.actualProfitCents).toBe(0);
    expect(summary.projectedProfitCents).toBe(-6500);
    expect(summary.staffCostCents).toBe(0);
    expect(summary.lineItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'labor:future_team_staff',
        timing: 'FUTURE',
        amountCents: -4000,
      }),
      expect.objectContaining({
        id: 'custom:future_team_cost',
        timing: 'FUTURE',
        amountCents: -2500,
      }),
    ]));
  });
});

describe('buildOrganizationFinanceSummary', () => {
  it('summarizes organization revenue, refunds, fees, labor, custom costs, and future costs', () => {
    const summary = buildOrganizationFinanceSummary({
      organizationId: 'org_1',
      asOf: '2026-06-09T12:00:00.000Z',
      bills: [
        {
          ...teamRegistrationBill,
          organizationId: 'org_1',
        },
        {
          id: 'rental_bill_1',
          organizationId: 'org_1',
          ownerType: 'USER',
          ownerId: 'user_1',
          slotId: 'slot_1',
          payments: [
            {
              id: 'rental_payment_1',
              amountCents: 10000,
              status: 'PAID',
              paidAt: '2026-06-05T12:00:00.000Z',
              stripeProcessingFeeCents: 350,
            },
          ],
        },
      ],
      staffLabor: [
        {
          id: 'event_staff_1',
          sourceType: 'EVENT_STAFF_ASSIGNMENT',
          eventId: 'event_1',
          label: 'Alex Rivera',
          actualStart: '2026-06-01T12:00:00.000Z',
          actualMinutes: 120,
          rate: { wageType: 'HOURLY', amountCents: 3000 },
          status: 'ACTUAL',
        },
        {
          id: 'future_team_staff_1',
          sourceType: 'TEAM_STAFF_LABOR',
          teamId: 'team_1',
          label: 'Future Coach',
          plannedStart: '2026-07-01T12:00:00.000Z',
          plannedMinutes: 60,
          rate: { wageType: 'HOURLY', amountCents: 4000 },
          status: 'PLANNED',
        },
      ],
      customLineItems: [
        {
          id: 'org_cost_1',
          organizationId: 'org_1',
          title: 'Facility supplies',
          category: 'supplies',
          amountCents: 2500,
          serviceStartAt: '2026-06-02T00:00:00.000Z',
        },
      ],
    });

    expect(summary.grossRevenueCents).toBe(30000);
    expect(summary.refundCents).toBe(5000);
    expect(summary.feeCents).toBe(1150);
    expect(summary.actualRevenueCents).toBe(23850);
    expect(summary.actualCostCents).toBe(8500);
    expect(summary.staffCostCents).toBe(6000);
    expect(summary.customCostCents).toBe(2500);
    expect(summary.futureCostCents).toBe(4000);
    expect(summary.actualProfitCents).toBe(15350);
    expect(summary.projectedProfitCents).toBe(11350);
    expect(summary.lineItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'organization-bill:bill_team_registration:paid',
        label: 'Team registration payment',
        classification: 'revenue',
      }),
      expect.objectContaining({
        id: 'organization-bill:rental_bill_1:paid',
        label: 'Rental payment',
        category: 'rental',
        classification: 'revenue',
      }),
      expect.objectContaining({
        id: 'labor:event_staff_1',
        amountCents: -6000,
        classification: 'labor_cost',
      }),
      expect.objectContaining({
        id: 'labor:future_team_staff_1',
        timing: 'FUTURE',
        amountCents: -4000,
      }),
      expect.objectContaining({
        id: 'custom:org_cost_1',
        amountCents: -2500,
        classification: 'custom_cost',
      }),
    ]));
  });
});
