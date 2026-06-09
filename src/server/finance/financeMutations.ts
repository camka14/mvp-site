import { prisma } from '@/lib/prisma';

type PrismaLike = any;

type CompensationWageType = 'HOURLY' | 'SALARY' | 'FLAT_PER_EVENT';
type StaffLaborStatus = 'PLANNED' | 'ACTUAL' | 'CANCELLED';
type FinancialLineItemScope = 'ORGANIZATION' | 'EVENT' | 'TEAM' | 'EVENT_TEAM';
type FinancialLineItemStatus = 'ESTIMATED' | 'APPROVED' | 'ACTUAL' | 'PAID' | 'VOID';

export class FinanceMutationError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'FinanceMutationError';
    this.status = status;
  }
}

type CompensationRateInput = {
  organizationId: string;
  targetType: 'ROLE' | 'STAFF';
  targetId: string;
  wageType: CompensationWageType;
  amountCents: number;
  effectiveFrom?: string | Date | null;
  effectiveTo?: string | Date | null;
  actingUserId: string;
};

type LaborInput = {
  plannedStart?: string | Date | null;
  plannedEnd?: string | Date | null;
  actualStart?: string | Date | null;
  actualEnd?: string | Date | null;
  plannedMinutes?: number | null;
  actualMinutes?: number | null;
  rateOverrideType?: CompensationWageType | null;
  rateOverrideCents?: number | null;
  status?: StaffLaborStatus | null;
  notes?: string | null;
};

type EventStaffAssignmentInput = LaborInput & {
  eventId: string;
  staffMemberId: string;
  organizationRoleId?: string | null;
  userId?: string | null;
  actingUserId: string;
};

type TeamStaffLaborInput = LaborInput & {
  teamId: string;
  eventTeamId?: string | null;
  eventId?: string | null;
  staffMemberId?: string | null;
  userId: string;
  teamStaffAssignmentId?: string | null;
  eventTeamStaffAssignmentId?: string | null;
  actingUserId: string;
};

type FinancialLineItemInput = {
  organizationId: string;
  scope: FinancialLineItemScope;
  category: string;
  title: string;
  description?: string | null;
  amountCents: number;
  quantity?: number | null;
  unitLabel?: string | null;
  status?: FinancialLineItemStatus | null;
  occurredAt?: string | Date | null;
  eventId?: string | null;
  teamId?: string | null;
  eventTeamId?: string | null;
  actingUserId: string;
};

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};

const parseDate = (value: unknown, fieldName: string): Date | null => {
  if (value == null || value === '') {
    return null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  throw new FinanceMutationError(400, `${fieldName} must be a valid date.`);
};

const normalizePositiveCents = (value: number, fieldName: string): number => {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new FinanceMutationError(400, `${fieldName} must be a positive whole-cent amount.`);
  }
  return value;
};

const normalizeOptionalText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};

const normalizeMinutes = (value: number | null | undefined, fieldName: string): number | null => {
  if (value == null) {
    return null;
  }
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new FinanceMutationError(400, `${fieldName} must be a positive whole number of minutes.`);
  }
  return value;
};

const assertOrderedRange = (start: Date | null, end: Date | null, label: string): void => {
  if (start && end && end.getTime() <= start.getTime()) {
    throw new FinanceMutationError(400, `${label} end must be after ${label} start.`);
  }
};

const normalizeLaborData = (input: LaborInput) => {
  const plannedStart = parseDate(input.plannedStart, 'plannedStart');
  const plannedEnd = parseDate(input.plannedEnd, 'plannedEnd');
  const actualStart = parseDate(input.actualStart, 'actualStart');
  const actualEnd = parseDate(input.actualEnd, 'actualEnd');
  assertOrderedRange(plannedStart, plannedEnd, 'Planned');
  assertOrderedRange(actualStart, actualEnd, 'Actual');

  if ((input.rateOverrideType && input.rateOverrideCents == null)
    || (!input.rateOverrideType && input.rateOverrideCents != null)) {
    throw new FinanceMutationError(400, 'rateOverrideType and rateOverrideCents must be provided together.');
  }

  return {
    plannedStart,
    plannedEnd,
    actualStart,
    actualEnd,
    plannedMinutes: normalizeMinutes(input.plannedMinutes, 'plannedMinutes'),
    actualMinutes: normalizeMinutes(input.actualMinutes, 'actualMinutes'),
    rateOverrideType: input.rateOverrideType ?? null,
    rateOverrideCents: input.rateOverrideCents == null
      ? null
      : normalizePositiveCents(input.rateOverrideCents, 'rateOverrideCents'),
    status: input.status ?? 'PLANNED',
    notes: normalizeOptionalText(input.notes),
  };
};

