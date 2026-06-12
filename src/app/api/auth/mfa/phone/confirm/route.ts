import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthMfaChallengePurpose } from '@/server/authMfaPurpose';
import { requireSession } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import {
  confirmPhoneMfaChallenge,
  getPhoneMfaStatus,
  isPhoneMfaError,
} from '@/server/authPhoneMfa';
import { applyRateLimit, RATE_LIMIT_POLICIES } from '@/server/rateLimit';

const schema = z.object({
  challengeId: z.string().min(1),
  code: z.string().min(4).max(10),
});

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
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
    const authUser = await prisma.authUser.findUnique({
      where: { id: session.userId },
      select: { email: true },
    });
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await confirmPhoneMfaChallenge({
      challengeId: parsed.data.challengeId,
      code: parsed.data.code,
      purpose: AuthMfaChallengePurpose.PROFILE_PHONE_SETUP,
      expectedUserId: session.userId,
      authUserEmail: authUser.email,
    });
    const mfa = await getPhoneMfaStatus(session.userId);
    return NextResponse.json({ mfa }, { status: 200 });
  } catch (error) {
    if (isPhoneMfaError(error)) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
}
