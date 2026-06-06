import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { canManageRegistrationQuestionScope } from '@/server/registrationQuestionAccess';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  userId: z.string().trim().min(1),
  amountCents: z.number().int().positive().optional(),
  label: z.string().trim().min(1).optional(),
  dueDate: z.string().optional(),
}).strict();

const parseDueDate = (value: unknown): Date => {
  if (typeof value !== 'string' || !value.trim()) {
    return new Date();
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : new Date();
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  const canManage = await canManageRegistrationQuestionScope({
    session,
    scopeType: 'TEAM',
    scopeId: id,
  });
  if (!canManage) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const [team, registration] = await Promise.all([
    prisma.canonicalTeams.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        organizationId: true,
        registrationPriceCents: true,
      },
    }),
    prisma.teamRegistrations.findUnique({
      where: {
        teamId_userId: {
          teamId: id,
          userId: parsed.data.userId,
        },
      },
      select: {
        id: true,
        userId: true,
        parentId: true,
        status: true,
      },
    }),
  ]);
  if (!team) {
    return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
  }
  if (!registration || String(registration.status ?? '').toUpperCase() !== 'ACTIVE') {
    return NextResponse.json({ error: 'Send bills only to approved active team members.' }, { status: 409 });
  }

  const amountCents = parsed.data.amountCents ?? Math.max(0, Math.round(team.registrationPriceCents ?? 0));
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: 'Bill amount must be greater than 0.' }, { status: 400 });
  }
  const now = new Date();
  const dueDate = parseDueDate(parsed.data.dueDate);
  const label = parsed.data.label?.trim() || `Team registration - ${team.name}`;
  const payerUserId = registration.parentId || registration.userId;

  const bill = await prisma.$transaction(async (tx) => {
    const createdBill = await tx.bills.create({
      data: {
        id: crypto.randomUUID(),
        ownerType: 'TEAM' as any,
        ownerId: team.id,
        totalAmountCents: amountCents,
        paidAmountCents: 0,
        eventId: null,
        slotId: null,
        occurrenceDate: null,
        organizationId: team.organizationId ?? null,
        allowSplit: false,
        status: 'OPEN' as any,
        paymentPlanEnabled: false,
        createdBy: session.userId,
        lineItems: [
          {
            id: 'line_1',
            type: 'OTHER',
            label,
            amountCents,
          },
        ],
        createdAt: now,
        updatedAt: now,
      } as any,
    });
    const payment = await tx.billPayments.create({
      data: {
        id: crypto.randomUUID(),
        billId: createdBill.id,
        sequence: 1,
        dueDate,
        amountCents,
        status: 'PENDING' as any,
        payerUserId,
        createdAt: now,
        updatedAt: now,
      },
    });
    return tx.bills.update({
      where: { id: createdBill.id },
      data: {
        nextPaymentDue: payment.dueDate,
        nextPaymentAmountCents: payment.amountCents,
        updatedAt: new Date(),
      },
    });
  });

  return NextResponse.json({ bill: withLegacyFields(bill) }, { status: 201 });
}
