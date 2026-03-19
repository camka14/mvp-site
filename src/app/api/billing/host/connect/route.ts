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
  organizationEmail: z.string().optional(),
  refreshUrl: z.string(),
  returnUrl: z.string(),
}).passthrough();

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(req);
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    const connectClientId = process.env.STRIPE_CONNECT_CLIENT_ID;
    const origin = getRequestOrigin(req);
    const returnUrl = sanitizeSameOriginUrl(parsed.data.returnUrl, origin);
    const refreshUrl = sanitizeSameOriginUrl(parsed.data.refreshUrl, origin);

    if (!returnUrl || !refreshUrl) {
      return NextResponse.json({ error: 'Invalid redirect url' }, { status: 400 });
    }

    const organizationId = parsed.data.organization?.$id ?? parsed.data.organization?.id ?? null;
    const targetEmail = parsed.data.organizationEmail ?? parsed.data.user?.email ?? undefined;

    const ownerKind = organizationId ? 'organization' : 'user';
    const ownerId = organizationId ?? session.userId;

    if (organizationId) {
      const organization = await prisma.organizations.findUnique({
        where: { id: organizationId },
        select: { id: true, ownerId: true },
      });

      if (!organization) {
        return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
      }

      if (!(await canManageOrganization(session, organization))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    if (!secretKey) {
      if (organizationId) {
        await prisma.organizations.update({
          where: { id: organizationId },
          data: { hasStripeAccount: true, updatedAt: new Date() },
        });
        await prisma.stripeAccounts.upsert({
          where: { id: `org_${organizationId}` },
          create: {
            id: `org_${organizationId}`,
            organizationId,
            accountId: `acct_mock_${organizationId}`,
            email: targetEmail ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          update: {
            accountId: `acct_mock_${organizationId}`,
            email: targetEmail ?? null,
            updatedAt: new Date(),
          },
        });
      } else {
        await prisma.userData.update({
          where: { id: session.userId },
          data: { hasStripeAccount: true, updatedAt: new Date() },
        });
        await prisma.stripeAccounts.upsert({
          where: { id: `user_${session.userId}` },
          create: {
            id: `user_${session.userId}`,
            userId: session.userId,
            accountId: `acct_mock_${session.userId}`,
            email: targetEmail ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          update: {
            accountId: `acct_mock_${session.userId}`,
            email: targetEmail ?? null,
            updatedAt: new Date(),
          },
        });
      }

      return NextResponse.json({ onboardingUrl: returnUrl }, { status: 200 });
    }

    if (!connectClientId) {
      return NextResponse.json({ error: 'STRIPE_CONNECT_CLIENT_ID is not set' }, { status: 500 });
    }

    const stripe = new Stripe(secretKey);
    const callbackUrl = getCallbackUrl(req.nextUrl.origin);

    try {
      const state = createConnectState(ownerKind, ownerId, returnUrl, refreshUrl);
      const onboardingUrl = buildStripeAuthorizeUrl(stripe, {
        clientId: connectClientId,
        state,
        redirectUri: callbackUrl,
        email: targetEmail,
      });

      return NextResponse.json({ onboardingUrl }, { status: 200 });
    } catch (error) {
      if (error instanceof Error && error.message === 'AUTH_SECRET is not set') {
        return NextResponse.json({ error: 'AUTH_SECRET is not set' }, { status: 500 });
      }

      console.error('Stripe onboarding failed', error);
      return NextResponse.json({ error: 'Stripe onboarding failed' }, { status: 500 });
    }
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Connect onboarding initialization failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
