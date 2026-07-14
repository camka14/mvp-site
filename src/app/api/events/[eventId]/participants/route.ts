import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getOptionalSession, requireSession } from '@/lib/permissions';
import { calculateAgeOnDate } from '@/lib/age';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import {
  resolveEventDivisionSelection,
} from '@/app/api/events/[eventId]/registrationDivisionUtils';
import { canManageEvent } from '@/server/accessControl';
import { extractDivisionTokenFromId } from '@/lib/divisionTypes';
import { dispatchRequiredEventDocuments } from '@/lib/eventConsentDispatch';
import {
  loadAndBuildRegistrationAnswerSnapshot,
  upsertRegistrationQuestionResponse,
} from '@/server/registrationQuestions';
import {
  buildEventParticipantSnapshot,
  deleteEventRegistration,
  findEventRegistration,
  syncDivisionTeamMembershipFromRegistrations,
  upsertEventRegistration,
} from '@/server/events/eventRegistrations';
import {
  claimOrCreateEventTeamSnapshot,
  findRegisteredEventTeamForCanonical,
  getCanonicalTeamIdsByUserIds,
  loadCanonicalTeamById,
} from '@/server/teams/teamMembership';
import {
  isWeeklyParentEvent,
  isWeeklyOccurrenceJoinClosed,
  resolveWeeklyOccurrence,
  resolveWeeklyOccurrenceStartAt,
  WEEKLY_OCCURRENCE_JOIN_CLOSED_ERROR,
} from '@/server/events/weeklyOccurrences';
import { getRefundPolicy } from '@/lib/refundPolicy';
import {
  applyRefundAttempts,
  buildRefundScopeSnapshot,
  createStripeRefundAttempts,
  hasRefundScopeDrift,
  isRefundScopeSnapshotValid,
  REFUND_SCOPE_VERSION,
  resolveRefundablePaymentsForRequest,
  type RefundRequestRow,
  type StripeRefundAttempt,
} from '@/server/refunds/refundExecution';
import {
  requireVerifiedEmailForEventRegistrationIfPaid,
  resolveEventRegistrationPriceCents,
} from '@/server/paidRegistrationGate';
import {
  assignRegisteredTeamToTournamentPool,
  getTournamentPoolIdsForBracket,
  isTournamentPoolPlayEnabled,
  isTournamentPoolValidationError,
  removeRegisteredTeamFromTournamentPools,
} from '@/server/events/tournamentPools';
import { isManualRegistrationPaymentMode } from '@/lib/manualRegistrationPayments';

export const dynamic = 'force-dynamic';
const RESTRICTED_EVENT_STATES = new Set(['UNPUBLISHED', 'DRAFT']);
type PrismaLike = PrismaClient | Prisma.TransactionClient;

const payloadSchema = z.object({
  user: z.record(z.string(), z.any()).optional(),
  userId: z.string().optional(),
  team: z.record(z.string(), z.any()).optional(),
  teamId: z.string().optional(),
  divisionId: z.string().optional(),
  divisionTypeId: z.string().optional(),
  divisionTypeKey: z.string().optional(),
  slotId: z.string().optional(),
  occurrenceDate: z.string().optional(),
  refundMode: z.enum(['auto', 'request']).optional(),
  refundReason: z.string().optional(),
  answers: z.any().optional(),
}).strict();

const PAID_ONLINE_CHECKOUT_REQUIRED_ERROR = 'Paid online registration must be completed through checkout.';
const ACTIVE_REGISTRATION_STATUSES = ['STARTED', 'PENDING', 'ACTIVE', 'BLOCKED', 'CONSENTFAILED', 'PAYMENT_FAILED'] as const;

const toEventResponse = (row: any) => {
  const response = { ...row };
  return response;
};

const extractId = (value: any): string | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    if (typeof value.$id === 'string') return value.$id;
    if (typeof value.id === 'string') return value.id;
  }
  return undefined;
};

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};

const ensureUnique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));
const normalizeUserIdList = (values: unknown): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }
  return ensureUnique(
    values
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean),
  );
};

const paymentFailedRegistrationSelect = {
  id: true,
  registrantId: true,
  registrantType: true,
  rosterRole: true,
  status: true,
  parentId: true,
  eventTeamId: true,
  divisionId: true,
  divisionTypeId: true,
  divisionTypeKey: true,
  consentDocumentId: true,
  consentStatus: true,
  slotId: true,
  occurrenceDate: true,
  createdAt: true,
  updatedAt: true,
} as const;

const toRegistrationEntry = (row: any) => ({
  registrationId: row.id,
  registrantId: row.registrantId,
  registrantType: row.registrantType,
  rosterRole: row.rosterRole,
  status: row.status,
  parentId: normalizeId(row.parentId),
  divisionId: normalizeId(row.divisionId),
  divisionTypeId: normalizeId(row.divisionTypeId),
  divisionTypeKey: normalizeId(row.divisionTypeKey),
  consentDocumentId: normalizeId(row.consentDocumentId),
  consentStatus: normalizeId(row.consentStatus),
  slotId: normalizeId(row.slotId),
  occurrenceDate: normalizeId(row.occurrenceDate),
  createdAt: row.createdAt ? row.createdAt.toISOString() : null,
  updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
});

const emptyRegistrationSnapshot = () => ({
  teams: [],
  users: [],
  children: [],
  waitlist: [],
  freeAgents: [],
});

const loadViewerPaymentFailedRegistrations = async ({
  eventId,
  userId,
  slotId,
  occurrenceDate,
}: {
  eventId: string;
  userId: string;
  slotId: string | null;
  occurrenceDate: string | null;
}) => {
  const canonicalTeamIdsByUserId = await getCanonicalTeamIdsByUserIds([userId], prisma);
  const canonicalTeamIds = canonicalTeamIdsByUserId.get(userId) ?? [];
  const eventTeams = canonicalTeamIds.length
    ? await prisma.teams.findMany({
      where: {
        eventId,
        parentTeamId: { in: canonicalTeamIds },
      },
      select: { id: true },
    })
    : [];
  const viewerTeamIds = ensureUnique([
    ...canonicalTeamIds,
    ...eventTeams
      .map((team) => normalizeId(team.id))
      .filter((teamId): teamId is string => Boolean(teamId)),
  ]);
  const or: any[] = [
    { registrantType: 'SELF', registrantId: userId },
    { registrantType: 'CHILD', parentId: userId },
  ];
  if (viewerTeamIds.length > 0) {
    or.push(
      { registrantType: 'TEAM', registrantId: { in: viewerTeamIds } },
      { registrantType: 'TEAM', eventTeamId: { in: viewerTeamIds } },
      { registrantType: 'TEAM', parentId: { in: viewerTeamIds } },
    );
  }

  const rows = await prisma.eventRegistrations.findMany({
    where: {
      eventId,
      status: 'PAYMENT_FAILED' as any,
      slotId: slotId ?? null,
      occurrenceDate: occurrenceDate ?? null,
      OR: or,
    },
    select: paymentFailedRegistrationSelect,
    orderBy: [
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
  });

  return {
    ...emptyRegistrationSnapshot(),
    teams: rows.filter((row) => row.registrantType === 'TEAM').map(toRegistrationEntry),
    users: rows.filter((row) => row.registrantType === 'SELF').map(toRegistrationEntry),
    children: rows.filter((row) => row.registrantType === 'CHILD').map(toRegistrationEntry),
  };
};
const normalizeRequiredTemplateIds = (values: unknown): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }
  return ensureUnique(
    values
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean),
  );
};

const normalizePositiveAmountList = (value: unknown): number[] => (
  Array.isArray(value)
    ? value
      .map((entry) => Math.round(typeof entry === 'number' ? entry : Number(entry)))
      .filter((entry) => Number.isFinite(entry) && entry > 0)
    : []
);

const normalizeRelativeDayList = (value: unknown): number[] => (
  Array.isArray(value)
    ? value
      .map((entry) => Math.trunc(typeof entry === 'number' ? entry : Number(entry)))
      .filter((entry) => Number.isFinite(entry))
    : []
);

const firstNonEmptyNumberList = (...values: unknown[]): number[] => {
  for (const value of values) {
    const normalized = normalizePositiveAmountList(value);
    if (normalized.length) {
      return normalized;
    }
  }
  return [];
};

