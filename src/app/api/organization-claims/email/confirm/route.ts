import { NextRequest, NextResponse } from 'next/server';
import { getOptionalSession } from '@/lib/permissions';
import { applyRateLimit, RATE_LIMIT_POLICIES } from '@/server/rateLimit';
import { confirmOrganizationClaimEmail } from '@/server/organizationClaims/service';
import { organizationClaimErrorResponse } from '@/server/organizationClaims/http';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token')?.trim() ?? '';
    if (!token) {
      return NextResponse.json(
        { error: 'Verification token is required.', code: 'CLAIM_VERIFICATION_INVALID' },
        { status: 400 },
      );
    }
    const session = await getOptionalSession(req);
    if (!session) {
      const confirmationPath = `${req.nextUrl.pathname}?token=${encodeURIComponent(token)}`;
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('next', confirmationPath);
      return NextResponse.redirect(loginUrl);
    }
    const rateLimited = await applyRateLimit(
      req,
      RATE_LIMIT_POLICIES.organizationClaimVerify,
      `${session.userId}:${token.slice(0, 120)}`,
    );
    if (rateLimited) return rateLimited;
    const claim = await confirmOrganizationClaimEmail(token, session);
    if (req.headers.get('accept')?.includes('text/html')) {
      const claimUrl = new URL(
        `/organizations/${encodeURIComponent(claim.organizationId)}/claim`,
        req.url,
      );
      claimUrl.searchParams.set('claimId', claim.id);
      claimUrl.searchParams.set('verification', 'email_verified');
      return NextResponse.redirect(claimUrl);
    }
    return NextResponse.json({ claim }, { status: 200 });
  } catch (error) {
    return organizationClaimErrorResponse(error);
  }
}
