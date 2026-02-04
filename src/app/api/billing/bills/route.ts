import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { parseDateInput, withLegacyList, withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  ownerType: z.enum(['USER', 'TEAM']),
  ownerId: z.string(),
  totalAmountCents: z.number(),
  eventId: z.string().nullable().optional(),
  organizationId: z.string().nullable().optional(),
  installmentAmounts: z.array(z.number()).optional(),
  installmentDueDates: z.array(z.string()).optional(),
  allowSplit: z.boolean().optional(),
  paymentPlanEnabled: z.boolean().optional(),
  event: z.record(z.string(), z.any()).optional(),
  user: z.record(z.string(), z.any()).optional(),
}).passthrough();

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  const params = req.nextUrl.searchParams;
  const ownerType = params.get('ownerType') as 'USER' | 'TEAM' | null;
  const ownerId = params.get('ownerId');
  const limit = Number(params.get('limit') || '100');

  if (!ownerType || !ownerId) {
    return NextResponse.json({ bills: [] }, { status: 200 });
  }

  if (ownerType === 'USER' && !session.isAdmin && ownerId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const bills = await prisma.bills.findMany({
    where: { ownerType, ownerId },
    take: Number.isFinite(limit) ? limit : 100,
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ bills: withLegacyList(bills) }, { status: 200 });
}

export async function POST(req: NextRequest) {
  await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const now = new Date();
  const bill = await prisma.bills.create({
    data: {
      id: crypto.randomUUID(),
      ownerType: parsed.data.ownerType,
      ownerId: parsed.data.ownerId,
      totalAmountCents: parsed.data.totalAmountCents,
      paidAmountCents: 0,
      eventId: parsed.data.eventId ?? null,
      organizationId: parsed.data.organizationId ?? null,
      allowSplit: parsed.data.allowSplit ?? false,
      status: 'OPEN',
      paymentPlanEnabled: parsed.data.paymentPlanEnabled ?? false,
      createdBy: parsed.data.user?.$id ?? null,
      createdAt: now,
      updatedAt: now,
    },
  });

  const amounts = Array.isArray(parsed.data.installmentAmounts) && parsed.data.installmentAmounts.length
    ? parsed.data.installmentAmounts
    : [parsed.data.totalAmountCents];
  const dueDates = Array.isArray(parsed.data.installmentDueDates) && parsed.data.installmentDueDates.length
    ? parsed.data.installmentDueDates
    : [now.toISOString()];

  const payments = await Promise.all(amounts.map((amount, index) => {
    const dueDate = parseDateInput(dueDates[index] ?? dueDates[dueDates.length - 1]) ?? now;
    return prisma.billPayments.create({
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
  await prisma.bills.update({
    where: { id: bill.id },
    data: {
      nextPaymentDue: nextPayment?.dueDate ?? null,
      nextPaymentAmountCents: nextPayment?.amountCents ?? null,
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({ bill: withLegacyFields(bill) }, { status: 201 });
}
