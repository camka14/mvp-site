import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import {
  EventFieldConflictError,
  assertNoEventFieldSchedulingConflicts,
} from '@/server/repositories/events';
import { normalizePublicRentalOrderSports } from '@/server/publicRentalOrders';
import {
  localDatePartsInTimeZone,
  mondayDayInTimeZone,
  minutesInTimeZone,
  parseDateInputInTimeZone,
  resolveTimeZone,
  resolveTimeZoneFromFieldOrOrganization,
} from '@/server/timeZones';
import { attachFacilitiesToFieldRows } from '@/server/fieldFacilityPayload';
import { canManageOrganization } from '@/server/accessControl';

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
  timeZone: z.string().optional(),
  repeating: z.boolean().optional(),
}).passthrough();

const orderSchema = z.object({
  eventId: z.string().min(1),
  selections: z.array(selectionSchema).min(1),
  sportId: z.string().trim().min(1).optional().nullable(),
  paymentIntentId: z.string().optional().nullable(),
  renterOrganizationId: z.string().trim().min(1).optional().nullable(),
}).strict();

type RentalOrderSelection = z.infer<typeof selectionSchema>;

type ValidatedRentalSelectionItem = {
  fieldId: string;
  facilityId: string | null;
  availabilitySlotId: string;
  priceCents: number;
};

type ValidatedRentalSelection = {
  selection: RentalOrderSelection;
  start: Date;
  end: Date;
  timeZone: string;
  fieldIds: string[];
  items: ValidatedRentalSelectionItem[];
  totalCents: number;
  requiredTemplateIds: string[];
  hostRequiredTemplateIds: string[];
};

type PaymentVerificationResult =
  | {
      ok: true;
      paymentIntentId?: string | null;
      metadata?: Record<string, string>;
      totalChargeCents?: number | null;
    }
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

const dateOnlyValueInTimeZone = (date: Date, timeZone: string): number => {
  const parts = localDatePartsInTimeZone(date, timeZone);
  if (!parts) {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }
  return Date.UTC(parts.year, parts.month - 1, parts.day);
};

const endMinutesInTimeZone = (start: Date, end: Date, timeZone: string): number => {
  const endMinutes = minutesInTimeZone(end, timeZone);
  return endMinutes === 0 && dateOnlyValueInTimeZone(end, timeZone) > dateOnlyValueInTimeZone(start, timeZone)
    ? 24 * 60
    : endMinutes;
};

const rentalSlotCoversSelection = (
  slot: Record<string, any>,
  selectionStart: Date,
  selectionEnd: Date,
  selectionTimeZone: string,
): boolean => {
  const slotTimeZone = resolveTimeZone(slot.timeZone, selectionTimeZone);
  const slotStart = parseDateInputInTimeZone(slot.startDate, slotTimeZone);
  const slotEnd = parseDateInputInTimeZone(slot.endDate, slotTimeZone);
  if (slot.repeating === false) {
    return Boolean(
      slotStart
      && slotEnd
      && selectionStart.getTime() >= slotStart.getTime()
      && selectionEnd.getTime() <= slotEnd.getTime(),
    );
  }

  const selectionDay = mondayDayInTimeZone(selectionStart, slotTimeZone);
  const slotDays = Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length
    ? slot.daysOfWeek.map((entry: unknown) => Number(entry)).filter((entry: number) => Number.isInteger(entry))
    : typeof slot.dayOfWeek === 'number'
      ? [slot.dayOfWeek]
      : [];
  if (slotDays.length && !slotDays.includes(selectionDay)) {
    return false;
  }

  const selectionStartMinutes = minutesInTimeZone(selectionStart, slotTimeZone);
  const selectionEndMinutes = endMinutesInTimeZone(selectionStart, selectionEnd, slotTimeZone);
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

  if (slotStart && dateOnlyValueInTimeZone(selectionStart, slotTimeZone) < dateOnlyValueInTimeZone(slotStart, slotTimeZone)) {
    return false;
  }
  if (slotEnd && dateOnlyValueInTimeZone(selectionStart, slotTimeZone) > dateOnlyValueInTimeZone(slotEnd, slotTimeZone)) {
    return false;
  }
  if (slotEnd && dateOnlyValueInTimeZone(selectionEnd, slotTimeZone) > dateOnlyValueInTimeZone(slotEnd, slotTimeZone)) {
    return false;
  }
  return true;
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
    return { ok: true, paymentIntentId: null, metadata: {}, totalChargeCents: 0 };
  }
  const normalizedIntentId = typeof paymentIntentId === 'string' ? paymentIntentId.trim() : '';
  if (!normalizedIntentId) {
    return { ok: false, status: 402, error: 'Payment is required before creating the rental order.' };
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return normalizedIntentId.startsWith('pi_')
      ? { ok: true, paymentIntentId: normalizedIntentId, metadata: {}, totalChargeCents: expectedAmountCents }
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
  const totalChargeCents = Number(metadata.total_charge_cents ?? intent.amount_received ?? intent.amount ?? expectedAmountCents);
  return {
    ok: true,
    paymentIntentId: normalizedIntentId,
    metadata,
    totalChargeCents: Number.isFinite(totalChargeCents) ? totalChargeCents : expectedAmountCents,
  };
};

