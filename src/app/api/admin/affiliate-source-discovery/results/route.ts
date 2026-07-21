import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';
import {
  bulkUpdateAffiliateSourceDiscoveryResults,
  listAffiliateSourceDiscoveryResults,
} from '@/server/affiliateImports/sourceDiscovery';

const bulkSchema = z.object({
  resultIds: z.array(z.string().trim().min(1)).min(1).max(100),
  action: z.enum(['REJECT', 'PROMOTE']),
});

export async function GET(req: NextRequest) {
  try {
    await requireRazumlyAdmin(req);
    const params = new URL(req.url).searchParams;
    return NextResponse.json(await listAffiliateSourceDiscoveryResults({
      campaignId: params.get('campaignId'),
      status: params.get('status'),
      query: params.get('query'),
      policyKey: params.get('policyKey'),
      sourceType: params.get('sourceType'),
      sportHint: params.get('sportHint'),
      minScore: params.has('minScore') ? Number(params.get('minScore')) : null,
      maxScore: params.has('maxScore') ? Number(params.get('maxScore')) : null,
      page: Number.parseInt(params.get('page') ?? '1', 10),
      pageSize: Number.parseInt(params.get('pageSize') ?? '50', 10),
    }));
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRazumlyAdmin(req);
    const parsed = bulkSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid bulk action.' }, { status: 400 });
    return NextResponse.json({
      results: await bulkUpdateAffiliateSourceDiscoveryResults(parsed.data.resultIds, parsed.data.action, session.userId),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : 'Bulk action failed.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
