import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import {
  EventFieldConflictError,
  assertNoEventFieldSchedulingConflicts,
} from '@/server/repositories/events';
import {
  normalizePublicRentalOrderSports,
  resolvePublicRentalOrderSportId,
} from '@/server/publicRentalOrders';

export const dynamic = 'force-dynamic';

const selectionSchema = z.object({
  key: z.string().optional(),
  scheduledFieldIds: z.array(z.string().min(1)).min(1),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  startTimeMinutes: z.number().int().min(0).max(24 * 60).optional(),
  endTimeMinutes: z.number().int().min(0).max(24 * 60).optional(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  repeating: z.boolean().optional(),
}).passthrough();

const orderSchema = z.object({
  eventId: z.string().min(1),
  selections: z.array(selectionSchema).min(1),
  sportId: z.string().trim().min(1).optional().nullable(),
  paymentIntentId: z.string().optional().nullable(),
}).strict();

type RentalOrderSelection = z.infer<typeof selectionSchema>;

type ValidatedRentalSelection = {
  selection: RentalOrderSelection;
  start: Date;
  end: Date;
  fieldIds: string[];
  totalCents: number;
  requiredTemplateIds: string[];
  hostRequiredTemplateIds: string[];
};

type PaymentVerificationResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

const normalizeSlug = (value: string): string => value.trim().toLowerCase();

const normalizeStringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(new Set(
      value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0),
    ))
    : []
);

const parseDateTime = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const mondayDayOf = (date: Date): number => ((date.getDay() + 6) % 7);

const startOfLocalDay = (date: Date): Date => new Date(
  date.getFullYear(),
  date.getMonth(),
  date.getDate(),
  0,
  0,
  0,
  0,
);

const minutesInDay = (date: Date): number => date.getHours() * 60 + date.getMinutes();

const rentalSlotCoversSelection = (
  slot: Record<string, any>,
  selectionStart: Date,
  selectionEnd: Date,
): boolean => {
  const slotStart = parseDateTime(slot.startDate);
  const slotEnd = parseDateTime(slot.endDate);
  if (slot.repeating === false) {
    return Boolean(
      slotStart
      && slotEnd
      && selectionStart.getTime() >= slotStart.getTime()
      && selectionEnd.getTime() <= slotEnd.getTime(),
    );
  }

  const selectionDay = mondayDayOf(selectionStart);
  const slotDays = Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length
    ? slot.daysOfWeek.map((entry: unknown) => Number(entry)).filter((entry: number) => Number.isInteger(entry))
    : typeof slot.dayOfWeek === 'number'
      ? [slot.dayOfWeek]
      : [];
  if (slotDays.length && !slotDays.includes(selectionDay)) {
    return false;
  }

  const selectionStartMinutes = minutesInDay(selectionStart);
  const selectionEndMinutes = minutesInDay(selectionEnd);
  if (
    typeof slot.startTimeMinutes === 'number'
    && selectionStartMinutes < slot.startTimeMinutes
  ) {
    return false;
  }
  if (
    typeof slot.endTimeMinutes === 'number'
    && selectionEndMinutes > slot.endTimeMinutes
  ) {
    return false;
  }

  if (slotStart && startOfLocalDay(selectionStart).getTime() < startOfLocalDay(slotStart).getTime()) {
    return false;
  }
  if (slotEnd && startOfLocalDay(selectionStart).getTime() > startOfLocalDay(slotEnd).getTime()) {
    return false;
  }
  if (slotEnd && startOfLocalDay(selectionEnd).getTime() > startOfLocalDay(slotEnd).getTime()) {
    return false;
  }
  return true;
};

const resolveCoordinates = (
  organization: Record<string, any>,
  primaryField: Record<string, any> | null,
): [number, number] => {
  if (Array.isArray(organization.coordinates) && organization.coordinates.length >= 2) {
    const first = Number(organization.coordinates[0]);
    const second = Number(organization.coordinates[1]);
    if (Number.isFinite(first) && Number.isFinite(second)) {
      return [first, second];
    }
  }
  const longitude = Number(primaryField?.long);
  const latitude = Number(primaryField?.lat);
  if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
    return [longitude, latitude];
  }
  return [0, 0];
};

