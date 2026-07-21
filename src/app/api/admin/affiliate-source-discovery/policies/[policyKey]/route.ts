import { NextRequest, NextResponse } from 'next/server';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';
import { applyAffiliateSourceDomainPolicy } from '@/server/affiliateImports/sourceDiscovery';
import { affiliateSourceDomainPolicyReviewSchema } from '@/server/affiliateImports/sourceDiscoveryTypes';

type RouteContext = { params: Promise<{ policyKey: string }> };

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const session = await requireRazumlyAdmin(req);
    const policyKey = decodeURIComponent((await params).policyKey ?? '').trim();
    const parsed = affiliateSourceDomainPolicyReviewSchema.safeParse(await req.json().catch(() => null));
    if (!policyKey || !parsed.success) return NextResponse.json({ error: 'Valid policy review is required.' }, { status: 400 });
    return NextResponse.json(await applyAffiliateSourceDomainPolicy(policyKey, parsed.data, session.userId));
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : 'Failed to update domain policy.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
