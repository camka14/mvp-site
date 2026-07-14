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
  normalizeRentalStringArray as normalizeStringArray,
  rentalSelectionSchema,
  type RentalSelectionField,
  type ValidatedRentalSelection,
  validateRentalSelections,
} from '@/server/rentals/selectionValidation';
import { attachFacilitiesToFieldRows } from '@/server/fieldFacilityPayload';
import { canManageOrganization } from '@/server/accessControl';

export const dynamic = 'force-dynamic';

const orderSchema = z.object({
  eventId: z.string().min(1),
  selections: z.array(rentalSelectionSchema).min(1),
  sportId: z.string().trim().min(1).optional().nullable(),
  paymentIntentId: z.string().optional().nullable(),
  renterOrganizationId: z.string().trim().min(1).optional().nullable(),
}).strict();

type PaymentVerificationResult =
  | {
      ok: true;
      paymentIntentId?: string | null;
      metadata?: Record<string, string>;
      totalChargeCents?: number | null;
    }
  | { ok: false; status: number; error: string };

const normalizeSlug = (value: string): string => value.trim().toLowerCase();

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
    return { ok: false, status: 503, error: 'Payment processing is unavailable. Please try again later.' };
  }

  const stripe = new Stripe(secretKey);
  const intent = await stripe.paymentIntents.retrieve(normalizedIntentId);
  if (intent.status !== 'succeeded') {
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
  const fields = await attachFacilitiesToFieldRows(fieldRows) as RentalSelectionField[];
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

  const bookingId = parsed.data.eventId;
  // A rental booking is not an Event yet. Never feed its client-provided
  // booking id into the scheduler's "exclude current event" parameter, or a
  // caller can name an occupied event and hide that event's conflicts.
  const conflictSubjectId = `rental-booking-conflict:${crypto.randomUUID()}`;

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

      for (const selection of validation.selections) {
        await assertNoEventFieldSchedulingConflicts({
          client: tx,
          eventId: conflictSubjectId,
          organizationId: null,
          fieldIds: selection.fieldIds,
          timeSlotIds: [],
          start: selection.start,
          end: selection.end,
          noFixedEndDateTime: false,
          eventType: 'EVENT',
          parentEvent: null,
        });
      }
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
