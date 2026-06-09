export type FinanceBillOwnerType = 'USER' | 'TEAM' | string;
export type FinanceWageType = 'HOURLY' | 'SALARY' | 'FLAT_PER_EVENT';
export type FinanceLineItemClassification =
  | 'revenue'
  | 'refund'
  | 'fee'
  | 'labor_cost'
  | 'team_registration_cost'
  | 'custom_cost'
  | 'potential_revenue'
  | 'warning';

export type FinanceBillPayment = {
  id?: string | null;
  amountCents?: number | null;
  status?: string | null;
  refundedAmountCents?: number | null;
  stripeProcessingFeeCents?: number | null;
  stripeTaxServiceFeeCents?: number | null;
};

export type FinanceBill = {
  id: string;
  ownerType?: FinanceBillOwnerType | null;
  ownerId?: string | null;
  eventId?: string | null;
  totalAmountCents?: number | null;
  paidAmountCents?: number | null;
  payments?: FinanceBillPayment[];
};

export type FinanceLaborRate = {
  wageType: FinanceWageType;
  amountCents: number;
};

export type FinanceLaborEntry = {
  id: string;
  label: string;
  staffMemberId?: string | null;
  userId?: string | null;
  eventId?: string | null;
  teamId?: string | null;
  eventTeamId?: string | null;
  plannedStart?: Date | string | null;
  plannedEnd?: Date | string | null;
  actualStart?: Date | string | null;
  actualEnd?: Date | string | null;
  plannedMinutes?: number | null;
  actualMinutes?: number | null;
  status?: string | null;
  rate?: FinanceLaborRate | null;
};

export type CustomFinanceLineItem = {
  id: string;
  title: string;
  category?: string | null;
  amountCents: number;
  eventId?: string | null;
  teamId?: string | null;
  eventTeamId?: string | null;
  scope?: string | null;
  status?: string | null;
};

export type FinanceLineItem = {
  id: string;
  sourceType: string;
  sourceId?: string | null;
  scope: 'EVENT' | 'TEAM' | 'ORGANIZATION' | 'EVENT_TEAM';
  label: string;
  category: string;
  amountCents: number;
  classification: FinanceLineItemClassification;
  status: string;
  isGenerated: boolean;
};

export type FinanceWarning = {
  code: string;
  message: string;
  sourceType?: string;
  sourceId?: string | null;
};

export type EventFinanceSummary = {
  eventId: string;
  actualRevenueCents: number;
  actualCostCents: number;
  actualProfitCents: number;
  potentialRevenueCents: number;
  projectedProfitCents: number;
  lineItems: FinanceLineItem[];
  warnings: FinanceWarning[];
};

export type TeamFinanceSummary = {
  teamId: string;
  eventTeamId?: string | null;
  actualRevenueCents: number;
  actualCostCents: number;
  actualProfitCents: number;
  eventRegistrationCostCents: number;
  staffCostCents: number;
  lineItems: FinanceLineItem[];
  warnings: FinanceWarning[];
};

const DEFAULT_ANNUAL_WORK_HOURS = 2080;

const normalizeCents = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }
  return 0;
};

const normalizeSignedCents = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const normalizeStatus = (value: unknown, fallback = 'ACTUAL'): string => {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized || fallback;
};

const isPaidPayment = (payment: FinanceBillPayment): boolean => (
  normalizeStatus(payment.status, '') === 'PAID'
);

const toDate = (value: Date | string | null | undefined): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const minutesBetween = (
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
): number | null => {
  const startDate = toDate(start);
  const endDate = toDate(end);
  if (!startDate || !endDate) {
    return null;
  }
  const minutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
  return minutes > 0 ? minutes : null;
};

const firstPositiveInteger = (...values: Array<number | null | undefined>): number | null => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.round(value);
    }
  }
  return null;
};

const resolveLaborMinutes = (entry: FinanceLaborEntry): number | null => (
  firstPositiveInteger(
    entry.actualMinutes,
    minutesBetween(entry.actualStart, entry.actualEnd),
    entry.plannedMinutes,
    minutesBetween(entry.plannedStart, entry.plannedEnd),
  )
);

