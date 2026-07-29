import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/permissions';
import { AuthMfaChallengePurpose } from '@/server/authMfaPurpose';
import {
  confirmTotpMfaChallenge,
  confirmTotpMfaChallengeForLocalBypass,
  isLocalAuthMfaBypassEnabled,
  isTotpMfaError,
} from '@/server/authTotpMfa';
import { applyRateLimit, RATE_LIMIT_POLICIES } from '@/server/rateLimit';
import { acceptOrganizationClaim } from '@/server/organizationClaims/service';
import { organizationClaimErrorResponse } from '@/server/organizationClaims/http';

export const dynamic = 'force-dynamic';

const schema = z.object({
  challengeId: z.string().min(1).max(200),
  code: z.string().min(6).max(16),
}).strict();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; claimId: string }> },
) {
  try {
    const [session, { id, claimId }, body] = await Promise.all([
      requireSession(req),
      params,
      req.json().catch(() => null),
    ]);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const rateLimited = await applyRateLimit(
      req,
      RATE_LIMIT_POLICIES.authMfaVerification,
      `${session.userId}:${parsed.data.challengeId}`,
    );
    if (rateLimited) return rateLimited;
    try {
      if (isLocalAuthMfaBypassEnabled(req)) {
        await confirmTotpMfaChallengeForLocalBypass({
          challengeId: parsed.data.challengeId,
          purpose: AuthMfaChallengePurpose.ORGANIZATION_CLAIM,
          expectedUserId: session.userId,
        });
      } else {
        await confirmTotpMfaChallenge({
          challengeId: parsed.data.challengeId,
          code: parsed.data.code,
          purpose: AuthMfaChallengePurpose.ORGANIZATION_CLAIM,
          expectedUserId: session.userId,
        });
      }
    } catch (error) {
      if (isTotpMfaError(error)) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.status },
        );
      }
      throw error;
    }
    const claim = await acceptOrganizationClaim(
      { organizationId: id, claimId, mfaConfirmed: true },
      session,
    );
    return NextResponse.json({ claim }, { status: 200 });
  } catch (error) {
    return organizationClaimErrorResponse(error);
  }
}