const verifyPaymentIntent = async ({
  paymentIntentId,
  expectedAmountCents,
  eventId,
  organizationId,
  userId,
}: {
  paymentIntentId?: string | null;
  expectedAmountCents: number;
  eventId: string;
  organizationId: string;
  userId: string;
}): Promise<PaymentVerificationResult> => {
  if (expectedAmountCents <= 0) {
    return { ok: true };
  }
  const normalizedIntentId = typeof paymentIntentId === 'string' ? paymentIntentId.trim() : '';
  if (!normalizedIntentId) {
    return { ok: false, status: 402, error: 'Payment is required before creating the rental order.' };
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return normalizedIntentId.startsWith('pi_')
      ? { ok: true }
      : { ok: false, status: 402, error: 'Payment confirmation is required before creating the rental order.' };
  }

  const stripe = new Stripe(secretKey);
  const intent = await stripe.paymentIntents.retrieve(normalizedIntentId);
  if (intent.status !== 'succeeded' && intent.status !== 'processing') {
    return { ok: false, status: 402, error: 'Payment has not completed yet.' };
  }
  const metadata = intent.metadata ?? {};
  if (metadata.purchase_type !== 'rental') {
    return { ok: false, status: 400, error: 'Payment intent is not for a rental.' };
  }
  if (metadata.event_id !== eventId) {
    return { ok: false, status: 400, error: 'Payment intent does not match this rental order.' };
  }
  if (metadata.organization_id !== organizationId) {
    return { ok: false, status: 400, error: 'Payment intent organization does not match this rental order.' };
  }
  if (metadata.user_id !== userId) {
    return { ok: false, status: 400, error: 'Payment intent user does not match this rental order.' };
  }
  if (Number(metadata.amount_cents) !== expectedAmountCents) {
    return { ok: false, status: 400, error: 'Payment amount does not match this rental order.' };
  }
  return { ok: true };
};

