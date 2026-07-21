import { NextRequest, NextResponse } from 'next/server';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';
import { queueAffiliateSourceDiscoveryRun } from '@/server/affiliateImports/sourceDiscovery';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const session = await requireRazumlyAdmin(req);
    const id = (await params).id?.trim();
    if (!id) return NextResponse.json({ error: 'Campaign id is required.' }, { status: 400 });
    return NextResponse.json({ run: await queueAffiliateSourceDiscoveryRun(id, session.userId) }, { status: 202 });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : 'Failed to queue campaign.';
    return NextResponse.json({ error: message }, { status: message.includes('not found') ? 404 : 400 });
  }
}