const firstNonEmptyRelativeDayList = (...values: unknown[]): number[] => {
  for (const value of values) {
    const normalized = normalizeRelativeDayList(value);
    if (normalized.length) {
      return normalized;
    }
  }
  return [];
};

const normalizeDateList = (value: unknown): Date[] => (
  Array.isArray(value)
    ? value
      .map((entry) => {
        if (entry instanceof Date && !Number.isNaN(entry.getTime())) {
          return entry;
        }
        if (typeof entry === 'string' || typeof entry === 'number') {
          const date = new Date(entry);
          return Number.isNaN(date.getTime()) ? null : date;
        }
        return null;
      })
      .filter((entry): entry is Date => Boolean(entry))
    : []
);

const resolveBillingDivision = async (
  client: PrismaLike,
  eventId: string,
  divisionSelection: {
    divisionId?: string | null;
    divisionTypeId?: string | null;
    divisionTypeKey?: string | null;
  },
) => {
  const candidates = ensureUnique([
    normalizeId(divisionSelection.divisionId) ?? '',
    normalizeId(divisionSelection.divisionTypeId) ?? '',
    normalizeId(divisionSelection.divisionTypeKey) ?? '',
    extractDivisionTokenFromId(normalizeId(divisionSelection.divisionId) ?? '') ?? '',
  ]);
  if (!candidates.length) {
    return null;
  }

  return client.divisions.findFirst({
    where: {
      eventId,
      OR: [
        { id: { in: candidates } },
        { key: { in: candidates } },
        { divisionTypeId: { in: candidates } },
      ],
    },
    select: {
      id: true,
      price: true,
      allowPaymentPlans: true,
      installmentAmounts: true,
      installmentDueRelativeDays: true,
    },
  } as any);
};

