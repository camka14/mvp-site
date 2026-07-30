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

const loginSchema = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(8),
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
  const normalizedIdentifier = email.toLowerCase();
  const authUser = normalizedIdentifier.includes('@')
    ? await prisma.authUser.findUnique({ where: { email: normalizedIdentifier } })
    : await prisma.userData.findFirst({
        where: {
          userName: {
            equals: normalizedIdentifier,
            mode: 'insensitive',
          },
        },
        select: { id: true },
      }).then((profile) => profile
        ? prisma.authUser.findUnique({ where: { id: profile.id } })
        : null);
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

  if (requiresEmailVerification) {
    return NextResponse.json(
      {
        error: 'Please verify your email before signing in.',
        code: 'EMAIL_NOT_VERIFIED',
        email: authUser.email,
        requiresEmailVerification: true,
        verificationEmailSent,
      },
      { status: 403 },
    );
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
