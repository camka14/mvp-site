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
export type FinanceLineItemTiming = 'ACTUAL' | 'FUTURE' | 'POTENTIAL' | 'WARNING';

export type FinanceBillPayment = {
  id?: string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  amountCents?: number | null;
  status?: string | null;
  paidAt?: Date | string | null;
  payerUserId?: string | null;
  refundedAmountCents?: number | null;
  stripeProcessingFeeCents?: number | null;
  stripeTaxServiceFeeCents?: number | null;
};

export type FinanceBill = {
  id: string;
  createdAt?: Date | string | null;
  organizationId?: string | null;
  ownerType?: FinanceBillOwnerType | null;
  ownerId?: string | null;
  eventId?: string | null;
  slotId?: string | null;
  sourceName?: string | null;
  sourceEntityType?: 'event' | 'rental' | 'organization' | null;
  sourceEntityId?: string | null;
  customerType?: 'users' | 'teams' | null;
  customerId?: string | null;
  customerName?: string | null;
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
  sourceType?: 'EVENT_STAFF_ASSIGNMENT' | 'TEAM_STAFF_LABOR';
  label: string;
  staffMemberId?: string | null;
  userId?: string | null;
  userName?: string | null;
  eventId?: string | null;
  eventName?: string | null;
  teamId?: string | null;
  teamName?: string | null;
  eventTeamId?: string | null;
  eventTeamName?: string | null;
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
  description?: string | null;
  category?: string | null;
  amountCents: number;
  quantity?: number | null;
  unitLabel?: string | null;
  organizationId?: string | null;
  eventId?: string | null;
  teamId?: string | null;
  eventTeamId?: string | null;
  scope?: string | null;
  status?: string | null;
  occurredAt?: Date | string | null;
  serviceStartAt?: Date | string | null;
  serviceEndAt?: Date | string | null;
};

export type FinanceLineItem = {
  id: string;
  sourceType: string;
  sourceId?: string | null;
  scope: 'EVENT' | 'TEAM' | 'ORGANIZATION' | 'EVENT_TEAM';
  label: string;
  sourceName?: string | null;
  sourceEntityType?: 'event' | 'rental' | 'organization' | 'team' | null;
  sourceEntityId?: string | null;
  customerType?: 'users' | 'teams' | null;
  customerId?: string | null;
  customerName?: string | null;
  category: string;
  amountCents: number;
  classification: FinanceLineItemClassification;
  status: string;
  timing: FinanceLineItemTiming;
  serviceStartAt?: string | null;
  serviceEndAt?: string | null;
  description?: string | null;
  quantity?: number | null;
  unitLabel?: string | null;
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
  futureCostCents: number;
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
  futureCostCents: number;
  projectedProfitCents: number;
  eventRegistrationCostCents: number;
  staffCostCents: number;
  lineItems: FinanceLineItem[];
  warnings: FinanceWarning[];
};