const createWeeklyPaymentPlanBillForRegistration = async (
  params: {
    tx: PrismaLike;
    event: any;
    ownerType: 'USER' | 'TEAM';
    ownerId: string;
    divisionSelection: {
      divisionId?: string | null;
      divisionTypeId?: string | null;
      divisionTypeKey?: string | null;
    };
    occurrence: { slotId: string; occurrenceDate: string; slot: any } | null;
    createdBy: string;
  },
) => {
  if (!isWeeklyParentEvent(params.event) || !params.occurrence) {
    return null;
  }

  const ownerId = normalizeId(params.ownerId);
  if (!ownerId) {
    return null;
  }

  const division = await resolveBillingDivision(
    params.tx,
    params.event.id,
    params.divisionSelection,
  );
  const allowPaymentPlans = division?.allowPaymentPlans === true;
  if (!allowPaymentPlans) {
    return null;
  }

  const totalAmountCents = Math.round(
    typeof division?.price === 'number'
      ? division.price
      : 0,
  );
  if (!Number.isFinite(totalAmountCents) || totalAmountCents <= 0) {
    return null;
  }

  const installmentAmounts = firstNonEmptyNumberList(division?.installmentAmounts);
  const amounts = installmentAmounts.length ? installmentAmounts : [totalAmountCents];
  const relativeDueDays = firstNonEmptyRelativeDayList(division?.installmentDueRelativeDays);

  if (!relativeDueDays.length) {
    throw new Error('Weekly payment plans require installment due date offsets.');
  }
  if (relativeDueDays.length !== amounts.length) {
    throw new Error('Weekly payment plan due date offsets must match installment amounts.');
  }

  const occurrenceStart = resolveWeeklyOccurrenceStartAt(
    params.occurrence.slot,
    params.occurrence.occurrenceDate,
  );
  if (!occurrenceStart) {
    throw new Error('Unable to resolve weekly session start date.');
  }

  const existing = await params.tx.bills.findFirst({
    where: {
      ownerType: params.ownerType,
      ownerId,
      eventId: params.event.id,
      slotId: params.occurrence.slotId,
      occurrenceDate: params.occurrence.occurrenceDate,
      parentBillId: null,
      paymentPlanEnabled: true,
    },
    select: { id: true },
  } as any);
  if (existing) {
    return existing;
  }

  const now = new Date();
  const bill = await params.tx.bills.create({
    data: {
      id: crypto.randomUUID(),
      ownerType: params.ownerType,
      ownerId,
      totalAmountCents,
      paidAmountCents: 0,
      eventId: params.event.id,
      slotId: params.occurrence.slotId,
      occurrenceDate: params.occurrence.occurrenceDate,
      organizationId: normalizeId(params.event.organizationId),
      allowSplit: params.ownerType === 'TEAM' ? Boolean(params.event.allowTeamSplitDefault) : false,
      status: 'OPEN',
      paymentPlanEnabled: true,
      createdBy: params.createdBy,
      lineItems: [
        {
          id: 'line_1',
          type: 'EVENT',
          label: 'Event registration',
          amountCents: totalAmountCents,
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
  } as any);

  const payments = await Promise.all(amounts.map((amount, index) => {
    const dueDate = new Date(occurrenceStart.getTime());
    dueDate.setDate(dueDate.getDate() + relativeDueDays[index]);
    return params.tx.billPayments.create({
      data: {
        id: crypto.randomUUID(),
        billId: bill.id,
        sequence: index + 1,
        dueDate,
        amountCents: amount,
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      },
    });
  }));

  const nextPayment = payments.sort((left, right) => left.sequence - right.sequence)[0];
  return params.tx.bills.update({
    where: { id: bill.id },
    data: {
      nextPaymentDue: nextPayment?.dueDate ?? null,
      nextPaymentAmountCents: nextPayment?.amountCents ?? null,
      updatedAt: new Date(),
    },
  });
};

const createManualRegistrationBillForRegistration = async (
  params: {
    tx: PrismaLike;
    event: any;
    ownerType: 'USER' | 'TEAM';
    ownerId: string;
    registrationId: string;
    divisionSelection: {
      divisionId?: string | null;
      divisionTypeId?: string | null;
      divisionTypeKey?: string | null;
    };
    occurrence: { slotId: string; occurrenceDate: string; slot: any } | null;
    createdBy: string;
  },
) => {
  if (!isManualRegistrationPaymentMode(params.event.registrationPaymentMode)) {
    return null;
  }

  const ownerId = normalizeId(params.ownerId);
  const registrationId = normalizeId(params.registrationId);
  if (!ownerId || !registrationId) {
    return null;
  }

  const division = await resolveBillingDivision(
    params.tx,
    params.event.id,
    params.divisionSelection,
  );
  const totalAmountCents = Math.round(
    typeof division?.price === 'number'
      ? division.price
      : typeof params.event.price === 'number'
        ? params.event.price
        : 0,
  );
  if (!Number.isFinite(totalAmountCents) || totalAmountCents <= 0) {
    return null;
  }

  const existing = await params.tx.bills.findFirst({
    where: {
      ownerType: params.ownerType,
      ownerId,
      eventId: params.event.id,
      slotId: params.occurrence?.slotId ?? null,
      occurrenceDate: params.occurrence?.occurrenceDate ?? null,
      parentBillId: null,
      sourceType: 'EVENT_REGISTRATION',
      sourceId: registrationId,
    },
    select: { id: true },
  } as any);
  if (existing) {
    return existing;
  }

  const allowPaymentPlans = division?.allowPaymentPlans === true || params.event.allowPaymentPlans === true;
  const installmentAmounts = allowPaymentPlans
    ? firstNonEmptyNumberList(division?.installmentAmounts, params.event.installmentAmounts)
    : [];
  const amounts = installmentAmounts.length ? installmentAmounts : [totalAmountCents];
  const now = new Date();
  const dueDates = (() => {
    if (params.occurrence) {
      const relativeDueDays = firstNonEmptyRelativeDayList(
        division?.installmentDueRelativeDays,
        params.event.installmentDueRelativeDays,
      );
      const occurrenceStart = resolveWeeklyOccurrenceStartAt(
        params.occurrence.slot,
        params.occurrence.occurrenceDate,
      );
      if (occurrenceStart && relativeDueDays.length === amounts.length) {
        return relativeDueDays.map((offset) => {
          const dueDate = new Date(occurrenceStart.getTime());
          dueDate.setDate(dueDate.getDate() + offset);
          return dueDate;
        });
      }
    }
    const configuredDueDates = normalizeDateList(params.event.installmentDueDates);
    if (configuredDueDates.length === amounts.length) {
      return configuredDueDates;
    }
    return amounts.map(() => now);
  })();

  const bill = await params.tx.bills.create({
    data: {
      id: crypto.randomUUID(),
      ownerType: params.ownerType,
      ownerId,
      totalAmountCents,
      paidAmountCents: 0,
      eventId: params.event.id,
      slotId: params.occurrence?.slotId ?? null,
      occurrenceDate: params.occurrence?.occurrenceDate ?? null,
      organizationId: normalizeId(params.event.organizationId),
      allowSplit: params.ownerType === 'TEAM' ? Boolean(params.event.allowTeamSplitDefault) : false,
      status: 'OPEN',
      sourceType: 'EVENT_REGISTRATION',
      sourceId: registrationId,
      paymentPlanEnabled: amounts.length > 1,
      createdBy: params.createdBy,
      lineItems: [
        {
          id: 'line_1',
          type: 'EVENT',
          label: 'Event registration',
          amountCents: totalAmountCents,
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
  } as any);

  const payments = await Promise.all(amounts.map((amount, index) => (
    params.tx.billPayments.create({
      data: {
        id: crypto.randomUUID(),
        billId: bill.id,
        sequence: index + 1,
        dueDate: dueDates[index] ?? now,
        amountCents: amount,
        paidAmountCents: 0,
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      },
    } as any)
  )));

  const nextPayment = payments.sort((left, right) => left.sequence - right.sequence)[0];
  return params.tx.bills.update({
    where: { id: bill.id },
    data: {
      nextPaymentDue: nextPayment?.dueDate ?? null,
      nextPaymentAmountCents: nextPayment?.amountCents ?? null,
      updatedAt: new Date(),
    },
  });
};

const createRegistrationBillForRegistration = async (
  params: Parameters<typeof createManualRegistrationBillForRegistration>[0],
) => {
  if (isManualRegistrationPaymentMode(params.event.registrationPaymentMode)) {
    return createManualRegistrationBillForRegistration(params);
  }
  return createWeeklyPaymentPlanBillForRegistration(params);
};

const resolveDirectRegistrationPaymentPlanAllowed = async (
  event: any,
  divisionSelection: {
    divisionId?: string | null;
    divisionTypeId?: string | null;
    divisionTypeKey?: string | null;
  },
): Promise<boolean> => {
  const eventAllowsPaymentPlans = Boolean(event?.allowPaymentPlans);
  const division = await resolveBillingDivision(prisma, event.id, divisionSelection);
  return division?.allowPaymentPlans === true || eventAllowsPaymentPlans;
};

const buildCheckoutRequiredResponse = () => NextResponse.json(
  {
    error: PAID_ONLINE_CHECKOUT_REQUIRED_ERROR,
    code: 'CHECKOUT_REQUIRED',
    checkoutRequired: true,
  },
  { status: 402 },
);

const buildOccurrenceWhere = (occurrence: { slotId: string; occurrenceDate: string } | null) => (
  occurrence
    ? {
        slotId: occurrence.slotId,
        occurrenceDate: occurrence.occurrenceDate,
      }
    : {
        slotId: null,
        occurrenceDate: null,
      }
);

const cancelFreeAgentRegistrationsForUsers = async ({
  client,
  eventId,
  userIds,
  occurrence,
}: {
  client: PrismaLike;
  eventId: string;
  userIds: string[];
  occurrence: { slotId: string; occurrenceDate: string } | null;
}) => {
  const normalizedUserIds = ensureUnique(userIds.map((userId) => normalizeId(userId) ?? ''));
  if (!normalizedUserIds.length) {
    return;
  }

  await client.eventRegistrations.updateMany({
    where: {
      eventId,
      ...buildOccurrenceWhere(occurrence),
      registrantType: { in: ['SELF', 'CHILD'] as any[] },
      registrantId: { in: normalizedUserIds },
      rosterRole: 'FREE_AGENT' as any,
      status: { in: [...ACTIVE_REGISTRATION_STATUSES] as any[] },
    },
    data: {
      status: 'CANCELLED' as any,
      updatedAt: new Date(),
    },
  });
};
const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length ? normalized : null;
};
const isSlotProvisionedTeam = (team: { kind?: unknown; captainId?: unknown; parentTeamId?: unknown }): boolean => (
  String(team.kind ?? '').trim().toUpperCase() === 'PLACEHOLDER'
  || String(team.captainId ?? '').trim().length === 0
  || normalizeId(team.parentTeamId) !== null
);
const isSchedulableTeamSignupEvent = (event: { eventType?: unknown; teamSignup?: unknown }): boolean => (
  Boolean(event.teamSignup)
  && ['LEAGUE', 'TOURNAMENT'].includes(String(event.eventType ?? '').trim().toUpperCase())
);
const normalizePlaceholderName = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length ? normalized : null;
};
const placeholderNameForEventTeam = async (params: {
  tx: PrismaLike;
  event: { id: string; teamIds?: unknown };
  eventTeamId: string;
}): Promise<string> => {
  let eventTeamIds = normalizeUserIdList(params.event.teamIds);
  if (!eventTeamIds.length && typeof params.tx.divisions?.findMany === 'function') {
    const divisionRows = await params.tx.divisions.findMany({
      where: { eventId: params.event.id },
      orderBy: { createdAt: 'asc' },
      select: { teamIds: true },
    });
    eventTeamIds = ensureUnique(
      (Array.isArray(divisionRows) ? divisionRows : [])
        .flatMap((row: { teamIds?: unknown }) => normalizeUserIdList(row.teamIds)),
    );
  }

  const eventTeamIndex = eventTeamIds.findIndex((teamId) => teamId === params.eventTeamId);
  let ordinal = eventTeamIndex >= 0 ? eventTeamIndex + 1 : eventTeamIds.length + 1;

  const existingPlaceholderNames = new Set<string>();
  if (typeof params.tx.teams?.findMany === 'function') {
    const placeholderRows = await params.tx.teams.findMany({
      where: {
        eventId: params.event.id,
        kind: 'PLACEHOLDER',
      },
      select: {
        id: true,
        name: true,
      },
    });
    (Array.isArray(placeholderRows) ? placeholderRows : []).forEach((row: { id?: unknown; name?: unknown }) => {
      if (normalizeId(row.id) === params.eventTeamId) {
        return;
      }
      const name = normalizePlaceholderName(row.name);
      if (name) {
        existingPlaceholderNames.add(name);
      }
    });
  }

  while (existingPlaceholderNames.has(`place holder ${ordinal}`)) {
    ordinal += 1;
  }

  return `Place Holder ${ordinal}`;
};
const normalizeNonNegativeInt = (value: unknown): number | null => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.max(0, Math.trunc(numeric));
};
const resetEventTeamSlotToPlaceholder = async (params: {
  tx: PrismaLike;
  event: any;
  eventTeamId: string;
  eventTeam?: any;
  team: any;
  existingRegistration: any;
  poolDivisionId?: string | null;
  createdBy: string;
  occurrence: { slotId: string; occurrenceDate: string } | null;
  now: Date;
}) => {
  const eventTeamDivisionId = normalizeId(params.eventTeam?.division);
  const divisionId = (isTournamentPoolPlayEnabled(params.event)
    ? (normalizeId(params.poolDivisionId) ?? eventTeamDivisionId)
    : null)
    ?? normalizeId(params.existingRegistration?.divisionId)
    ?? normalizeId(params.eventTeam?.division)
    ?? normalizeId(params.team?.division);
  const divisionTypeId = normalizeId(params.existingRegistration?.divisionTypeId)
    ?? normalizeId(params.eventTeam?.divisionTypeId)
    ?? normalizeId(params.team?.divisionTypeId);
  const teamSize = normalizeNonNegativeInt(params.event?.teamSizeLimit)
    ?? normalizeNonNegativeInt(params.eventTeam?.teamSize)
    ?? normalizeNonNegativeInt(params.team?.teamSize)
    ?? 0;
  const placeholderName = await placeholderNameForEventTeam({
    tx: params.tx,
    event: params.event,
    eventTeamId: params.eventTeamId,
  });

  await params.tx.teams.update({
    where: { id: params.eventTeamId },
    data: {
      eventId: params.event.id,
      kind: 'PLACEHOLDER',
      playerIds: [],
      playerRegistrationIds: [],
      division: divisionId,
      divisionTypeId,
      wins: 0,
      losses: 0,
      name: placeholderName,
      captainId: '',
      managerId: '',
      headCoachId: null,
      coachIds: [],
      staffAssignmentIds: [],
      parentTeamId: null,
      pending: [],
      teamSize,
      profileImageId: null,
      sport: null,
      updatedAt: params.now,
    },
  });
};
const normalizeSportKey = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
};

const normalizeDivisionToken = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length ? normalized : null;
};

const normalizeDivisionTeamIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return ensureUnique(
    value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0),
  );
};

