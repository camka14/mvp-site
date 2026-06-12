import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/permissions';
import {
  isTotpMfaError,
  readTotpMfaRequestMetadata,
  startProfileTotpMfaSetup,
} from '@/server/authTotpMfa';
import { applyRateLimit, RATE_LIMIT_POLICIES } from '@/server/rateLimit';

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const rateLimited = await applyRateLimit(req, RATE_LIMIT_POLICIES.authMfaSend, session.userId);
  if (rateLimited) {
    return rateLimited;
  }

  try {
    const mfa = await startProfileTotpMfaSetup({
      userId: session.userId,
      sessionVersion: session.sessionVersion,
      metadata: readTotpMfaRequestMetadata(req),
    });
    return NextResponse.json({ mfa }, { status: 200 });
  } catch (error) {
    if (isTotpMfaError(error)) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
}
