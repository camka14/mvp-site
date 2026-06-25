import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { calculateMvpAndStripeFeesWithTax, getPaymentMethodFeeLabel } from '@/lib/billingFees';
import {
  type BillingAddress,
  loadUserBillingProfile,
  resolveBillingAddressInput,
  upsertUserBillingAddress,
  validateUsBillingAddress,
} from '@/lib/billingAddress';
import { resolvePurchaseContext } from '@/lib/purchaseContext';
import {
  buildOrganizerManualTaxQuote,
  buildZeroTaxQuote,
  calculateTaxQuote,
  INTERNAL_TAX_CATEGORIES,
  type InternalTaxCategory,
  type TaxQuote,
} from '@/lib/stripeTax';
import {
  normalizeOrganizerManualTaxRateBps,
  resolvePurchaseTaxPolicy,
  taxPolicyRequiresStripeTaxCalculation,
  taxPolicyUsesOrganizerManualTax,
  type TaxPolicyDecision,
} from '@/lib/taxPolicy';
import { buildDestinationTransferData } from '@/lib/stripeConnectAccounts';
import {
  buildBillingAddressFingerprint,
  findReusableIncompleteProductPaymentIntent,
  findReusableIncompleteTeamRegistrationPaymentIntent,
  getCheckoutTaxCalculationIdFromMetadata,
  getCheckoutTaxCategoryFromMetadata,
} from '@/lib/stripeCheckoutReuse';
import { resolveEventDivisionSelection } from '@/app/api/events/[eventId]/registrationDivisionUtils';
import {
  extractRentalCheckoutWindow,
  releaseRentalCheckoutLocks,
  reserveRentalCheckoutLocks,
  type RentalCheckoutWindow,
} from '@/server/repositories/rentalCheckoutLocks';
import { buildEventRegistrationId } from '@/server/events/eventRegistrations';
import {
  findTeamRegistration,
  releaseStartedTeamRegistration,
  reserveTeamRegistrationSlot,
} from '@/server/teams/teamOpenRegistration';
import {
  canManageCanonicalTeam,
  claimOrCreateEventTeamSnapshot,
  loadCanonicalTeamById,
} from '@/server/teams/teamMembership';
import { getTeamRegistrationSignatureState } from '@/server/teams/teamRegistrationDocuments';
import {
  isWeeklyParentEvent,
  isWeeklyOccurrenceJoinClosed,
  resolveWeeklyOccurrence,
  WEEKLY_OCCURRENCE_JOIN_CLOSED_ERROR,
} from '@/server/events/weeklyOccurrences';
import { loadBillingTaxPolicyContext } from '@/server/billingTaxContext';
import {
  deleteRegistrationQuestionResponsesForSubjects,
  loadAndBuildRegistrationAnswerSnapshot,
  upsertRegistrationQuestionResponse,
} from '@/server/registrationQuestions';
import { requireVerifiedEmailForPaidRegistration } from '@/server/emailVerificationGate';
import {
  attachDiscountCodeReservationPaymentIntent,
  DiscountCodeError,
  releaseDiscountCodeReservation,
  reserveDiscountApplication,
  resolveDiscountApplication,
  type ResolvedDiscountApplication,
} from '@/server/discounts/discountCodeResolver';

export const dynamic = 'force-dynamic';

const schema = z.object({
  user: z.record(z.string(), z.any()).optional(),
  event: z.record(z.string(), z.any()).optional(),
  team: z.record(z.string(), z.any()).optional(),
  teamRegistration: z.union([z.record(z.string(), z.any()), z.string()]).optional(),
  timeSlot: z.record(z.string(), z.any()).optional(),
  organization: z.record(z.string(), z.any()).optional(),
  purchaseType: z.string().optional(),
  slotId: z.string().optional(),
  occurrenceDate: z.string().optional(),
  productId: z.string().optional(),
  billId: z.string().optional(),
  billPaymentId: z.string().optional(),
  discountCode: z.string().optional(),
  taxCategory: z.enum(INTERNAL_TAX_CATEGORIES).optional(),
  billingAddress: z.unknown().optional(),
}).passthrough();

const normalizeString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length ? normalized : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const extractEntityId = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') {
    return normalizeString(value);
  }
  const row = value as Record<string, unknown>;
  return normalizeString(row.$id ?? row.id ?? row.teamId);
};

type TeamRegistrationCheckoutTarget = {
  teamId: string | null;
  registrantId: string | null;
  registrantType: 'SELF' | 'CHILD';
  parentId: string | null;
  rosterRole: 'PARTICIPANT' | 'WAITLIST' | 'FREE_AGENT';
  consentDocumentId: string | null;
  consentStatus: string | null;
};

const parseTeamRegistrationCheckoutTarget = (params: {
  teamRegistration: unknown;
  fallbackTeamId: string | null;
  fallbackUserId: string | null;
}): TeamRegistrationCheckoutTarget => {
  const row = params.teamRegistration && typeof params.teamRegistration === 'object'
    ? params.teamRegistration as Record<string, unknown>
    : null;
  const embeddedTeam = row?.team && typeof row.team === 'object'
    ? row.team as Record<string, unknown>
    : null;
  const registrantType = String(row?.registrantType ?? '').trim().toUpperCase() === 'CHILD' ? 'CHILD' : 'SELF';
  const rosterRoleValue = String(row?.rosterRole ?? '').trim().toUpperCase();
  const rosterRole = rosterRoleValue === 'WAITLIST' || rosterRoleValue === 'FREE_AGENT'
    ? rosterRoleValue
    : 'PARTICIPANT';

  return {
    teamId: normalizeString(row?.teamId ?? embeddedTeam?.$id ?? embeddedTeam?.id ?? row?.$id ?? row?.id)
      ?? params.fallbackTeamId,
    registrantId: normalizeString(
      row?.registrantId
        ?? row?.userId
        ?? row?.childId,
    ) ?? params.fallbackUserId,
    registrantType,
    parentId: normalizeString(row?.parentId),
    rosterRole,
    consentDocumentId: normalizeString(row?.consentDocumentId),
    consentStatus: normalizeString(row?.consentStatus),
  };
};

const buildLineItemReference = ({
  purchaseType,
  productId,
  eventId,
  teamId,
  timeSlotId,
  billId,
  billPaymentId,
}: {
  purchaseType: string;
  productId?: string | null;
  eventId?: string | null;
  teamId?: string | null;
  timeSlotId?: string | null;
  billId?: string | null;
  billPaymentId?: string | null;
}) => [purchaseType, productId, eventId, teamId, timeSlotId, billId, billPaymentId]
  .filter((value): value is string => Boolean(value))
  .join('_')
  .slice(0, 200);

const appendMetadata = (
  metadata: Record<string, string>,
  key: string,
  value: unknown,
  maxLength = 200,
) => {
  const normalized = normalizeString(value);
  if (!normalized) return;
  metadata[key] = normalized.slice(0, maxLength);
};

const isSignedStatus = (value: unknown): boolean => {
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === 'signed' || normalized === 'completed';
};

const STARTED_REGISTRATION_TTL_MS = 10 * 60 * 1000;

type RegistrationHoldResponseFields = {
  registrationId?: string;
  registrationHoldExpiresAt?: string;
  registrationHoldTtlSeconds?: number;
};

