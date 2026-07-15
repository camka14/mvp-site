import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { canManageBillPayment, loadBillForAction } from '@/server/billing/billPaymentActions';

/**
 * Most image files are intentionally public (event, organization, and profile
 * media). Manual payment proofs are the exception: a leaked file ID must not
 * disclose a receipt or payment screenshot. The proof record is the durable
 * discriminator, so access remains correct even when the same generic file
 * endpoint serves both public and private media.
 */
export const assertFileReadAccess = async (req: NextRequest, fileId: string): Promise<void> => {
  const proof = await prisma.billPaymentProofs.findFirst({
    where: { fileId },
    select: { billId: true, uploadedByUserId: true },
  });
  if (!proof) return;

  const session = await requireSession(req);
  if (proof.uploadedByUserId === session.userId) return;

  const bill = await loadBillForAction(proof.billId);
  if (!bill || !(await canManageBillPayment(session, bill))) {
    throw new Response('Forbidden', { status: 403 });
  }
};