const divisionMatchesTarget = (
  row: { id?: string | null; key?: string | null },
  targetDivisionId: string | null,
): boolean => {
  const normalizedTarget = normalizeDivisionToken(targetDivisionId);
  if (!normalizedTarget) {
    return false;
  }
  const aliases = new Set<string>();
  const rowId = normalizeDivisionToken(row.id);
  const rowKey = normalizeDivisionToken(row.key);
  if (rowId) {
    aliases.add(rowId);
    const token = extractDivisionTokenFromId(rowId);
    if (token) {
      aliases.add(token);
    }
  }
  if (rowKey) {
    aliases.add(rowKey);
  }
  return aliases.has(normalizedTarget);
};

const refundRequestSelect = {
  id: true,
  eventId: true,
  userId: true,
  requestedByUserId: true,
  hostId: true,
  teamId: true,
  organizationId: true,
  reason: true,
  status: true,
  slotId: true,
  occurrenceDate: true,
  billIds: true,
  paymentIds: true,
  paymentScope: true,
  requestedAmountCents: true,
  currency: true,
  policyDecision: true,
  scopeVersion: true,
  scopeHash: true,
} as const;

const divisionAliases = (divisionId: string | null): Set<string> => {
  const aliases = new Set<string>();
  const normalized = normalizeDivisionToken(divisionId);
  if (normalized) {
    aliases.add(normalized);
  }
  if (divisionId) {
    const token = extractDivisionTokenFromId(divisionId);
    const normalizedToken = normalizeDivisionToken(token);
    if (normalizedToken) {
      aliases.add(normalizedToken);
    }
  }
  return aliases;
};

const teamDivisionMatchesSelection = (
  teamDivision: string | null,
  targetDivisionId: string | null,
): boolean => {
  const targetAliases = divisionAliases(targetDivisionId);
  if (!targetAliases.size) {
    return true;
  }
  const teamAliases = divisionAliases(teamDivision);
  for (const alias of teamAliases) {
    if (targetAliases.has(alias)) {
      return true;
    }
  }
  return false;
};

const syncDivisionTeamMembership = async (params: {
  event: {
    id: string;
    singleDivision: boolean | null;
    divisions: string[] | null;
  };
  teamId: string;
  mode: 'add' | 'remove';
  targetDivisionId: string | null;
}, client: PrismaLike = prisma) => {
  const rows = await client.divisions.findMany({
    where: {
      eventId: params.event.id,
      OR: [
        { kind: 'LEAGUE' },
        { kind: null },
      ],
    },
    select: {
      id: true,
      key: true,
      teamIds: true,
      kind: true,
    },
  });

  const shouldAssignToDivision = params.mode === 'add' && !Boolean(params.event.singleDivision);
  for (const row of rows) {
    const isPlayoff = typeof row.kind === 'string' && row.kind.toUpperCase() === 'PLAYOFF';
    if (isPlayoff) {
      continue;
    }
    const currentTeamIds = normalizeDivisionTeamIds(row.teamIds).filter((teamId) => teamId !== params.teamId);
    const shouldIncludeTeam = shouldAssignToDivision && divisionMatchesTarget(row, params.targetDivisionId);
    const nextTeamIds = shouldIncludeTeam ? ensureUnique([...currentTeamIds, params.teamId]) : currentTeamIds;
    await client.divisions.update({
      where: { id: row.id },
      data: {
        teamIds: nextTeamIds,
        updatedAt: new Date(),
      },
    });
  }
};