const validateRentalSelections = ({
  selections,
  fields,
  slots,
}: {
  selections: RentalOrderSelection[];
  fields: Array<Record<string, any>>;
  slots: Array<Record<string, any>>;
}): { ok: true; selections: ValidatedRentalSelection[] } | { ok: false; error: string } => {
  const fieldById = new Map(fields.map((field) => [String(field.id), field]));
  const slotById = new Map(slots.map((slot) => [String(slot.id), slot]));
  const validatedSelections: ValidatedRentalSelection[] = [];

  for (const selection of selections) {
    const start = parseDateTime(selection.startDate);
    const end = parseDateTime(selection.endDate);
    if (!start || !end || end.getTime() <= start.getTime()) {
      return { ok: false, error: 'Rental selections must include valid start and end times.' };
    }
    const fieldIds = normalizeStringArray(selection.scheduledFieldIds);
    if (!fieldIds.length) {
      return { ok: false, error: 'Rental selections must include at least one field.' };
    }
    const durationMinutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / (60 * 1000)));
    const requiredTemplateIds = new Set<string>();
    const hostRequiredTemplateIds = new Set<string>();
    let totalCents = 0;

    for (const fieldId of fieldIds) {
      const field = fieldById.get(fieldId);
      if (!field) {
        return { ok: false, error: 'One or more selected fields are unavailable.' };
      }
      const rentalSlotIds = normalizeStringArray(field.rentalSlotIds);
      const matchedSlot = rentalSlotIds
        .map((slotId) => slotById.get(slotId))
        .find((slot): slot is Record<string, any> => (
          slot ? rentalSlotCoversSelection(slot, start, end) : false
        ));
      if (!matchedSlot) {
        return { ok: false, error: `${field.name || 'Selected field'} is not available for the selected time.` };
      }
      if (typeof matchedSlot.price === 'number' && matchedSlot.price > 0) {
        totalCents += Math.round((matchedSlot.price * durationMinutes) / 60);
      }
      normalizeStringArray(matchedSlot.requiredTemplateIds).forEach((id) => requiredTemplateIds.add(id));
      normalizeStringArray(matchedSlot.hostRequiredTemplateIds).forEach((id) => hostRequiredTemplateIds.add(id));
    }

    validatedSelections.push({
      selection,
      start,
      end,
      fieldIds,
      totalCents,
      requiredTemplateIds: Array.from(requiredTemplateIds),
      hostRequiredTemplateIds: Array.from(hostRequiredTemplateIds),
    });
  }

  return { ok: true, selections: validatedSelections };
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = orderSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { slug } = await params;
  const normalizedSlug = normalizeSlug(slug);
  const organization = await (prisma as any).organizations.findUnique({
    where: { publicSlug: normalizedSlug },
    select: {
      id: true,
      name: true,
      sports: true,
      location: true,
      address: true,
      coordinates: true,
      ownerId: true,
      publicPageEnabled: true,
    },
  });
  if (!organization || organization.publicPageEnabled !== true) {
    return NextResponse.json({ error: 'Organization not found.' }, { status: 404 });
  }

  const availableSports = normalizePublicRentalOrderSports(organization.sports);
  if (!availableSports.length) {
    return NextResponse.json({
      error: 'This organization must have at least one sport configured before rental-only orders can be created.',
    }, { status: 400 });
  }
  const requestedSportId = typeof parsed.data.sportId === 'string'
    ? parsed.data.sportId.trim()
    : '';
  if (!requestedSportId) {
    return NextResponse.json({ error: 'Select a sport before ordering this rental.' }, { status: 400 });
  }
  if (requestedSportId && !availableSports.includes(requestedSportId)) {
    return NextResponse.json({ error: 'Selected sport is not available for this organization.' }, { status: 400 });
  }

  const fields = await (prisma as any).fields.findMany({
    where: { organizationId: organization.id },
  });
  const rentalSlotIds = Array.from(new Set(fields.flatMap((field: Record<string, any>) => normalizeStringArray(field.rentalSlotIds))));
  const slots = rentalSlotIds.length
    ? await (prisma as any).timeSlots.findMany({
        where: {
          id: { in: rentalSlotIds },
          price: { not: null },
        },
      })
    : [];

  const validation = validateRentalSelections({
    selections: parsed.data.selections,
    fields,
    slots,
  });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const totalCents = validation.selections.reduce((sum, selection) => sum + selection.totalCents, 0);
  const paymentVerification = await verifyPaymentIntent({
    paymentIntentId: parsed.data.paymentIntentId,
    expectedAmountCents: totalCents,
    eventId: parsed.data.eventId,
    organizationId: organization.id,
    userId: session.userId,
  });
  if (!paymentVerification.ok) {
    return NextResponse.json({ error: paymentVerification.error }, { status: paymentVerification.status });
  }

  const earliestStart = validation.selections.reduce<Date | null>(
    (current, selection) => (!current || selection.start < current ? selection.start : current),
    null,
  );
  const latestEnd = validation.selections.reduce<Date | null>(
    (current, selection) => (!current || selection.end > current ? selection.end : current),
    null,
  );
  if (!earliestStart || !latestEnd) {
    return NextResponse.json({ error: 'Rental selections must include valid times.' }, { status: 400 });
  }

  const fieldIds = Array.from(new Set(validation.selections.flatMap((selection) => selection.fieldIds)));
  const fieldById = new Map<string, Record<string, any>>(
    fields.map((field: Record<string, any>) => [String(field.id), field]),
  );
  const primaryField = fieldById.get(fieldIds[0]) ?? null;
  const timeSlotIds = validation.selections.map((selection, index) => `${parsed.data.eventId}-rental-${index + 1}`);
  const now = new Date();
  const sportId = resolvePublicRentalOrderSportId({
    organizationName: organization.name,
    organizationSports: organization.sports,
    requestedSportId,
  });
  if (!sportId) {
    return NextResponse.json({ error: 'Unable to determine a sport for this rental order.' }, { status: 400 });
  }

  try {
    await (prisma as any).$transaction(async (tx: any) => {
      const existingEvent = await tx.events.findUnique({
        where: { id: parsed.data.eventId },
        select: { id: true, organizationId: true },
      });
      if (existingEvent) {
        if (existingEvent.organizationId === organization.id) {
          return;
        }
        throw new Error('A different event already exists for this rental order.');
      }

      await assertNoEventFieldSchedulingConflicts({
        client: tx,
        eventId: parsed.data.eventId,
        organizationId: null,
        fieldIds,
        timeSlotIds,
        start: earliestStart,
        end: latestEnd,
        noFixedEndDateTime: false,
        eventType: 'EVENT',
        parentEvent: null,
      });

      for (let index = 0; index < validation.selections.length; index += 1) {
        const validated = validation.selections[index];
        const dayOfWeek = mondayDayOf(validated.start);
        await tx.timeSlots.create({
          data: {
            id: timeSlotIds[index],
            createdAt: now,
            updatedAt: now,
            dayOfWeek,
            daysOfWeek: [dayOfWeek],
            startTimeMinutes: minutesInDay(validated.start),
            endTimeMinutes: minutesInDay(validated.end),
            startDate: validated.start,
            endDate: validated.end,
            repeating: false,
            scheduledFieldId: validated.fieldIds[0] ?? null,
            scheduledFieldIds: validated.fieldIds,
            price: 0,
            divisions: [],
            requiredTemplateIds: validated.requiredTemplateIds,
            hostRequiredTemplateIds: validated.hostRequiredTemplateIds,
          },
        });
      }

      await tx.events.create({
        data: {
          id: parsed.data.eventId,
          createdAt: now,
          updatedAt: now,
          name: organization.name,
          start: earliestStart,
          end: latestEnd,
          description: `Private rental order for ${organization.name}.`,
          divisions: [],
          winnerSetCount: null,
          loserSetCount: null,
          doubleElimination: false,
          location: primaryField?.location ?? organization.location ?? 'Rental',
          address: organization.address ?? null,
          rating: null,
          teamSizeLimit: 10,
          maxParticipants: 10,
          minAge: null,
          maxAge: null,
          hostId: organization.ownerId,
          assistantHostIds: [],
          noFixedEndDateTime: false,
          price: 0,
          singleDivision: true,
          registrationByDivisionType: false,
          waitListIds: [],
          freeAgentIds: [],
          cancellationRefundHours: 24,
          teamSignup: false,
          prize: null,
          registrationCutoffHours: 0,
          seedColor: 0,
          imageId: '',
          fieldCount: fieldIds.length,
          winnerBracketPointsToVictory: [],
          loserBracketPointsToVictory: [],
          coordinates: resolveCoordinates(organization, primaryField),
          gamesPerOpponent: null,
          includePlayoffs: false,
          playoffTeamCount: null,
          usesSets: false,
          matchDurationMinutes: null,
          setDurationMinutes: null,
          setsPerMatch: null,
          restTimeMinutes: null,
          state: 'PRIVATE',
          pointsToVictory: [],
          sportId,
          timeSlotIds,
          fieldIds,
          teamIds: [],
          userIds: [session.userId],
          leagueScoringConfigId: null,
          organizationId: organization.id,
          parentEvent: null,
          autoCancellation: null,
          eventType: 'EVENT',
          officialSchedulingMode: 'SCHEDULE',
          doTeamsOfficiate: false,
          teamOfficialsMaySwap: false,
          officialIds: [],
          officialPositions: [],
          matchRulesOverride: null,
          autoCreatePointMatchIncidents: false,
          allowPaymentPlans: false,
          installmentCount: 0,
          installmentDueDates: [],
          installmentAmounts: [],
          allowTeamSplitDefault: false,
          splitLeaguePlayoffDivisions: false,
          requiredTemplateIds: [],
        },
      });
    });
  } catch (error) {
    if (error instanceof EventFieldConflictError) {
      return NextResponse.json({ error: error.message, conflicts: error.conflicts }, { status: 409 });
    }
    console.error('Failed to create public rental order', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to create rental order.',
    }, { status: 500 });
  }

  return NextResponse.json({
    eventId: parsed.data.eventId,
    totalCents,
  }, { status: 201 });
}