const buildRegistrationHoldResponseFields = (
  registrationId: string | null,
  registrationHoldExpiresAt: Date | null | undefined,
): RegistrationHoldResponseFields => (
  registrationId && registrationHoldExpiresAt
    ? {
        registrationId,
        registrationHoldExpiresAt: registrationHoldExpiresAt.toISOString(),
        registrationHoldTtlSeconds: Math.floor(STARTED_REGISTRATION_TTL_MS / 1000),
      }
    : {}
);

const buildFeeBreakdown = (taxQuote: TaxQuote) => ({
  eventPrice: taxQuote.subtotalCents,
  stripeFee: taxQuote.stripeFeeCents,
  stripeProcessingFee: taxQuote.stripeProcessingFeeCents,
  stripeTaxServiceFee: taxQuote.stripeTaxServiceFeeCents,
  processingFee: taxQuote.processingFeeCents,
  mvpFee: taxQuote.processingFeeCents,
  taxAmount: taxQuote.taxAmountCents,
  totalCharge: taxQuote.totalChargeCents,
  hostReceives: taxQuote.hostReceivesCents,
  feePercentage: taxQuote.feePercentage,
  paymentMethodType: taxQuote.paymentMethodType,
  paymentMethodLabel: taxQuote.paymentMethodLabel,
  purchaseType: taxQuote.purchaseType,
});

const taxPolicyResponseFields = (taxPolicy: TaxPolicyDecision) => ({
  taxMode: taxPolicy.mode,
  taxReasonCode: taxPolicy.reasonCode,
  taxJurisdictionState: taxPolicy.jurisdictionState,
  taxability: taxPolicy.taxability,
  taxLiabilityParty: taxPolicy.liabilityParty,
  taxCollectionStrategy: taxPolicy.collectionStrategy,
  taxPolicyRuleId: taxPolicy.policyRuleId,
  taxPolicyRuleVersion: taxPolicy.policyRuleVersion,
  organizerResponsibilityMessage: taxPolicy.organizerResponsibilityMessage,
});

type RegistrationDivisionSelectionInput = {
  divisionId?: string | null;
  divisionTypeId?: string | null;
  divisionTypeKey?: string | null;
};

const sortRegistrationsByCreatedAt = <T extends { id: string; createdAt: Date | null }>(rows: T[]): T[] => (
  [...rows].sort((left, right) => {
    const leftTime = left.createdAt ? left.createdAt.getTime() : 0;
    const rightTime = right.createdAt ? right.createdAt.getTime() : 0;
    if (leftTime !== rightTime) return leftTime - rightTime;
    return left.id.localeCompare(right.id);
  })
);

