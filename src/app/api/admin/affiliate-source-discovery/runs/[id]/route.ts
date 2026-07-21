import { NextRequest, NextResponse } from 'next/server';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';
import { getAffiliateSourceDiscoveryRunContext } from '@/server/affiliateImports/sourceDiscovery';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    await requireRazumlyAdmin(req);
    const id = (await params).id?.trim();
    if (!id) return NextResponse.json({ error: 'Run id is required.' }, { status: 400 });
    return NextResponse.json(await getAffiliateSourceDiscoveryRunContext(id));
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : 'Failed to load discovery run.';
    return NextResponse.json({ error: message }, { status: message.includes('not found') ? 404 : 500 });
  }
}