const validateRentalSelections = ({
  selections,
  fields,
  slots,
  organization,
  now = new Date(),
}: {
  selections: RentalOrderSelection[];
  fields: Array<Record<string, any>>;
  slots: Array<Record<string, any>>;
  organization: Record<string, any>;
  now?: Date;
}): { ok: true; selections: ValidatedRentalSelection[] } | { ok: false; error: string } => {
  const fieldById = new Map(fields.map((field) => [String(field.id), field]));
  const slotById = new Map(slots.map((slot) => [String(slot.id), slot]));
  const validatedSelections: ValidatedRentalSelection[] = [];

  for (const selection of selections) {
    const fieldIds = normalizeStringArray(selection.scheduledFieldIds);
    if (!fieldIds.length) {
      return { ok: false, error: 'Rental selections must include at least one field.' };
    }
    const primaryField = fieldById.get(fieldIds[0]) ?? null;
    const selectionTimeZone = resolveTimeZone(
      selection.timeZone,
      resolveTimeZoneFromFieldOrOrganization(primaryField, organization),
    );
    const start = parseDateInputInTimeZone(selection.startDate, selectionTimeZone);
    const end = parseDateInputInTimeZone(selection.endDate, selectionTimeZone);
    if (!start || !end || end.getTime() <= start.getTime()) {
      return { ok: false, error: 'Rental selections must include valid start and end times.' };
    }
    if (start.getTime() < now.getTime()) {
      return { ok: false, error: 'Rental selections must start in the future.' };
    }
    const durationMinutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / (60 * 1000)));
    const requiredTemplateIds = new Set<string>();
    const hostRequiredTemplateIds = new Set<string>();
    const items: ValidatedRentalSelectionItem[] = [];
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
          slot ? rentalSlotCoversSelection(slot, start, end, selectionTimeZone) : false
        ));
      if (!matchedSlot) {
        return { ok: false, error: `${field.name || 'Selected field'} is not available for the selected time.` };
      }
      let priceCents = 0;
      if (typeof matchedSlot.price === 'number' && matchedSlot.price > 0) {
        priceCents = Math.round((matchedSlot.price * durationMinutes) / 60);
        totalCents += priceCents;
      }
      items.push({
        fieldId,
        facilityId: typeof field.facilityId === 'string' && field.facilityId.trim() ? field.facilityId.trim() : null,
        availabilitySlotId: String(matchedSlot.id),
        priceCents,
      });
      normalizeStringArray(matchedSlot.requiredTemplateIds).forEach((id) => requiredTemplateIds.add(id));
      normalizeStringArray(matchedSlot.hostRequiredTemplateIds).forEach((id) => hostRequiredTemplateIds.add(id));
    }

    validatedSelections.push({
      selection,
      start,
      end,
      timeZone: selectionTimeZone,
      fieldIds,
      items,
      totalCents,
      requiredTemplateIds: Array.from(requiredTemplateIds),
      hostRequiredTemplateIds: Array.from(hostRequiredTemplateIds),
    });
  }

  return { ok: true, selections: validatedSelections };
};

