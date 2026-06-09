import { prisma } from '@/lib/prisma';
import {
  buildEventFinanceSummary,
  buildTeamFinanceSummary,
  type CustomFinanceLineItem,
  type EventFinanceSummary,
  type FinanceBill,
  type FinanceLaborEntry,
  type FinanceLaborRate,
  type FinanceWageType,
  type TeamFinanceSummary,
} from '@/server/finance/financeAnalysis';

type PrismaLike = any;

const ACTIVE_PARTICIPANT_STATUSES = ['ACTIVE'] as const;

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};

const normalizeIds = (values: unknown[]): string[] => (
  Array.from(new Set(values.map((value) => normalizeId(value)).filter((value): value is string => Boolean(value))))
);

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

const normalizeWageType = (value: unknown): FinanceWageType | null => {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'HOURLY' || normalized === 'SALARY' || normalized === 'FLAT_PER_EVENT') {
    return normalized;
  }
  return null;
};

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const displayName = (user: Record<string, unknown> | null | undefined, fallback: string): string => {
  const firstName = typeof user?.firstName === 'string' ? user.firstName.trim() : '';
  const lastName = typeof user?.lastName === 'string' ? user.lastName.trim() : '';
  const fullName = `${firstName} ${lastName}`.trim();
  if (fullName) {
    return fullName;
  }
  const userName = typeof user?.userName === 'string' ? user.userName.trim() : '';
  return userName || fallback;
};

const paymentSelect = {
  id: true,
  billId: true,
  amountCents: true,
  status: true,
  refundedAmountCents: true,
  stripeProcessingFeeCents: true,
  stripeTaxServiceFeeCents: true,
} as const;

const billSelect = {
  id: true,
  ownerType: true,
  ownerId: true,
  eventId: true,
  totalAmountCents: true,
  paidAmountCents: true,
} as const;

const loadPaymentsByBillId = async (
  client: PrismaLike,
  billIds: string[],
): Promise<Map<string, FinanceBill['payments']>> => {
  if (!billIds.length) {
    return new Map();
  }
  const payments = await client.billPayments.findMany({
    where: { billId: { in: billIds } },
    select: paymentSelect,
  });
  const byBillId = new Map<string, FinanceBill['payments']>();
  payments.forEach((payment: any) => {
    const current = byBillId.get(payment.billId) ?? [];
    current.push({
      id: payment.id,
      amountCents: payment.amountCents,
      status: payment.status,
      refundedAmountCents: payment.refundedAmountCents,
      stripeProcessingFeeCents: payment.stripeProcessingFeeCents,
      stripeTaxServiceFeeCents: payment.stripeTaxServiceFeeCents,
    });
    byBillId.set(payment.billId, current);
  });
  return byBillId;
};

const attachPayments = async (
  client: PrismaLike,
  rows: any[],
): Promise<FinanceBill[]> => {
  const billIds = rows.map((row) => row.id);
  const paymentsByBillId = await loadPaymentsByBillId(client, billIds);
  return rows.map((row) => ({
    id: row.id,
    ownerType: row.ownerType,
    ownerId: row.ownerId,
    eventId: row.eventId,
    totalAmountCents: row.totalAmountCents,
    paidAmountCents: row.paidAmountCents,
    payments: paymentsByBillId.get(row.id) ?? [],
  }));
};

const loadUsersById = async (
  client: PrismaLike,
  userIds: string[],
): Promise<Map<string, Record<string, unknown>>> => {
  if (!userIds.length) {
    return new Map();
  }
  const users = await client.userData.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      userName: true,
    },
  });
  return new Map(users.map((user: Record<string, unknown>) => [String(user.id), user]));
};

type StaffMemberRateContext = {
  staffMembersById: Map<string, { id: string; userId: string | null; roleId: string | null }>;
  staffRatesByStaffId: Map<string, any[]>;
  roleRatesByRoleId: Map<string, any[]>;
};

