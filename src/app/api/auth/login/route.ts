import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyPassword, setAuthCookie } from '@/lib/authServer';
import { getRequestOrigin } from '@/lib/requestOrigin';
import {
  isInitialEmailVerificationAvailable,
  sendInitialEmailVerification,
} from '@/server/authEmailVerification';
import { ACCOUNT_SUSPENDED_CODE, isAuthUserSuspended } from '@/server/authState';
import { applyRateLimit, RATE_LIMIT_POLICIES } from '@/server/rateLimit';
import { buildAuthSessionPayload } from '@/server/authSessionPayload';
import {
  createWebLoginMfaChallenge,
  isLocalAuthMfaBypassEnabled,
  isTotpMfaError,
  readTotpMfaRequestMetadata,
} from '@/server/authTotpMfa';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  clientType: z.enum(['web']).optional(),
});

export async function POST(req: NextRequest) {
  const rateLimited = await applyRateLimit(req, RATE_LIMIT_POLICIES.authLogin);
  if (rateLimited) {
    return rateLimited;
  }

  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();
  const authUser = await prisma.authUser.findUnique({ where: { email: normalizedEmail } });
  if (!authUser) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  if (isAuthUserSuspended(authUser)) {
    return NextResponse.json(
      { error: 'Account suspended', code: ACCOUNT_SUSPENDED_CODE },
      { status: 403 },
    );
  }

  const ok = await verifyPassword(password, authUser.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const requiresEmailVerification = !authUser.emailVerifiedAt;
  let verificationEmailSent = false;
  if (requiresEmailVerification && isInitialEmailVerificationAvailable()) {
    try {
      await sendInitialEmailVerification({
        userId: authUser.id,
        email: authUser.email,
        origin: getRequestOrigin(req),
      });
      verificationEmailSent = true;
    } catch (error) {
      console.error('Failed to send verification email during login', error);
    }
  }

  if (!isLocalAuthMfaBypassEnabled(req)) {
    try {
      const challenge = await createWebLoginMfaChallenge({
        userId: authUser.id,
        sessionVersion: authUser.sessionVersion ?? 0,
        metadata: readTotpMfaRequestMetadata(req),
      });
      if (challenge) {
        return NextResponse.json(
          {
            error: 'Authenticator verification required.',
            code: challenge.code,
            email: authUser.email,
            requiresMfa: true,
            requiresMfaSetup: false,
            mfa: challenge.mfa,
            requiresEmailVerification,
            verificationEmailSent,
          },
          { status: 200 },
        );
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
  }

  const now = new Date();
  const updatedAuthUser = await prisma.authUser.update({
    where: { id: authUser.id },
    data: { lastLogin: now, updatedAt: now },
  });
  const { payload, token } = await buildAuthSessionPayload({
    authUser: updatedAuthUser,
    verificationEmailSent,
  });
  const res = NextResponse.json(payload, { status: 200 });
  setAuthCookie(res, token);
  return res;
}
