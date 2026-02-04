import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const safeJsonParse = (value: string): any => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const sumPaid = (payments: Array<{ amountCents: number; status: string | null }>) => {
  return payments.reduce((total, payment) => {
    if (payment.status === 'PAID') return total + payment.amountCents;
    return total;
  }, 0);
};

export async function POST(req: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get('stripe-signature') ?? '';
  const payload = await req.text();

  let event: any = safeJsonParse(payload);

  if (webhookSecret && signature) {
    try {
      const stripe = new Stripe(secretKey ?? '');
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (error) {
      console.error('Stripe webhook signature failed', error);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }
  }

  if (!event || typeof event !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const dataObject = event.data?.object ?? {};
  const metadata = dataObject.metadata ?? {};
  const billId = metadata.bill_id ?? metadata.billId ?? dataObject.billId ?? null;
  const billPaymentId = metadata.bill_payment_id ?? metadata.billPaymentId ?? dataObject.billPaymentId ?? null;
  const purchaseType = metadata.purchase_type ?? metadata.purchaseType ?? null;

  try {
    if (billId && billPaymentId) {
      const now = new Date();
      await prisma.billPayments.update({
        where: { id: billPaymentId },
        data: { status: 'PAID', paidAt: now, updatedAt: now },
      });

      const bill = await prisma.bills.findUnique({ where: { id: billId } });
      if (bill) {
        const payments = await prisma.billPayments.findMany({
          where: { billId },
          select: { amountCents: true, status: true },
        });
        const paidAmountCents = sumPaid(payments);
        const status = paidAmountCents >= bill.totalAmountCents ? 'PAID' : bill.status ?? 'OPEN';
        await prisma.bills.update({
          where: { id: billId },
          data: { paidAmountCents, status, updatedAt: now },
        });
      }
    }

    if (purchaseType === 'product') {
      const productId = metadata.product_id ?? metadata.productId;
      const userId = metadata.user_id ?? metadata.userId;
      if (productId && userId) {
        const existing = await prisma.subscriptions.findFirst({
          where: { productId, userId, status: 'ACTIVE' },
        });
        if (!existing) {
          const product = await prisma.products.findUnique({ where: { id: productId } });
          if (product) {
            await prisma.subscriptions.create({
              data: {
                id: crypto.randomUUID(),
                productId: product.id,
                userId,
                organizationId: product.organizationId,
                startDate: new Date(),
                priceCents: product.priceCents,
                period: product.period,
                status: 'ACTIVE',
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('Stripe webhook handling failed', error);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
