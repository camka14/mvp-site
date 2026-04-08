import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { calculateMvpAndStripeFeesWithTax } from '@/lib/billingFees';
import {
  loadUserBillingProfile,
  resolveBillingAddressInput,
  upsertUserBillingAddress,
  validateUsBillingAddress,
} from '@/lib/billingAddress';
import { resolvePurchaseContext } from '@/lib/purchaseContext';
import { calculateTaxQuote, INTERNAL_TAX_CATEGORIES, type InternalTaxCategory } from '@/lib/stripeTax';
import { buildDestinationTransferData } from '@/lib/stripeConnectAccounts';
import { resolveEventDivisionSelection } from '@/app/api/events/[eventId]/registrationDivisionUtils';
import {
  extractRentalCheckoutWindow,
  releaseRentalCheckoutLocks,
  reserveRentalCheckoutLocks,
  type RentalCheckoutWindow,
} from '@/server/repositories/rentalCheckoutLocks';

export const dynamic = 'force-dynamic';

const schema = z.object({
  user: z.record(z.string(), z.any()).optional(),
  event: z.record(z.string(), z.any()).optional(),
  team: z.record(z.string(), z.any()).optional(),
  timeSlot: z.record(z.string(), z.any()).optional(),
  organization: z.record(z.string(), z.any()).optional(),
  productId: z.string().optional(),
  billId: z.string().optional(),
  billPaymentId: z.string().optional(),
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
  return normalizeString(row.$id ?? row.id);
};

const buildLineItemReference = ({
  purchaseType,
  productId,
  eventId,
  timeSlotId,
  billId,
  billPaymentId,
}: {
  purchaseType: string;
  productId?: string | null;
  eventId?: string | null;
  timeSlotId?: string | null;
  billId?: string | null;
  billPaymentId?: string | null;
}) => [purchaseType, productId, eventId, timeSlotId, billId, billPaymentId]
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

const STARTED_REGISTRATION_TTL_MS = 5 * 60 * 1000;

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
  divisionSelectionInput,
  now,
}: {
  eventId: string | null;
  teamId: string | null;
  userId: string | null;
  actorUserId: string;
  divisionSelectionInput: RegistrationDivisionSelectionInput;
  now: Date;
}): Promise<{ ok: true; registrationId: string } | { ok: false; status: number; error: string }> => {
  if (!eventId) {
    return { ok: false, status: 400, error: 'Event id is required for event checkout.' };
  }
  if (!teamId && !userId) {
    return { ok: false, status: 400, error: 'User or team id is required for event checkout.' };
  }

  const registrationId = teamId ? `${eventId}__team__${teamId}` : `${eventId}__self__${userId}`;
  const cutoff = new Date(now.getTime() - STARTED_REGISTRATION_TTL_MS);

  return prisma.$transaction(async (tx) => {
    const lockedEvents = await tx.$queryRaw<Array<{
      id: string;
      start: Date | string | null;
      minAge: number | null;
      maxAge: number | null;
      sportId: string | null;
      registrationByDivisionType: boolean | null;
      divisions: unknown;
      maxParticipants: number | null;
      teamSignup: boolean | null;
    }>>`
      SELECT
        "id",
        "start",
        "minAge",
        "maxAge",
        "sportId",
        "registrationByDivisionType",
        "divisions",
        "maxParticipants",
        "teamSignup"
      FROM "Events"
      WHERE "id" = ${eventId}
      FOR UPDATE
    `;
    const event = lockedEvents[0] ?? null;
    if (!event) {
      return { ok: false, status: 404, error: 'Event not found.' };
    }

    const expectsTeamRegistration = Boolean(event.teamSignup);
    if (expectsTeamRegistration && !teamId) {
      return { ok: false, status: 409, error: 'Team registration is required for this event.' };
    }
    if (!expectsTeamRegistration && teamId) {
      return { ok: false, status: 409, error: 'This event requires individual registration.' };
    }

    if (teamId) {
      const team = await tx.teams.findUnique({
        where: { id: teamId },
        select: { id: true },
      });
      if (!team) {
        return { ok: false, status: 404, error: 'Team not found.' };
      }
    }

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
    if (existing?.status === 'ACTIVE') {
      return { ok: false, status: 409, error: 'Participant is already registered for this event.' };
    }

    const eventStart = event.start instanceof Date
      ? event.start
      : (event.start ? new Date(event.start) : now);
    const normalizedEventStart = Number.isNaN(eventStart.getTime()) ? now : eventStart;
    const selectionInput = {
      divisionId: normalizeString(divisionSelectionInput.divisionId ?? existing?.divisionId ?? null),
      divisionTypeId: normalizeString(divisionSelectionInput.divisionTypeId ?? existing?.divisionTypeId ?? null),
      divisionTypeKey: normalizeString(divisionSelectionInput.divisionTypeKey ?? existing?.divisionTypeKey ?? null),
    };
    const divisionSelectionResult = await resolveEventDivisionSelection({
      event: {
        id: event.id,
        start: normalizedEventStart,
        minAge: event.minAge ?? null,
        maxAge: event.maxAge ?? null,
        sportId: event.sportId ?? null,
        registrationByDivisionType: event.registrationByDivisionType ?? null,
        divisions: normalizeStringList(event.divisions),
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
    let divisionMaxParticipants = 0;
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
      divisionMaxParticipants = selectedDivision.maxParticipants ?? 0;
    }

    if (!existing) {
      await tx.eventRegistrations.create({
        data: {
          id: registrationId,
          eventId,
          registrantId: teamId ?? (userId as string),
          registrantType: teamId ? 'TEAM' : 'SELF',
          status: 'STARTED' as any,
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
          status: 'STARTED' as any,
          divisionId: divisionSelection.divisionId,
          divisionTypeId: divisionSelection.divisionTypeId,
          divisionTypeKey: divisionSelection.divisionTypeKey,
          updatedAt: now,
        },
      });
    }

    const registrantScope = teamId
      ? { registrantType: 'TEAM' as any }
      : { registrantType: { in: ['SELF', 'CHILD'] as any[] } };
    const releaseStartedReservation = async () => {
      await tx.eventRegistrations.deleteMany({
        where: {
          id: registrationId,
          status: 'STARTED' as any,
        },
      });
    };

    if (divisionMaxParticipants > 0 && divisionIdForCapacity) {
      const divisionRegistrations = await tx.eventRegistrations.findMany({
        where: {
          eventId,
          status: { in: ['STARTED', 'ACTIVE', 'PENDINGCONSENT'] as any[] },
          ...registrantScope,
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

    const maxParticipants = event.maxParticipants ?? 0;
    if (maxParticipants > 0) {
      const cappedRegistrations = await tx.eventRegistrations.findMany({
        where: {
          eventId,
          status: { in: ['STARTED', 'ACTIVE', 'PENDINGCONSENT'] as any[] },
          ...registrantScope,
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

    return { ok: true, registrationId };
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
  const teamId = extractEntityId(payload.team);
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
      timeSlot: payload.timeSlot ?? null,
      requestedTaxCategory: (payload.taxCategory ?? null) as InternalTaxCategory | null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to resolve purchase details.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (resolvedPurchase.amountCents <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }

  if (!secretKey) {
    const fallbackFees = calculateMvpAndStripeFeesWithTax({
      eventAmountCents: resolvedPurchase.amountCents,
      eventType: resolvedPurchase.eventType,
      taxAmountCents: 0,
      stripeTaxServiceFeeCents: 0,
    });
    return NextResponse.json({
      paymentIntent: `pi_mock_${crypto.randomUUID()}`,
      publishableKey,
      taxCalculationId: `tax_mock_${crypto.randomUUID()}`,
      taxCategory: resolvedPurchase.taxCategory,
      feeBreakdown: {
        eventPrice: resolvedPurchase.amountCents,
        stripeFee: fallbackFees.stripeFeeCents,
        processingFee: fallbackFees.mvpFeeCents,
        mvpFee: fallbackFees.mvpFeeCents,
        taxAmount: 0,
        totalCharge: fallbackFees.totalChargeCents,
        hostReceives: resolvedPurchase.amountCents,
        feePercentage: fallbackFees.mvpFeePercentage * 100,
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
  if (!billingAddress) {
    return NextResponse.json({
      error: 'Billing address is required before creating a payment intent.',
      billingAddressRequired: true,
    }, { status: 400 });
  }

  let taxQuote: Awaited<ReturnType<typeof calculateTaxQuote>>;
  try {
    const stripe = new Stripe(secretKey);
    const eventIdForReference = extractEntityId(payload.event);
    const timeSlotIdForReference = extractEntityId(payload.timeSlot);
    taxQuote = await calculateTaxQuote({
      stripe,
      userId: session.userId,
      organizationId:
        extractEntityId(payload.organization)
        ?? resolvedPurchase.organizationId
        ?? normalizeString(payload.event?.organizationId)
        ?? null,
      email: billingEmail,
      billingAddress: validateUsBillingAddress(billingAddress),
      subtotalCents: resolvedPurchase.amountCents,
      purchaseType: resolvedPurchase.purchaseType,
      taxCategory: resolvedPurchase.taxCategory,
      eventType: resolvedPurchase.eventType,
      lineItemReference: buildLineItemReference({
        purchaseType: resolvedPurchase.purchaseType,
        productId: resolvedPurchase.product?.id ?? null,
        eventId: eventIdForReference,
        timeSlotId: timeSlotIdForReference,
        billId: payload.billId ?? null,
        billPaymentId: payload.billPaymentId ?? null,
      }),
      description: resolvedPurchase.product?.name
        ?? normalizeString(payload.event?.name)
        ?? resolvedPurchase.purchaseType,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to calculate tax.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const feeBreakdown = {
    eventPrice: taxQuote.subtotalCents,
    stripeFee: taxQuote.stripeFeeCents,
    processingFee: taxQuote.processingFeeCents,
    mvpFee: taxQuote.processingFeeCents,
    taxAmount: taxQuote.taxAmountCents,
    totalCharge: taxQuote.totalChargeCents,
    hostReceives: taxQuote.hostReceivesCents,
    feePercentage: taxQuote.feePercentage,
    purchaseType: taxQuote.purchaseType,
  };

  const actorUserId = normalizeString(session?.userId) ?? userId ?? 'system:purchase-intent';
  let reservedRegistrationId: string | null = null;
  let reservedRentalWindow: RentalCheckoutWindow | null = null;

  if (resolvedPurchase.purchaseType === 'event') {
    const reservationResult = await reserveEventRegistrationSlot({
      eventId,
      teamId,
      userId,
      actorUserId,
      divisionSelectionInput,
      now: new Date(),
    });
    if (!reservationResult.ok) {
      return NextResponse.json({ error: reservationResult.error }, { status: reservationResult.status });
    }
    reservedRegistrationId = reservationResult.registrationId;
  } else if (resolvedPurchase.purchaseType === 'rental') {
    const rentalWindowResult = extractRentalCheckoutWindow({
      event: payload.event,
      timeSlot: payload.timeSlot,
    });
    if (!rentalWindowResult.ok) {
      return NextResponse.json({ error: rentalWindowResult.error }, { status: rentalWindowResult.status });
    }

    const lockReservation = await reserveRentalCheckoutLocks({
      client: prisma,
      window: rentalWindowResult.window,
      userId: actorUserId,
      now: new Date(),
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
  try {
    const stripe = new Stripe(secretKey);
    const organizationId =
      extractEntityId(payload.organization)
      ?? normalizeString(payload.event?.organizationId)
      ?? (resolvedPurchase.product?.organizationId ?? null);
    const transferData = await buildDestinationTransferData({
      organizationId,
      hostUserId: normalizeString(payload.event?.hostId),
      transferAmountCents: taxQuote.subtotalCents,
    });

    const metadata: Record<string, string> = {
      purchase_type: resolvedPurchase.purchaseType,
    };

    appendMetadata(metadata, 'user_id', userId);
    appendMetadata(metadata, 'team_id', teamId);
    appendMetadata(metadata, 'event_id', eventId);
    appendMetadata(metadata, 'product_id', payload.productId ?? resolvedPurchase.product?.id);
    appendMetadata(metadata, 'organization_id', organizationId);
    appendMetadata(metadata, 'organization_name', payload.organization?.name);
    appendMetadata(metadata, 'team_name', payload.team?.name);
    appendMetadata(metadata, 'amount_cents', taxQuote.subtotalCents);
    appendMetadata(metadata, 'total_charge_cents', taxQuote.totalChargeCents);
    appendMetadata(metadata, 'processing_fee_cents', taxQuote.processingFeeCents);
    appendMetadata(metadata, 'mvp_fee_cents', taxQuote.processingFeeCents);
    appendMetadata(metadata, 'stripe_fee_cents', taxQuote.stripeFeeCents);
    appendMetadata(metadata, 'stripe_processing_fee_cents', taxQuote.stripeProcessingFeeCents);
    appendMetadata(metadata, 'stripe_tax_service_fee_cents', taxQuote.stripeTaxServiceFeeCents);
    appendMetadata(metadata, 'tax_cents', taxQuote.taxAmountCents);
    appendMetadata(metadata, 'tax_calculation_id', taxQuote.calculationId);
    appendMetadata(metadata, 'tax_category', taxQuote.taxCategory);
    appendMetadata(metadata, 'event_name', payload.event?.name);
    appendMetadata(metadata, 'event_location', payload.event?.location);
    appendMetadata(metadata, 'event_start', payload.event?.start);
    appendMetadata(metadata, 'host_id', payload.event?.hostId);
    appendMetadata(metadata, 'time_slot_id', extractEntityId(payload.timeSlot));
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
    appendMetadata(metadata, 'product_name', resolvedPurchase.product?.name);
    appendMetadata(metadata, 'product_description', resolvedPurchase.product?.description);
    appendMetadata(metadata, 'product_period', resolvedPurchase.product?.period);
    appendMetadata(metadata, 'transfer_destination_account_id', transferData?.destination);
    appendMetadata(metadata, 'transfer_amount_cents', transferData?.amount);

    const intent = await stripe.paymentIntents.create({
      amount: taxQuote.totalChargeCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      customer: taxQuote.customerId,
      receipt_email: billingEmail ?? undefined,
      hooks: {
        inputs: {
          tax: {
            calculation: taxQuote.calculationId,
          },
        },
      },
      metadata,
      ...(transferData ? { transfer_data: transferData } : {}),
    });

    return NextResponse.json({
      paymentIntent: intent.client_secret ?? intent.id,
      publishableKey,
      taxCalculationId: taxQuote.calculationId,
      taxCategory: taxQuote.taxCategory,
      feeBreakdown,
    }, { status: 200 });
  } catch (error) {
    console.error('Stripe payment intent failed', error);
    await releaseStartedRegistration({
      registrationId: reservedRegistrationId,
      eventId,
    });
    await releaseReservedRentalWindow({
      window: reservedRentalWindow,
      userId: actorUserId,
    });
    const message = error instanceof Error ? error.message : 'Failed to create payment intent.';
    return NextResponse.json({
      error: message,
      publishableKey,
      taxCalculationId: taxQuote.calculationId,
      taxCategory: taxQuote.taxCategory,
      feeBreakdown,
    }, { status: 502 });
  }
}
