import { NextRequest, NextResponse } from 'next/server';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';
import { updateAffiliateSourceDiscoveryCampaign } from '@/server/affiliateImports/sourceDiscovery';
import { affiliateSourceDiscoveryCampaignSchema } from '@/server/affiliateImports/sourceDiscoveryTypes';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    await requireRazumlyAdmin(req);
    const id = (await params).id?.trim();
    const parsed = affiliateSourceDiscoveryCampaignSchema.safeParse(await req.json().catch(() => null));
    if (!id || !parsed.success) return NextResponse.json({ error: 'Valid campaign input is required.' }, { status: 400 });
    return NextResponse.json({ campaign: await updateAffiliateSourceDiscoveryCampaign(id, parsed.data) });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : 'Failed to update campaign.';
    return NextResponse.json({ error: message }, { status: message.includes('not found') ? 404 : 400 });
  }
}