const effectiveWindow = (
  effectiveFromInput: string | Date | null | undefined,
  effectiveToInput: string | Date | null | undefined,
): { effectiveFrom: Date; effectiveTo: Date | null } => {
  const effectiveFrom = parseDate(effectiveFromInput, 'effectiveFrom') ?? new Date();
  const effectiveTo = parseDate(effectiveToInput, 'effectiveTo');
  if (effectiveTo && effectiveTo.getTime() <= effectiveFrom.getTime()) {
    throw new FinanceMutationError(400, 'effectiveTo must be after effectiveFrom.');
  }
  return { effectiveFrom, effectiveTo };
};

const closePriorCompensationRates = async (
  delegate: { findMany: (args: any) => Promise<any[]>; updateMany: (args: any) => Promise<unknown> },
  targetWhere: Record<string, string>,
  effectiveFrom: Date,
  effectiveTo: Date | null,
  actingUserId: string,
): Promise<void> => {
  const overlapWindow: Record<string, unknown> = effectiveTo
    ? { lt: effectiveTo }
    : {};
  const overlapping = await delegate.findMany({
    where: {
      ...targetWhere,
      ...(effectiveTo ? { effectiveFrom: overlapWindow } : {}),
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gt: effectiveFrom } },
      ],
    },
    select: {
      id: true,
      effectiveFrom: true,
    },
  });
  const futureOverlap = overlapping.find((row) => row.effectiveFrom.getTime() >= effectiveFrom.getTime());
  if (futureOverlap) {
    throw new FinanceMutationError(409, 'Compensation rate overlaps an existing future rate.');
  }

  await delegate.updateMany({
    where: {
      ...targetWhere,
      effectiveFrom: { lt: effectiveFrom },
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gt: effectiveFrom } },
      ],
    },
    data: {
      effectiveTo: effectiveFrom,
      updatedBy: actingUserId,
      updatedAt: new Date(),
    },
  });
};