const loadStaffMemberRateContext = async (
  client: PrismaLike,
  organizationId: string,
  staffMemberIds: string[],
  roleIds: string[],
): Promise<StaffMemberRateContext> => {
  const staffMembers = staffMemberIds.length
    ? await client.staffMembers.findMany({
      where: {
        organizationId,
        id: { in: staffMemberIds },
      },
      select: {
        id: true,
        userId: true,
        roleId: true,
      },
    })
    : [];
  const allRoleIds = normalizeIds([...roleIds, ...staffMembers.map((staffMember: any) => staffMember.roleId)]);

  const [staffRates, roleRates] = await Promise.all([
    staffMemberIds.length
      ? client.staffCompensationRates.findMany({
        where: {
          organizationId,
          staffMemberId: { in: staffMemberIds },
        },
        orderBy: { effectiveFrom: 'desc' },
      })
      : Promise.resolve([]),
    allRoleIds.length
      ? client.organizationRoleCompensationRates.findMany({
        where: {
          organizationId,
          organizationRoleId: { in: allRoleIds },
        },
        orderBy: { effectiveFrom: 'desc' },
      })
      : Promise.resolve([]),
  ]);

  const staffRatesByStaffId = new Map<string, any[]>();
  staffRates.forEach((row: any) => {
    staffRatesByStaffId.set(row.staffMemberId, [...(staffRatesByStaffId.get(row.staffMemberId) ?? []), row]);
  });
  const roleRatesByRoleId = new Map<string, any[]>();
  roleRates.forEach((row: any) => {
    roleRatesByRoleId.set(row.organizationRoleId, [...(roleRatesByRoleId.get(row.organizationRoleId) ?? []), row]);
  });

  return {
    staffMembersById: new Map(staffMembers.map((staffMember: any) => [staffMember.id, staffMember])),
    staffRatesByStaffId,
    roleRatesByRoleId,
  };
};

const activeRateAt = (rates: any[], referenceDate: Date): FinanceLaborRate | null => {
  const rate = rates.find((row) => {
    const effectiveFrom = toDate(row.effectiveFrom);
    const effectiveTo = toDate(row.effectiveTo);
    return Boolean(
      effectiveFrom
      && effectiveFrom.getTime() <= referenceDate.getTime()
      && (!effectiveTo || effectiveTo.getTime() > referenceDate.getTime())
    );
  });
  const wageType = normalizeWageType(rate?.wageType);
  if (!rate || !wageType) {
    return null;
  }
  return {
    wageType,
    amountCents: normalizeCents(rate.amountCents),
  };
};

const assignmentReferenceDate = (entry: any, fallback: Date): Date => (
  toDate(entry.actualStart)
  ?? toDate(entry.plannedStart)
  ?? fallback
);

const resolveRate = (
  entry: any,
  context: StaffMemberRateContext,
  referenceDate: Date,
): FinanceLaborRate | null => {
  const overrideType = normalizeWageType(entry.rateOverrideType);
  if (overrideType && typeof entry.rateOverrideCents === 'number') {
    return {
      wageType: overrideType,
      amountCents: normalizeCents(entry.rateOverrideCents),
    };
  }
  const staffMemberId = normalizeId(entry.staffMemberId);
  if (staffMemberId) {
    const staffRate = activeRateAt(context.staffRatesByStaffId.get(staffMemberId) ?? [], referenceDate);
    if (staffRate) {
      return staffRate;
    }
  }
  const staffMember = staffMemberId ? context.staffMembersById.get(staffMemberId) : null;
  const roleId = normalizeId(entry.organizationRoleId) ?? normalizeId(staffMember?.roleId);
  return roleId ? activeRateAt(context.roleRatesByRoleId.get(roleId) ?? [], referenceDate) : null;
};

const loadEventStaffLabor = async (
  client: PrismaLike,
  event: { id: string; organizationId: string; start: Date },
): Promise<FinanceLaborEntry[]> => {
  const rows = await client.eventStaffAssignments.findMany({
    where: {
      eventId: event.id,
      status: { not: 'CANCELLED' },
    },
  });
  const staffMemberIds = normalizeIds(rows.map((row: any) => row.staffMemberId));
  const roleIds = normalizeIds(rows.map((row: any) => row.organizationRoleId));
  const context = await loadStaffMemberRateContext(client, event.organizationId, staffMemberIds, roleIds);
  const userIds = normalizeIds(rows.map((row: any) => (
    row.userId ?? context.staffMembersById.get(row.staffMemberId)?.userId
  )));
  const usersById = await loadUsersById(client, userIds);

  return rows.map((row: any) => {
    const staffMember = context.staffMembersById.get(row.staffMemberId);
    const userId = normalizeId(row.userId) ?? normalizeId(staffMember?.userId);
    const referenceDate = assignmentReferenceDate(row, event.start);
    return {
      id: row.id,
      eventId: row.eventId,
      staffMemberId: row.staffMemberId,
      userId,
      label: displayName(userId ? usersById.get(userId) : null, `Staff ${row.staffMemberId}`),
      plannedStart: row.plannedStart,
      plannedEnd: row.plannedEnd,
      actualStart: row.actualStart,
      actualEnd: row.actualEnd,
      plannedMinutes: row.plannedMinutes,
      actualMinutes: row.actualMinutes,
      status: row.status,
      rate: resolveRate(row, context, referenceDate),
    };
  });
};