const resolveLaborCostCents = (
  entry: FinanceLaborEntry,
  annualWorkHours = DEFAULT_ANNUAL_WORK_HOURS,
): { costCents: number | null; warning?: FinanceWarning } => {
  if (normalizeStatus(entry.status, 'PLANNED') === 'CANCELLED') {
    return { costCents: 0 };
  }

  const rate = entry.rate;
  if (!rate || !Number.isFinite(rate.amountCents) || rate.amountCents < 0) {
    return {
      costCents: null,
      warning: {
        code: 'missing_labor_rate',
        message: `Missing compensation rate for ${entry.label}.`,
        sourceType: 'labor',
        sourceId: entry.id,
      },
    };
  }

  if (rate.wageType === 'FLAT_PER_EVENT') {
    return { costCents: normalizeCents(rate.amountCents) };
  }

  const minutes = resolveLaborMinutes(entry);
  if (!minutes) {
    return {
      costCents: null,
      warning: {
        code: 'missing_labor_minutes',
        message: `Missing paid time for ${entry.label}.`,
        sourceType: 'labor',
        sourceId: entry.id,
      },
    };
  }

  if (rate.wageType === 'SALARY') {
    const hourlyCents = normalizeCents(rate.amountCents) / annualWorkHours;
    return { costCents: Math.round(hourlyCents * (minutes / 60)) };
  }

  return { costCents: Math.round(normalizeCents(rate.amountCents) * (minutes / 60)) };
};

const summarizePaidBill = (bill: FinanceBill): {
  paidCents: number;
  refundedCents: number;
  feeCents: number;
} => {
  const paidPayments = (bill.payments ?? []).filter(isPaidPayment);
  if (!paidPayments.length) {
    return {
      paidCents: normalizeCents(bill.paidAmountCents),
      refundedCents: 0,
      feeCents: 0,
    };
  }

  return paidPayments.reduce(
    (totals, payment) => ({
      paidCents: totals.paidCents + normalizeCents(payment.amountCents),
      refundedCents: totals.refundedCents + normalizeCents(payment.refundedAmountCents),
      feeCents: totals.feeCents
        + normalizeCents(payment.stripeProcessingFeeCents)
        + normalizeCents(payment.stripeTaxServiceFeeCents),
    }),
    { paidCents: 0, refundedCents: 0, feeCents: 0 },
  );
};

const customCostLineItem = (
  item: CustomFinanceLineItem,
  scope: FinanceLineItem['scope'],
): FinanceLineItem => {
  const costCents = Math.abs(normalizeSignedCents(item.amountCents));
  return {
    id: `custom:${item.id}`,
    sourceType: 'custom_line_item',
    sourceId: item.id,
    scope,
    label: item.title,
    category: item.category ?? 'custom',
    amountCents: -costCents,
    classification: 'custom_cost',
    status: normalizeStatus(item.status),
    isGenerated: false,
  };
};

const laborLineItems = (
  entries: FinanceLaborEntry[],
  scope: FinanceLineItem['scope'],
): {
  lineItems: FinanceLineItem[];
  warnings: FinanceWarning[];
  costCents: number;
} => entries.reduce(
  (result, entry) => {
    const resolved = resolveLaborCostCents(entry);
    if (resolved.warning) {
      result.warnings.push(resolved.warning);
      result.lineItems.push({
        id: `warning:labor:${entry.id}`,
        sourceType: 'labor',
        sourceId: entry.id,
        scope,
        label: resolved.warning.message,
        category: 'labor',
        amountCents: 0,
        classification: 'warning',
        status: 'WARNING',
        isGenerated: true,
      });
      return result;
    }

    const costCents = normalizeCents(resolved.costCents);
    if (costCents > 0) {
      result.costCents += costCents;
      result.lineItems.push({
        id: `labor:${entry.id}`,
        sourceType: 'labor',
        sourceId: entry.id,
        scope,
        label: entry.label,
        category: 'labor',
        amountCents: -costCents,
        classification: 'labor_cost',
        status: normalizeStatus(entry.status, 'ACTUAL'),
        isGenerated: true,
      });
    }

    return result;
  },
  { lineItems: [] as FinanceLineItem[], warnings: [] as FinanceWarning[], costCents: 0 },
);

