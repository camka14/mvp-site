import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { parseDateInput } from '@/server/requestParsing';
import { canManageOrganization } from '@/server/accessControl';
import { loadBillDiscountSummaries, withBillDiscountAmounts } from '@/server/billing/billDiscountSummaries';
import { handleApiRouteError } from '@/server/http/routeErrors';
import {
  isWeeklyParentEvent,
  resolveWeeklyOccurrence,
  resolveWeeklyOccurrenceStartAt,
} from '@/server/events/weeklyOccurrences';

export const dynamic = 'force-dynamic';

const BILL_LIST_MAX_OFFSET = 1_000_000;

const createSchema = z.object({
  ownerType: z.enum(['USER', 'TEAM', 'ORGANIZATION']),
  ownerId: z.string(),
  totalAmountCents: z.number(),
  eventId: z.string().nullable().optional(),
  slotId: z.string().nullable().optional(),
  occurrenceDate: z.string().nullable().optional(),
  organizationId: z.string().nullable().optional(),
  sourceType: z.string().trim().min(1).nullable().optional(),
  sourceId: z.string().trim().min(1).nullable().optional(),
  installmentAmounts: z.array(z.number()).optional(),
  installmentDueDates: z.array(z.string()).optional(),
  installmentDueRelativeDays: z.array(z.number()).optional(),
  allowSplit: z.boolean().optional(),
  paymentPlanEnabled: z.boolean().optional(),
  lineItems: z.array(
    z.object({
      id: z.string().optional(),
      type: z.enum(['EVENT', 'FEE', 'TAX', 'PRODUCT', 'RENTAL', 'OTHER']).optional(),
      label: z.string(),
      amountCents: z.number(),
      quantity: z.number().optional(),
    }).passthrough(),
  ).optional(),
  event: z.record(z.string(), z.any()).optional(),
  user: z.record(z.string(), z.any()).optional(),
}).passthrough();

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const uniqueIds = (values: Array<string | null | undefined>): string[] => (
  Array.from(new Set(values.filter((value): value is string => Boolean(value))))
);

type BillOwnerType = z.infer<typeof createSchema>['ownerType'];

const canManageBillOwner = async (
  session: Awaited<ReturnType<typeof requireSession>>,
  ownerType: BillOwnerType,
  ownerId: string,
): Promise<boolean> => {
  if (session.isAdmin) return true;
  if (ownerType === 'USER') return ownerId === session.userId;

  if (ownerType === 'ORGANIZATION') {
    const organization = await prisma.organizations.findUnique({
      where: { id: ownerId },
      select: { id: true, ownerId: true },
    });
    return Boolean(organization && await canManageOrganization(session, organization));
  }

  const requestedTeam = await prisma.teams.findUnique({
    where: { id: ownerId },
    select: {
      parentTeamId: true,
      captainId: true,
      managerId: true,
      headCoachId: true,
    },
  });
  if (!requestedTeam) return false;

  const teams = [requestedTeam];
  const parentTeamId = normalizeId(requestedTeam.parentTeamId);
  if (parentTeamId) {
    const parentTeam = await prisma.teams.findUnique({
      where: { id: parentTeamId },
      select: {
        parentTeamId: true,
        captainId: true,
        managerId: true,
        headCoachId: true,
      },
    });
    if (parentTeam) teams.push(parentTeam);
  }

  return teams.some((team) => uniqueIds([
    normalizeId(team.captainId),
    normalizeId(team.managerId),
    normalizeId(team.headCoachId),
  ]).includes(session.userId));
};