export const createCompensationRate = async (
  input: CompensationRateInput,
  client: PrismaLike = prisma,
) => {
  const organizationId = normalizeId(input.organizationId);
  const targetId = normalizeId(input.targetId);
  if (!organizationId || !targetId) {
    throw new FinanceMutationError(400, 'organizationId and targetId are required.');
  }
  const amountCents = normalizePositiveCents(input.amountCents, 'amountCents');
  const { effectiveFrom, effectiveTo } = effectiveWindow(input.effectiveFrom, input.effectiveTo);
  const now = new Date();

  return client.$transaction(async (tx: PrismaLike) => {
    if (input.targetType === 'ROLE') {
      const role = await tx.organizationRoles.findFirst({
        where: {
          id: targetId,
          organizationId,
        },
        select: { id: true },
      });
      if (!role) {
        throw new FinanceMutationError(404, 'Organization role not found.');
      }
      await closePriorCompensationRates(
        tx.organizationRoleCompensationRates,
        { organizationId, organizationRoleId: targetId },
        effectiveFrom,
        effectiveTo,
        input.actingUserId,
      );
      return tx.organizationRoleCompensationRates.create({
        data: {
          id: createId('org_role_rate'),
          organizationId,
          organizationRoleId: targetId,
          wageType: input.wageType,
          amountCents,
          effectiveFrom,
          effectiveTo,
          createdBy: input.actingUserId,
          updatedBy: input.actingUserId,
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    const staffMember = await tx.staffMembers.findFirst({
      where: {
        id: targetId,
        organizationId,
      },
      select: { id: true },
    });
    if (!staffMember) {
      throw new FinanceMutationError(404, 'Staff member not found.');
    }
    await closePriorCompensationRates(
      tx.staffCompensationRates,
      { organizationId, staffMemberId: targetId },
      effectiveFrom,
      effectiveTo,
      input.actingUserId,
    );
    return tx.staffCompensationRates.create({
      data: {
        id: createId('staff_rate'),
        organizationId,
        staffMemberId: targetId,
        wageType: input.wageType,
        amountCents,
        effectiveFrom,
        effectiveTo,
        createdBy: input.actingUserId,
        updatedBy: input.actingUserId,
        createdAt: now,
        updatedAt: now,
      },
    });
  });
};

export const createEventStaffAssignment = async (
  input: EventStaffAssignmentInput,
  client: PrismaLike = prisma,
) => {
  const eventId = normalizeId(input.eventId);
  const staffMemberId = normalizeId(input.staffMemberId);
  if (!eventId || !staffMemberId) {
    throw new FinanceMutationError(400, 'eventId and staffMemberId are required.');
  }
  const event = await client.events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      organizationId: true,
    },
  });
  if (!event) {
    throw new FinanceMutationError(404, 'Event not found.');
  }
  if (!event.organizationId) {
    throw new FinanceMutationError(400, 'Event staff costs require an organization event.');
  }

  const staffMember = await client.staffMembers.findFirst({
    where: {
      id: staffMemberId,
      organizationId: event.organizationId,
    },
    select: {
      id: true,
      userId: true,
      roleId: true,
    },
  });
  if (!staffMember) {
    throw new FinanceMutationError(404, 'Staff member not found.');
  }

  const organizationRoleId = normalizeId(input.organizationRoleId);
  if (organizationRoleId) {
    const role = await client.organizationRoles.findFirst({
      where: {
        id: organizationRoleId,
        organizationId: event.organizationId,
      },
      select: { id: true },
    });
    if (!role) {
      throw new FinanceMutationError(404, 'Organization role not found.');
    }
  }

  const laborData = normalizeLaborData(input);
  const now = new Date();
  return client.eventStaffAssignments.create({
    data: {
      id: createId('event_staff_labor'),
      organizationId: event.organizationId,
      eventId,
      staffMemberId,
      organizationRoleId,
      userId: normalizeId(input.userId) ?? staffMember.userId ?? null,
      ...laborData,
      createdBy: input.actingUserId,
      updatedBy: input.actingUserId,
      createdAt: now,
      updatedAt: now,
    },
  });
};

export const createTeamStaffLaborEntry = async (
  input: TeamStaffLaborInput,
  client: PrismaLike = prisma,
) => {
  const teamId = normalizeId(input.teamId);
  const userId = normalizeId(input.userId);
  if (!teamId || !userId) {
    throw new FinanceMutationError(400, 'teamId and userId are required.');
  }
  const team = await client.canonicalTeams.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      organizationId: true,
    },
  });
  if (!team) {
    throw new FinanceMutationError(404, 'Team not found.');
  }
  if (!team.organizationId) {
    throw new FinanceMutationError(400, 'Team staff costs require an organization team.');
  }

  const eventTeamId = normalizeId(input.eventTeamId);
  let eventId = normalizeId(input.eventId);
  if (eventTeamId) {
    const eventTeam = await client.teams.findFirst({
      where: {
        id: eventTeamId,
        parentTeamId: teamId,
      },
      select: {
        id: true,
        eventId: true,
        parentTeamId: true,
      },
    });
    if (!eventTeam) {
      throw new FinanceMutationError(404, 'Event team not found for this canonical team.');
    }
    if (eventId && eventTeam.eventId !== eventId) {
      throw new FinanceMutationError(409, 'eventId does not match the event team.');
    }
    eventId = eventTeam.eventId ?? eventId;
  }
  if (eventId) {
    const event = await client.events.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        organizationId: true,
      },
    });
    if (!event) {
      throw new FinanceMutationError(404, 'Event not found.');
    }
    if (event.organizationId !== team.organizationId) {
      throw new FinanceMutationError(409, 'Event does not belong to this team organization.');
    }
  }

  let staffMemberId = normalizeId(input.staffMemberId);
  if (staffMemberId) {
    const staffMember = await client.staffMembers.findFirst({
      where: {
        id: staffMemberId,
        organizationId: team.organizationId,
      },
      select: { id: true },
    });
    if (!staffMember) {
      throw new FinanceMutationError(404, 'Staff member not found.');
    }
  } else {
    const staffMember = await client.staffMembers.findUnique({
      where: {
        organizationId_userId: {
          organizationId: team.organizationId,
          userId,
        },
      },
      select: { id: true },
    });
    staffMemberId = staffMember?.id ?? null;
  }

  const teamStaffAssignmentId = normalizeId(input.teamStaffAssignmentId);
  if (teamStaffAssignmentId) {
    const assignment = await client.teamStaffAssignments.findFirst({
      where: {
        id: teamStaffAssignmentId,
        teamId,
        userId,
      },
      select: { id: true },
    });
    if (!assignment) {
      throw new FinanceMutationError(404, 'Team staff assignment not found.');
    }
  }

  const eventTeamStaffAssignmentId = normalizeId(input.eventTeamStaffAssignmentId);
  if (eventTeamStaffAssignmentId) {
    const assignment = await client.eventTeamStaffAssignments.findFirst({
      where: {
        id: eventTeamStaffAssignmentId,
        userId,
        ...(eventTeamId ? { eventTeamId } : {}),
      },
      select: {
        id: true,
        eventTeamId: true,
      },
    });
    if (!assignment) {
      throw new FinanceMutationError(404, 'Event team staff assignment not found.');
    }
    if (eventTeamId && assignment.eventTeamId !== eventTeamId) {
      throw new FinanceMutationError(409, 'Event team staff assignment does not match the event team.');
    }
  }

  const laborData = normalizeLaborData(input);
  const now = new Date();
  return client.teamStaffLaborEntries.create({
    data: {
      id: createId('team_staff_labor'),
      organizationId: team.organizationId,
      teamId,
      eventTeamId,
      eventId,
      staffMemberId,
      userId,
      teamStaffAssignmentId,
      eventTeamStaffAssignmentId,
      ...laborData,
      createdBy: input.actingUserId,
      updatedBy: input.actingUserId,
      createdAt: now,
      updatedAt: now,
    },
  });
};

