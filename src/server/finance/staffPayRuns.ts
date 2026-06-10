import { prisma } from '@/lib/prisma';
import {
  resolveFinanceLaborCostCents,
  resolveFinanceLaborMinutes,
  type FinanceLaborEntry,
} from '@/server/finance/financeAnalysis';
import { loadOrganizationStaffLaborEntries } from '@/server/finance/financeRepository';

type PrismaLike = any;

type StaffPayRunAction = 'APPROVE' | 'MARK_PAID' | 'VOID';

export class StaffPayRunError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'StaffPayRunError';
    this.status = status;
  }
}

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;

const parseDate = (value: unknown, fieldName: string): Date => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  throw new StaffPayRunError(400, `${fieldName} must be a valid date.`);
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

const sourceStartDate = (entry: FinanceLaborEntry): Date | null => (
  toDate(entry.actualStart)
  ?? toDate(entry.plannedStart)
  ?? toDate(entry.actualEnd)
  ?? toDate(entry.plannedEnd)
);

const sourceEndDate = (entry: FinanceLaborEntry): Date | null => (
  toDate(entry.actualEnd)
  ?? toDate(entry.plannedEnd)
  ?? sourceStartDate(entry)
);

const isEntryInPeriod = (
  entry: FinanceLaborEntry,
  periodStart: Date,
  periodEnd: Date,
): boolean => {
  const sourceDate = sourceStartDate(entry);
  if (!sourceDate) {
    return false;
  }
  return sourceDate.getTime() >= periodStart.getTime()
    && sourceDate.getTime() <= periodEnd.getTime();
};

const normalizeTitle = (value: unknown, periodStart: Date, periodEnd: Date): string => {
  if (typeof value === 'string' && value.trim()) {
    return value.trim().slice(0, 140);
  }
  return `Staff pay run ${periodStart.toLocaleDateString()} - ${periodEnd.toLocaleDateString()}`;
};

const mapPayRun = (row: any) => ({
  ...row,
  items: Array.isArray(row.items) ? row.items : [],
});

const attachPayRunItems = async (
  payRuns: any[],
  organizationId: string,
  client: PrismaLike,
) => {
  const payRunIds = payRuns.map((row) => row.id).filter((value): value is string => typeof value === 'string');
  if (!payRunIds.length) {
    return payRuns.map(mapPayRun);
  }

  const items = await client.staffPayRunItem.findMany({
    where: {
      organizationId,
      payRunId: { in: payRunIds },
    },
    orderBy: [{ serviceStartAt: 'asc' }, { createdAt: 'asc' }],
  });
  const itemsByPayRunId = new Map<string, any[]>();
  items.forEach((item: any) => {
    itemsByPayRunId.set(item.payRunId, [...(itemsByPayRunId.get(item.payRunId) ?? []), item]);
  });
  return payRuns.map((payRun) => mapPayRun({
    ...payRun,
    items: itemsByPayRunId.get(payRun.id) ?? [],
  }));
};

export const listStaffPayRuns = async (
  organizationId: string,
  client: PrismaLike = prisma,
) => {
  const rows = await client.staffPayRun.findMany({
    where: { organizationId },
    orderBy: [{ createdAt: 'desc' }],
    take: 25,
  });
  return attachPayRunItems(rows, organizationId, client);
};

