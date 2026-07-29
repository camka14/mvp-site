import { NextRequest, NextResponse } from 'next/server';
import { getOptionalSession } from '@/lib/permissions';
import { getOrganizationClaimPresentation } from '@/server/organizationClaims/service';
import { organizationClaimErrorResponse } from '@/server/organizationClaims/http';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ id }, session] = await Promise.all([params, getOptionalSession(req)]);
    const claim = await getOrganizationClaimPresentation(id, session);
    return NextResponse.json({ claim }, { status: 200 });
  } catch (error) {
    return organizationClaimErrorResponse(error);
  }
}