const canManageLinkedChildParticipant = async (params: {
  parentId: string;
  childId: string;
}): Promise<boolean> => {
  const link = await prisma.parentChildLinks.findFirst({
    where: {
      parentId: params.parentId,
      childId: params.childId,
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  return Boolean(link);
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await getOptionalSession(req);
  const { eventId } = await params;
  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
      state: true,
      hostId: true,
      assistantHostIds: true,
      organizationId: true,
      teamSignup: true,
      singleDivision: true,
      maxParticipants: true,
      eventType: true,
      parentEvent: true,
      registrationPaymentMode: true,
      manualPaymentLinks: true,
      manualPaymentInstructions: true,
      timeSlotIds: true,
    },
  });
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const eventState = String(event.state ?? '').toUpperCase();
  const canManageCurrentEvent = session ? await canManageEvent(session, event) : false;
  if (RESTRICTED_EVENT_STATES.has(eventState) && !canManageCurrentEvent) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const slotId = normalizeId(req.nextUrl.searchParams.get('slotId'));
  const occurrenceDate = normalizeId(req.nextUrl.searchParams.get('occurrenceDate'));
  const manageModeRequested = req.nextUrl.searchParams.get('manage') === 'true';
  if (manageModeRequested && !session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (manageModeRequested && !canManageCurrentEvent) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (isWeeklyParentEvent(event) && (!slotId || !occurrenceDate)) {
    return NextResponse.json({
      event: toEventResponse(event),
      participants: {
        teamIds: [],
        userIds: [],
        waitListIds: [],
        freeAgentIds: [],
        divisions: [],
      },
      registrations: manageModeRequested
        ? {
          teams: [],
          users: [],
          children: [],
          waitlist: [],
          freeAgents: [],
        }
        : undefined,
      teams: [],
      users: [],
      participantCount: 0,
      participantCapacity: null,
      occurrence: null,
      divisionWarnings: [],
      weeklySelectionRequired: true,
    }, { status: 200 });
  }
  if (!isWeeklyParentEvent(event) && (slotId || occurrenceDate)) {
    return NextResponse.json({ error: 'Weekly occurrence selection is only valid for weekly events.' }, { status: 400 });
  }
  if (isWeeklyParentEvent(event)) {
    const resolvedOccurrence = await resolveWeeklyOccurrence({
      event,
      occurrence: {
        slotId,
        occurrenceDate,
      },
    });
    if (!resolvedOccurrence.ok) {
      return NextResponse.json({ error: resolvedOccurrence.error }, { status: 400 });
    }
  }

  try {
    const snapshot = await buildEventParticipantSnapshot({
      event,
      occurrence: slotId && occurrenceDate ? { slotId, occurrenceDate } : null,
      includeRegistrations: manageModeRequested,
    });
    const viewerPaymentFailedRegistrations = !manageModeRequested && session
      ? await loadViewerPaymentFailedRegistrations({
          eventId,
          userId: session.userId,
          slotId: slotId ?? null,
          occurrenceDate: occurrenceDate ?? null,
        })
      : undefined;
    return NextResponse.json({
      event: toEventResponse(event),
      participants: snapshot.participants,
      registrations: manageModeRequested ? snapshot.registrations : viewerPaymentFailedRegistrations,
      teams: snapshot.teams.map((team) => team),
      users: snapshot.users.map((user) => user),
      participantCount: snapshot.participantCount,
      participantCapacity: snapshot.participantCapacity,
      occurrence: snapshot.occurrence,
      divisionWarnings: snapshot.divisionWarnings,
      weeklySelectionRequired: false,
    }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load participants.' },
      { status: 400 },
    );
  }
}

const ensureTeamRefundRequest = async (
  params: {
    eventId: string;
    hostId: string | null;
    organizationId: string | null;
    teamId: string;
    requestedByUserId: string;
    reason: string;
    participantUserIds?: string[];
    slotId?: string | null;
    occurrenceDate?: string | null;
  },
  client: PrismaLike = prisma,
): Promise<void> => {
  const existing = await client.refundRequests.findFirst({
    where: {
      eventId: params.eventId,
      teamId: params.teamId,
      requestedByUserId: params.requestedByUserId,
      slotId: params.slotId ?? null,
      occurrenceDate: params.occurrenceDate ?? null,
      status: 'WAITING',
    },
    select: refundRequestSelect,
  });
  if (existing?.id && isRefundScopeSnapshotValid(existing as RefundRequestRow)) {
    return;
  }

  const refundRequest: RefundRequestRow = {
    id: crypto.randomUUID(),
    eventId: params.eventId,
    userId: params.requestedByUserId,
    requestedByUserId: params.requestedByUserId,
    hostId: params.hostId,
    organizationId: params.organizationId,
    teamId: params.teamId,
    slotId: params.slotId ?? null,
    occurrenceDate: params.occurrenceDate ?? null,
    reason: params.reason,
    status: 'WAITING',
    authorizedPayerUserIds: params.participantUserIds,
  };
  const payments = await resolveRefundablePaymentsForRequest(
    client,
    refundRequest,
    { scopeMode: 'TEAM_WIDE' },
  );
  if (!payments.length) {
    return;
  }
  const scope = buildRefundScopeSnapshot(refundRequest, payments, 'HOST_REVIEW_REQUIRED');
  const now = new Date();
  await client.refundRequests.create({
    data: {
      id: refundRequest.id,
      eventId: refundRequest.eventId,
      userId: refundRequest.userId,
      requestedByUserId: refundRequest.requestedByUserId,
      hostId: refundRequest.hostId,
      organizationId: refundRequest.organizationId,
      teamId: refundRequest.teamId,
      slotId: refundRequest.slotId ?? null,
      occurrenceDate: refundRequest.occurrenceDate ?? null,
      billIds: scope.billIds,
      paymentIds: scope.paymentIds,
      paymentScope: scope.paymentScope,
      requestedAmountCents: scope.requestedAmountCents,
      currency: scope.currency,
      policyDecision: scope.policyDecision,
      scopeVersion: scope.scopeVersion,
      scopeHash: scope.scopeHash,
      reason: refundRequest.reason,
      status: 'WAITING',
      createdAt: now,
      updatedAt: now,
    },
  });
};

async function updateParticipants(
  req: NextRequest,
  params: Promise<{ eventId: string }>,
  mode: 'add' | 'remove',
) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { eventId } = await params;
  const event = await prisma.events.findUnique({
    where: { id: eventId },
  });
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }
  const affiliateUrl = typeof event.affiliateUrl === 'string' ? event.affiliateUrl.trim() : '';
  if (mode === 'add' && affiliateUrl.length > 0) {
    return NextResponse.json(
      { error: 'This event uses external registration.' },
      { status: 400 },
    );
  }
  const canManageCurrentEvent = await canManageEvent(session, event);
  const eventState = String(event.state ?? '').toUpperCase();
  if (RESTRICTED_EVENT_STATES.has(eventState) && !canManageCurrentEvent) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const userId = parsed.data.userId ?? extractId(parsed.data.user);
  const teamId = parsed.data.teamId ?? extractId(parsed.data.team);
  if ((userId && teamId) || (!userId && !teamId)) {
    return NextResponse.json(
      { error: 'Specify exactly one participant target via userId or teamId.' },
      { status: 400 },
    );
  }

  const hasOccurrenceInput = Boolean(parsed.data.slotId || parsed.data.occurrenceDate);
  const weeklyOccurrence = isWeeklyParentEvent(event)
    ? await resolveWeeklyOccurrence({
      event,
      occurrence: parsed.data,
    })
    : null;
  if (weeklyOccurrence && !weeklyOccurrence.ok) {
    return NextResponse.json({ error: weeklyOccurrence.error }, { status: 400 });
  }
  if (isWeeklyParentEvent(event) && (!parsed.data.slotId || !parsed.data.occurrenceDate)) {
    return NextResponse.json(
      { error: 'Weekly events require slotId and occurrenceDate for participant changes.' },
      { status: 400 },
    );
  }
  if (!isWeeklyParentEvent(event) && hasOccurrenceInput) {
    return NextResponse.json(
      { error: 'Weekly occurrence selection is only valid for weekly events.' },
      { status: 400 },
    );
  }
  const resolvedOccurrence = weeklyOccurrence?.ok ? weeklyOccurrence.value : null;
  if (mode === 'add' && resolvedOccurrence && isWeeklyOccurrenceJoinClosed(resolvedOccurrence)) {
    return NextResponse.json({ error: WEEKLY_OCCURRENCE_JOIN_CLOSED_ERROR }, { status: 409 });
  }

  if (mode === 'add' && userId && !teamId && event.teamSignup) {
    return NextResponse.json(
      { error: 'Individual joins for team events must use the free-agent route.' },
      { status: 403 },
    );
  }

  if (userId && !session.isAdmin && session.userId !== userId && !canManageCurrentEvent) {
    const canManageChild = await canManageLinkedChildParticipant({
      parentId: session.userId,
      childId: userId,
    });
    if (!canManageChild) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const divisionSelectionResult = mode === 'add'
    ? await resolveEventDivisionSelection({
      event,
      input: parsed.data,
    })
    : null;

  if (mode === 'add' && divisionSelectionResult && !divisionSelectionResult.ok) {
    return NextResponse.json({ error: divisionSelectionResult.error ?? 'Invalid division selection' }, { status: 400 });
  }
  const divisionSelection = mode === 'add' && divisionSelectionResult?.ok
    ? divisionSelectionResult.selection
    : { divisionId: null, divisionTypeId: null, divisionTypeKey: null };
  let directOnlineCheckoutRequired = false;
  if (mode === 'add') {
    const emailVerificationRequired = await requireVerifiedEmailForEventRegistrationIfPaid({
      userId: session.userId,
      event,
      selection: divisionSelection,
    });
    if (emailVerificationRequired) {
      return emailVerificationRequired;
    }
    const registrationPriceCents = await resolveEventRegistrationPriceCents({
      event,
      selection: divisionSelection,
    });
    const paymentPlanAllowed = registrationPriceCents > 0
      ? await resolveDirectRegistrationPaymentPlanAllowed(event, divisionSelection)
      : false;
    directOnlineCheckoutRequired = registrationPriceCents > 0
      && !canManageCurrentEvent
      && !isManualRegistrationPaymentMode(event.registrationPaymentMode)
      && !paymentPlanAllowed;
    if (directOnlineCheckoutRequired && userId) {
      return buildCheckoutRequiredResponse();
    }
  }
  const eventAnswersSnapshot = mode === 'add'
    ? await loadAndBuildRegistrationAnswerSnapshot({
      scopeType: 'EVENT',
      scopeId: event.id,
      answers: parsed.data.answers,
    })
    : [];

  const requiredTemplateIds = normalizeRequiredTemplateIds(event.requiredTemplateIds);
  const warnings: string[] = [];
  const refundPolicyStart = resolvedOccurrence
    ? resolveWeeklyOccurrenceStartAt(resolvedOccurrence.slot, resolvedOccurrence.occurrenceDate) ?? event.start
    : event.start;
  const refundPolicy = getRefundPolicy({
    start: refundPolicyStart,
    cancellationRefundHours: event.cancellationRefundHours,
  });
  const requestedRefundMode = mode === 'remove' && teamId
    ? (parsed.data.refundMode ?? 'request')
    : undefined;
  if (requestedRefundMode && isManualRegistrationPaymentMode(event.registrationPaymentMode)) {
    return NextResponse.json(
      { error: 'This event uses manual payments. The host is responsible for refunds outside BracketIQ.' },
      { status: 400 },
    );
  }
  if (requestedRefundMode === 'auto' && !refundPolicy.canAutoRefund) {
    return NextResponse.json(
      { error: 'Automatic refund is not available for this event.' },
      { status: 400 },
    );
  }

  if (mode === 'add' && userId) {
    const registrant = await prisma.userData.findUnique({
      where: { id: userId },
      select: { dateOfBirth: true },
    });
    if (!registrant) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const ageAtEvent = calculateAgeOnDate(registrant.dateOfBirth, event.start);
    if (!Number.isFinite(ageAtEvent)) {
      return NextResponse.json({ error: 'Invalid date of birth' }, { status: 400 });
    }

    if (ageAtEvent < 18) {
      const parentLink = await prisma.parentChildLinks.findFirst({
        where: {
          childId: userId,
          status: 'ACTIVE',
        },
        orderBy: {
          updatedAt: 'desc',
        },
        select: {
          parentId: true,
        },
      });
      if (!parentLink?.parentId) {
        return NextResponse.json(
          { error: 'No linked parent/guardian found. Ask a parent to add you first.' },
          { status: 403 },
        );
      }

      const requestRegistration = await upsertEventRegistration({
        eventId: event.id,
        registrantType: 'CHILD',
        registrantId: userId,
        parentId: parentLink.parentId,
        rosterRole: 'PARTICIPANT',
        status: 'STARTED',
        ageAtEvent,
        divisionId: divisionSelection.divisionId,
        divisionTypeId: divisionSelection.divisionTypeId,
        divisionTypeKey: divisionSelection.divisionTypeKey,
        consentStatus: 'guardian_approval_required',
        createdBy: session.userId,
        occurrence: resolvedOccurrence,
      });
      if (eventAnswersSnapshot.length) {
        await upsertRegistrationQuestionResponse({
          scopeType: 'EVENT',
          scopeId: event.id,
          subjectType: 'EVENT_REGISTRATION',
          subjectId: requestRegistration.id,
          responderUserId: session.userId,
          registrantUserId: userId,
          registrantType: 'CHILD',
          answersSnapshot: eventAnswersSnapshot,
        });
      }

      await prisma.invites?.deleteMany?.({
        where: {
          type: 'EVENT',
          eventId: event.id,
          userId: session.userId,
        },
      });

      return NextResponse.json({
        event: toEventResponse(event),
        registration: requestRegistration,
        requiresParentApproval: true,
      }, { status: 200 });
    }
  }

  let teamForRegistration:
    | {
      id: string;
      division: string | null;
      divisionTypeId: string | null;
      sport: string | null;
      playerIds: string[];
      managerId: string | null;
    }
    | null = null;
  let teamRefundReason = normalizeId(parsed.data.refundReason) ?? 'team_refund_requested';
  let teamRefundParticipantUserIds: string[] = [];
  let teamRefundAuthorizedPayerUserIds: string[] = [];
  let teamRefundRequestTeamId: string | null = null;
  let canonicalTeamRow: Record<string, any> | null = null;
  let teamForRemoval: Record<string, any> | null = null;

  if (teamId) {
    const team = await loadCanonicalTeamById(teamId, prisma);

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }
    teamForRemoval = team as Record<string, any>;
    const registeredEventTeam = await findRegisteredEventTeamForCanonical({
      eventId: event.id,
      canonicalTeamId: teamId,
    }, prisma);
    const isTeamManager = normalizeId((team as any).managerId) === session.userId
      || normalizeId((team as any).captainId) === session.userId;
    if (!session.isAdmin && !isTeamManager && !canManageCurrentEvent) {
      return NextResponse.json(
        { error: 'Only the team manager can register or withdraw this team.' },
        { status: 403 },
      );
    }
    if (mode === 'add' && directOnlineCheckoutRequired) {
      return buildCheckoutRequiredResponse();
    }
    teamRefundReason = (!isTeamManager && canManageCurrentEvent)
      ? 'team_unregistered_by_host'
      : 'team_refund_requested';
    teamRefundRequestTeamId = normalizeId((registeredEventTeam as any)?.parentTeamId)
      ?? normalizeId((team as any).parentTeamId)
      ?? team.id;
    teamRefundParticipantUserIds = ensureUnique(
      [
        ...normalizeUserIdList((team as any).playerIds),
        ...normalizeUserIdList([(team as any).captainId, (team as any).managerId, (team as any).headCoachId]),
      ],
    );
    teamRefundAuthorizedPayerUserIds = (session.isAdmin || canManageCurrentEvent)
      ? teamRefundParticipantUserIds
      : [session.userId];
    if (mode === 'add') {
      canonicalTeamRow = team as Record<string, any>;
      teamForRegistration = {
        ...(team as any),
        playerIds: normalizeUserIdList((team as any).playerIds),
      };
    }
  }

  if (teamForRegistration && mode === 'add') {
    const team = teamForRegistration;
    const normalizedEventSport = normalizeSportKey(event.sportId);
    const normalizedTeamSport = normalizeSportKey(team.sport);
    if (normalizedEventSport && normalizedTeamSport !== normalizedEventSport) {
      return NextResponse.json(
        { error: 'This team does not match the event sport.' },
        { status: 403 },
      );
    }
  }

  if (mode === 'add' && teamForRegistration && requiredTemplateIds.length > 0 && teamForRegistration.playerIds.length > 0) {
    const [childProfiles, childEmails, activeLinks] = await Promise.all([
      prisma.userData.findMany({
        where: { id: { in: teamForRegistration.playerIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
        },
      }),
      prisma.sensitiveUserData.findMany({
        where: { userId: { in: teamForRegistration.playerIds } },
        select: {
          userId: true,
          email: true,
        },
      }),
      prisma.parentChildLinks.findMany({
        where: {
          childId: { in: teamForRegistration.playerIds },
          status: 'ACTIVE',
        },
        select: {
          childId: true,
        },
      }),
    ]);

    const childEmailById = new Map(childEmails.map((row) => [row.userId, normalizeEmail(row.email)]));
    const childIds = new Set(activeLinks.map((row) => row.childId));

    childProfiles.forEach((child) => {
      if (!childIds.has(child.id)) {
        return;
      }
      const ageAtEvent = calculateAgeOnDate(child.dateOfBirth, event.start);
      if (!Number.isFinite(ageAtEvent) || ageAtEvent >= 13) {
        return;
      }
      const childEmail = childEmailById.get(child.id);
      if (childEmail) {
        return;
      }
      const name = `${(child.firstName ?? '').trim()} ${(child.lastName ?? '').trim()}`.trim() || child.id;
      warnings.push(`Under-13 player ${name} is missing an email and cannot complete child signature steps until an email is added.`);
    });
  }

  if (teamId) {
    const registeredEventTeam = await findRegisteredEventTeamForCanonical({
      eventId: event.id,
      canonicalTeamId: teamId,
    }, prisma);
    const existingRegistration = registeredEventTeam
      ? await findEventRegistration({
        eventId: event.id,
        registrantType: 'TEAM',
        registrantId: registeredEventTeam.id,
        occurrence: resolvedOccurrence,
      })
      : await findEventRegistration({
        eventId: event.id,
        registrantType: 'TEAM',
        registrantId: teamId,
        occurrence: resolvedOccurrence,
      });

    if (
      mode === 'add'
      && existingRegistration
      && ['STARTED', 'PENDING', 'ACTIVE'].includes(String(existingRegistration.status ?? ''))
      && !canManageCurrentEvent
    ) {
      return NextResponse.json({ error: 'Team is already registered for this event.' }, { status: 409 });
    }

    if (mode === 'add') {
      const result = await (async () => {
        try {
          return await prisma.$transaction(async (tx) => {
            const tournamentPoolIds = isTournamentPoolPlayEnabled(event)
              ? await getTournamentPoolIdsForBracket({
                eventId: event.id,
                bracketDivisionId: divisionSelection.divisionId,
                client: tx,
              })
              : [];
            const eventTeam = await claimOrCreateEventTeamSnapshot({
              tx,
              eventId: event.id,
              canonicalTeamId: teamId,
              createdBy: session.userId,
              canonicalTeam: canonicalTeamRow,
              divisionId: divisionSelection.divisionId,
              divisionTypeId: divisionSelection.divisionTypeId,
              divisionTypeKey: divisionSelection.divisionTypeKey,
              placeholderDivisionIds: tournamentPoolIds,
              occurrence: resolvedOccurrence,
            });
            const registeredEventTeamId = normalizeId((eventTeam as any)?.id) ?? teamId;
            const eventRegistration = await upsertEventRegistration({
              eventId: event.id,
              registrantType: 'TEAM',
              registrantId: registeredEventTeamId,
              parentId: normalizeId((eventTeam as any)?.parentTeamId) ?? teamId,
              rosterRole: 'PARTICIPANT',
              status: isManualRegistrationPaymentMode(event.registrationPaymentMode)
                ? 'PENDING'
                : 'ACTIVE',
              eventTeamId: registeredEventTeamId,
              divisionId: divisionSelection.divisionId ?? normalizeId((eventTeam as any)?.division),
              divisionTypeId: divisionSelection.divisionTypeId ?? normalizeId((eventTeam as any)?.divisionTypeId),
              divisionTypeKey: divisionSelection.divisionTypeKey,
              createdBy: session.userId,
              occurrence: resolvedOccurrence,
            }, tx);
            if (eventAnswersSnapshot.length && eventRegistration?.id) {
              await upsertRegistrationQuestionResponse({
                scopeType: 'EVENT',
                scopeId: event.id,
                subjectType: 'EVENT_REGISTRATION',
                subjectId: eventRegistration.id,
                responderUserId: session.userId,
                registrantUserId: session.userId,
                registrantType: 'TEAM',
                answersSnapshot: eventAnswersSnapshot,
                client: tx,
              });
            }
            if (isTournamentPoolPlayEnabled(event)) {
              await assignRegisteredTeamToTournamentPool({
                eventId: event.id,
                bracketDivisionId: divisionSelection.divisionId,
                eventTeamId: String((eventTeam as any)?.id ?? ''),
                preferredPoolId: tournamentPoolIds.includes(normalizeId((eventTeam as any)?.division) ?? '')
                  ? normalizeId((eventTeam as any)?.division)
                  : null,
                client: tx,
              });
            } else {
              await syncDivisionTeamMembershipFromRegistrations(event, tx);
            }
            await cancelFreeAgentRegistrationsForUsers({
              client: tx,
              eventId: event.id,
              userIds: [
                session.userId,
                ...normalizeUserIdList(teamForRegistration?.playerIds),
              ],
              occurrence: resolvedOccurrence,
            });
            const bill = !canManageCurrentEvent
              ? await createRegistrationBillForRegistration({
                tx,
                event,
                ownerType: 'TEAM',
                ownerId: teamId,
                registrationId: eventRegistration?.id ?? '',
                divisionSelection,
                occurrence: resolvedOccurrence,
                createdBy: session.userId,
              })
              : null;
            return { bill };
          });
        } catch (error) {
          if (isTournamentPoolValidationError(error)) {
            return { error: error.message };
          }
          throw error;
        }
      })();
      if ('error' in result) {
        return NextResponse.json({ error: result.error }, { status: 409 });
      }
      const refreshedEvent = await prisma.events.findUnique({ where: { id: event.id } });
      return NextResponse.json({
        event: toEventResponse(refreshedEvent ?? event),
        bill: result.bill ? result.bill : undefined,
        warnings: warnings.length ? warnings : undefined,
      }, { status: 200 });
    }

    if (!existingRegistration) {
      return NextResponse.json({ error: 'Team is not registered for this event.' }, { status: 404 });
    }

    const now = new Date();
    let autoRefundRequest: RefundRequestRow | null = null;
    let existingAutoRefundRequest: RefundRequestRow | null = null;
    let autoRefundAttempts: StripeRefundAttempt[] = [];

    if (requestedRefundMode === 'auto') {
      const refundTeamIds = ensureUnique(
        [
          teamRefundRequestTeamId,
          teamId,
          normalizeId(existingRegistration.eventTeamId),
        ].filter((value): value is string => Boolean(value)),
      );
      const existingAutoRefundCandidate = await prisma.refundRequests.findFirst({
        where: {
          eventId: event.id,
          teamId: { in: refundTeamIds },
          requestedByUserId: session.userId,
          slotId: resolvedOccurrence?.slotId ?? null,
          occurrenceDate: resolvedOccurrence?.occurrenceDate ?? null,
          status: { in: ['WAITING', 'APPROVED'] },
        },
        orderBy: { updatedAt: 'desc' },
        select: refundRequestSelect,
      }) as RefundRequestRow | null;
      existingAutoRefundRequest = (session.isAdmin || canManageCurrentEvent)
        && existingAutoRefundCandidate
        && isRefundScopeSnapshotValid(existingAutoRefundCandidate)
        ? existingAutoRefundCandidate
        : null;
      autoRefundRequest = existingAutoRefundRequest
        ? {
          ...existingAutoRefundRequest,
          reason: teamRefundReason,
          slotId: resolvedOccurrence?.slotId ?? null,
          occurrenceDate: resolvedOccurrence?.occurrenceDate ?? null,
        }
        : {
          id: crypto.randomUUID(),
          eventId: event.id,
          userId: session.userId,
          requestedByUserId: session.userId,
          hostId: event.hostId,
          teamId: teamRefundRequestTeamId ?? teamId,
          organizationId: event.organizationId ?? null,
          reason: teamRefundReason,
          status: 'APPROVED',
          slotId: resolvedOccurrence?.slotId ?? null,
          occurrenceDate: resolvedOccurrence?.occurrenceDate ?? null,
          authorizedPayerUserIds: teamRefundAuthorizedPayerUserIds,
        };

      try {
        const refundablePayments = await resolveRefundablePaymentsForRequest(
          prisma,
          autoRefundRequest,
          { scopeMode: 'TEAM_WIDE' },
        );
        if (existingAutoRefundRequest && hasRefundScopeDrift(existingAutoRefundRequest, refundablePayments)) {
          return NextResponse.json(
            { error: 'The payment scope changed after this automatic refund was created. Submit a new refund request.' },
            { status: 409 },
          );
        }
        if (!existingAutoRefundRequest && !refundablePayments.length) {
          return NextResponse.json(
            { error: 'No refundable payment found for automatic refund.' },
            { status: 400 },
          );
        }
        if (!existingAutoRefundRequest) {
          autoRefundRequest = {
            ...autoRefundRequest,
            ...buildRefundScopeSnapshot(autoRefundRequest, refundablePayments, 'AUTO_APPROVED'),
          };
        }
        autoRefundAttempts = await createStripeRefundAttempts({
          request: autoRefundRequest,
          payments: refundablePayments,
          approvedByUserId: session.userId,
        });
      } catch (error) {
        console.error('Automatic team refund failed during withdrawal', error);
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Failed to create refund.' },
          { status: 502 },
        );
      }

      if (!autoRefundAttempts.length && existingAutoRefundRequest?.status !== 'APPROVED') {
        return NextResponse.json(
          { error: 'No refundable payment found for automatic refund.' },
          { status: 400 },
        );
      }
    }

    const updatedEvent = await prisma.$transaction(async (tx) => {
      const eventTeamIdToRemove = normalizeId(existingRegistration.eventTeamId) ?? normalizeId(existingRegistration.registrantId) ?? teamId;
      await deleteEventRegistration({
        eventId: event.id,
        registrantType: 'TEAM',
        registrantId: eventTeamIdToRemove,
        occurrence: resolvedOccurrence,
      }, tx);
      let removedTournamentPoolId: string | null = null;
      if (isTournamentPoolPlayEnabled(event)) {
        removedTournamentPoolId = await removeRegisteredTeamFromTournamentPools({
          eventId: event.id,
          eventTeamId: eventTeamIdToRemove,
          client: tx,
        });
      }

      const existingEventTeamId = normalizeId(existingRegistration.eventTeamId)
        ?? normalizeId(registeredEventTeam?.id);
      if (existingEventTeamId) {
        await tx.eventRegistrations.updateMany({
          where: {
            eventTeamId: existingEventTeamId,
            registrantType: { not: 'TEAM' },
            status: { in: ['STARTED', 'PENDING', 'ACTIVE', 'BLOCKED', 'CONSENTFAILED'] },
          },
          data: {
            status: 'CANCELLED',
            updatedAt: now,
          },
        });
        await tx.eventTeamStaffAssignments?.updateMany?.({
          where: {
            eventTeamId: existingEventTeamId,
            status: 'ACTIVE',
          },
          data: {
            status: 'CANCELLED',
            updatedAt: now,
          },
        });
      }

      if (
        existingEventTeamId
        && isSchedulableTeamSignupEvent(event)
        && (!registeredEventTeam || isSlotProvisionedTeam(registeredEventTeam))
      ) {
        await resetEventTeamSlotToPlaceholder({
          tx,
          event,
          eventTeamId: existingEventTeamId,
          eventTeam: registeredEventTeam,
          team: teamForRemoval,
          existingRegistration,
          poolDivisionId: removedTournamentPoolId,
          createdBy: session.userId,
          occurrence: resolvedOccurrence,
          now,
        });
      }

      await syncDivisionTeamMembershipFromRegistrations(event, tx);
      const touchedEvent = await tx.events.update({
        where: { id: event.id },
        data: { updatedAt: now },
      });

      if (requestedRefundMode === 'auto' && autoRefundRequest) {
        if (existingAutoRefundRequest) {
          await tx.refundRequests.update({
            where: { id: existingAutoRefundRequest.id },
            data: {
              status: 'APPROVED',
              updatedAt: now,
            },
          });
        } else {
          await tx.refundRequests.create({
            data: {
              id: autoRefundRequest.id,
              eventId: autoRefundRequest.eventId,
              userId: autoRefundRequest.userId,
              requestedByUserId: autoRefundRequest.requestedByUserId,
              hostId: autoRefundRequest.hostId,
              teamId: autoRefundRequest.teamId,
              organizationId: autoRefundRequest.organizationId,
              slotId: autoRefundRequest.slotId ?? null,
              occurrenceDate: autoRefundRequest.occurrenceDate ?? null,
              billIds: autoRefundRequest.billIds ?? [],
              paymentIds: autoRefundRequest.paymentIds ?? [],
              paymentScope: autoRefundRequest.paymentScope ?? [],
              requestedAmountCents: autoRefundRequest.requestedAmountCents ?? 0,
              currency: autoRefundRequest.currency ?? 'usd',
              policyDecision: autoRefundRequest.policyDecision,
              scopeVersion: autoRefundRequest.scopeVersion ?? REFUND_SCOPE_VERSION,
              scopeHash: autoRefundRequest.scopeHash,
              reason: autoRefundRequest.reason,
              status: 'APPROVED',
              createdAt: now,
              updatedAt: now,
            },
          });
        }
        await applyRefundAttempts(tx, autoRefundAttempts, now);
      } else {
        await ensureTeamRefundRequest({
          eventId: event.id,
          hostId: event.hostId,
          organizationId: event.organizationId ?? null,
          teamId: teamRefundRequestTeamId ?? normalizeId(existingRegistration.eventTeamId) ?? teamId,
          requestedByUserId: session.userId,
          reason: teamRefundReason,
          participantUserIds: teamRefundAuthorizedPayerUserIds,
          slotId: resolvedOccurrence?.slotId ?? null,
          occurrenceDate: resolvedOccurrence?.occurrenceDate ?? null,
        }, tx);
      }

      return touchedEvent;
    });

    return NextResponse.json({
      event: toEventResponse(updatedEvent),
      warnings: warnings.length ? warnings : undefined,
    }, { status: 200 });
  }

  const registrant = await prisma.userData.findUnique({
    where: { id: userId! },
    select: { dateOfBirth: true },
  });
  if (!registrant) {
    return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
  }

  const ageAtEvent = calculateAgeOnDate(registrant.dateOfBirth, event.start);
  if (!Number.isFinite(ageAtEvent)) {
    return NextResponse.json({ error: 'Invalid date of birth' }, { status: 400 });
  }

  const canManageLinkedChild = session.userId !== userId && !canManageCurrentEvent
    ? await canManageLinkedChildParticipant({
      parentId: session.userId,
      childId: userId!,
    })
    : false;
  const registrantType = canManageLinkedChild ? 'CHILD' : 'SELF';
  const parentId = canManageLinkedChild ? session.userId : null;

  if (mode === 'add') {
    const existingSelf = await findEventRegistration({
      eventId: event.id,
      registrantType: 'SELF',
      registrantId: userId!,
      occurrence: resolvedOccurrence,
    });
    const existingChild = await findEventRegistration({
      eventId: event.id,
      registrantType: 'CHILD',
      registrantId: userId!,
      occurrence: resolvedOccurrence,
    });
    const activeExisting = [existingSelf, existingChild].find((row) => (
      Boolean(row) && ['STARTED', 'PENDING', 'ACTIVE'].includes(String(row?.status ?? ''))
    ));
    if (activeExisting) {
      return NextResponse.json({ error: 'User is already registered for this event.' }, { status: 409 });
    }

    let consentDocumentId: string | null = null;
    let consentStatus: string | null = null;

    if (requiredTemplateIds.length > 0) {
      if (registrantType === 'CHILD' && parentId) {
        const childSensitive = await prisma.sensitiveUserData.findFirst({
          where: { userId: userId! },
          select: { email: true },
        });
        const childEmail = normalizeEmail(childSensitive?.email);
        const consentDispatch = await dispatchRequiredEventDocuments({
          eventId: event.id,
          organizationId: event.organizationId ?? null,
          requiredTemplateIds,
          parentUserId: parentId,
          childUserId: userId!,
        });
        consentDocumentId = consentDispatch.firstDocumentId ?? null;
        consentStatus = !childEmail
          ? 'child_email_required'
          : (consentDispatch.errors.length > 0 ? 'send_failed' : 'sent');
        warnings.push(...consentDispatch.errors);
      } else {
        const consentDispatch = await dispatchRequiredEventDocuments({
          eventId: event.id,
          organizationId: event.organizationId ?? null,
          requiredTemplateIds,
          participantUserId: userId!,
        });
        consentDocumentId = consentDispatch.firstDocumentId ?? null;
        consentStatus = consentDispatch.errors.length > 0 ? 'send_failed' : 'sent';
        warnings.push(...consentDispatch.errors);
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const registration = await upsertEventRegistration({
        eventId: event.id,
        registrantType,
        registrantId: userId!,
        parentId,
        rosterRole: 'PARTICIPANT',
        status: requiredTemplateIds.length > 0
          ? 'STARTED'
          : isManualRegistrationPaymentMode(event.registrationPaymentMode)
            ? 'PENDING'
            : 'ACTIVE',
        ageAtEvent,
        divisionId: divisionSelection.divisionId,
        divisionTypeId: divisionSelection.divisionTypeId,
        divisionTypeKey: divisionSelection.divisionTypeKey,
        consentDocumentId,
        consentStatus,
        createdBy: session.userId,
        occurrence: resolvedOccurrence,
      }, tx);
      if (eventAnswersSnapshot.length) {
        await upsertRegistrationQuestionResponse({
          scopeType: 'EVENT',
          scopeId: event.id,
          subjectType: 'EVENT_REGISTRATION',
          subjectId: registration.id,
          responderUserId: session.userId,
          registrantUserId: userId!,
          registrantType,
          answersSnapshot: eventAnswersSnapshot,
          client: tx,
        });
      }

      await tx.invites?.deleteMany?.({
        where: {
          type: 'EVENT',
          eventId: event.id,
          userId: session.userId,
        },
      });

      const bill = !canManageCurrentEvent && registrantType === 'SELF' && requiredTemplateIds.length === 0
        ? await createRegistrationBillForRegistration({
          tx,
          event,
          ownerType: 'USER',
          ownerId: userId!,
          registrationId: registration.id,
          divisionSelection,
          occurrence: resolvedOccurrence,
          createdBy: session.userId,
        })
        : null;

      return { registration, bill };
    });

    return NextResponse.json({
      event: toEventResponse(event),
      registration: result.registration,
      bill: result.bill ? result.bill : undefined,
      warnings: warnings.length ? warnings : undefined,
    }, { status: 200 });
  }

  const updatedEvent = await prisma.$transaction(async (tx) => {
    await tx.eventRegistrations.updateMany({
      where: {
        eventId: event.id,
        registrantId: userId!,
        registrantType: { in: ['SELF', 'CHILD'] },
        status: { not: 'CANCELLED' },
        ...(resolvedOccurrence
          ? {
            slotId: resolvedOccurrence.slotId,
            occurrenceDate: resolvedOccurrence.occurrenceDate,
          }
          : {
            slotId: null,
            occurrenceDate: null,
          }),
      },
      data: {
        status: 'CANCELLED',
        updatedAt: new Date(),
      },
    });
    return tx.events.update({
      where: { id: event.id },
      data: { updatedAt: new Date() },
    });
  });

  await prisma.invites?.deleteMany?.({
    where: {
      type: 'EVENT',
      eventId: event.id,
      userId: session.userId,
    },
  });

  return NextResponse.json({
    event: toEventResponse(updatedEvent),
    warnings: warnings.length ? warnings : undefined,
  }, { status: 200 });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  return updateParticipants(req, params, 'add');
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  return updateParticipants(req, params, 'remove');
}
