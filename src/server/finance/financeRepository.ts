import { prisma } from '@/lib/prisma';
import {
  buildOrganizationFinanceSummary,
  buildEventFinanceSummary,
  buildTeamFinanceSummary,
  type CustomFinanceLineItem,
  type EventFinanceSummary,
  type FinanceBill,
  type FinanceLaborEntry,
  type FinanceLaborRate,
  type FinanceWageType,
  type OrganizationFinanceSummary,
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
  createdAt: true,
  updatedAt: true,
  billId: true,
  amountCents: true,
  status: true,
  paidAt: true,
  payerUserId: true,
  refundedAmountCents: true,
  stripeProcessingFeeCents: true,
  stripeTaxServiceFeeCents: true,
} as const;

const billSelect = {
  id: true,
  createdAt: true,
  organizationId: true,
  ownerType: true,
  ownerId: true,
  eventId: true,
  slotId: true,
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
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      amountCents: payment.amountCents,
      status: payment.status,
      paidAt: payment.paidAt,
      payerUserId: payment.payerUserId,
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
  if (!rows.length) {
    return [];
  }
  const billIds = rows.map((row) => row.id);
  const paymentsByBillId = await loadPaymentsByBillId(client, billIds);
  const payments = [...paymentsByBillId.values()].flat();
  const eventIds = normalizeIds(rows.map((row) => row.eventId));
  const slotIds = normalizeIds(rows.map((row) => row.slotId));
  const teamOwnerIds = normalizeIds(rows
    .filter((row) => String(row.ownerType ?? '').toUpperCase() === 'TEAM')
    .map((row) => row.ownerId));
  const userOwnerIds = normalizeIds(rows
    .filter((row) => String(row.ownerType ?? '').toUpperCase() === 'USER')
    .map((row) => row.ownerId));
  const payerUserIds = normalizeIds(payments.map((payment) => payment?.payerUserId));

  const [eventRows, userRows, canonicalTeamRows, eventTeamRows, slotRows] = await Promise.all([
    eventIds.length
      ? client.events.findMany({
        where: { id: { in: eventIds } },
        select: { id: true, name: true },
      })
      : Promise.resolve([]),
    normalizeIds([...userOwnerIds, ...payerUserIds]).length
      ? client.userData.findMany({
        where: { id: { in: normalizeIds([...userOwnerIds, ...payerUserIds]) } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          userName: true,
        },
      })
      : Promise.resolve([]),
    teamOwnerIds.length
      ? client.canonicalTeams.findMany({
        where: { id: { in: teamOwnerIds } },
        select: { id: true, name: true },
      })
      : Promise.resolve([]),
    teamOwnerIds.length
      ? client.teams.findMany({
        where: { id: { in: teamOwnerIds } },
        select: { id: true, name: true, parentTeamId: true },
      })
      : Promise.resolve([]),
    slotIds.length
      ? client.timeSlots.findMany({
        where: { id: { in: slotIds } },
        select: {
          id: true,
          scheduledFieldId: true,
          scheduledFieldIds: true,
        },
      })
      : Promise.resolve([]),
  ]);

  const eventNamesById = new Map<string, string>(
    eventRows.map((event: any) => [String(event.id), String(event.name ?? '').trim()]),
  );
  const usersById = new Map<string, Record<string, unknown>>(
    userRows.map((user: Record<string, unknown>) => [String(user.id), user]),
  );
  const canonicalTeamsById = new Map<string, { name?: unknown; parentTeamId?: unknown }>(
    canonicalTeamRows.map((team: any) => [String(team.id), team]),
  );
  const eventTeamsById = new Map<string, { name?: unknown; parentTeamId?: unknown }>(
    eventTeamRows.map((team: any) => [String(team.id), team]),
  );
  const fieldIds = normalizeIds(slotRows.flatMap((slot: any) => [
    slot.scheduledFieldId,
    ...(Array.isArray(slot.scheduledFieldIds) ? slot.scheduledFieldIds : []),
  ]));
  const fieldRows = fieldIds.length
    ? await client.fields.findMany({
      where: { id: { in: fieldIds } },
      select: { id: true, name: true },
    })
    : [];
  const fieldNamesById = new Map<string, string>(
    fieldRows.map((field: any) => [String(field.id), String(field.name ?? '').trim()]),
  );
  const sourceNameBySlotId = new Map<string, string>();
  slotRows.forEach((slot: any) => {
    const slotFieldIds = normalizeIds([
      slot.scheduledFieldId,
      ...(Array.isArray(slot.scheduledFieldIds) ? slot.scheduledFieldIds : []),
    ]);
    const fieldName = slotFieldIds.map((fieldId) => fieldNamesById.get(fieldId)).find(Boolean);
    sourceNameBySlotId.set(String(slot.id), fieldName || 'Rental');
  });

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    organizationId: row.organizationId,
    ownerType: row.ownerType,
    ownerId: row.ownerId,
    eventId: row.eventId,
    slotId: row.slotId,
    sourceName: row.eventId
      ? eventNamesById.get(String(row.eventId)) || 'Event'
      : row.slotId
        ? sourceNameBySlotId.get(String(row.slotId)) || 'Rental'
        : 'Organization',
    sourceEntityType: row.eventId ? 'event' : row.slotId ? 'rental' : row.organizationId ? 'organization' : null,
    sourceEntityId: row.eventId ?? row.slotId ?? row.organizationId ?? null,
    customerType: (() => {
      const ownerType = String(row.ownerType ?? '').toUpperCase();
      if (ownerType === 'TEAM') return 'teams' as const;
      if (ownerType === 'USER') return 'users' as const;
      const payerUserId = (paymentsByBillId.get(row.id) ?? []).find((payment) => payment?.payerUserId)?.payerUserId;
      return payerUserId ? 'users' as const : null;
    })(),
    customerId: (() => {
      const ownerType = String(row.ownerType ?? '').toUpperCase();
      if (ownerType === 'TEAM') {
        const eventTeam = eventTeamsById.get(String(row.ownerId));
        return normalizeId(eventTeam?.parentTeamId) ?? normalizeId(row.ownerId);
      }
      if (ownerType === 'USER') {
        return normalizeId(row.ownerId);
      }
      const payerUserId = (paymentsByBillId.get(row.id) ?? []).find((payment) => payment?.payerUserId)?.payerUserId;
      return normalizeId(payerUserId);
    })(),
    customerName: (() => {
      const ownerType = String(row.ownerType ?? '').toUpperCase();
      if (ownerType === 'TEAM') {
        const canonicalTeam = canonicalTeamsById.get(String(row.ownerId));
        const eventTeam = eventTeamsById.get(String(row.ownerId));
        if (canonicalTeam?.name) {
          return String(canonicalTeam.name);
        }
        if (eventTeam?.parentTeamId) {
          const parentTeam = canonicalTeamsById.get(String(eventTeam.parentTeamId));
          if (parentTeam?.name) {
            return String(parentTeam.name);
          }
        }
        return eventTeam?.name ? String(eventTeam.name) : 'Team';
      }
      if (ownerType === 'USER') {
        return displayName(usersById.get(String(row.ownerId)), 'Customer');
      }
      const payerUserId = (paymentsByBillId.get(row.id) ?? []).find((payment) => payment?.payerUserId)?.payerUserId;
      return payerUserId ? displayName(usersById.get(String(payerUserId)), 'Customer') : null;
    })(),
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

const isPlannedLabor = (entry: any): boolean => {
  const status = String(entry.status ?? '').trim().toUpperCase();
  return status === '' || status === 'PLANNED' || status === 'SCHEDULED';
};

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
  event: { id: string; organizationId: string; start: Date; name?: string | null },
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
      sourceType: 'EVENT_STAFF_ASSIGNMENT',
      eventId: row.eventId,
      eventName: event.name ?? null,
      staffMemberId: row.staffMemberId,
      userId,
      userName: displayName(userId ? usersById.get(userId) : null, `Staff ${row.staffMemberId}`),
      label: displayName(userId ? usersById.get(userId) : null, `Staff ${row.staffMemberId}`),
      plannedStart: row.plannedStart ?? (isPlannedLabor(row) ? event.start : null),
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
  const eventIds = normalizeIds(rows.map((row: any) => row.eventId));
  const eventsById: Map<string, { start: Date | null; name: string | null }> = eventIds.length
    ? new Map<string, { start: Date | null; name: string | null }>((await client.events.findMany({
      where: { id: { in: eventIds } },
      select: { id: true, start: true, name: true },
    })).map((event: any) => [String(event.id), { start: toDate(event.start), name: String(event.name ?? '').trim() || null }]))
    : new Map<string, { start: Date | null; name: string | null }>();
  const laborTeamIds = normalizeIds(rows.map((row: any) => row.teamId));
  const laborEventTeamIds = normalizeIds(rows.map((row: any) => row.eventTeamId));
  const [teamRows, eventTeamRows] = await Promise.all([
    laborTeamIds.length
      ? client.canonicalTeams.findMany({
        where: { id: { in: laborTeamIds } },
        select: { id: true, name: true },
      })
      : Promise.resolve([]),
    laborEventTeamIds.length
      ? client.teams.findMany({
        where: { id: { in: laborEventTeamIds } },
        select: { id: true, name: true },
      })
      : Promise.resolve([]),
  ]);
  const teamNamesById = new Map(teamRows.map((team: any) => [String(team.id), String(team.name ?? '').trim() || null]));
  const eventTeamNamesById = new Map(eventTeamRows.map((team: any) => [String(team.id), String(team.name ?? '').trim() || null]));

  return rows.map((row: any) => {
    const event = row.eventId ? eventsById.get(row.eventId) : null;
    const eventStart = event?.start ?? null;
    const plannedStart = row.plannedStart ?? (isPlannedLabor(row) ? eventStart : null);
    const referenceDate = assignmentReferenceDate({ ...row, plannedStart }, eventStart ?? fallbackDate);
    const userName = displayName(usersById.get(row.userId), `Team staff ${row.userId}`);
    return {
      id: row.id,
      sourceType: 'TEAM_STAFF_LABOR',
      teamId: row.teamId,
      teamName: row.teamId ? teamNamesById.get(row.teamId) ?? null : null,
      eventTeamId: row.eventTeamId,
      eventTeamName: row.eventTeamId ? eventTeamNamesById.get(row.eventTeamId) ?? null : null,
      eventId: row.eventId,
      eventName: event?.name ?? null,
      staffMemberId: row.staffMemberId,
      userId: row.userId,
      userName,
      label: userName,
      plannedStart,
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
  description: true,
  category: true,
  amountCents: true,
  quantity: true,
  unitLabel: true,
  organizationId: true,
  eventId: true,
  teamId: true,
  eventTeamId: true,
  scope: true,
  status: true,
  occurredAt: true,
  serviceStartAt: true,
  serviceEndAt: true,
} as const;

const toCustomLineItem = (row: any): CustomFinanceLineItem => ({
  id: row.id,
  title: row.title,
  description: row.description,
  category: row.category,
  amountCents: row.amountCents,
  quantity: row.quantity,
  unitLabel: row.unitLabel,
  organizationId: row.organizationId,
  eventId: row.eventId,
  teamId: row.teamId,
  eventTeamId: row.eventTeamId,
  scope: row.scope,
  status: row.status,
  occurredAt: row.occurredAt,
  serviceStartAt: row.serviceStartAt,
  serviceEndAt: row.serviceEndAt,
});

export const loadOrganizationStaffLaborEntries = async (
  organizationId: string,
  client: PrismaLike = prisma,
): Promise<FinanceLaborEntry[]> => {
  const [eventRows, teamRows] = await Promise.all([
    client.eventStaffAssignments.findMany({
      where: {
        organizationId,
        status: { not: 'CANCELLED' },
      },
    }),
    client.teamStaffLaborEntries.findMany({
      where: {
        organizationId,
        status: { not: 'CANCELLED' },
      },
    }),
  ]);

  const eventIds = normalizeIds([
    ...eventRows.map((row: any) => row.eventId),
    ...teamRows.map((row: any) => row.eventId),
  ]);
  const eventsById: Map<string, { start: Date | null; name: string | null }> = eventIds.length
    ? new Map<string, { start: Date | null; name: string | null }>((await client.events.findMany({
      where: {
        id: { in: eventIds },
        organizationId,
      },
      select: { id: true, start: true, name: true },
    })).map((event: any) => [String(event.id), { start: toDate(event.start), name: String(event.name ?? '').trim() || null }]))
    : new Map<string, { start: Date | null; name: string | null }>();

  const staffMemberIds = normalizeIds([
    ...eventRows.map((row: any) => row.staffMemberId),
    ...teamRows.map((row: any) => row.staffMemberId),
  ]);
  const roleIds = normalizeIds(eventRows.map((row: any) => row.organizationRoleId));
  const context = await loadStaffMemberRateContext(client, organizationId, staffMemberIds, roleIds);
  const userIds = normalizeIds([
    ...eventRows.map((row: any) => (
      row.userId ?? context.staffMembersById.get(row.staffMemberId)?.userId
    )),
    ...teamRows.map((row: any) => row.userId),
  ]);
  const usersById = await loadUsersById(client, userIds);
  const teamIds = normalizeIds(teamRows.map((row: any) => row.teamId));
  const eventTeamIds = normalizeIds(teamRows.map((row: any) => row.eventTeamId));
  const [canonicalTeamRows, eventTeamRows] = await Promise.all([
    teamIds.length
      ? client.canonicalTeams.findMany({
        where: { id: { in: teamIds } },
        select: { id: true, name: true },
      })
      : Promise.resolve([]),
    eventTeamIds.length
      ? client.teams.findMany({
        where: { id: { in: eventTeamIds } },
        select: { id: true, name: true },
      })
      : Promise.resolve([]),
  ]);
  const teamNamesById = new Map(canonicalTeamRows.map((team: any) => [String(team.id), String(team.name ?? '').trim() || null]));
  const eventTeamNamesById = new Map(eventTeamRows.map((team: any) => [String(team.id), String(team.name ?? '').trim() || null]));
  const fallbackDate = new Date();

  const eventLabor: FinanceLaborEntry[] = eventRows.map((row: any) => {
    const staffMember = context.staffMembersById.get(row.staffMemberId);
    const userId = normalizeId(row.userId) ?? normalizeId(staffMember?.userId);
    const event = row.eventId ? eventsById.get(row.eventId) : null;
    const eventStart = event?.start ?? null;
    const plannedStart = row.plannedStart ?? (isPlannedLabor(row) ? eventStart : null);
    const referenceDate = assignmentReferenceDate({ ...row, plannedStart }, eventStart ?? fallbackDate);
    const userName = displayName(userId ? usersById.get(userId) : null, `Staff ${row.staffMemberId}`);
    return {
      id: row.id,
      sourceType: 'EVENT_STAFF_ASSIGNMENT',
      eventId: row.eventId,
      eventName: event?.name ?? null,
      staffMemberId: row.staffMemberId,
      userId,
      userName,
      label: userName,
      plannedStart,
      plannedEnd: row.plannedEnd,
      actualStart: row.actualStart,
      actualEnd: row.actualEnd,
      plannedMinutes: row.plannedMinutes,
      actualMinutes: row.actualMinutes,
      status: row.status,
      rate: resolveRate(row, context, referenceDate),
    };
  });

  const teamLabor: FinanceLaborEntry[] = teamRows.map((row: any) => {
    const event = row.eventId ? eventsById.get(row.eventId) : null;
    const eventStart = event?.start ?? null;
    const plannedStart = row.plannedStart ?? (isPlannedLabor(row) ? eventStart : null);
    const referenceDate = assignmentReferenceDate({ ...row, plannedStart }, eventStart ?? fallbackDate);
    const userName = displayName(usersById.get(row.userId), `Team staff ${row.userId}`);
    return {
      id: row.id,
      sourceType: 'TEAM_STAFF_LABOR',
      teamId: row.teamId,
      teamName: row.teamId ? teamNamesById.get(row.teamId) ?? null : null,
      eventTeamId: row.eventTeamId,
      eventTeamName: row.eventTeamId ? eventTeamNamesById.get(row.eventTeamId) ?? null : null,
      eventId: row.eventId,
      eventName: event?.name ?? null,
      staffMemberId: row.staffMemberId,
      userId: row.userId,
      userName,
      label: userName,
      plannedStart,
      plannedEnd: row.plannedEnd,
      actualStart: row.actualStart,
      actualEnd: row.actualEnd,
      plannedMinutes: row.plannedMinutes,
      actualMinutes: row.actualMinutes,
      status: row.status,
      rate: resolveRate(row, context, referenceDate),
    };
  });

  return [...eventLabor, ...teamLabor];
};

export const loadEventFinanceSummary = async (
  eventId: string,
  client: PrismaLike = prisma,
): Promise<EventFinanceSummary | null> => {
  const event = await client.events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
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
      name: event.name,
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
    eventStart: event.start,
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

export const loadOrganizationFinanceSummary = async (
  organizationId: string,
  client: PrismaLike = prisma,
  options: { from?: string | Date | null; to?: string | Date | null } = {},
): Promise<OrganizationFinanceSummary | null> => {
  const organization = await client.organizations.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
    },
  });
  if (!organization) {
    return null;
  }

  const eventRows = await client.events.findMany({
    where: { organizationId },
    select: { id: true },
  });
  const eventIds = normalizeIds(eventRows.map((event: any) => event.id));

  const [billRows, staffLabor, customRows] = await Promise.all([
    client.bills.findMany({
      where: eventIds.length
        ? {
          OR: [
            { organizationId },
            { eventId: { in: eventIds } },
          ],
        }
        : { organizationId },
      select: billSelect,
    }),
    loadOrganizationStaffLaborEntries(organizationId, client),
    client.financialLineItems.findMany({
      where: {
        organizationId,
        status: { not: 'VOID' },
      },
      select: customLineItemSelect,
    }),
  ]);

  const bills = await attachPayments(client, billRows);
  return buildOrganizationFinanceSummary({
    organizationId,
    bills,
    staffLabor,
    customLineItems: customRows.map(toCustomLineItem),
    from: options.from,
    to: options.to,
  });
};

export const listOrganizationFinancialLineItemCategories = async (
  organizationId: string,
  client: PrismaLike = prisma,
): Promise<string[]> => {
  const rows = await client.financialLineItems.findMany({
    where: {
      organizationId,
      status: { not: 'VOID' },
    },
    select: { category: true },
    orderBy: { category: 'asc' },
  });

  const categoriesByKey = new Map<string, string>();
  rows.forEach((row: { category?: string | null }) => {
    const category = row.category?.trim();
    if (!category) {
      return;
    }
    const key = category.toLowerCase();
    if (!categoriesByKey.has(key)) {
      categoriesByKey.set(key, category);
    }
  });
  return [...categoriesByKey.values()].sort((a, b) => a.localeCompare(b));
};