const loadTeamStaffLabor = async (
  client: PrismaLike,
  organizationId: string,
  teamIds: string[],
  eventTeamIds: string[],
): Promise<FinanceLaborEntry[]> => {
  const rows = await client.teamStaffLaborEntries.findMany({
    where: {
      organizationId,
      status: { not: 'CANCELLED' },
      OR: [
        ...(teamIds.length ? [{ teamId: { in: teamIds } }] : []),
        ...(eventTeamIds.length ? [{ eventTeamId: { in: eventTeamIds } }] : []),
      ],
    },
  });
  const staffMemberIds = normalizeIds(rows.map((row: any) => row.staffMemberId));
  const context = await loadStaffMemberRateContext(client, organizationId, staffMemberIds, []);
  const userIds = normalizeIds(rows.map((row: any) => row.userId));
  const usersById = await loadUsersById(client, userIds);
  const fallbackDate = new Date();

  return rows.map((row: any) => {
    const referenceDate = assignmentReferenceDate(row, fallbackDate);
    return {
      id: row.id,
      teamId: row.teamId,
      eventTeamId: row.eventTeamId,
      eventId: row.eventId,
      staffMemberId: row.staffMemberId,
      userId: row.userId,
      label: displayName(usersById.get(row.userId), `Team staff ${row.userId}`),
      plannedStart: row.plannedStart,
      plannedEnd: row.plannedEnd,
      actualStart: row.actualStart,
      actualEnd: row.actualEnd,
      plannedMinutes: row.plannedMinutes,
      actualMinutes: row.actualMinutes,
      status: row.status,
      rate: resolveRate(row, context, referenceDate),
    };
  });
};

const customLineItemSelect = {
  id: true,
  title: true,
  category: true,
  amountCents: true,
  eventId: true,
  teamId: true,
  eventTeamId: true,
  scope: true,
  status: true,
} as const;

const toCustomLineItem = (row: any): CustomFinanceLineItem => ({
  id: row.id,
  title: row.title,
  category: row.category,
  amountCents: row.amountCents,
  eventId: row.eventId,
  teamId: row.teamId,
  eventTeamId: row.eventTeamId,
  scope: row.scope,
  status: row.status,
});

export const loadEventFinanceSummary = async (
  eventId: string,
  client: PrismaLike = prisma,
): Promise<EventFinanceSummary | null> => {
  const event = await client.events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      organizationId: true,
      start: true,
      price: true,
      maxParticipants: true,
    },
  });
  if (!event?.organizationId) {
    return null;
  }

  const [billRows, participantCount, staffLabor, customRows] = await Promise.all([
    client.bills.findMany({
      where: { eventId },
      select: billSelect,
    }),
    client.eventRegistrations.count({
      where: {
        eventId,
        rosterRole: 'PARTICIPANT',
        status: { in: [...ACTIVE_PARTICIPANT_STATUSES] },
      },
    }),
    loadEventStaffLabor(client, {
      id: event.id,
      organizationId: event.organizationId,
      start: event.start,
    }),
    client.financialLineItems.findMany({
      where: {
        eventId,
        status: { not: 'VOID' },
      },
      select: customLineItemSelect,
    }),
  ]);

  const bills = await attachPayments(client, billRows);
  return buildEventFinanceSummary({
    eventId,
    eventPriceCents: event.price,
    maxParticipants: event.maxParticipants,
    confirmedParticipantCount: participantCount,
    bills,
    staffLabor,
    customLineItems: customRows.map(toCustomLineItem),
  });
};

export const loadTeamFinanceSummary = async (
  teamId: string,
  client: PrismaLike = prisma,
  options: { eventTeamId?: string | null } = {},
): Promise<TeamFinanceSummary | null> => {
  const team = await client.canonicalTeams.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      organizationId: true,
    },
  });
  if (!team?.organizationId) {
    return null;
  }

  const eventTeamRows = options.eventTeamId
    ? [{ id: options.eventTeamId }]
    : await client.teams.findMany({
      where: {
        parentTeamId: teamId,
      },
      select: { id: true },
    });
  const eventTeamIds = normalizeIds(eventTeamRows.map((row: any) => row.id));
  const ownerIds = normalizeIds([teamId, ...eventTeamIds]);

  const [billRows, staffLabor, customRows] = await Promise.all([
    client.bills.findMany({
      where: {
        ownerType: 'TEAM',
        ownerId: { in: ownerIds },
      },
      select: billSelect,
    }),
    loadTeamStaffLabor(client, team.organizationId, [teamId], eventTeamIds),
    client.financialLineItems.findMany({
      where: {
        status: { not: 'VOID' },
        OR: [
          { teamId },
          ...(eventTeamIds.length ? [{ eventTeamId: { in: eventTeamIds } }] : []),
        ],
      },
      select: customLineItemSelect,
    }),
  ]);

  const bills = await attachPayments(client, billRows);
  return buildTeamFinanceSummary({
    teamId,
    eventTeamId: options.eventTeamId,
    relatedEventTeamIds: eventTeamIds,
    bills,
    staffLabor,
    customLineItems: customRows.map(toCustomLineItem),
  });
};
