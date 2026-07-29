import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/permissions';
import { cancelOrganizationClaim } from '@/server/organizationClaims/service';
import { organizationClaimErrorResponse } from '@/server/organizationClaims/http';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; claimId: string }> },
) {
  try {
    const [session, { id, claimId }] = await Promise.all([requireSession(req), params]);
    const claim = await cancelOrganizationClaim(id, claimId, session);
    return NextResponse.json({ claim }, { status: 200 });
  } catch (error) {
    return organizationClaimErrorResponse(error);
  }
}