export type OrganizationFinanceSummary = {
  organizationId: string;
  grossRevenueCents: number;
  refundCents: number;
  feeCents: number;
  actualRevenueCents: number;
  actualCostCents: number;
  actualProfitCents: number;
  futureCostCents: number;
  projectedProfitCents: number;
  staffCostCents: number;
  customCostCents: number;
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

const toIsoString = (value: Date | string | null | undefined): string | null => {
  const date = toDate(value);
  return date ? date.toISOString() : null;
};

const normalizeAsOf = (value: Date | string | null | undefined): Date => (
  toDate(value) ?? new Date()
);

const lineItemTiming = ({
  classification,
  status,
  serviceStartAt,
  serviceEndAt,
  amountCents,
  asOf,
}: {
  classification: FinanceLineItemClassification;
  status?: string | null;
  serviceStartAt?: Date | string | null;
  serviceEndAt?: Date | string | null;
  amountCents: number;
  asOf: Date;
}): FinanceLineItemTiming => {
  if (classification === 'warning') {
    return 'WARNING';
  }
  if (classification === 'potential_revenue') {
    return 'POTENTIAL';
  }
  if (normalizeStatus(status, '') === 'VOID') {
    return 'WARNING';
  }
  if (amountCents < 0) {
    const recognitionDate = toDate(serviceStartAt) ?? toDate(serviceEndAt);
    if (recognitionDate && recognitionDate.getTime() > asOf.getTime()) {
      return 'FUTURE';
    }
  }
  return 'ACTUAL';
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

export const resolveFinanceLaborCostCents = resolveLaborCostCents;

export const resolveFinanceLaborMinutes = resolveLaborMinutes;

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

const billRecognitionDate = (bill: FinanceBill): Date | string | null | undefined => {
  const paidPayment = (bill.payments ?? []).find(isPaidPayment);
  return paidPayment?.paidAt ?? paidPayment?.createdAt ?? bill.createdAt;
};

const namedBillLabel = (bill: FinanceBill, fallback: string): string => {
  const sourceName = String(bill.sourceName ?? '').trim();
  const customerName = String(bill.customerName ?? '').trim();
  return sourceName && customerName ? `${sourceName} - ${customerName}` : fallback;
};

const billLineItemMetadata = (
  bill: FinanceBill,
): Pick<
  FinanceLineItem,
  'sourceName' | 'sourceEntityType' | 'sourceEntityId' | 'customerType' | 'customerId' | 'customerName'
> => ({
  sourceName: bill.sourceName ?? null,
  sourceEntityType: bill.sourceEntityType ?? (bill.eventId ? 'event' : bill.slotId ? 'rental' : bill.organizationId ? 'organization' : null),
  sourceEntityId: bill.sourceEntityId ?? bill.eventId ?? bill.slotId ?? bill.organizationId ?? null,
  customerType: bill.customerType ?? null,
  customerId: bill.customerId ?? null,
  customerName: bill.customerName ?? null,
});

const laborLineItemMetadata = (
  entry: FinanceLaborEntry,
): Pick<
  FinanceLineItem,
  'sourceName' | 'sourceEntityType' | 'sourceEntityId' | 'customerType' | 'customerId' | 'customerName'
> => {
  const sourceName = entry.eventName ?? entry.teamName ?? entry.eventTeamName ?? null;
  const sourceEntityType = entry.eventId ? 'event' : entry.teamId || entry.eventTeamId ? 'team' : null;
  const sourceEntityId = entry.eventId ?? entry.teamId ?? entry.eventTeamId ?? null;
  return {
    sourceName,
    sourceEntityType,
    sourceEntityId,
    customerType: entry.userId ? 'users' : null,
    customerId: entry.userId ?? null,
    customerName: entry.userName ?? entry.label ?? null,
  };
};

const isWithinRange = (
  value: Date | string | null | undefined,
  from: Date | null,
  to: Date | null,
): boolean => {
  if (!from && !to) {
    return true;
  }
  const date = toDate(value);
  if (!date) {
    return true;
  }
  if (from && date.getTime() < from.getTime()) {
    return false;
  }
  if (to && date.getTime() > to.getTime()) {
    return false;
  }
  return true;
};

const buildFinanceLineItem = (item: Omit<FinanceLineItem, 'timing' | 'serviceStartAt' | 'serviceEndAt'> & {
  serviceStartAt?: Date | string | null;
  serviceEndAt?: Date | string | null;
}, asOf: Date): FinanceLineItem => {
  const serviceStartAt = toIsoString(item.serviceStartAt);
  const serviceEndAt = toIsoString(item.serviceEndAt);
  return {
    ...item,
    serviceStartAt,
    serviceEndAt,
    timing: lineItemTiming({
      classification: item.classification,
      status: item.status,
      serviceStartAt,
      serviceEndAt,
      amountCents: item.amountCents,
      asOf,
    }),
  };
};

const customCostLineItem = (
  item: CustomFinanceLineItem,
  scope: FinanceLineItem['scope'],
  asOf: Date,
): FinanceLineItem => {
  const costCents = Math.abs(normalizeSignedCents(item.amountCents));
  return buildFinanceLineItem({
    id: `custom:${item.id}`,
    sourceType: 'custom_line_item',
    sourceId: item.id,
    scope,
    label: item.title,
    category: item.category ?? 'custom',
    amountCents: -costCents,
    classification: 'custom_cost',
    status: normalizeStatus(item.status),
    description: item.description ?? null,
    quantity: item.quantity ?? null,
    unitLabel: item.unitLabel ?? null,
    isGenerated: false,
    serviceStartAt: item.serviceStartAt ?? item.occurredAt,
    serviceEndAt: item.serviceEndAt,
  }, asOf);
};

const laborLineItems = (
  entries: FinanceLaborEntry[],
  scope: FinanceLineItem['scope'],
  asOf: Date,
): {
  lineItems: FinanceLineItem[];
  warnings: FinanceWarning[];
  costCents: number;
  futureCostCents: number;
} => entries.reduce(
  (result, entry) => {
    const resolved = resolveLaborCostCents(entry);
    const serviceStartAt = entry.actualStart ?? entry.plannedStart;
    const serviceEndAt = entry.actualEnd ?? entry.plannedEnd;
    const paidMinutes = resolveLaborMinutes(entry);
    if (resolved.warning) {
      result.warnings.push(resolved.warning);
      result.lineItems.push(buildFinanceLineItem({
        id: `warning:labor:${entry.id}`,
        sourceType: 'labor',
        sourceId: entry.id,
        scope,
        label: resolved.warning.message,
        ...laborLineItemMetadata(entry),
        category: 'labor',
        amountCents: 0,
        classification: 'warning',
        status: 'WARNING',
        quantity: paidMinutes ? Number((paidMinutes / 60).toFixed(2)) : null,
        unitLabel: paidMinutes ? 'hours' : null,
        isGenerated: true,
        serviceStartAt,
        serviceEndAt,
      }, asOf));
      return result;
    }

    const costCents = normalizeCents(resolved.costCents);
    if (costCents > 0) {
      const lineItem = buildFinanceLineItem({
        id: `labor:${entry.id}`,
        sourceType: 'labor',
        sourceId: entry.id,
        scope,
        label: entry.label,
        ...laborLineItemMetadata(entry),
        category: 'labor',
        amountCents: -costCents,
        classification: 'labor_cost',
        status: normalizeStatus(entry.status, 'ACTUAL'),
        quantity: paidMinutes ? Number((paidMinutes / 60).toFixed(2)) : null,
        unitLabel: paidMinutes ? 'hours' : null,
        isGenerated: true,
        serviceStartAt,
        serviceEndAt,
      }, asOf);
      if (lineItem.timing === 'FUTURE') {
        result.futureCostCents += costCents;
      } else {
        result.costCents += costCents;
      }
      result.lineItems.push(lineItem);
    }

    return result;
  },
  { lineItems: [] as FinanceLineItem[], warnings: [] as FinanceWarning[], costCents: 0, futureCostCents: 0 },
);

export const buildEventFinanceSummary = ({
  eventId,
  eventStart,
  eventPriceCents,
  maxParticipants,
  confirmedParticipantCount,
  bills = [],
  staffLabor = [],
  customLineItems = [],
  asOf: asOfInput,
}: {
  eventId: string;
  eventStart?: Date | string | null;
  eventPriceCents?: number | null;
  maxParticipants?: number | null;
  confirmedParticipantCount?: number | null;
  bills?: FinanceBill[];
  staffLabor?: FinanceLaborEntry[];
  customLineItems?: CustomFinanceLineItem[];
  asOf?: Date | string | null;
}): EventFinanceSummary => {
  const asOf = normalizeAsOf(asOfInput);
  const lineItems: FinanceLineItem[] = [];
  const warnings: FinanceWarning[] = [];
  let actualRevenueCents = 0;
  let actualCostCents = 0;
  let futureCostCents = 0;

  bills
    .filter((bill) => bill.eventId === eventId)
    .forEach((bill) => {
      const billTotals = summarizePaidBill(bill);
      const recognitionDate = billRecognitionDate(bill);
      if (billTotals.paidCents > 0) {
        actualRevenueCents += billTotals.paidCents;
        lineItems.push(buildFinanceLineItem({
          id: `bill:${bill.id}:paid`,
          sourceType: 'bill',
          sourceId: bill.id,
          scope: 'EVENT',
          label: namedBillLabel(bill, bill.ownerType === 'TEAM' ? 'Team registration payment' : 'Registration payment'),
          ...billLineItemMetadata(bill),
          category: bill.ownerType === 'TEAM' ? 'team_registration' : 'registration',
          amountCents: billTotals.paidCents,
          classification: 'revenue',
          status: 'PAID',
          quantity: 1,
          unitLabel: bill.ownerType === 'TEAM' ? 'team registration' : 'registration',
          isGenerated: true,
          serviceStartAt: recognitionDate,
        }, asOf));
      }
      if (billTotals.refundedCents > 0) {
        actualRevenueCents -= billTotals.refundedCents;
        lineItems.push(buildFinanceLineItem({
          id: `bill:${bill.id}:refund`,
          sourceType: 'bill',
          sourceId: bill.id,
          scope: 'EVENT',
          label: namedBillLabel(bill, 'Refunds'),
          ...billLineItemMetadata(bill),
          category: 'refunds',
          amountCents: -billTotals.refundedCents,
          classification: 'refund',
          status: 'ACTUAL',
          quantity: 1,
          unitLabel: 'refund',
          isGenerated: true,
          serviceStartAt: recognitionDate,
        }, asOf));
      }
      if (billTotals.feeCents > 0) {
        actualRevenueCents -= billTotals.feeCents;
        lineItems.push(buildFinanceLineItem({
          id: `bill:${bill.id}:fees`,
          sourceType: 'bill',
          sourceId: bill.id,
          scope: 'EVENT',
          label: 'Payment processing fees',
          ...billLineItemMetadata(bill),
          category: 'fees',
          amountCents: -billTotals.feeCents,
          classification: 'fee',
          status: 'ACTUAL',
          quantity: 1,
          unitLabel: 'payment',
          isGenerated: true,
          serviceStartAt: recognitionDate,
        }, asOf));
      }
    });

  const labor = laborLineItems(staffLabor.filter((entry) => entry.eventId === eventId), 'EVENT', asOf);
  lineItems.push(...labor.lineItems);
  warnings.push(...labor.warnings);
  actualCostCents += labor.costCents;
  futureCostCents += labor.futureCostCents;

  customLineItems
    .filter((item) => item.eventId === eventId)
    .forEach((item) => {
      const lineItem = customCostLineItem(item, 'EVENT', asOf);
      lineItems.push(lineItem);
      if (lineItem.timing === 'FUTURE') {
        futureCostCents += Math.abs(lineItem.amountCents);
      } else {
        actualCostCents += Math.abs(lineItem.amountCents);
      }
    });

  const openSpots = Math.max(
    0,
    normalizeCents(maxParticipants) - normalizeCents(confirmedParticipantCount),
  );
  const potentialRevenueCents = openSpots * normalizeCents(eventPriceCents);
  if (potentialRevenueCents > 0) {
    lineItems.push(buildFinanceLineItem({
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
      serviceStartAt: eventStart,
    }, asOf));
  }

  const actualProfitCents = actualRevenueCents - actualCostCents;
  return {
    eventId,
    actualRevenueCents,
    actualCostCents,
    actualProfitCents,
    futureCostCents,
    potentialRevenueCents,
    projectedProfitCents: actualProfitCents + potentialRevenueCents - futureCostCents,
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
  asOf: asOfInput,
}: {
  teamId: string;
  eventTeamId?: string | null;
  relatedEventTeamIds?: string[];
  bills?: FinanceBill[];
  staffLabor?: FinanceLaborEntry[];
  customLineItems?: CustomFinanceLineItem[];
  asOf?: Date | string | null;
}): TeamFinanceSummary => {
  const asOf = normalizeAsOf(asOfInput);
  const eventTeamIds = new Set([eventTeamId, ...relatedEventTeamIds].filter((value): value is string => Boolean(value)));
  const teamIds = new Set([teamId, ...eventTeamIds]);
  const lineItems: FinanceLineItem[] = [];
  const warnings: FinanceWarning[] = [];
  let actualRevenueCents = 0;
  let actualCostCents = 0;
  let futureCostCents = 0;
  let eventRegistrationCostCents = 0;

  bills
    .filter((bill) => normalizeStatus(bill.ownerType, '') === 'TEAM' && Boolean(bill.ownerId && teamIds.has(bill.ownerId)))
    .forEach((bill) => {
      const billTotals = summarizePaidBill(bill);
      const recognitionDate = billRecognitionDate(bill);
      if (billTotals.paidCents > 0) {
        actualCostCents += billTotals.paidCents;
        eventRegistrationCostCents += billTotals.paidCents;
        lineItems.push(buildFinanceLineItem({
          id: `team-bill:${bill.id}:paid`,
          sourceType: 'bill',
          sourceId: bill.id,
          scope: bill.ownerId && eventTeamIds.has(bill.ownerId) ? 'EVENT_TEAM' : 'TEAM',
          label: namedBillLabel(bill, 'Event registration cost'),
          ...billLineItemMetadata(bill),
          category: 'team_registration',
          amountCents: -billTotals.paidCents,
          classification: 'team_registration_cost',
          status: 'PAID',
          quantity: 1,
          unitLabel: 'registration',
          isGenerated: true,
          serviceStartAt: recognitionDate,
        }, asOf));
      }
      if (billTotals.refundedCents > 0) {
        actualCostCents -= billTotals.refundedCents;
        eventRegistrationCostCents -= billTotals.refundedCents;
        lineItems.push(buildFinanceLineItem({
          id: `team-bill:${bill.id}:refund`,
          sourceType: 'bill',
          sourceId: bill.id,
          scope: bill.ownerId && eventTeamIds.has(bill.ownerId) ? 'EVENT_TEAM' : 'TEAM',
          label: namedBillLabel(bill, 'Registration refunds'),
          ...billLineItemMetadata(bill),
          category: 'refunds',
          amountCents: billTotals.refundedCents,
          classification: 'refund',
          status: 'ACTUAL',
          quantity: 1,
          unitLabel: 'refund',
          isGenerated: true,
          serviceStartAt: recognitionDate,
        }, asOf));
      }
      if (billTotals.feeCents > 0) {
        actualCostCents += billTotals.feeCents;
        lineItems.push(buildFinanceLineItem({
          id: `team-bill:${bill.id}:fees`,
          sourceType: 'bill',
          sourceId: bill.id,
          scope: bill.ownerId && eventTeamIds.has(bill.ownerId) ? 'EVENT_TEAM' : 'TEAM',
          label: 'Payment processing fees',
          ...billLineItemMetadata(bill),
          category: 'fees',
          amountCents: -billTotals.feeCents,
          classification: 'fee',
          status: 'ACTUAL',
          quantity: 1,
          unitLabel: 'payment',
          isGenerated: true,
          serviceStartAt: recognitionDate,
        }, asOf));
      }
    });

  const labor = laborLineItems(
    staffLabor.filter((entry) => (
      (entry.teamId && teamIds.has(entry.teamId))
      || (entry.eventTeamId && teamIds.has(entry.eventTeamId))
    )),
    eventTeamIds.size ? 'EVENT_TEAM' : 'TEAM',
    asOf,
  );
  lineItems.push(...labor.lineItems);
  warnings.push(...labor.warnings);
  actualCostCents += labor.costCents;
  futureCostCents += labor.futureCostCents;

  customLineItems
    .filter((item) => (
      (item.teamId && teamIds.has(item.teamId))
      || (item.eventTeamId && teamIds.has(item.eventTeamId))
    ))
    .forEach((item) => {
      const lineItem = customCostLineItem(item, item.eventTeamId && eventTeamIds.has(item.eventTeamId) ? 'EVENT_TEAM' : 'TEAM', asOf);
      lineItems.push(lineItem);
      if (lineItem.timing === 'FUTURE') {
        futureCostCents += Math.abs(lineItem.amountCents);
      } else {
        actualCostCents += Math.abs(lineItem.amountCents);
      }
    });

  const actualProfitCents = actualRevenueCents - actualCostCents;
  return {
    teamId,
    eventTeamId,
    actualRevenueCents,
    actualCostCents,
    actualProfitCents,
    futureCostCents,
    projectedProfitCents: actualProfitCents - futureCostCents,
    eventRegistrationCostCents,
    staffCostCents: labor.costCents,
    lineItems,
    warnings,
  };
};

export const buildOrganizationFinanceSummary = ({
  organizationId,
  bills = [],
  staffLabor = [],
  customLineItems = [],
  from,
  to,
  asOf: asOfInput,
}: {
  organizationId: string;
  bills?: FinanceBill[];
  staffLabor?: FinanceLaborEntry[];
  customLineItems?: CustomFinanceLineItem[];
  from?: Date | string | null;
  to?: Date | string | null;
  asOf?: Date | string | null;
}): OrganizationFinanceSummary => {
  const asOf = normalizeAsOf(asOfInput);
  const fromDate = toDate(from);
  const toDateValue = toDate(to);
  const lineItems: FinanceLineItem[] = [];
  const warnings: FinanceWarning[] = [];
  let grossRevenueCents = 0;
  let refundCents = 0;
  let feeCents = 0;
  let actualCostCents = 0;
  let futureCostCents = 0;
  let customCostCents = 0;

  bills
    .filter((bill) => !bill.organizationId || bill.organizationId === organizationId)
    .forEach((bill) => {
      const recognitionDate = billRecognitionDate(bill);
      if (!isWithinRange(recognitionDate, fromDate, toDateValue)) {
        return;
      }
      const billTotals = summarizePaidBill(bill);
      const isTeamRegistration = normalizeStatus(bill.ownerType, '') === 'TEAM';
      const isRental = Boolean(bill.slotId);
      const baseLabel = isTeamRegistration
        ? 'Team registration payment'
        : isRental
          ? 'Rental payment'
          : bill.eventId
            ? 'Event registration payment'
            : 'Organization payment';
      const category = isTeamRegistration
        ? 'team_registration'
        : isRental
          ? 'rental'
          : bill.eventId
            ? 'event_registration'
            : 'organization_sales';

      if (billTotals.paidCents > 0) {
        grossRevenueCents += billTotals.paidCents;
        lineItems.push(buildFinanceLineItem({
          id: `organization-bill:${bill.id}:paid`,
          sourceType: 'bill',
          sourceId: bill.id,
          scope: 'ORGANIZATION',
          label: namedBillLabel(bill, baseLabel),
          ...billLineItemMetadata(bill),
          category,
          amountCents: billTotals.paidCents,
          classification: 'revenue',
          status: 'PAID',
          quantity: 1,
          unitLabel: isTeamRegistration
            ? 'team registration'
            : isRental
              ? 'rental'
              : bill.eventId
                ? 'registration'
                : 'payment',
          isGenerated: true,
          serviceStartAt: recognitionDate,
        }, asOf));
      }
      if (billTotals.refundedCents > 0) {
        refundCents += billTotals.refundedCents;
        lineItems.push(buildFinanceLineItem({
          id: `organization-bill:${bill.id}:refund`,
          sourceType: 'bill',
          sourceId: bill.id,
          scope: 'ORGANIZATION',
          label: namedBillLabel(bill, 'Refunds'),
          ...billLineItemMetadata(bill),
          category: 'refunds',
          amountCents: -billTotals.refundedCents,
          classification: 'refund',
          status: 'ACTUAL',
          quantity: 1,
          unitLabel: 'refund',
          isGenerated: true,
          serviceStartAt: recognitionDate,
        }, asOf));
      }
      if (billTotals.feeCents > 0) {
        feeCents += billTotals.feeCents;
        lineItems.push(buildFinanceLineItem({
          id: `organization-bill:${bill.id}:fees`,
          sourceType: 'bill',
          sourceId: bill.id,
          scope: 'ORGANIZATION',
          label: 'Payment processing fees',
          ...billLineItemMetadata(bill),
          category: 'fees',
          amountCents: -billTotals.feeCents,
          classification: 'fee',
          status: 'ACTUAL',
          quantity: 1,
          unitLabel: 'payment',
          isGenerated: true,
          serviceStartAt: recognitionDate,
        }, asOf));
      }
    });

  const labor = laborLineItems(
    staffLabor.filter((entry) => isWithinRange(entry.actualStart ?? entry.plannedStart, fromDate, toDateValue)),
    'ORGANIZATION',
    asOf,
  );
  lineItems.push(...labor.lineItems);
  warnings.push(...labor.warnings);
  actualCostCents += labor.costCents;
  futureCostCents += labor.futureCostCents;

  customLineItems
    .filter((item) => item.organizationId === undefined || item.organizationId === organizationId)
    .filter((item) => isWithinRange(item.serviceStartAt ?? item.occurredAt, fromDate, toDateValue))
    .forEach((item) => {
      const lineItem = customCostLineItem(item, 'ORGANIZATION', asOf);
      lineItems.push(lineItem);
      if (lineItem.timing === 'FUTURE') {
        futureCostCents += Math.abs(lineItem.amountCents);
      } else {
        const amount = Math.abs(lineItem.amountCents);
        actualCostCents += amount;
        customCostCents += amount;
      }
    });

  const actualRevenueCents = grossRevenueCents - refundCents - feeCents;
  const actualProfitCents = actualRevenueCents - actualCostCents;
  return {
    organizationId,
    grossRevenueCents,
    refundCents,
    feeCents,
    actualRevenueCents,
    actualCostCents,
    actualProfitCents,
    futureCostCents,
    projectedProfitCents: actualProfitCents - futureCostCents,
    staffCostCents: labor.costCents,
    customCostCents,
    lineItems,
    warnings,
  };
};
