import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { isManualRegistrationPaymentMode } from '@/lib/manualRegistrationPayments';
import {
  canManageBillPayment,
  loadBillPaymentForAction,
  submitManualBillPaymentProofForAction,
} from '@/server/billing/billPaymentActions';

export const dynamic = 'force-dynamic';

const payloadSchema = z.object({
  fileId: z.string().trim().min(1),
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
  { params }: { params: Promise<{ id: string; paymentId: string }> },
) {
  const session = await requireSession(req);
  const { id, paymentId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const loaded = await loadBillPaymentForAction(id, paymentId);
  if (!loaded) {
    return NextResponse.json({ error: 'Bill payment not found.' }, { status: 404 });
  }
  if (!(await canManageBillPayment(session, loaded.bill))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!(await isManualPaymentBill(loaded.bill.eventId))) {
    return NextResponse.json(
      { error: 'Proof upload is only available for manual registration payments.' },
      { status: 400 },
    );
  }

  try {
    const proof = await submitManualBillPaymentProofForAction({
      bill: loaded.bill,
      payment: loaded.payment,
      fileId: parsed.data.fileId,
      userId: session.userId,
      now: new Date(),
    });
    return NextResponse.json({ proof: proof }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to submit proof of payment.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
