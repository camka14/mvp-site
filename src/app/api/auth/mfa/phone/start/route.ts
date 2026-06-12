import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/permissions';
import {
  isPhoneMfaError,
  readPhoneMfaRequestMetadata,
  startProfilePhoneMfaSetup,
} from '@/server/authPhoneMfa';
import { applyRateLimit, RATE_LIMIT_POLICIES } from '@/server/rateLimit';

const schema = z.object({
  phoneNumber: z.string().min(7).max(32),
});

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const rateLimited = await applyRateLimit(req, RATE_LIMIT_POLICIES.authMfaSend, session.userId);
  if (rateLimited) {
    return rateLimited;
  }

  try {
    const mfa = await startProfilePhoneMfaSetup({
      userId: session.userId,
      phoneNumber: parsed.data.phoneNumber,
      sessionVersion: session.sessionVersion,
      metadata: readPhoneMfaRequestMetadata(req),
    });
    return NextResponse.json({ mfa }, { status: 200 });
  } catch (error) {
    if (isPhoneMfaError(error)) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
}