export const buildEventFinanceSummary = ({
  eventId,
  eventPriceCents,
  maxParticipants,
  confirmedParticipantCount,
  bills = [],
  staffLabor = [],
  customLineItems = [],
}: {
  eventId: string;
  eventPriceCents?: number | null;
  maxParticipants?: number | null;
  confirmedParticipantCount?: number | null;
  bills?: FinanceBill[];
  staffLabor?: FinanceLaborEntry[];
  customLineItems?: CustomFinanceLineItem[];
}): EventFinanceSummary => {
  const lineItems: FinanceLineItem[] = [];
  const warnings: FinanceWarning[] = [];
  let actualRevenueCents = 0;
  let actualCostCents = 0;

  bills
    .filter((bill) => bill.eventId === eventId)
    .forEach((bill) => {
      const billTotals = summarizePaidBill(bill);
      if (billTotals.paidCents > 0) {
        actualRevenueCents += billTotals.paidCents;
        lineItems.push({
          id: `bill:${bill.id}:paid`,
          sourceType: 'bill',
          sourceId: bill.id,
          scope: 'EVENT',
          label: bill.ownerType === 'TEAM' ? 'Team registration payment' : 'Registration payment',
          category: bill.ownerType === 'TEAM' ? 'team_registration' : 'registration',
          amountCents: billTotals.paidCents,
          classification: 'revenue',
          status: 'PAID',
          isGenerated: true,
        });
      }
      if (billTotals.refundedCents > 0) {
        actualRevenueCents -= billTotals.refundedCents;
        lineItems.push({
          id: `bill:${bill.id}:refund`,
          sourceType: 'bill',
          sourceId: bill.id,
          scope: 'EVENT',
          label: 'Refunds',
          category: 'refunds',
          amountCents: -billTotals.refundedCents,
          classification: 'refund',
          status: 'ACTUAL',
          isGenerated: true,
        });
      }
      if (billTotals.feeCents > 0) {
        actualRevenueCents -= billTotals.feeCents;
        lineItems.push({
          id: `bill:${bill.id}:fees`,
          sourceType: 'bill',
          sourceId: bill.id,
          scope: 'EVENT',
          label: 'Payment processing fees',
          category: 'fees',
          amountCents: -billTotals.feeCents,
          classification: 'fee',
          status: 'ACTUAL',
          isGenerated: true,
        });
      }
    });

  const labor = laborLineItems(staffLabor.filter((entry) => entry.eventId === eventId), 'EVENT');
  lineItems.push(...labor.lineItems);
  warnings.push(...labor.warnings);
  actualCostCents += labor.costCents;

  customLineItems
    .filter((item) => item.eventId === eventId)
    .forEach((item) => {
      const lineItem = customCostLineItem(item, 'EVENT');
      lineItems.push(lineItem);
      actualCostCents += Math.abs(lineItem.amountCents);
    });

  const openSpots = Math.max(
    0,
    normalizeCents(maxParticipants) - normalizeCents(confirmedParticipantCount),
  );
  const potentialRevenueCents = openSpots * normalizeCents(eventPriceCents);
  if (potentialRevenueCents > 0) {
    lineItems.push({
      id: `potential:event:${eventId}:open-spots`,
      sourceType: 'event',
      sourceId: eventId,
      scope: 'EVENT',
      label: 'Potential open-spot revenue',
      category: 'potential',
      amountCents: potentialRevenueCents,
      classification: 'potential_revenue',
      status: 'PROJECTED',
      isGenerated: true,
    });
  }

  const actualProfitCents = actualRevenueCents - actualCostCents;
  return {
    eventId,
    actualRevenueCents,
    actualCostCents,
    actualProfitCents,
    potentialRevenueCents,
    projectedProfitCents: actualProfitCents + potentialRevenueCents,
    lineItems,
    warnings,
  };
};

