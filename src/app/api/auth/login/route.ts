import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyPassword, setAuthCookie, signSessionToken, SessionToken } from '@/lib/authServer';
import { applyNameCaseToUserFields } from '@/lib/nameCase';
import { getRequestOrigin } from '@/lib/requestOrigin';
import {
  isInitialEmailVerificationAvailable,
  sendInitialEmailVerification,
} from '@/server/authEmailVerification';
import { buildProfileCompletionState } from '@/server/profileCompletion';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const toPublicUser = (user: { id: string; email: string; name: string | null; createdAt: Date | null; updatedAt: Date | null }) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

export async function POST(req: NextRequest) {
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

  const ok = await verifyPassword(password, authUser.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  if (!authUser.emailVerifiedAt) {
    if (!isInitialEmailVerificationAvailable()) {
      return NextResponse.json(
        { error: 'Email verification is unavailable because SMTP is not configured.', code: 'EMAIL_VERIFICATION_UNAVAILABLE' },
        { status: 503 },
      );
    }

    try {
      await sendInitialEmailVerification({
        userId: authUser.id,
        email: authUser.email,
        origin: getRequestOrigin(req),
      });
    } catch (error) {
      console.error('Failed to send verification email during login', error);
      return NextResponse.json(
        { error: 'Failed to send verification email. Please try again.', code: 'EMAIL_VERIFICATION_SEND_FAILED' },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        error: 'Email not verified. We sent a verification link to your email.',
        code: 'EMAIL_NOT_VERIFIED',
        email: authUser.email,
        requiresEmailVerification: true,
        verificationEmailSent: true,
      },
      { status: 403 },
    );
  }

  const now = new Date();
  await prisma.authUser.update({ where: { id: authUser.id }, data: { lastLogin: now, updatedAt: now } });
  const profile = await prisma.userData.findUnique({ where: { id: authUser.id } });

  const session: SessionToken = { userId: authUser.id, isAdmin: false };
  const token = signSessionToken(session);
  const res = NextResponse.json(
    {
      user: toPublicUser(authUser),
      session,
      token,
      profile: profile ? applyNameCaseToUserFields(profile) : null,
      ...buildProfileCompletionState({ authUser, profile }),
    },
    { status: 200 },
  );
  setAuthCookie(res, token);
  return res;
}
