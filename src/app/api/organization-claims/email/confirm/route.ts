import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/permissions';
import { applyRateLimit, RATE_LIMIT_POLICIES } from '@/server/rateLimit';
import { confirmOrganizationClaimEmail } from '@/server/organizationClaims/service';
import { organizationClaimErrorResponse } from '@/server/organizationClaims/http';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(req);
    const token = req.nextUrl.searchParams.get('token')?.trim() ?? '';
    if (!token) {
      return NextResponse.json(
        { error: 'Verification token is required.', code: 'CLAIM_VERIFICATION_INVALID' },
        { status: 400 },
      );
    }
    const rateLimited = await applyRateLimit(
      req,
      RATE_LIMIT_POLICIES.organizationClaimVerify,
      `${session.userId}:${token.slice(0, 120)}`,
    );
    if (rateLimited) return rateLimited;
    const claim = await confirmOrganizationClaimEmail(token, session);
    return NextResponse.json({ claim }, { status: 200 });
  } catch (error) {
    return organizationClaimErrorResponse(error);
  }
}
