import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { isManualRegistrationPaymentMode } from '@/lib/manualRegistrationPayments';
import {
  canAdministerBillPayment,
  loadBillPaymentForAction,
  reviewManualBillPaymentProofForAction,
} from '@/server/billing/billPaymentActions';

export const dynamic = 'force-dynamic';

const payloadSchema = z.object({
  decision: z.enum(['ACCEPT', 'REJECT']),
  amountAcceptedCents: z.number().int().nonnegative().optional(),
  reviewNote: z.string().optional().nullable(),
}).strict();

const isManualPaymentBill = async (eventId: string | null): Promise<boolean> => {
  if (!eventId) {
    return false;
  }
  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: { registrationPaymentMode: true },
  } as any);
  return isManualRegistrationPaymentMode((event as any)?.registrationPaymentMode);
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string; proofId: string }> },
) {
  const session = await requireSession(req);
  const { id, paymentId, proofId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const loaded = await loadBillPaymentForAction(id, paymentId);
  if (!loaded) {
    return NextResponse.json({ error: 'Bill payment not found.' }, { status: 404 });
  }
  if (!(await canAdministerBillPayment(session, loaded.bill))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!(await isManualPaymentBill(loaded.bill.eventId))) {
    return NextResponse.json(
      { error: 'Manual payment proof review is only available for manual registration payments.' },
      { status: 400 },
    );
  }
  if (parsed.data.decision === 'ACCEPT' && parsed.data.amountAcceptedCents === undefined) {
    return NextResponse.json({ error: 'amountAcceptedCents is required when accepting proof.' }, { status: 400 });
  }

  try {
    const bill = await reviewManualBillPaymentProofForAction({
      bill: loaded.bill,
      payment: loaded.payment,
      proofId,
      accepted: parsed.data.decision === 'ACCEPT',
      amountAcceptedCents: parsed.data.amountAcceptedCents,
      reviewedByUserId: session.userId,
      reviewNote: parsed.data.reviewNote,
      now: new Date(),
    });
    return NextResponse.json({ bill: bill ?? loaded.bill }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to review proof of payment.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