export const createFinancialLineItem = async (
  input: FinancialLineItemInput,
  client: PrismaLike = prisma,
) => {
  const organizationId = normalizeId(input.organizationId);
  if (!organizationId) {
    throw new FinanceMutationError(400, 'organizationId is required.');
  }
  const amountCents = normalizePositiveCents(input.amountCents, 'amountCents');
  const category = normalizeOptionalText(input.category);
  const title = normalizeOptionalText(input.title);
  if (!category || !title) {
    throw new FinanceMutationError(400, 'category and title are required.');
  }

  let eventId = normalizeId(input.eventId);
  let teamId = normalizeId(input.teamId);
  let eventTeamId = normalizeId(input.eventTeamId);

  if (input.scope === 'ORGANIZATION') {
    eventId = null;
    teamId = null;
    eventTeamId = null;
  } else if (input.scope === 'EVENT') {
    if (!eventId) {
      throw new FinanceMutationError(400, 'eventId is required for event line items.');
    }
    const event = await client.events.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true },
    });
    if (!event || event.organizationId !== organizationId) {
      throw new FinanceMutationError(404, 'Event not found for this organization.');
    }
    teamId = null;
    eventTeamId = null;
  } else if (input.scope === 'TEAM') {
    if (!teamId) {
      throw new FinanceMutationError(400, 'teamId is required for team line items.');
    }
    const team = await client.canonicalTeams.findUnique({
      where: { id: teamId },
      select: { id: true, organizationId: true },
    });
    if (!team || team.organizationId !== organizationId) {
      throw new FinanceMutationError(404, 'Team not found for this organization.');
    }
    eventId = null;
    eventTeamId = null;
  } else {
    if (!eventTeamId) {
      throw new FinanceMutationError(400, 'eventTeamId is required for event-team line items.');
    }
    const eventTeam = await client.teams.findUnique({
      where: { id: eventTeamId },
      select: {
        id: true,
        eventId: true,
        parentTeamId: true,
      },
    });
    if (!eventTeam?.eventId) {
      throw new FinanceMutationError(404, 'Event team not found.');
    }
    const event = await client.events.findUnique({
      where: { id: eventTeam.eventId },
      select: {
        id: true,
        organizationId: true,
      },
    });
    if (!event || event.organizationId !== organizationId) {
      throw new FinanceMutationError(404, 'Event team not found for this organization.');
    }
    if (teamId && eventTeam.parentTeamId !== teamId) {
      throw new FinanceMutationError(409, 'teamId does not match the event team parent.');
    }
    eventId = event.id;
    teamId = eventTeam.parentTeamId ?? teamId;
  }

  const occurredAt = parseDate(input.occurredAt, 'occurredAt');
  const now = new Date();
  return client.financialLineItems.create({
    data: {
      id: createId('finance_line_item'),
      organizationId,
      scope: input.scope,
      category,
      title,
      description: normalizeOptionalText(input.description),
      amountCents,
      quantity: input.quantity ?? null,
      unitLabel: normalizeOptionalText(input.unitLabel),
      status: input.status ?? 'ACTUAL',
      occurredAt,
      eventId,
      teamId,
      eventTeamId,
      createdBy: input.actingUserId,
      updatedBy: input.actingUserId,
      createdAt: now,
      updatedAt: now,
    },
  });
};