export const createDraftStaffPayRun = async (
  input: {
    organizationId: string;
    periodStart: string | Date;
    periodEnd: string | Date;
    title?: string | null;
    notes?: string | null;
    actingUserId: string;
  },
  client: PrismaLike = prisma,
) => {
  const periodStart = parseDate(input.periodStart, 'periodStart');
  const periodEnd = parseDate(input.periodEnd, 'periodEnd');
  if (periodEnd.getTime() < periodStart.getTime()) {
    throw new StaffPayRunError(400, 'periodEnd must be on or after periodStart.');
  }

  const organization = await client.organizations.findUnique({
    where: { id: input.organizationId },
    select: { id: true },
  });
  if (!organization) {
    throw new StaffPayRunError(404, 'Organization not found.');
  }

  const [laborEntries, existingItems] = await Promise.all([
    loadOrganizationStaffLaborEntries(input.organizationId, client),
    client.staffPayRunItem.findMany({
      where: { organizationId: input.organizationId },
      select: {
        eventStaffAssignmentId: true,
        teamStaffLaborEntryId: true,
      },
    }),
  ]);

  const paidEventLaborIds = new Set(
    existingItems
      .map((item: any) => item.eventStaffAssignmentId)
      .filter((value: unknown): value is string => typeof value === 'string' && Boolean(value)),
  );
  const paidTeamLaborIds = new Set(
    existingItems
      .map((item: any) => item.teamStaffLaborEntryId)
      .filter((value: unknown): value is string => typeof value === 'string' && Boolean(value)),
  );

  const itemInputs = laborEntries
    .filter((entry) => isEntryInPeriod(entry, periodStart, periodEnd))
    .filter((entry) => {
      if (entry.sourceType === 'EVENT_STAFF_ASSIGNMENT') {
        return !paidEventLaborIds.has(entry.id);
      }
      if (entry.sourceType === 'TEAM_STAFF_LABOR') {
        return !paidTeamLaborIds.has(entry.id);
      }
      return false;
    })
    .map((entry) => {
      const resolved = resolveFinanceLaborCostCents(entry);
      const amountCents = resolved.costCents ?? 0;
      if (!entry.userId || amountCents <= 0 || resolved.warning) {
        return null;
      }
      return {
        id: createId('staff_pay_run_item'),
        organizationId: input.organizationId,
        staffMemberId: entry.staffMemberId ?? null,
        userId: entry.userId,
        eventId: entry.eventId ?? null,
        teamId: entry.teamId ?? null,
        eventTeamId: entry.eventTeamId ?? null,
        eventStaffAssignmentId: entry.sourceType === 'EVENT_STAFF_ASSIGNMENT' ? entry.id : null,
        teamStaffLaborEntryId: entry.sourceType === 'TEAM_STAFF_LABOR' ? entry.id : null,
        label: entry.label,
        wageType: entry.rate?.wageType ?? null,
        rateCents: entry.rate?.amountCents ?? null,
        paidMinutes: resolveFinanceLaborMinutes(entry),
        amountCents,
        serviceStartAt: sourceStartDate(entry),
        serviceEndAt: sourceEndDate(entry),
        status: 'DRAFT',
        payoutStatus: 'NOT_STARTED',
        createdBy: input.actingUserId,
        updatedBy: input.actingUserId,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (!itemInputs.length) {
    throw new StaffPayRunError(400, 'No unpaid staff labor was found for this pay period.');
  }

  const totalAmountCents = itemInputs.reduce((sum, item) => sum + item.amountCents, 0);
  const now = new Date();
  return client.$transaction(async (tx: PrismaLike) => {
    const payRun = await tx.staffPayRun.create({
      data: {
        id: createId('staff_pay_run'),
        organizationId: input.organizationId,
        title: normalizeTitle(input.title, periodStart, periodEnd),
        periodStart,
        periodEnd,
        status: 'DRAFT',
        payoutStatus: 'NOT_STARTED',
        totalAmountCents,
        itemCount: itemInputs.length,
        notes: typeof input.notes === 'string' && input.notes.trim() ? input.notes.trim() : null,
        createdBy: input.actingUserId,
        updatedBy: input.actingUserId,
        createdAt: now,
        updatedAt: now,
      },
    });
    const items = await Promise.all(itemInputs.map((item) => (
      tx.staffPayRunItem.create({
        data: {
          ...item,
          payRunId: payRun.id,
          createdAt: now,
          updatedAt: now,
        },
      })
    )));
    return {
      ...payRun,
      items,
    };
  });
};

export const updateStaffPayRunStatus = async (
  input: {
    organizationId: string;
    payRunId: string;
    action: StaffPayRunAction;
    actingUserId: string;
  },
  client: PrismaLike = prisma,
) => {
  const payRun = await client.staffPayRun.findFirst({
    where: {
      id: input.payRunId,
      organizationId: input.organizationId,
    },
    select: {
      id: true,
      status: true,
    },
  });
  if (!payRun) {
    throw new StaffPayRunError(404, 'Pay run not found.');
  }

  const now = new Date();
  const updateForAction = {
    APPROVE: {
      status: 'APPROVED',
      approvedAt: now,
      approvedByUserId: input.actingUserId,
      updatedBy: input.actingUserId,
    },
    MARK_PAID: {
      status: 'PAID',
      payoutStatus: 'PAID',
      paidAt: now,
      paidByUserId: input.actingUserId,
      updatedBy: input.actingUserId,
    },
    VOID: {
      status: 'VOID',
      payoutStatus: 'CANCELLED',
      updatedBy: input.actingUserId,
    },
  }[input.action];

  const itemUpdateForAction = {
    APPROVE: {
      status: 'APPROVED',
      approvedAt: now,
      approvedByUserId: input.actingUserId,
      updatedBy: input.actingUserId,
    },
    MARK_PAID: {
      status: 'PAID',
      payoutStatus: 'PAID',
      paidAt: now,
      paidByUserId: input.actingUserId,
      updatedBy: input.actingUserId,
    },
    VOID: {
      status: 'VOID',
      payoutStatus: 'CANCELLED',
      updatedBy: input.actingUserId,
    },
  }[input.action];

  return client.$transaction(async (tx: PrismaLike) => {
    const updated = await tx.staffPayRun.update({
      where: { id: input.payRunId },
      data: updateForAction,
    });
    await tx.staffPayRunItem.updateMany({
      where: {
        payRunId: input.payRunId,
        organizationId: input.organizationId,
      },
      data: itemUpdateForAction,
    });
    const items = await tx.staffPayRunItem.findMany({
      where: { payRunId: input.payRunId },
      orderBy: [{ serviceStartAt: 'asc' }, { createdAt: 'asc' }],
    });
    return {
      ...updated,
      items,
    };
  });
};
