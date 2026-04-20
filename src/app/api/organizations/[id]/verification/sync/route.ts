import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { canManageOrganization } from '@/server/accessControl';
import {
  findManagedOrganizationStripeAccount,
  syncManagedOrganizationStripeAccount,
} from '@/server/organizationStripeVerification';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(_req);
    const { id } = await params;
    const organization = await prisma.organizations.findUnique({
      where: { id },
      select: {
        id: true,
        ownerId: true,
        hostIds: true,
        officialIds: true,
      },
    });

    if (!organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    if (!(await canManageOrganization(session, organization))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    const managedStripeAccount = await findManagedOrganizationStripeAccount(id);

    if (secretKey && managedStripeAccount?.accountId) {
      const stripe = new Stripe(secretKey);
      await syncManagedOrganizationStripeAccount({
        stripe,
        organizationId: id,
        accountId: managedStripeAccount.accountId,
      });
    }

    const updatedOrganization = await prisma.organizations.findUnique({
      where: { id },
    });

    if (!updatedOrganization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    return NextResponse.json(withLegacyFields(updatedOrganization), { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to sync organization verification status', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
