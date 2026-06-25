import { NextRequest, NextResponse } from 'next/server';
import { withLegacyList } from '@/server/legacyFormat';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';
import { listAffiliateCandidates } from '@/server/affiliateImports/service';

export async function GET(req: NextRequest) {
  try {
    await requireRazumlyAdmin(req);
    const candidates = await listAffiliateCandidates({
      status: req.nextUrl.searchParams.get('status'),
      sourceId: req.nextUrl.searchParams.get('sourceId'),
    });
    return NextResponse.json({ candidates: withLegacyList(candidates) }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to load affiliate discoveries', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