export const buildTeamFinanceSummary = ({
  teamId,
  eventTeamId,
  relatedEventTeamIds = [],
  bills = [],
  staffLabor = [],
  customLineItems = [],
}: {
  teamId: string;
  eventTeamId?: string | null;
  relatedEventTeamIds?: string[];
  bills?: FinanceBill[];
  staffLabor?: FinanceLaborEntry[];
  customLineItems?: CustomFinanceLineItem[];
}): TeamFinanceSummary => {
  const eventTeamIds = new Set([eventTeamId, ...relatedEventTeamIds].filter((value): value is string => Boolean(value)));
  const teamIds = new Set([teamId, ...eventTeamIds]);
  const lineItems: FinanceLineItem[] = [];
  const warnings: FinanceWarning[] = [];
  let actualRevenueCents = 0;
  let actualCostCents = 0;
  let eventRegistrationCostCents = 0;

  bills
    .filter((bill) => normalizeStatus(bill.ownerType, '') === 'TEAM' && Boolean(bill.ownerId && teamIds.has(bill.ownerId)))
    .forEach((bill) => {
      const billTotals = summarizePaidBill(bill);
      if (billTotals.paidCents > 0) {
        actualCostCents += billTotals.paidCents;
        eventRegistrationCostCents += billTotals.paidCents;
        lineItems.push({
          id: `team-bill:${bill.id}:paid`,
          sourceType: 'bill',
          sourceId: bill.id,
          scope: bill.ownerId && eventTeamIds.has(bill.ownerId) ? 'EVENT_TEAM' : 'TEAM',
          label: 'Event registration cost',
          category: 'team_registration',
          amountCents: -billTotals.paidCents,
          classification: 'team_registration_cost',
          status: 'PAID',
          isGenerated: true,
        });
      }
      if (billTotals.refundedCents > 0) {
        actualCostCents -= billTotals.refundedCents;
        eventRegistrationCostCents -= billTotals.refundedCents;
        lineItems.push({
          id: `team-bill:${bill.id}:refund`,
          sourceType: 'bill',
          sourceId: bill.id,
          scope: bill.ownerId && eventTeamIds.has(bill.ownerId) ? 'EVENT_TEAM' : 'TEAM',
          label: 'Registration refunds',
          category: 'refunds',
          amountCents: billTotals.refundedCents,
          classification: 'refund',
          status: 'ACTUAL',
          isGenerated: true,
        });
      }
      if (billTotals.feeCents > 0) {
        actualCostCents += billTotals.feeCents;
        lineItems.push({
          id: `team-bill:${bill.id}:fees`,
          sourceType: 'bill',
          sourceId: bill.id,
          scope: bill.ownerId && eventTeamIds.has(bill.ownerId) ? 'EVENT_TEAM' : 'TEAM',
          label: 'Payment processing fees',
          category: 'fees',
          amountCents: -billTotals.feeCents,
          classification: 'fee',
          status: 'ACTUAL',
          isGenerated: true,
        });
      }
    });

  const labor = laborLineItems(
    staffLabor.filter((entry) => (
      (entry.teamId && teamIds.has(entry.teamId))
      || (entry.eventTeamId && teamIds.has(entry.eventTeamId))
    )),
    eventTeamIds.size ? 'EVENT_TEAM' : 'TEAM',
  );
  lineItems.push(...labor.lineItems);
  warnings.push(...labor.warnings);
  actualCostCents += labor.costCents;

  customLineItems
    .filter((item) => (
      (item.teamId && teamIds.has(item.teamId))
      || (item.eventTeamId && teamIds.has(item.eventTeamId))
    ))
    .forEach((item) => {
      const lineItem = customCostLineItem(item, item.eventTeamId && eventTeamIds.has(item.eventTeamId) ? 'EVENT_TEAM' : 'TEAM');
      lineItems.push(lineItem);
      actualCostCents += Math.abs(lineItem.amountCents);
    });

  return {
    teamId,
    eventTeamId,
    actualRevenueCents,
    actualCostCents,
    actualProfitCents: actualRevenueCents - actualCostCents,
    eventRegistrationCostCents,
    staffCostCents: labor.costCents,
    lineItems,
    warnings,
  };
};
