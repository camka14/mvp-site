import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthMfaChallengePurpose } from '@/server/authMfaPurpose';
import { setAuthCookie } from '@/lib/authServer';
import { prisma } from '@/lib/prisma';
import { ACCOUNT_SUSPENDED_CODE, isAuthUserSuspended } from '@/server/authState';
import { buildAuthSessionPayload } from '@/server/authSessionPayload';
import { confirmTotpMfaChallenge, isTotpMfaError } from '@/server/authTotpMfa';
import { applyRateLimit, RATE_LIMIT_POLICIES } from '@/server/rateLimit';

const schema = z.object({
  challengeId: z.string().min(1),
  code: z.string().min(6).max(16),
});

const errorResponse = (error: unknown) => {
  if (isTotpMfaError(error)) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  throw error;
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const rateLimited = await applyRateLimit(req, RATE_LIMIT_POLICIES.authMfaVerification, parsed.data.challengeId);
  if (rateLimited) {
    return rateLimited;
  }

  try {
    const confirmed = await confirmTotpMfaChallenge({
      challengeId: parsed.data.challengeId,
      code: parsed.data.code,
      purpose: AuthMfaChallengePurpose.LOGIN,
    });
    const authUser = await prisma.authUser.findUnique({ where: { id: confirmed.userId } });
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (isAuthUserSuspended(authUser)) {
      return NextResponse.json(
        { error: 'Account suspended', code: ACCOUNT_SUSPENDED_CODE },
        { status: 403 },
      );
    }
    if ((authUser.sessionVersion ?? 0) !== confirmed.sessionVersion) {
      return NextResponse.json({ error: 'Verification challenge has expired.' }, { status: 401 });
    }

    const now = new Date();
    const updatedAuthUser = await prisma.authUser.update({
      where: { id: authUser.id },
      data: { lastLogin: now, updatedAt: now },
    });
    const { payload, token } = await buildAuthSessionPayload({ authUser: updatedAuthUser });
    const response = NextResponse.json(payload, { status: 200 });
    setAuthCookie(response, token);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