const RENTAL_BILL_SOURCE_TYPE = 'RENTAL_BOOKING';
const ACTIVE_RENTAL_BOOKING_ITEM_STATUSES = ['PENDING_PAYMENT', 'CONFIRMED'];

const normalizeOptionalString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const assertNoRentalBookingItemConflicts = async ({
  tx,
  bookingId,
  selections,
}: {
  tx: any;
  bookingId: string;
  selections: ValidatedRentalSelection[];
}) => {
  if (typeof tx.rentalBookingItems?.findMany !== 'function') {
    return;
  }
  const conflictWindows = selections.flatMap((selection) => (
    selection.items.map((item) => ({
      fieldId: item.fieldId,
      start: selection.start,
      end: selection.end,
    }))
  ));
  if (!conflictWindows.length) {
    return;
  }

  const conflicts = await tx.rentalBookingItems.findMany({
    where: {
      bookingId: { not: bookingId },
      status: { in: ACTIVE_RENTAL_BOOKING_ITEM_STATUSES },
      OR: conflictWindows.map((window) => ({
        fieldId: window.fieldId,
        start: { lt: window.end },
        end: { gt: window.start },
      })),
    } as any,
    select: {
      id: true,
      bookingId: true,
      fieldId: true,
      start: true,
      end: true,
    },
  });
  if (!conflicts.length) {
    return;
  }

  throw new EventFieldConflictError(conflicts.map((conflict: any) => ({
    fieldId: String(conflict.fieldId),
    blockId: `rental-booking:${conflict.bookingId}:${conflict.id}`,
    parentId: normalizeOptionalString(conflict.bookingId),
    start: conflict.start instanceof Date ? conflict.start : new Date(conflict.start),
    end: conflict.end instanceof Date ? conflict.end : new Date(conflict.end),
  })));
};

const buildRentalBillLineItems = ({
  bookingId,
  organizationId,
  userId,
  renterOrganizationId,
  rentalAmountCents,
  totalChargeCents,
}: {
  bookingId: string;
  organizationId: string;
  userId: string;
  renterOrganizationId: string | null;
  rentalAmountCents: number;
  totalChargeCents: number;
}) => {
  const lineItems: Array<Record<string, unknown>> = [];
  if (rentalAmountCents > 0) {
    lineItems.push({
      id: 'line_1',
      type: 'RENTAL',
      label: 'Field rental',
      amountCents: rentalAmountCents,
      purchaseType: 'rental',
      rentalBookingId: bookingId,
      organizationId,
      userId,
      ...(renterOrganizationId ? { renterOrganizationId } : {}),
    });
  }
  const additionalCharges = totalChargeCents - rentalAmountCents;
  if (additionalCharges > 0) {
    lineItems.push({
      id: `line_${lineItems.length + 1}`,
      type: 'OTHER',
      label: 'Additional charges',
      amountCents: additionalCharges,
      purchaseType: 'rental',
      rentalBookingId: bookingId,
      organizationId,
      userId,
      ...(renterOrganizationId ? { renterOrganizationId } : {}),
    });
  }
  return lineItems.length
    ? lineItems
    : [{
        id: 'line_1',
        type: 'RENTAL',
        label: 'Field rental',
        amountCents: totalChargeCents,
        purchaseType: 'rental',
        rentalBookingId: bookingId,
        organizationId,
        userId,
        ...(renterOrganizationId ? { renterOrganizationId } : {}),
      }];
};