export async function GET(req: NextRequest) {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession(req);
  } catch (error) {
    return handleApiRouteError(error, 'Failed to load bills');
  }
  const params = req.nextUrl.searchParams;
  const ownerType = params.get('ownerType') as 'USER' | 'TEAM' | 'ORGANIZATION' | null;
  const ownerId = normalizeId(params.get('ownerId'));
  const limit = Number(params.get('limit') || '100');
  const rawOffset = params.get('offset') ?? '0';
  const offset = Number(rawOffset);
  const normalizedLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 200) : 100;
  if (
    !Number.isSafeInteger(offset)
    || offset < 0
    || offset > BILL_LIST_MAX_OFFSET
  ) {
    return NextResponse.json({
      error: `offset must be an integer between 0 and ${BILL_LIST_MAX_OFFSET}`,
    }, { status: 400 });
  }
  const normalizedOffset = offset;

  if (!ownerType || !ownerId) {
    return NextResponse.json({
      bills: [],
      pagination: {
        limit: normalizedLimit,
        offset: normalizedOffset,
        nextOffset: normalizedOffset,
        hasMore: false,
      },
    }, { status: 200 });
  }

  if (ownerType === 'USER' && !session.isAdmin && ownerId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (ownerType === 'ORGANIZATION' && !session.isAdmin) {
    const organization = await prisma.organizations.findUnique({
      where: { id: ownerId },
      select: { id: true, ownerId: true },
    });
    if (!organization || !(await canManageOrganization(session, organization))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }
  if (ownerType === 'TEAM' && !(await canManageBillOwner(session, ownerType, ownerId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let ownerIds = [ownerId];
  if (ownerType === 'TEAM') {
    const [eventTeam, childEventTeams] = await Promise.all([
      prisma.teams.findUnique({
        where: { id: ownerId },
        select: { parentTeamId: true },
      }),
      prisma.teams.findMany({
        where: { parentTeamId: ownerId },
        select: { id: true },
      }),
    ]);
    ownerIds = uniqueIds([
      ownerId,
      normalizeId(eventTeam?.parentTeamId),
      ...childEventTeams.map((team) => normalizeId(team.id)),
    ]);
  }

  const bills = await prisma.bills.findMany({
    where: ownerType === 'TEAM'
      ? { ownerType, ownerId: { in: ownerIds } }
      : { ownerType, ownerId },
    take: normalizedLimit + 1,
    skip: normalizedOffset,
    orderBy: [
      { createdAt: 'desc' },
      { id: 'desc' },
    ],
  });
  const pageRows = bills.slice(0, normalizedLimit);
  const billIds = pageRows.map((bill) => bill.id);
  const billPayments = billIds.length
    ? await prisma.billPayments.findMany({
      where: { billId: { in: billIds } },
      select: { billId: true, paymentIntentId: true },
    })
    : [];
  const paymentsByBillId = new Map<string, typeof billPayments>();
  billPayments.forEach((payment) => {
    const existing = paymentsByBillId.get(payment.billId);
    if (existing) {
      existing.push(payment);
      return;
    }
    paymentsByBillId.set(payment.billId, [payment]);
  });
  const discountAmountsByBillId = await loadBillDiscountSummaries(
    prisma,
    pageRows.map((bill) => ({
      ...bill,
      payments: paymentsByBillId.get(bill.id) ?? [],
    })),
  );

  return NextResponse.json({
    bills: pageRows.map((bill) => withBillDiscountAmounts(bill, discountAmountsByBillId)),
    pagination: {
      limit: normalizedLimit,
      offset: normalizedOffset,
      nextOffset: normalizedOffset + pageRows.length,
      hasMore: bills.length > normalizedLimit,
    },
  }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const requestedOwnerId = parsed.data.ownerId.trim();
  let ownerId = requestedOwnerId;
  if (!ownerId) {
    return NextResponse.json({ error: 'ownerId is required' }, { status: 400 });
  }
  if (!(await canManageBillOwner(session, parsed.data.ownerType, ownerId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const totalAmountCents = Math.round(parsed.data.totalAmountCents);
  if (!Number.isFinite(totalAmountCents) || totalAmountCents <= 0) {
    return NextResponse.json({ error: 'totalAmountCents must be greater than 0' }, { status: 400 });
  }

  const normalizedLineItems = Array.isArray(parsed.data.lineItems)
    ? parsed.data.lineItems
      .map((item, index) => {
        const amountCents = Math.round(item.amountCents);
        const quantity = item.quantity !== undefined ? Math.round(item.quantity) : undefined;
        if (!Number.isFinite(amountCents) || amountCents <= 0) {
          return null;
        }
        const label = item.label.trim();
        if (!label.length) {
          return null;
        }
        return {
          id: item.id?.trim() || `line_${index + 1}`,
          type: item.type ?? 'OTHER',
          label,
          amountCents,
          ...(quantity && quantity > 1 ? { quantity } : {}),
        };
      })
      .filter((item): item is {
        id: string;
        type: 'EVENT' | 'FEE' | 'TAX' | 'PRODUCT' | 'RENTAL' | 'OTHER';
        label: string;
        amountCents: number;
        quantity?: number;
      } => Boolean(item))
    : [];
  const lineItemsTotalAmountCents = normalizedLineItems.reduce((sum, item) => sum + item.amountCents, 0);
  const effectiveTotalAmountCents = lineItemsTotalAmountCents > 0 ? lineItemsTotalAmountCents : totalAmountCents;

  const eventId = parsed.data.eventId?.trim() || null;
  const slotId = parsed.data.slotId?.trim() || null;
  const occurrenceDate = parsed.data.occurrenceDate?.trim() || null;
  const organizationId = parsed.data.organizationId?.trim() || null;
  const sourceType = parsed.data.sourceType?.trim() || null;
  const sourceId = parsed.data.sourceId?.trim() || null;
  const paymentPlanEnabled = parsed.data.paymentPlanEnabled ?? false;
  const now = new Date();

  const alternateTeamOwnerIds = [ownerId];
  if (parsed.data.ownerType === 'TEAM') {
    const eventTeam = await prisma.teams.findUnique({
      where: { id: ownerId },
      select: { parentTeamId: true },
    });
    const parentTeamId = normalizeId(eventTeam?.parentTeamId);
    if (parentTeamId) {
      alternateTeamOwnerIds.push(parentTeamId);
      ownerId = parentTeamId;
    }
  }
  const duplicateOwnerIds = uniqueIds([ownerId, ...alternateTeamOwnerIds]);

  const amounts = Array.isArray(parsed.data.installmentAmounts) && parsed.data.installmentAmounts.length
    ? parsed.data.installmentAmounts.map((amount) => Math.round(amount))
    : [effectiveTotalAmountCents];
  if (amounts.some((amount) => !Number.isFinite(amount) || amount <= 0)) {
    return NextResponse.json({ error: 'installmentAmounts must contain positive numbers' }, { status: 400 });
  }

  const relativeDueDays = Array.isArray(parsed.data.installmentDueRelativeDays) && parsed.data.installmentDueRelativeDays.length
    ? parsed.data.installmentDueRelativeDays
      .map((value) => Math.trunc(value))
      .filter((value) => Number.isFinite(value))
    : [];
  if (parsed.data.installmentDueRelativeDays?.length && relativeDueDays.length !== parsed.data.installmentDueRelativeDays.length) {
    return NextResponse.json({ error: 'installmentDueRelativeDays must contain finite numbers' }, { status: 400 });
  }
  if (relativeDueDays.length > 0 && relativeDueDays.length !== amounts.length) {
    return NextResponse.json(
      { error: 'installmentDueRelativeDays must match installmentAmounts length' },
      { status: 400 },
    );
  }

  let resolvedBillSlotId: string | null = null;
  let resolvedBillOccurrenceDate: string | null = null;
  let dueDates: Date[] = [];
  if (paymentPlanEnabled && eventId) {
    const event = await prisma.events.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        eventType: true,
        parentEvent: true,
        timeSlotIds: true,
      },
    });
    if (!event) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    }
    if (isWeeklyParentEvent(event)) {
      if (!slotId || !occurrenceDate) {
        return NextResponse.json(
          { error: 'Weekly payment plans require slotId and occurrenceDate.' },
          { status: 400 },
        );
      }
      const resolvedOccurrence = await resolveWeeklyOccurrence({
        event,
        occurrence: { slotId, occurrenceDate },
      });
      if (!resolvedOccurrence.ok) {
        return NextResponse.json({ error: resolvedOccurrence.error }, { status: 400 });
      }
      resolvedBillSlotId = resolvedOccurrence.value.slotId;
      resolvedBillOccurrenceDate = resolvedOccurrence.value.occurrenceDate;
      if (relativeDueDays.length === 0) {
        return NextResponse.json(
          { error: 'Weekly payment plans require installmentDueRelativeDays.' },
          { status: 400 },
        );
      }
      if (relativeDueDays.length > 0) {
        const occurrenceStart = resolveWeeklyOccurrenceStartAt(
          resolvedOccurrence.value.slot,
          resolvedOccurrence.value.occurrenceDate,
        );
        if (!occurrenceStart) {
          return NextResponse.json({ error: 'Unable to resolve weekly occurrence start date.' }, { status: 400 });
        }
        dueDates = relativeDueDays.map((offsetDays) => {
          const dueDate = new Date(occurrenceStart.getTime());
          dueDate.setDate(dueDate.getDate() + offsetDays);
          return dueDate;
        });
      }
    } else if (slotId || occurrenceDate || relativeDueDays.length > 0) {
      return NextResponse.json(
        { error: 'Occurrence-relative payment plans are only valid for weekly events.' },
        { status: 400 },
      );
    }
  } else if (slotId || occurrenceDate || relativeDueDays.length > 0) {
    return NextResponse.json(
      { error: 'Occurrence-relative payment plans require an event payment plan.' },
      { status: 400 },
    );
  }

  if (!dueDates.length) {
    dueDates = Array.isArray(parsed.data.installmentDueDates) && parsed.data.installmentDueDates.length
      ? parsed.data.installmentDueDates.map((value) => parseDateInput(value) ?? now)
      : [now];
  }

  const shouldEnforceUniquePaymentPlan = Boolean(eventId && paymentPlanEnabled);
  const creationResult = await prisma.$transaction(async (tx) => {
    if (shouldEnforceUniquePaymentPlan && eventId) {
      const existing = await tx.bills.findFirst({
        where: {
          ownerType: parsed.data.ownerType,
          ownerId: duplicateOwnerIds.length > 1 ? { in: duplicateOwnerIds } : ownerId,
          eventId,
          parentBillId: null,
          paymentPlanEnabled: true,
          ...(resolvedBillSlotId && resolvedBillOccurrenceDate
            ? {
                slotId: resolvedBillSlotId,
                occurrenceDate: resolvedBillOccurrenceDate,
              }
            : {}),
        } as any,
        select: { id: true },
      });
      if (existing) {
        return { duplicateBillId: existing.id } as const;
      }
    }

    const bill = await tx.bills.create({
      data: {
        id: crypto.randomUUID(),
        ownerType: parsed.data.ownerType,
        ownerId,
        totalAmountCents: effectiveTotalAmountCents,
        paidAmountCents: 0,
        eventId,
        slotId: resolvedBillSlotId,
        occurrenceDate: resolvedBillOccurrenceDate,
        organizationId,
        sourceType,
        sourceId,
        allowSplit: parsed.data.allowSplit ?? false,
        status: 'OPEN',
        paymentPlanEnabled,
        createdBy: session.userId,
        lineItems: normalizedLineItems.length > 0
          ? normalizedLineItems
          : [
              {
                id: 'line_1',
                type: 'EVENT',
                label: 'Event registration',
                amountCents: effectiveTotalAmountCents,
              },
            ],
        createdAt: now,
        updatedAt: now,
      } as any,
    });

    const payments = await Promise.all(amounts.map((amount, index) => {
      const dueDate = dueDates[index] ?? dueDates[dueDates.length - 1] ?? now;
      return tx.billPayments.create({
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

    const nextPayment = payments.sort((a, b) => a.sequence - b.sequence)[0];
    const updatedBill = await tx.bills.update({
      where: { id: bill.id },
      data: {
        nextPaymentDue: nextPayment?.dueDate ?? null,
        nextPaymentAmountCents: nextPayment?.amountCents ?? null,
        updatedAt: new Date(),
      },
    });

    return { bill: updatedBill } as const;
  });

  if ('duplicateBillId' in creationResult) {
    return NextResponse.json(
      {
        error: 'A payment plan already exists for this owner and event.',
        billId: creationResult.duplicateBillId,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ bill: creationResult.bill }, { status: 201 });
}
