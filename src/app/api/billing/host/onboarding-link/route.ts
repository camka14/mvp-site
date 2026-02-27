import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageOrganization } from '@/server/accessControl';
import {
  buildStripeAuthorizeUrl,
  createConnectState,
  getCallbackUrl,
  getRequestOrigin,
  sanitizeSameOriginUrl,
} from '../stripeConnectState';

export const dynamic = 'force-dynamic';

const schema = z.object({
  user: z.record(z.string(), z.any()).optional(),
  organization: z.record(z.string(), z.any()).optional(),
  refreshUrl: z.string(),
  returnUrl: z.string(),
}).passthrough();

const getStandardDashboardUrl = (livemode: boolean) =>
  livemode
    ? 'https://dashboard.stripe.com/'
    : 'https://dashboard.stripe.com/test/dashboard';

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(req);
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const origin = getRequestOrigin(req);
    const returnUrl = sanitizeSameOriginUrl(parsed.data.returnUrl, origin);
    const refreshUrl = sanitizeSameOriginUrl(parsed.data.refreshUrl, origin);

    if (!returnUrl || !refreshUrl) {
      return NextResponse.json({ error: 'Invalid redirect url' }, { status: 400 });
    }

    const organizationId = parsed.data.organization?.$id ?? parsed.data.organization?.id ?? null;
    const ownerKind = organizationId ? 'organization' : 'user';
    const ownerId = organizationId ?? session.userId;

    if (organizationId) {
      const organization = await prisma.organizations.findUnique({
        where: { id: organizationId },
        select: { ownerId: true, hostIds: true },
      });
      if (!organization) {
        return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
      }
      if (!canManageOrganization(session, organization)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const accountRecord = await prisma.stripeAccounts.findFirst({
      where: organizationId ? { organizationId } : { userId: session.userId },
    });

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey || !accountRecord?.accountId) {
      return NextResponse.json({ onboardingUrl: returnUrl }, { status: 200 });
    }

    try {
      const stripe = new Stripe(secretKey);
      const isLiveSecretKey = !(
        secretKey.startsWith('sk_test_')
        || secretKey.startsWith('rk_test_')
      );
      const account = await stripe.accounts.retrieve(accountRecord.accountId);
      const dashboardType = account.controller?.stripe_dashboard?.type;
      const isStandardAccount =
        account.type === 'standard' || dashboardType === 'full';
      const isExpressAccount =
        account.type === 'express' || dashboardType === 'express';

      if (isStandardAccount) {
        return NextResponse.json(
          { onboardingUrl: getStandardDashboardUrl(isLiveSecretKey) },
          { status: 200 },
        );
      }

      if (isExpressAccount) {
        try {
          const loginLink = await stripe.accounts.createLoginLink(
            accountRecord.accountId,
          );
          return NextResponse.json(
            { onboardingUrl: loginLink.url },
            { status: 200 },
          );
        } catch (loginError) {
          console.error('Stripe Express login link failed, falling back to account onboarding', loginError);
        }
      }

      const link = await stripe.accountLinks.create({
        account: accountRecord.accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });

      return NextResponse.json({ onboardingUrl: link.url, expiresAt: link.expires_at }, { status: 200 });
    } catch (error) {
      const connectClientId = process.env.STRIPE_CONNECT_CLIENT_ID;
      if (!connectClientId) {
        console.error('Stripe onboarding link failed and fallback is unavailable', error);
        return NextResponse.json({ error: 'STRIPE_CONNECT_CLIENT_ID is not set' }, { status: 500 });
      }

      try {
        const state = createConnectState(ownerKind, ownerId, returnUrl, refreshUrl);
        const callbackUrl = getCallbackUrl(origin);
        const onboardingUrl = buildStripeAuthorizeUrl(new Stripe(secretKey), {
          clientId: connectClientId,
          state,
          redirectUri: callbackUrl,
        });
        return NextResponse.json({ onboardingUrl }, { status: 200 });
      } catch (fallbackError) {
        console.error('Stripe onboarding fallback link failed', fallbackError);
        return NextResponse.json({ error: 'Stripe onboarding link failed' }, { status: 500 });
      }
    }
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Stripe management link failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
