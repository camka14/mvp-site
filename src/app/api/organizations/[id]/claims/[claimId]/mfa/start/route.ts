import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/permissions';
import {
  createOrganizationClaimMfaChallenge,
  readTotpMfaRequestMetadata,
} from '@/server/authTotpMfa';
import { applyRateLimit, RATE_LIMIT_POLICIES } from '@/server/rateLimit';
import { getOrganizationClaim } from '@/server/organizationClaims/service';
import { organizationClaimErrorResponse } from '@/server/organizationClaims/http';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; claimId: string }> },
) {
  try {
    const [session, { id, claimId }] = await Promise.all([requireSession(req), params]);
    await getOrganizationClaim(id, claimId, session);
    const rateLimited = await applyRateLimit(
      req,
      RATE_LIMIT_POLICIES.authMfaSend,
      `${session.userId}:${id}:${claimId}`,
    );
    if (rateLimited) return rateLimited;
    const challenge = await createOrganizationClaimMfaChallenge({
      userId: session.userId,
      sessionVersion: session.sessionVersion,
      metadata: readTotpMfaRequestMetadata(req),
    });
    if (!challenge) {
      const returnTo = `/organizations/${encodeURIComponent(id)}/claim?claimId=${encodeURIComponent(claimId)}`;
      return NextResponse.json({
        error: 'Set up an authenticator before accepting organization ownership.',
        code: 'MFA_SETUP_REQUIRED_FOR_ORGANIZATION_CLAIM',
        setupUrl: `/profile?mfa=organization-claim&returnTo=${encodeURIComponent(returnTo)}`,
      }, { status: 403 });
    }
    return NextResponse.json({
      code: 'MFA_REQUIRED_FOR_ORGANIZATION_CLAIM',
      mfa: challenge,
    }, { status: 200 });
  } catch (error) {
    return organizationClaimErrorResponse(error);
  }
}
