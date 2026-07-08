import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/permissions';
import { resolvePurchaseContext } from '@/lib/purchaseContext';
import {
  DiscountCodeError,
  resolveDiscountApplication,
} from '@/server/discounts/discountCodeResolver';
import { logBillingError } from '@/server/billing/errorLogging';

export const dynamic = 'force-dynamic';

const schema = z.object({
  event: z.record(z.string(), z.any()).optional(),
  team: z.record(z.string(), z.any()).optional(),
  teamRegistration: z.union([z.record(z.string(), z.any()), z.string()]).optional(),
  timeSlot: z.record(z.string(), z.any()).optional(),
  purchaseType: z.string().optional(),
  productId: z.string().optional(),
  discountCode: z.string().optional(),
}).passthrough();

const normalizeString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length ? normalized : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const extractEntityId = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') {
    return normalizeString(value);
  }
  const row = value as Record<string, unknown>;
  return normalizeString(row.$id ?? row.id ?? row.teamId);
};

const resolveDiscountTargetId = ({
  purchaseType,
  eventId,
  productId,
  teamId,
}: {
  purchaseType: string;
  eventId: string | null;
  productId: string | null;
  teamId: string | null;
}): string | null => {
  if (purchaseType === 'event') {
    return eventId;
  }
  if (purchaseType === 'product') {
    return productId;
  }
  if (purchaseType === 'team_registration') {
    return teamId;
  }
  return null;
};

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    logBillingError({
      route: '/api/billing/discount-preview',
      stage: 'validate_input',
      status: 400,
      error: 'Invalid input',
      context: { issues: parsed.error.issues.length },
    });
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;
  const eventId = extractEntityId(payload.event);
  const productId = normalizeString(payload.productId);
  const teamId = extractEntityId(payload.team)
    ?? extractEntityId(payload.teamRegistration);
  const requestedPurchaseType = normalizeString(payload.purchaseType);
  const requestedDiscountCode = normalizeString(payload.discountCode);

  let resolvedPurchase: Awaited<ReturnType<typeof resolvePurchaseContext>>;
  try {
    resolvedPurchase = await resolvePurchaseContext({
      productId: payload.productId ?? null,
      event: payload.event ?? null,
      teamRegistration: payload.teamRegistration ?? (requestedPurchaseType === 'team_registration' ? payload.team ?? null : null),
      timeSlot: payload.timeSlot ?? null,
      requestedTaxCategory: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to resolve purchase details.';
    logBillingError({
      route: '/api/billing/discount-preview',
      stage: 'resolve_purchase',
      status: 400,
      error,
      context: {
        userId: session.userId,
        requestedPurchaseType,
        eventId,
        productId,
        teamId,
        discountCode: requestedDiscountCode,
      },
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (
    resolvedPurchase.purchaseType !== 'event'
    && resolvedPurchase.purchaseType !== 'product'
    && resolvedPurchase.purchaseType !== 'team_registration'
  ) {
    logBillingError({
      route: '/api/billing/discount-preview',
      stage: 'unsupported_purchase_type',
      status: 400,
      error: 'Discount codes are not supported for this purchase type.',
      context: {
        userId: session.userId,
        purchaseType: resolvedPurchase.purchaseType,
        eventId,
        productId,
        teamId,
        discountCode: requestedDiscountCode,
      },
    });
    return NextResponse.json({ error: 'Discount codes are not supported for this purchase type.' }, { status: 400 });
  }

  const discountTargetId = resolveDiscountTargetId({
    purchaseType: resolvedPurchase.purchaseType,
    eventId,
    productId: productId ?? resolvedPurchase.product?.id ?? null,
    teamId: teamId ?? resolvedPurchase.team?.id ?? null,
  });

  if (!requestedDiscountCode) {
    return NextResponse.json({
      code: null,
      applied: false,
      originalAmountCents: resolvedPurchase.amountCents,
      discountAmountCents: 0,
      discountedAmountCents: resolvedPurchase.amountCents,
    });
  }

  try {
    const discountResult = await resolveDiscountApplication({
      code: requestedDiscountCode,
      purchaseType: resolvedPurchase.purchaseType,
      targetId: discountTargetId ?? '',
      originalAmountCents: resolvedPurchase.amountCents,
      buyerUserId: session.userId,
    });
    const discount = discountResult.discount;
    const discountedAmountCents = discount?.discountedAmountCents ?? resolvedPurchase.amountCents;
    return NextResponse.json({
      code: discount?.code ?? requestedDiscountCode.toUpperCase(),
      applied: Boolean(discount),
      originalAmountCents: resolvedPurchase.amountCents,
      discountAmountCents: Math.max(0, resolvedPurchase.amountCents - discountedAmountCents),
      discountedAmountCents,
      discountId: discount?.discountId ?? null,
      discountCodeId: discount?.discountCodeId ?? null,
    });
  } catch (error) {
    if (error instanceof DiscountCodeError) {
      logBillingError({
        route: '/api/billing/discount-preview',
        stage: 'resolve_discount',
        status: error.status,
        error,
        context: {
          userId: session.userId,
          purchaseType: resolvedPurchase.purchaseType,
          targetId: discountTargetId,
          eventId,
          productId: productId ?? resolvedPurchase.product?.id ?? null,
          teamId: teamId ?? resolvedPurchase.team?.id ?? null,
          discountCode: requestedDiscountCode,
        },
      });
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Unable to apply discount code.';
    logBillingError({
      route: '/api/billing/discount-preview',
      stage: 'resolve_discount',
      status: 400,
      error,
      context: {
        userId: session.userId,
        purchaseType: resolvedPurchase.purchaseType,
        targetId: discountTargetId,
        eventId,
        productId: productId ?? resolvedPurchase.product?.id ?? null,
        teamId: teamId ?? resolvedPurchase.team?.id ?? null,
        discountCode: requestedDiscountCode,
      },
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