const reserveEventRegistrationSlot = async ({
  eventId,
  teamId,
  userId,
  actorUserId,
  actorIsAdmin,
  divisionSelectionInput,
  answers,
  slotId,
  occurrenceDate,
  now,
}: {
  eventId: string | null;
  teamId: string | null;
  userId: string | null;
  actorUserId: string;
  actorIsAdmin?: boolean;
  divisionSelectionInput: RegistrationDivisionSelectionInput;
  answers?: unknown;
  slotId?: string | null;
  occurrenceDate?: string | null;
  now: Date;
}): Promise<{
  ok: true;
  registrationId: string;
  teamId: string | null;
  registrationHoldExpiresAt: Date;
} | { ok: false; status: number; error: string }> => {
  if (!eventId) {
    return { ok: false, status: 400, error: 'Event id is required for event checkout.' };
  }
  if (!teamId && !userId) {
    return { ok: false, status: 400, error: 'User or team id is required for event checkout.' };
  }

  const cutoff = new Date(now.getTime() - STARTED_REGISTRATION_TTL_MS);

  return prisma.$transaction(async (tx) => {
    const lockedEvents = await tx.$queryRaw<Array<{
      id: string;
      start: Date | string | null;
      minAge: number | null;
      maxAge: number | null;
      sportId: string | null;
      registrationByDivisionType: boolean | null;
      maxParticipants: number | null;
      teamSignup: boolean | null;
      eventType: string | null;
      includePlayoffs: boolean | null;
      parentEvent: string | null;
      timeSlotIds: string[] | null;
    }>>`
      SELECT
        "id",
        "start",
        "minAge",
        "maxAge",
        "sportId",
        "registrationByDivisionType",
        "maxParticipants",
        "teamSignup",
        "eventType",
        "includePlayoffs",
        "parentEvent",
        "timeSlotIds"
      FROM "Events"
      WHERE "id" = ${eventId}
      FOR UPDATE
    `;
    const event = lockedEvents[0] ?? null;
    if (!event) {
      return { ok: false, status: 404, error: 'Event not found.' };
    }
    const eventDivisionRows = typeof (tx as any).divisions?.findMany === 'function'
      ? await (tx as any).divisions.findMany({
          where: {
            eventId,
            OR: [
              { kind: 'LEAGUE' },
              { kind: null },
            ],
          },
          orderBy: [
            { sortOrder: 'asc' },
            { createdAt: 'asc' },
            { name: 'asc' },
            { id: 'asc' },
          ],
          select: {
            id: true,
          },
        })
      : [];
    const eventDivisionIds = eventDivisionRows.length
      ? normalizeStringList(eventDivisionRows.map((row: { id?: string | null }) => row.id))
      : normalizeStringList((event as any).divisions);
    (event as any).divisions = eventDivisionIds;

    const expectsTeamRegistration = Boolean(event.teamSignup);
    if (expectsTeamRegistration && !teamId) {
      return { ok: false, status: 409, error: 'Team registration is required for this event.' };
    }
    if (!expectsTeamRegistration && teamId) {
      return { ok: false, status: 409, error: 'This event requires individual registration.' };
    }

    const hasOccurrenceInput = Boolean(slotId || occurrenceDate);
    const resolvedOccurrence = isWeeklyParentEvent(event)
      ? await resolveWeeklyOccurrence({
        event,
        occurrence: {
          slotId: slotId ?? undefined,
          occurrenceDate: occurrenceDate ?? undefined,
        },
      }, tx)
      : null;
    if (resolvedOccurrence && !resolvedOccurrence.ok) {
      return { ok: false, status: 400, error: resolvedOccurrence.error };
    }
    if (isWeeklyParentEvent(event) && (!slotId || !occurrenceDate)) {
      return { ok: false, status: 400, error: 'Weekly event checkout requires slotId and occurrenceDate.' };
    }
    if (!isWeeklyParentEvent(event) && hasOccurrenceInput) {
      return { ok: false, status: 400, error: 'Occurrence selection is only valid for weekly events.' };
    }
    const occurrence = resolvedOccurrence?.ok ? resolvedOccurrence.value : null;
    if (occurrence && isWeeklyOccurrenceJoinClosed(occurrence, now)) {
      return { ok: false, status: 409, error: WEEKLY_OCCURRENCE_JOIN_CLOSED_ERROR };
    }
    const eventStart = event.start instanceof Date
      ? event.start
      : (event.start ? new Date(event.start) : now);
    const normalizedEventStart = Number.isNaN(eventStart.getTime()) ? now : eventStart;
    const selectionInput = {
      divisionId: normalizeString(divisionSelectionInput.divisionId ?? null),
      divisionTypeId: normalizeString(divisionSelectionInput.divisionTypeId ?? null),
      divisionTypeKey: normalizeString(divisionSelectionInput.divisionTypeKey ?? null),
    };
    const divisionSelectionResult = await resolveEventDivisionSelection({
      event: {
        id: event.id,
        start: normalizedEventStart,
        minAge: event.minAge ?? null,
        maxAge: event.maxAge ?? null,
        sportId: event.sportId ?? null,
        registrationByDivisionType: event.registrationByDivisionType ?? null,
        divisions: normalizeStringList((event as any).divisions),
        eventType: event.eventType ?? null,
        includePlayoffs: event.includePlayoffs ?? null,
      },
      input: selectionInput,
    });
    if (!divisionSelectionResult.ok) {
      return {
        ok: false,
        status: 400,
        error: divisionSelectionResult.error ?? 'Invalid division selection.',
      };
    }
    const divisionSelection = divisionSelectionResult.selection;
    const answersSnapshot = await loadAndBuildRegistrationAnswerSnapshot({
      scopeType: 'EVENT',
      scopeId: eventId,
      answers,
      client: tx,
    });

    let participantTeamId = teamId;
    let parentTeamId: string | null = null;
    if (teamId) {
      const eventTeam = await tx.teams.findUnique({
        where: { id: teamId },
        select: { id: true },
      });
      if (eventTeam?.id) {
        participantTeamId = eventTeam.id;
      } else {
        const canonicalTeam = await loadCanonicalTeamById(teamId, tx);
        if (!canonicalTeam) {
          return { ok: false, status: 404, error: 'Team not found.' };
        }
        const canManageTeam = await canManageCanonicalTeam({
          teamId,
          userId: actorUserId,
          isAdmin: actorIsAdmin,
        }, tx);
        if (!canManageTeam) {
          return { ok: false, status: 403, error: 'Only the team manager can register this team.' };
        }
        const checkoutEventTeam = await claimOrCreateEventTeamSnapshot({
          tx,
          eventId,
          canonicalTeamId: teamId,
          createdBy: actorUserId,
          canonicalTeam,
          divisionId: divisionSelection.divisionId,
          divisionTypeId: divisionSelection.divisionTypeId,
          divisionTypeKey: divisionSelection.divisionTypeKey,
          occurrence,
          upsertRegistration: false,
        });
        participantTeamId = normalizeString((checkoutEventTeam as any)?.id);
        parentTeamId = teamId;
      }
      if (!participantTeamId) {
        return { ok: false, status: 404, error: 'Team not found.' };
      }
    }

    const participantId = participantTeamId ?? (userId as string);
    const registrationId = buildEventRegistrationId({
      eventId,
      registrantType: participantTeamId ? 'TEAM' : 'SELF',
      registrantId: participantId,
      slotId: occurrence?.slotId ?? null,
      occurrenceDate: occurrence?.occurrenceDate ?? null,
    });

    const staleStartedRows = await tx.eventRegistrations.findMany({
      where: {
        eventId,
        status: 'STARTED' as any,
        OR: [
          { createdAt: null },
          { createdAt: { lt: cutoff } },
        ],
      },
      select: { id: true },
    });
    if (staleStartedRows.length > 0) {
      await deleteRegistrationQuestionResponsesForSubjects({
        subjectType: 'EVENT_REGISTRATION',
        subjectIds: staleStartedRows.map((row) => row.id),
        client: tx,
      });
      await tx.eventRegistrations.deleteMany({
        where: { id: { in: staleStartedRows.map((row) => row.id) } },
      });
    }

    const existing = await tx.eventRegistrations.findUnique({
      where: { id: registrationId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        divisionId: true,
        divisionTypeId: true,
        divisionTypeKey: true,
      },
    });
    if (existing && (existing.status === 'ACTIVE' || existing.status === 'PENDING')) {
      return {
        ok: false,
        status: 409,
        error: existing.status === 'PENDING'
          ? 'Payment is pending for this event registration.'
          : 'Participant is already registered for this event.',
      };
    }

    let divisionMaxParticipants: number | null = null;
    let divisionIdForCapacity: string | null = null;
    if (divisionSelection.divisionId) {
      const selectedDivision = await tx.divisions.findFirst({
        where: {
          eventId,
          OR: [
            { id: divisionSelection.divisionId },
            { key: divisionSelection.divisionId },
          ],
        },
        select: {
          id: true,
          maxParticipants: true,
        },
      });
      if (!selectedDivision) {
        return { ok: false, status: 400, error: 'Selected division is not available for this event.' };
      }
      divisionIdForCapacity = selectedDivision.id;
      divisionMaxParticipants = selectedDivision.maxParticipants ?? null;
      if (!divisionMaxParticipants || divisionMaxParticipants <= 0) {
        return { ok: false, status: 400, error: 'Set max participants for this division before checkout.' };
      }
    }

    const existingStatus = String(existing?.status ?? '').trim().toUpperCase();
    const registrationHoldCreatedAt = existingStatus === 'STARTED'
      ? existing?.createdAt ?? now
      : now;

    if (!existing) {
      await tx.eventRegistrations.create({
        data: {
          id: registrationId,
          eventId,
          registrantId: participantId,
          parentId: parentTeamId,
          eventTeamId: participantTeamId,
          registrantType: participantTeamId ? 'TEAM' : 'SELF',
          rosterRole: 'PARTICIPANT' as any,
          status: 'STARTED' as any,
          slotId: occurrence?.slotId ?? null,
          occurrenceDate: occurrence?.occurrenceDate ?? null,
          ageAtEvent: null,
          divisionId: divisionSelection.divisionId,
          divisionTypeId: divisionSelection.divisionTypeId,
          divisionTypeKey: divisionSelection.divisionTypeKey,
          consentDocumentId: null,
          consentStatus: null,
          createdBy: actorUserId,
          createdAt: now,
          updatedAt: now,
        },
      });
    } else if (
      existing.status !== ('STARTED' as any)
      || existing.divisionId !== divisionSelection.divisionId
      || existing.divisionTypeId !== divisionSelection.divisionTypeId
      || existing.divisionTypeKey !== divisionSelection.divisionTypeKey
    ) {
      await tx.eventRegistrations.update({
        where: { id: registrationId },
        data: {
          registrantId: participantId,
          parentId: parentTeamId,
          eventTeamId: participantTeamId,
          registrantType: participantTeamId ? 'TEAM' : 'SELF',
          rosterRole: 'PARTICIPANT' as any,
          status: 'STARTED' as any,
          slotId: occurrence?.slotId ?? null,
          occurrenceDate: occurrence?.occurrenceDate ?? null,
          divisionId: divisionSelection.divisionId,
          divisionTypeId: divisionSelection.divisionTypeId,
          divisionTypeKey: divisionSelection.divisionTypeKey,
          createdAt: registrationHoldCreatedAt,
          updatedAt: now,
        },
      });
    }

    if (answersSnapshot.length > 0) {
      await upsertRegistrationQuestionResponse({
        scopeType: 'EVENT',
        scopeId: eventId,
        subjectType: 'EVENT_REGISTRATION',
        subjectId: registrationId,
        responderUserId: actorUserId,
        registrantUserId: userId ?? actorUserId,
        registrantType: participantTeamId ? 'TEAM' : 'SELF',
        answersSnapshot,
        client: tx,
      });
    }

    const registrantScope = teamId
      ? { registrantType: 'TEAM' as any }
      : { registrantType: { in: ['SELF', 'CHILD'] as any[] } };
    const releaseStartedReservation = async () => {
      await deleteRegistrationQuestionResponsesForSubjects({
        subjectType: 'EVENT_REGISTRATION',
        subjectIds: [registrationId],
        client: tx,
      });
      await tx.eventRegistrations.deleteMany({
        where: {
          id: registrationId,
          status: 'STARTED' as any,
        },
      });
    };

    if (divisionMaxParticipants && divisionMaxParticipants > 0 && divisionIdForCapacity) {
      const divisionRegistrations = await tx.eventRegistrations.findMany({
        where: {
          eventId,
          status: { in: ['STARTED', 'PENDING', 'ACTIVE'] as any[] },
          rosterRole: 'PARTICIPANT' as any,
          ...registrantScope,
          ...(occurrence
            ? {
              slotId: occurrence.slotId,
              occurrenceDate: occurrence.occurrenceDate,
            }
            : {
              slotId: null,
              occurrenceDate: null,
            }),
          divisionId: divisionIdForCapacity,
        },
        select: { id: true, createdAt: true },
      });
      const orderedDivision = sortRegistrationsByCreatedAt(divisionRegistrations);
      if (orderedDivision.length > divisionMaxParticipants) {
        const divisionPosition = orderedDivision.findIndex((entry) => entry.id === registrationId);
        if (divisionPosition < 0 || divisionPosition >= divisionMaxParticipants) {
          await releaseStartedReservation();
          return { ok: false, status: 409, error: 'Selected division is full. Registration slot was not reserved.' };
        }
      }
    }

    const maxParticipants = eventDivisionIds.length ? 0 : (event.maxParticipants ?? 0);
    if (maxParticipants > 0) {
      const cappedRegistrations = await tx.eventRegistrations.findMany({
        where: {
          eventId,
          status: { in: ['STARTED', 'PENDING', 'ACTIVE'] as any[] },
          rosterRole: 'PARTICIPANT' as any,
          ...registrantScope,
          ...(occurrence
            ? {
              slotId: occurrence.slotId,
              occurrenceDate: occurrence.occurrenceDate,
            }
            : {
              slotId: null,
              occurrenceDate: null,
            }),
        },
        select: { id: true, createdAt: true },
      });
      const ordered = sortRegistrationsByCreatedAt(cappedRegistrations);
      if (ordered.length > maxParticipants) {
        const position = ordered.findIndex((entry) => entry.id === registrationId);
        if (position < 0 || position >= maxParticipants) {
          await releaseStartedReservation();
          return { ok: false, status: 409, error: 'Event is full. Registration slot was not reserved.' };
        }
      }
    }

    return {
      ok: true,
      registrationId,
      teamId: participantTeamId,
      registrationHoldExpiresAt: new Date(registrationHoldCreatedAt.getTime() + STARTED_REGISTRATION_TTL_MS),
    };
  });
};

