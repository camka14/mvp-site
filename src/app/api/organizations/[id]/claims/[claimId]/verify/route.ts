import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/permissions';
import { applyRateLimit, RATE_LIMIT_POLICIES } from '@/server/rateLimit';
import { verifyOrganizationClaim } from '@/server/organizationClaims/service';
import { organizationClaimErrorResponse } from '@/server/organizationClaims/http';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; claimId: string }> },
) {
  try {
    const [session, { id, claimId }] = await Promise.all([requireSession(req), params]);
    const rateLimited = await applyRateLimit(
      req,
      RATE_LIMIT_POLICIES.organizationClaimVerify,
      `${session.userId}:${id}:${claimId}`,
    );
    if (rateLimited) return rateLimited;
    const claim = await verifyOrganizationClaim(
      { organizationId: id, claimId },
      session,
    );
    return NextResponse.json({ claim }, { status: 200 });
  } catch (error) {
    return organizationClaimErrorResponse(error);
  }
}