const findOrCreateRentalBill = async ({
  tx,
  bookingId,
  organizationId,
  userId,
  renterOrganizationId,
  payment,
  rentalAmountCents,
}: {
  tx: any;
  bookingId: string;
  organizationId: string;
  userId: string;
  renterOrganizationId: string | null;
  payment: Extract<PaymentVerificationResult, { ok: true }>;
  rentalAmountCents: number;
}): Promise<string | null> => {
  const paymentIntentId = normalizeOptionalString(payment.paymentIntentId);
  if (rentalAmountCents <= 0 && !paymentIntentId) {
    return null;
  }
  const ownerType = renterOrganizationId ? 'ORGANIZATION' : 'USER';
  const ownerId = renterOrganizationId ?? userId;
  const now = new Date();
  const totalChargeCents = Math.max(
    rentalAmountCents,
    Number.isFinite(payment.totalChargeCents) ? Math.round(Number(payment.totalChargeCents)) : rentalAmountCents,
  );

  if (paymentIntentId) {
    const existingPayment = await tx.billPayments.findFirst({
      where: { paymentIntentId },
      select: { id: true, billId: true },
    });
    if (existingPayment?.billId) {
      await tx.bills.update({
        where: { id: existingPayment.billId },
        data: {
          ownerType,
          ownerId,
          organizationId,
          sourceType: RENTAL_BILL_SOURCE_TYPE,
          sourceId: bookingId,
          updatedAt: now,
        } as any,
      });
      return existingPayment.billId;
    }
  }

  if (totalChargeCents <= 0) {
    return null;
  }

  const bill = await tx.bills.create({
    data: {
      id: crypto.randomUUID(),
      ownerType,
      ownerId,
      organizationId,
      eventId: null,
      slotId: null,
      occurrenceDate: null,
      sourceType: RENTAL_BILL_SOURCE_TYPE,
      sourceId: bookingId,
      totalAmountCents: totalChargeCents,
      paidAmountCents: totalChargeCents,
      nextPaymentDue: null,
      nextPaymentAmountCents: null,
      parentBillId: null,
      allowSplit: false,
      status: 'PAID',
      paymentPlanEnabled: false,
      createdBy: userId,
      lineItems: buildRentalBillLineItems({
        bookingId,
        organizationId,
        userId,
        renterOrganizationId,
        rentalAmountCents,
        totalChargeCents,
      }),
      createdAt: now,
      updatedAt: now,
    } as any,
    select: { id: true },
  });

  await tx.billPayments.create({
    data: {
      id: crypto.randomUUID(),
      billId: bill.id,
      sequence: 1,
      dueDate: now,
      amountCents: totalChargeCents,
      status: 'PAID',
      paidAt: now,
      paymentIntentId,
      payerUserId: userId,
      taxCalculationId: normalizeOptionalString(payment.metadata?.tax_calculation_id),
      taxAmountCents: Number(payment.metadata?.tax_cents ?? 0) || 0,
      stripeProcessingFeeCents: Number(payment.metadata?.stripe_processing_fee_cents ?? 0) || 0,
      stripeTaxServiceFeeCents: Number(payment.metadata?.stripe_tax_service_fee_cents ?? 0) || 0,
      createdAt: now,
      updatedAt: now,
    },
  });

  return bill.id;
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
      logoId: true,
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
  const requestedSportId = typeof parsed.data.sportId === 'string'
    ? parsed.data.sportId.trim()
    : '';
  if (requestedSportId && !availableSports.includes(requestedSportId)) {
    return NextResponse.json({ error: 'Selected sport is not available for this organization.' }, { status: 400 });
  }

  const renterOrganizationId = normalizeOptionalString(parsed.data.renterOrganizationId);
  if (renterOrganizationId) {
    const renterOrganization = await (prisma as any).organizations.findUnique({
      where: { id: renterOrganizationId },
      select: { id: true, ownerId: true },
    });
    if (!renterOrganization || !(await canManageOrganization(session, renterOrganization))) {
      return NextResponse.json({ error: 'You do not have access to book rentals for this organization.' }, { status: 403 });
    }
  }

  const fieldRows = await (prisma as any).fields.findMany({
    where: { organizationId: organization.id },
  });
  const fields = await attachFacilitiesToFieldRows(fieldRows);
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
    organization,
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
  const bookingId = parsed.data.eventId;

  try {
    const booking = await (prisma as any).$transaction(async (tx: any) => {
      const existingBooking = await tx.rentalBookings.findUnique({
        where: { id: bookingId },
        select: {
          id: true,
          billId: true,
          eventId: true,
          totalAmountCents: true,
          paymentIntentId: true,
        },
      });
      if (existingBooking) {
        const existingItems = await tx.rentalBookingItems.findMany({
          where: { bookingId },
          select: {
            id: true,
            fieldId: true,
            start: true,
            end: true,
            eventId: true,
            eventTimeSlotId: true,
          },
          orderBy: { start: 'asc' },
        });
        return {
          ...existingBooking,
          items: existingItems,
        };
      }

      await assertNoEventFieldSchedulingConflicts({
        client: tx,
        eventId: bookingId,
        organizationId: null,
        fieldIds,
        timeSlotIds: [],
        start: earliestStart,
        end: latestEnd,
        noFixedEndDateTime: false,
        eventType: 'EVENT',
        parentEvent: null,
      });
      await assertNoRentalBookingItemConflicts({
        tx,
        bookingId,
        selections: validation.selections,
      });

      const now = new Date();
      const billId = await findOrCreateRentalBill({
        tx,
        bookingId,
        organizationId: organization.id,
        userId: session.userId,
        renterOrganizationId,
        payment: paymentVerification,
        rentalAmountCents: totalCents,
      });

      const createdBooking = await tx.rentalBookings.create({
        data: {
          id: bookingId,
          createdAt: now,
          updatedAt: now,
          organizationId: organization.id,
          renterType: renterOrganizationId ? 'ORGANIZATION' : 'USER',
          renterUserId: renterOrganizationId ? null : session.userId,
          renterOrganizationId,
          createdByUserId: session.userId,
          billId,
          eventId: null,
          status: 'CONFIRMED',
          totalAmountCents: totalCents,
          currency: 'usd',
          paymentIntentId: normalizeOptionalString(paymentVerification.paymentIntentId),
          expiresAt: null,
          confirmedAt: now,
          cancelledAt: null,
          metadata: {
            publicSlug: normalizedSlug,
            requestedSportId: requestedSportId || null,
            earliestStart: earliestStart.toISOString(),
            latestEnd: latestEnd.toISOString(),
          },
        },
        select: {
          id: true,
          billId: true,
          eventId: true,
          totalAmountCents: true,
          paymentIntentId: true,
        },
      });

      const bookingItems: Array<Record<string, unknown>> = [];
      let itemIndex = 0;
      for (const validated of validation.selections) {
        for (const item of validated.items) {
          itemIndex += 1;
          const itemId = `${bookingId}__item_${itemIndex}`;
          bookingItems.push({
            id: itemId,
            bookingId,
            fieldId: item.fieldId,
            start: validated.start,
            end: validated.end,
          });
          await tx.rentalBookingItems.create({
            data: {
              id: itemId,
              createdAt: now,
              updatedAt: now,
              bookingId,
              organizationId: organization.id,
              facilityId: item.facilityId,
              fieldId: item.fieldId,
              availabilitySlotId: item.availabilitySlotId,
              eventId: null,
              eventTimeSlotId: null,
              start: validated.start,
              end: validated.end,
              timeZone: validated.timeZone,
              priceCents: item.priceCents,
              status: 'CONFIRMED',
              requiredTemplateIds: validated.requiredTemplateIds,
              hostRequiredTemplateIds: validated.hostRequiredTemplateIds,
              metadata: {
                selectionKey: validated.selection.key ?? null,
              },
            } as any,
          });
        }
      }

      return {
        ...createdBooking,
        items: bookingItems,
      };
    });

    const createEventParams = new URLSearchParams({ create: '1' });
    if (typeof booking.renterOrganizationId === 'string' && booking.renterOrganizationId.trim().length > 0) {
      createEventParams.set('hostOrgId', booking.renterOrganizationId.trim());
    }

    return NextResponse.json({
      bookingId: booking.id,
      billId: booking.billId,
      eventId: booking.eventId,
      totalCents,
      items: booking.items.map((item: any) => ({
        id: item.id,
        fieldId: item.fieldId,
        start: item.start instanceof Date ? item.start.toISOString() : item.start,
        end: item.end instanceof Date ? item.end.toISOString() : item.end,
        eventId: item.eventId ?? null,
        eventTimeSlotId: item.eventTimeSlotId ?? null,
      })),
      createEventUrl: `/events/${encodeURIComponent(booking.id)}/schedule?${createEventParams.toString()}`,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof EventFieldConflictError) {
      return NextResponse.json({ error: error.message, conflicts: error.conflicts }, { status: 409 });
    }
    console.error('Failed to create public rental order', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to create rental order.',
    }, { status: 500 });
  }
}