const releaseStartedRegistration = async ({
  registrationId,
  eventId,
}: {
  registrationId: string | null;
  eventId: string | null;
}) => {
  if (!registrationId || !eventId) return;
  try {
    await prisma.eventRegistrations.deleteMany({
      where: {
        id: registrationId,
        eventId,
        status: 'STARTED' as any,
      },
    });
  } catch (error) {
    console.warn('Failed to release started registration after checkout intent failure.', {
      registrationId,
      eventId,
      error,
    });
  }
};

const releaseStartedCheckoutRegistration = async ({
  purchaseType,
  registrationId,
  eventId,
  teamId,
}: {
  purchaseType: string | null;
  registrationId: string | null;
  eventId: string | null;
  teamId: string | null;
}) => {
  const normalizedPurchaseType = (purchaseType ?? '').trim().toLowerCase();
  if (normalizedPurchaseType === 'team_registration') {
    await releaseStartedTeamRegistration({
      registrationId,
      teamId,
    });
    return;
  }
  await releaseStartedRegistration({
    registrationId,
    eventId,
  });
};

const releaseReservedRentalWindow = async ({
  window,
  userId,
}: {
  window: RentalCheckoutWindow | null;
  userId: string;
}) => {
  if (!window) return;
  try {
    await releaseRentalCheckoutLocks({
      client: prisma,
      window,
      userId,
    });
  } catch (error) {
    console.warn('Failed to release reserved rental checkout window.', {
      eventId: window.eventId,
      fieldIds: window.fieldIds,
      error,
    });
  }
};

const normalizeDivisionInput = (payload: Record<string, unknown>): RegistrationDivisionSelectionInput => {
  const eventPayload = payload.event && typeof payload.event === 'object'
    ? (payload.event as Record<string, unknown>)
    : {};
  return {
    divisionId: normalizeString(payload.divisionId ?? eventPayload.divisionId ?? null),
    divisionTypeId: normalizeString(payload.divisionTypeId ?? eventPayload.divisionTypeId ?? null),
    divisionTypeKey: normalizeString(payload.divisionTypeKey ?? eventPayload.divisionTypeKey ?? null),
  };
};

const normalizeStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .map((entry) => normalizeString(entry))
    .filter((entry): entry is string => Boolean(entry));
  return Array.from(new Set(normalized));
};

