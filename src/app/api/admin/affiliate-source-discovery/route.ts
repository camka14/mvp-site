import { NextRequest, NextResponse } from 'next/server';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';
import {
  createAffiliateSourceDiscoveryCampaign,
  listAffiliateSourceDiscoveryCampaigns,
} from '@/server/affiliateImports/sourceDiscovery';
import { affiliateSourceDiscoveryCampaignSchema } from '@/server/affiliateImports/sourceDiscoveryTypes';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    await requireRazumlyAdmin(req);
    const [campaigns, sports] = await Promise.all([
      listAffiliateSourceDiscoveryCampaigns(),
      prisma.sports.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    ]);
    return NextResponse.json({ campaigns, sports });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to list affiliate source discovery campaigns', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRazumlyAdmin(req);
    const parsed = affiliateSourceDiscoveryCampaignSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid campaign', details: parsed.error.flatten() }, { status: 400 });
    const campaign = await createAffiliateSourceDiscoveryCampaign(parsed.data, session.userId);
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : 'Failed to create campaign.';
    return NextResponse.json({ error: message }, { status: message.includes('Unique constraint') ? 409 : 400 });
  }
}
