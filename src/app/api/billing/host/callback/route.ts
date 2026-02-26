import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import {
  appendStripeResultQuery,
  getRequestOrigin,
  parseConnectState,
} from '../stripeConnectState';

export const dynamic = 'force-dynamic';

const getSafeFallbackUrl = (origin: string): string => new URL('/?', origin).toString();

const redirectWithResult = (
  target: string,
  result: 'return' | 'error',
  reason?: string,
): NextResponse => {
  const redirectUrl = appendStripeResultQuery(target, result, reason ? { reason } : undefined);
  return NextResponse.redirect(new URL(redirectUrl), { status: 302 });
};

export async function GET(req: NextRequest) {
  const origin = getRequestOrigin(req);

  const code = req.nextUrl.searchParams.get('code');
  const stateToken = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');

  const fallbackUrl = getSafeFallbackUrl(origin);

  if (error) {
    const state = stateToken ? parseConnectState(stateToken) : null;
    const target = state?.refreshUrl ?? fallbackUrl;
    return redirectWithResult(target, 'error', error);
  }

  if (!stateToken) {
    return redirectWithResult(fallbackUrl, 'error', 'missing_state');
  }

  const state = parseConnectState(stateToken);
  if (!state) {
    return redirectWithResult(fallbackUrl, 'error', 'invalid_state');
  }

  if (!code) {
    return redirectWithResult(state.refreshUrl, 'error', 'missing_code');
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return redirectWithResult(state.refreshUrl, 'error', 'missing_stripe_secret');
  }

  const stripe = new Stripe(secretKey);

  try {
    const token = await stripe.oauth.token({
      grant_type: 'authorization_code',
      code,
    });

    const accountId = token?.stripe_user_id;
    if (!accountId) {
      return redirectWithResult(state.refreshUrl, 'error', 'invalid_token');
    }

    const now = new Date();

    if (state.kind === 'organization') {
      await prisma.$transaction(async (tx) => {
        await tx.organizations.update({
          where: { id: state.ownerId },
          data: { hasStripeAccount: true, updatedAt: now },
        });
        await tx.stripeAccounts.upsert({
          where: { id: `org_${state.ownerId}` },
          create: {
            id: `org_${state.ownerId}`,
            organizationId: state.ownerId,
            accountId,
            createdAt: now,
            updatedAt: now,
          },
          update: {
            accountId,
            organizationId: state.ownerId,
            updatedAt: now,
          },
        });
      });
    } else {
      await prisma.$transaction(async (tx) => {
        await tx.userData.update({
          where: { id: state.ownerId },
          data: { hasStripeAccount: true, updatedAt: now },
        });
        await tx.stripeAccounts.upsert({
          where: { id: `user_${state.ownerId}` },
          create: {
            id: `user_${state.ownerId}`,
            userId: state.ownerId,
            accountId,
            createdAt: now,
            updatedAt: now,
          },
          update: {
            accountId,
            userId: state.ownerId,
            updatedAt: now,
          },
        });
      });
    }

    return redirectWithResult(state.returnUrl, 'return');
  } catch (exchangeError) {
    console.error('Stripe OAuth token exchange failed', exchangeError);
    return redirectWithResult(state.refreshUrl, 'error', 'token_exchange_failed');
  }
}