const resolveDiscountTargetId = ({
  purchaseType,
  eventId,
  productId,
  teamId,
}: {
  purchaseType: string;
  eventId: string | null;
  productId: string | null;
  teamId: string | null;
}): string | null => {
  if (purchaseType === 'event') {
    return eventId;
  }
  if (purchaseType === 'product') {
    return productId;
  }
  if (purchaseType === 'team_registration') {
    return teamId;
  }
  return null;
};

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;
  const payloadRow = payload as Record<string, unknown>;
  const userId = extractEntityId(payload.user);
  const eventId = extractEntityId(payload.event);
  const requestedPurchaseType = normalizeString(payload.purchaseType);
  const directTeamId = extractEntityId(payload.team);
  const teamCheckoutTarget = parseTeamRegistrationCheckoutTarget({
    teamRegistration: payload.teamRegistration,
    fallbackTeamId: requestedPurchaseType === 'team_registration' ? directTeamId : null,
    fallbackUserId: userId ?? session.userId,
  });
  const teamId = teamCheckoutTarget.teamId ?? directTeamId;
  let checkoutTeamId = teamId;
  const slotId = normalizeString(payload.slotId);
  const occurrenceDate = normalizeString(payload.occurrenceDate);
  const divisionSelectionInput = normalizeDivisionInput(payloadRow);
  const hostTemplateSource = (payload.timeSlot as Record<string, unknown> | undefined)?.hostRequiredTemplateIds;
  const hostRequiredTemplateIds = Array.from(
    new Set(
      [
        ...(
          Array.isArray(hostTemplateSource)
            ? hostTemplateSource.map((value) => normalizeString(value))
            : []
        ),
      ].filter((value): value is string => Boolean(value)),
    ),
  );
  const primaryRequiredTemplateId = hostRequiredTemplateIds[0] ?? null;

  if (payload.timeSlot && hostRequiredTemplateIds.length > 0) {
    if (!userId) {
      return NextResponse.json({ error: 'Sign in to complete rental document signing before payment.' }, { status: 403 });
    }
    const templates = await prisma.templateDocuments.findMany({
      where: { id: { in: hostRequiredTemplateIds } },
      select: { id: true, title: true, signOnce: true },
    });
    const templateById = new Map(templates.map((template) => [template.id, template]));
    const missingTemplateIds = hostRequiredTemplateIds.filter((templateId) => !templateById.has(templateId));
    if (missingTemplateIds.length > 0) {
      return NextResponse.json({
        error: `Rental document templates not found: ${missingTemplateIds.join(', ')}`,
      }, { status: 400 });
    }
    const unsignedTemplateLabels: string[] = [];
    for (const templateId of hostRequiredTemplateIds) {
      const template = templateById.get(templateId);
      if (!template) {
        continue;
      }
      if (!template.signOnce && !eventId) {
        return NextResponse.json({ error: 'Event id is required to verify rental document signatures.' }, { status: 400 });
      }

      const signedRows = await prisma.signedDocuments.findMany({
        where: {
          templateId: template.id,
          userId,
          signerRole: 'participant',
          ...(template.signOnce ? {} : { eventId }),
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: { status: true },
      });
      const hasSignedDocument = signedRows.some((row) => isSignedStatus(row.status));
      if (!hasSignedDocument) {
        unsignedTemplateLabels.push(template.title?.trim() || template.id);
      }
    }

    if (unsignedTemplateLabels.length > 0) {
      return NextResponse.json({
        error: `Rental document must be signed before checkout: ${unsignedTemplateLabels.join(', ')}`,
      }, { status: 403 });
    }
  }

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
  const secretKey = process.env.STRIPE_SECRET_KEY;
  let resolvedPurchase: Awaited<ReturnType<typeof resolvePurchaseContext>>;

  try {
    resolvedPurchase = await resolvePurchaseContext({
      productId: payload.productId ?? null,
      event: payload.event ?? null,
      teamRegistration: payload.teamRegistration ?? (requestedPurchaseType === 'team_registration' ? payload.team ?? null : null),
      timeSlot: payload.timeSlot ?? null,
      requestedTaxCategory: (payload.taxCategory ?? null) as InternalTaxCategory | null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to resolve purchase details.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  let checkoutAmountCents = resolvedPurchase.amountCents;
  let discountApplication: ResolvedDiscountApplication | null = null;
  let discountReservationRequest: {
    code: string;
    purchaseType: 'event' | 'product' | 'team_registration';
    targetId: string;
  } | null = null;
  const requestedDiscountCode = normalizeString(payload.discountCode);
  if (requestedDiscountCode) {
    if (
      resolvedPurchase.purchaseType !== 'event'
      && resolvedPurchase.purchaseType !== 'product'
      && resolvedPurchase.purchaseType !== 'team_registration'
    ) {
      return NextResponse.json({ error: 'Discount codes are not supported for this purchase type.' }, { status: 400 });
    }
    const discountTargetId = resolveDiscountTargetId({
      purchaseType: resolvedPurchase.purchaseType,
      eventId,
      productId: payload.productId ?? resolvedPurchase.product?.id ?? null,
      teamId: teamId ?? resolvedPurchase.team?.id ?? null,
    });
    const discountPurchaseType = resolvedPurchase.purchaseType as 'event' | 'product' | 'team_registration';
    try {
      const discountResult = await resolveDiscountApplication({
        code: requestedDiscountCode,
        purchaseType: discountPurchaseType,
        targetId: discountTargetId ?? '',
        originalAmountCents: resolvedPurchase.amountCents,
        buyerUserId: session.userId,
      });
      checkoutAmountCents = discountResult.amountCents;
      discountApplication = discountResult.discount;
      if (discountResult.discount && discountTargetId) {
        discountReservationRequest = {
          code: requestedDiscountCode,
          purchaseType: discountPurchaseType,
          targetId: discountTargetId,
        };
      }
    } catch (error) {
      if (error instanceof DiscountCodeError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      const message = error instanceof Error ? error.message : 'Unable to apply discount code.';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const taxContext = await loadBillingTaxPolicyContext({
    event: payload.event ?? null,
    timeSlot: payload.timeSlot ?? null,
    organization: payload.organization ?? null,
    organizationId:
      resolvedPurchase.organizationId
      ?? normalizeString(payload.event?.organizationId)
      ?? normalizeString(resolvedPurchase.product?.organizationId)
      ?? null,
  });

  const taxPolicy = resolvePurchaseTaxPolicy({
    purchaseType: resolvedPurchase.purchaseType,
    taxCategory: resolvedPurchase.taxCategory,
    event: taxContext.event ?? payload.event ?? null,
    organization: taxContext.organization ?? payload.organization ?? null,
    timeSlot: taxContext.timeSlot ?? payload.timeSlot ?? null,
  });
  const organizerManualTaxRateBps = normalizeOrganizerManualTaxRateBps(
    (taxContext.event ?? payload.event ?? null)?.organizerManualTaxRateBps,
  );

  let existingTeamRegistration: Awaited<ReturnType<typeof findTeamRegistration>> | null = null;
  if (resolvedPurchase.purchaseType === 'team_registration') {
    const registrantId = teamCheckoutTarget.registrantId ?? userId ?? session.userId;
    if (!teamId || !registrantId) {
      return NextResponse.json({ error: 'Registrant and team are required for team checkout.' }, { status: 400 });
    }

    existingTeamRegistration = await findTeamRegistration({
      teamId,
      registrantId,
    });
    if (existingTeamRegistration) {
      teamCheckoutTarget.parentId = normalizeString(existingTeamRegistration.parentId) ?? teamCheckoutTarget.parentId;
      teamCheckoutTarget.registrantType = String(existingTeamRegistration.registrantType ?? '').trim().toUpperCase() === 'CHILD'
        ? 'CHILD'
        : teamCheckoutTarget.registrantType;
      teamCheckoutTarget.rosterRole = String(existingTeamRegistration.rosterRole ?? '').trim().toUpperCase() === 'WAITLIST'
        ? 'WAITLIST'
        : String(existingTeamRegistration.rosterRole ?? '').trim().toUpperCase() === 'FREE_AGENT'
          ? 'FREE_AGENT'
          : teamCheckoutTarget.rosterRole;
      teamCheckoutTarget.consentDocumentId = normalizeString(existingTeamRegistration.consentDocumentId)
        ?? teamCheckoutTarget.consentDocumentId;
    }

    const signatureState = await getTeamRegistrationSignatureState({
      teamId,
      registrantId,
      registrantType: teamCheckoutTarget.registrantType,
      parentId: teamCheckoutTarget.parentId,
    });
    if (!signatureState.hasCompletedRequiredSignatures) {
      const missingLabel = signatureState.missingTemplateLabels[0];
      const errorMessage = signatureState.missingChildEmail
        ? 'Child email is required before team documents can be signed.'
        : missingLabel
          ? `Team document must be signed before checkout: ${signatureState.missingTemplateLabels.join(', ')}`
          : 'Required team documents must be signed before checkout.';
      return NextResponse.json({
        error: errorMessage,
        missingTemplateIds: signatureState.missingTemplateIds,
        missingTemplateLabels: signatureState.missingTemplateLabels,
        consentStatus: signatureState.consentStatus,
        requiresChildEmail: signatureState.missingChildEmail,
      }, { status: 403 });
    }

    teamCheckoutTarget.consentStatus = signatureState.consentStatus ?? 'completed';
  }

  if (checkoutAmountCents <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }
  if (
    resolvedPurchase.purchaseType === 'event'
    || resolvedPurchase.purchaseType === 'team_registration'
  ) {
    const emailVerificationRequired = await requireVerifiedEmailForPaidRegistration(session.userId);
    if (emailVerificationRequired) {
      return emailVerificationRequired;
    }
  }

  if (taxPolicy.collectionStrategy === 'BLOCKED_NEEDS_REVIEW') {
    return NextResponse.json({
      error: 'Tax collection must be configured before checkout can continue.',
      ...taxPolicyResponseFields(taxPolicy),
    }, { status: 400 });
  }
  if (taxPolicy.collectionStrategy === 'ORGANIZER_STRIPE_TAX') {
    return NextResponse.json({
      error: 'Organizer Stripe Tax checkout requires connected-account tax setup and is not enabled for this checkout yet.',
      ...taxPolicyResponseFields(taxPolicy),
    }, { status: 400 });
  }

  if (!secretKey) {
    if (taxPolicyUsesOrganizerManualTax(taxPolicy)) {
      const manualTaxQuote = buildOrganizerManualTaxQuote({
        subtotalCents: checkoutAmountCents,
        organizerManualTaxRateBps,
        purchaseType: resolvedPurchase.purchaseType,
        taxCategory: resolvedPurchase.taxCategory,
        eventType: resolvedPurchase.eventType,
      });
      return NextResponse.json({
        paymentIntent: `pi_mock_${crypto.randomUUID()}`,
        publishableKey,
        checkoutMode: 'PAYMENT_INTENT',
        taxCategory: resolvedPurchase.taxCategory,
        ...taxPolicyResponseFields(taxPolicy),
        feeBreakdown: buildFeeBreakdown(manualTaxQuote),
      }, { status: 200 });
    }
    const fallbackFees = calculateMvpAndStripeFeesWithTax({
      eventAmountCents: checkoutAmountCents,
      eventType: resolvedPurchase.eventType,
      taxAmountCents: 0,
      stripeTaxServiceFeeCents: 0,
    });
    return NextResponse.json({
      paymentIntent: `pi_mock_${crypto.randomUUID()}`,
      publishableKey,
      checkoutMode: 'PAYMENT_INTENT',
      taxCalculationId: taxPolicyRequiresStripeTaxCalculation(taxPolicy) ? `tax_mock_${crypto.randomUUID()}` : undefined,
      taxCategory: resolvedPurchase.taxCategory,
      ...taxPolicyResponseFields(taxPolicy),
      feeBreakdown: {
        eventPrice: checkoutAmountCents,
        stripeFee: fallbackFees.stripeFeeCents,
        stripeProcessingFee: fallbackFees.stripeProcessingFeeCents,
        stripeTaxServiceFee: fallbackFees.stripeTaxServiceFeeCents,
        processingFee: fallbackFees.mvpFeeCents,
        mvpFee: fallbackFees.mvpFeeCents,
        taxAmount: 0,
        totalCharge: fallbackFees.totalChargeCents,
        hostReceives: fallbackFees.hostReceivesCents,
        feePercentage: fallbackFees.mvpFeePercentage * 100,
        paymentMethodType: fallbackFees.paymentMethodType,
        paymentMethodLabel: getPaymentMethodFeeLabel(fallbackFees.paymentMethodType),
        purchaseType: resolvedPurchase.purchaseType,
      },
    }, { status: 200 });
  }

  const inlineBillingAddress = resolveBillingAddressInput(payload.billingAddress);
  if (payload.billingAddress !== undefined && !inlineBillingAddress) {
    return NextResponse.json({ error: 'Invalid billing address.' }, { status: 400 });
  }
  const billingProfile = await loadUserBillingProfile(session.userId);
  let savedBillingProfile: Awaited<ReturnType<typeof upsertUserBillingAddress>> | null = null;
  if (inlineBillingAddress) {
    try {
      savedBillingProfile = await upsertUserBillingAddress(session.userId, inlineBillingAddress);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save billing address.';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }
  const billingAddress = savedBillingProfile?.billingAddress ?? billingProfile.billingAddress;
  const billingEmail = savedBillingProfile?.email ?? billingProfile.email;
  const requiresBillingAddressForTax = taxPolicyRequiresStripeTaxCalculation(taxPolicy);
  if (requiresBillingAddressForTax && !billingAddress) {
    return NextResponse.json({
      error: 'Billing address is required before creating a payment intent.',
      billingAddressRequired: true,
    }, { status: 400 });
  }

  const stripe = new Stripe(secretKey);
  let validatedBillingAddress: BillingAddress | null = null;
  if (billingAddress) {
    try {
      validatedBillingAddress = validateUsBillingAddress(billingAddress);
    } catch (error) {
      if (requiresBillingAddressForTax) {
        const message = error instanceof Error ? error.message : 'Invalid billing address.';
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }
  }
  const eventIdForReference = taxContext.eventId ?? extractEntityId(payload.event);
  const timeSlotIdForReference = taxContext.timeSlotId ?? extractEntityId(payload.timeSlot);
  const organizationId =
    taxContext.organizationId
    ?? extractEntityId(payload.organization)
    ?? resolvedPurchase.organizationId
    ?? normalizeString(payload.event?.organizationId)
    ?? normalizeString(resolvedPurchase.product?.organizationId)
    ?? null;
  const hostUserId = resolvedPurchase.hostUserId ?? normalizeString(payload.event?.hostId);

  let taxQuote: TaxQuote;
  if (taxPolicy.mode === 'ZERO_TAX') {
    taxQuote = buildZeroTaxQuote({
      subtotalCents: checkoutAmountCents,
      purchaseType: resolvedPurchase.purchaseType,
      taxCategory: resolvedPurchase.taxCategory,
      eventType: resolvedPurchase.eventType,
    });
  } else if (taxPolicyUsesOrganizerManualTax(taxPolicy)) {
    taxQuote = buildOrganizerManualTaxQuote({
      subtotalCents: checkoutAmountCents,
      organizerManualTaxRateBps,
      purchaseType: resolvedPurchase.purchaseType,
      taxCategory: resolvedPurchase.taxCategory,
      eventType: resolvedPurchase.eventType,
    });
  } else {
    try {
      taxQuote = await calculateTaxQuote({
        stripe,
        userId: session.userId,
        organizationId,
        email: billingEmail,
        billingAddress: validatedBillingAddress as BillingAddress,
        subtotalCents: checkoutAmountCents,
        purchaseType: resolvedPurchase.purchaseType,
        taxCategory: resolvedPurchase.taxCategory,
        eventType: resolvedPurchase.eventType,
        lineItemReference: buildLineItemReference({
          purchaseType: resolvedPurchase.purchaseType,
          productId: resolvedPurchase.product?.id ?? null,
          eventId: eventIdForReference,
          teamId: checkoutTeamId,
          timeSlotId: timeSlotIdForReference,
          billId: payload.billId ?? null,
          billPaymentId: payload.billPaymentId ?? null,
        }),
        description: resolvedPurchase.product?.name
          ?? resolvedPurchase.team?.name
          ?? normalizeString(payload.event?.name)
          ?? resolvedPurchase.purchaseType,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to calculate tax.';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const feeBreakdown = buildFeeBreakdown(taxQuote);
  const connectedAccountTransferAmountCents = taxPolicyUsesOrganizerManualTax(taxPolicy)
    ? taxQuote.hostReceivesCents + taxQuote.taxAmountCents
    : taxQuote.hostReceivesCents;

  const transferData = await buildDestinationTransferData({
    organizationId,
    hostUserId,
    transferAmountCents: connectedAccountTransferAmountCents,
  });
  const billingAddressFingerprint = buildBillingAddressFingerprint(validatedBillingAddress);

  if (resolvedPurchase.purchaseType === 'product' && !discountApplication) {
    const productId = payload.productId ?? resolvedPurchase.product?.id ?? '';
    const reusableIntent = await findReusableIncompleteProductPaymentIntent({
      stripe,
      customerId: taxQuote.customerId,
      productId,
      userId: session.userId,
      organizationId,
      totalChargeCents: taxQuote.totalChargeCents,
      billingAddressFingerprint,
      transferData,
    });
    if (reusableIntent?.client_secret) {
      return NextResponse.json({
        paymentIntent: reusableIntent.client_secret,
        publishableKey,
        checkoutMode: 'PAYMENT_INTENT',
        taxCalculationId: (getCheckoutTaxCalculationIdFromMetadata(reusableIntent.metadata) ?? taxQuote.calculationId) || undefined,
        taxCategory: getCheckoutTaxCategoryFromMetadata(reusableIntent.metadata) ?? taxQuote.taxCategory,
        ...taxPolicyResponseFields(taxPolicy),
        feeBreakdown,
      }, { status: 200 });
    }
  }

  const actorUserId = normalizeString(session?.userId) ?? userId ?? 'system:purchase-intent';
  const checkoutUserId = resolvedPurchase.purchaseType === 'team_registration'
    ? (teamCheckoutTarget.registrantId ?? userId ?? session.userId)
    : (userId ?? session.userId);
  let reservedRegistrationId: string | null = null;
  let reservedRegistrationHoldExpiresAt: Date | null = null;
  let reservedRentalWindow: RentalCheckoutWindow | null = null;

  if (resolvedPurchase.purchaseType === 'event') {
    const reservationResult = await reserveEventRegistrationSlot({
      eventId,
      teamId,
      userId: checkoutUserId,
      actorUserId,
      actorIsAdmin: Boolean(session.isAdmin),
      divisionSelectionInput,
      answers: payloadRow.answers,
      slotId,
      occurrenceDate,
      now: new Date(),
    });
    if (!reservationResult.ok) {
      return NextResponse.json({ error: reservationResult.error }, { status: reservationResult.status });
    }
    reservedRegistrationId = reservationResult.registrationId;
    reservedRegistrationHoldExpiresAt = reservationResult.registrationHoldExpiresAt;
    checkoutTeamId = reservationResult.teamId ?? checkoutTeamId;
  } else if (resolvedPurchase.purchaseType === 'team_registration') {
    const reservationResult = await reserveTeamRegistrationSlot({
      teamId,
      userId: checkoutUserId,
      actorUserId,
      status: 'STARTED',
      registrantType: teamCheckoutTarget.registrantType,
      parentId: teamCheckoutTarget.parentId,
      rosterRole: teamCheckoutTarget.rosterRole,
      consentDocumentId: teamCheckoutTarget.consentDocumentId
        ?? normalizeString(existingTeamRegistration?.consentDocumentId),
      consentStatus: teamCheckoutTarget.consentStatus
        ?? normalizeString(existingTeamRegistration?.consentStatus),
      now: new Date(),
    });
    if (!reservationResult.ok) {
      return NextResponse.json({ error: reservationResult.error }, { status: reservationResult.status });
    }
    reservedRegistrationId = reservationResult.registrationId;
    reservedRegistrationHoldExpiresAt = reservationResult.registrationHoldExpiresAt ?? null;
  } else if (resolvedPurchase.purchaseType === 'rental') {
    const rentalWindowResult = extractRentalCheckoutWindow({
      event: payload.event,
      timeSlot: payload.timeSlot,
    });
    if (!rentalWindowResult.ok) {
      return NextResponse.json({ error: rentalWindowResult.error }, { status: rentalWindowResult.status });
    }
    const now = new Date();
    if (rentalWindowResult.window.start.getTime() < now.getTime()) {
      return NextResponse.json({ error: 'Rental selections must start in the future.' }, { status: 400 });
    }

    const lockReservation = await reserveRentalCheckoutLocks({
      client: prisma,
      window: rentalWindowResult.window,
      userId: actorUserId,
      now,
    });
    if (!lockReservation.ok) {
      return NextResponse.json(
        {
          error: lockReservation.error,
          conflicts: lockReservation.conflicts,
          conflictFieldIds: lockReservation.conflictFieldIds,
        },
        { status: lockReservation.status },
      );
    }
    reservedRentalWindow = rentalWindowResult.window;
  }

  const registrationHoldResponseFields = buildRegistrationHoldResponseFields(
    reservedRegistrationId,
    reservedRegistrationHoldExpiresAt,
  );

  if (
    resolvedPurchase.purchaseType === 'team_registration'
    && reservedRegistrationId
    && checkoutUserId
    && !discountApplication
  ) {
    const reusableIntent = await findReusableIncompleteTeamRegistrationPaymentIntent({
      stripe,
      customerId: taxQuote.customerId,
      teamId: teamId ?? resolvedPurchase.team?.id ?? '',
      userId: checkoutUserId,
      organizationId,
      registrationId: reservedRegistrationId,
      totalChargeCents: taxQuote.totalChargeCents,
      billingAddressFingerprint,
      transferData,
    });
    if (reusableIntent?.client_secret) {
      return NextResponse.json({
        paymentIntent: reusableIntent.client_secret,
        publishableKey,
        checkoutMode: 'PAYMENT_INTENT',
        taxCalculationId: (getCheckoutTaxCalculationIdFromMetadata(reusableIntent.metadata) ?? taxQuote.calculationId) || undefined,
        taxCategory: getCheckoutTaxCategoryFromMetadata(reusableIntent.metadata) ?? taxQuote.taxCategory,
        ...taxPolicyResponseFields(taxPolicy),
        feeBreakdown,
        ...registrationHoldResponseFields,
      }, { status: 200 });
    }
  }

  if (discountApplication && discountReservationRequest) {
    try {
      const reservationResult = await reserveDiscountApplication({
        ...discountReservationRequest,
        originalAmountCents: resolvedPurchase.amountCents,
        buyerUserId: actorUserId,
        registrationId: reservedRegistrationId,
        productId: payload.productId ?? resolvedPurchase.product?.id ?? null,
        organizationId,
      });
      if (reservationResult.amountCents !== checkoutAmountCents) {
        throw new DiscountCodeError('Discount code pricing changed. Please refresh checkout and try again.', 409);
      }
      discountApplication = reservationResult.discount;
    } catch (error) {
      await releaseStartedCheckoutRegistration({
        purchaseType: resolvedPurchase.purchaseType,
        registrationId: reservedRegistrationId,
        eventId,
        teamId: checkoutTeamId,
      });
      await releaseReservedRentalWindow({
        window: reservedRentalWindow,
        userId: actorUserId,
      });
      if (error instanceof DiscountCodeError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      const message = error instanceof Error ? error.message : 'Unable to reserve discount code.';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  try {
    const metadata: Record<string, string> = {
      purchase_type: resolvedPurchase.purchaseType,
      fees_included_in_price: 'true',
    };

    appendMetadata(metadata, 'user_id', checkoutUserId);
    appendMetadata(metadata, 'buyer_user_id', actorUserId);
    appendMetadata(metadata, 'team_id', checkoutTeamId);
    appendMetadata(metadata, 'event_id', eventId);
    if (resolvedPurchase.purchaseType === 'rental') {
      appendMetadata(metadata, 'rental_booking_id', eventId);
    }
    appendMetadata(metadata, 'product_id', payload.productId ?? resolvedPurchase.product?.id);
    appendMetadata(metadata, 'organization_id', organizationId);
    appendMetadata(metadata, 'organization_name', payload.organization?.name);
    appendMetadata(metadata, 'team_name', payload.team?.name ?? resolvedPurchase.team?.name);
    appendMetadata(metadata, 'amount_cents', taxQuote.subtotalCents);
    appendMetadata(metadata, 'original_amount_cents', discountApplication?.originalAmountCents);
    appendMetadata(metadata, 'discounted_amount_cents', discountApplication?.discountedAmountCents);
    appendMetadata(metadata, 'discount_code', discountApplication?.code);
    appendMetadata(metadata, 'discount_id', discountApplication?.discountId);
    appendMetadata(metadata, 'discount_code_id', discountApplication?.discountCodeId);
    appendMetadata(metadata, 'discount_reservation_id', discountApplication?.reservationId);
    appendMetadata(metadata, 'total_charge_cents', taxQuote.totalChargeCents);
    appendMetadata(metadata, 'processing_fee_cents', taxQuote.processingFeeCents);
    appendMetadata(metadata, 'mvp_fee_cents', taxQuote.processingFeeCents);
    appendMetadata(metadata, 'stripe_fee_cents', taxQuote.stripeFeeCents);
    appendMetadata(metadata, 'stripe_processing_fee_cents', taxQuote.stripeProcessingFeeCents);
    appendMetadata(metadata, 'stripe_tax_service_fee_cents', taxQuote.stripeTaxServiceFeeCents);
    appendMetadata(metadata, 'payment_method_fee_type', taxQuote.paymentMethodType);
    appendMetadata(metadata, 'payment_method_fee_label', taxQuote.paymentMethodLabel);
    appendMetadata(metadata, 'tax_cents', taxQuote.taxAmountCents);
    appendMetadata(metadata, 'fee_percentage', taxQuote.feePercentage.toFixed(4));
    appendMetadata(metadata, 'tax_calculation_id', taxQuote.calculationId);
    appendMetadata(metadata, 'tax_category', taxQuote.taxCategory);
    appendMetadata(metadata, 'tax_mode', taxPolicy.mode);
    appendMetadata(metadata, 'tax_reason_code', taxPolicy.reasonCode);
    appendMetadata(metadata, 'tax_jurisdiction_state', taxPolicy.jurisdictionState);
    appendMetadata(metadata, 'taxability', taxPolicy.taxability);
    appendMetadata(metadata, 'tax_liability_party', taxPolicy.liabilityParty);
    appendMetadata(metadata, 'tax_collection_strategy', taxPolicy.collectionStrategy);
    appendMetadata(metadata, 'tax_policy_rule_id', taxPolicy.policyRuleId);
    appendMetadata(metadata, 'tax_policy_rule_version', taxPolicy.policyRuleVersion);
    appendMetadata(metadata, 'organizer_manual_tax_rate_bps', taxPolicyUsesOrganizerManualTax(taxPolicy) ? organizerManualTaxRateBps : null);
    appendMetadata(metadata, 'billing_address_fingerprint', billingAddressFingerprint);
    appendMetadata(metadata, 'event_name', payload.event?.name);
    appendMetadata(metadata, 'event_location', payload.event?.location);
    appendMetadata(metadata, 'event_start', payload.event?.start);
    appendMetadata(metadata, 'host_id', hostUserId);
    appendMetadata(metadata, 'time_slot_id', extractEntityId(payload.timeSlot));
    appendMetadata(metadata, 'occurrence_slot_id', slotId);
    appendMetadata(metadata, 'occurrence_date', occurrenceDate);
    appendMetadata(metadata, 'time_slot_start', payload.timeSlot?.startDate);
    appendMetadata(metadata, 'time_slot_end', payload.timeSlot?.endDate);
    appendMetadata(metadata, 'rental_template_id', primaryRequiredTemplateId);
    if (hostRequiredTemplateIds.length > 1) {
      appendMetadata(metadata, 'rental_template_ids', hostRequiredTemplateIds.join(','));
    }
    appendMetadata(metadata, 'rental_host_template_id', primaryRequiredTemplateId);
    if (hostRequiredTemplateIds.length > 1) {
      appendMetadata(metadata, 'rental_host_template_ids', hostRequiredTemplateIds.join(','));
    }
    appendMetadata(metadata, 'registration_id', reservedRegistrationId);
    appendMetadata(metadata, 'team_registration_registrant_type', teamCheckoutTarget.registrantType);
    appendMetadata(metadata, 'team_registration_parent_id', teamCheckoutTarget.parentId);
    appendMetadata(metadata, 'team_registration_roster_role', teamCheckoutTarget.rosterRole);
    appendMetadata(metadata, 'team_registration_consent_document_id', teamCheckoutTarget.consentDocumentId);
    appendMetadata(metadata, 'team_registration_consent_status', teamCheckoutTarget.consentStatus);
    appendMetadata(metadata, 'product_name', resolvedPurchase.product?.name);
    appendMetadata(metadata, 'product_description', resolvedPurchase.product?.description);
    appendMetadata(metadata, 'product_period', resolvedPurchase.product?.period);
    appendMetadata(metadata, 'transfer_destination_account_id', transferData?.destination);
    appendMetadata(metadata, 'transfer_amount_cents', transferData?.amount);

    const intent = await stripe.paymentIntents.create({
      amount: taxQuote.totalChargeCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      customer: taxQuote.customerId || undefined,
      receipt_email: billingEmail ?? undefined,
      ...(taxQuote.calculationId
        ? {
          hooks: {
            inputs: {
              tax: {
                calculation: taxQuote.calculationId,
              },
            },
          },
        }
        : {}),
      metadata,
      ...(transferData ? { transfer_data: transferData } : {}),
    });

    if (discountApplication?.reservationId) {
      await attachDiscountCodeReservationPaymentIntent({
        reservationId: discountApplication.reservationId,
        paymentIntentId: intent.id,
      }).catch((error) => {
        console.warn('Failed to attach discount reservation to payment intent.', {
          reservationId: discountApplication?.reservationId,
          paymentIntentId: intent.id,
          error,
        });
      });
    }

    return NextResponse.json({
      paymentIntent: intent.client_secret ?? intent.id,
      publishableKey,
      checkoutMode: 'PAYMENT_INTENT',
      taxCalculationId: taxQuote.calculationId || undefined,
      taxCategory: taxQuote.taxCategory,
      ...taxPolicyResponseFields(taxPolicy),
      feeBreakdown,
      ...registrationHoldResponseFields,
    }, { status: 200 });
  } catch (error) {
    console.error('Stripe payment intent failed', error);
    await releaseStartedCheckoutRegistration({
      purchaseType: resolvedPurchase.purchaseType,
      registrationId: reservedRegistrationId,
      eventId,
      teamId: checkoutTeamId,
    });
    await releaseReservedRentalWindow({
      window: reservedRentalWindow,
      userId: actorUserId,
    });
    await releaseDiscountCodeReservation({
      reservationId: discountApplication?.reservationId,
    });
    const message = error instanceof Error ? error.message : 'Failed to create payment intent.';
    return NextResponse.json({
      error: message,
      publishableKey,
      checkoutMode: 'PAYMENT_INTENT',
      taxCalculationId: taxQuote.calculationId || undefined,
      taxCategory: taxQuote.taxCategory,
      ...taxPolicyResponseFields(taxPolicy),
      feeBreakdown,
    }, { status: 502 });
  }
}
