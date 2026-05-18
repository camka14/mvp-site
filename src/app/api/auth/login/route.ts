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
import { ACCOUNT_SUSPENDED_CODE, isAuthUserSuspended } from '@/server/authState';
import { buildProfileCompletionState } from '@/server/profileCompletion';
import { withDerivedCanonicalTeamIds } from '@/server/teams/teamMembership';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const toPublicUser = (user: {
  id: string;
  email: string;
  name: string | null;
  emailVerifiedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  emailVerifiedAt: user.emailVerifiedAt,
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

  const now = new Date();
  await prisma.authUser.update({ where: { id: authUser.id }, data: { lastLogin: now, updatedAt: now } });
  const profile = await prisma.userData.findUnique({ where: { id: authUser.id } });
  const [profileWithDerivedTeamIds] = profile
    ? await withDerivedCanonicalTeamIds([profile], prisma)
    : [null];

  const session: SessionToken = {
    userId: authUser.id,
    isAdmin: false,
    sessionVersion: authUser.sessionVersion ?? 0,
  };
  const token = signSessionToken(session);
  const res = NextResponse.json(
    {
      user: toPublicUser(authUser),
      session,
      token,
      profile: profileWithDerivedTeamIds ? applyNameCaseToUserFields(profileWithDerivedTeamIds) : null,
      ...buildProfileCompletionState({ authUser, profile }),
      ...(requiresEmailVerification
        ? {
            code: 'EMAIL_NOT_VERIFIED',
            email: authUser.email,
            requiresEmailVerification: true,
            verificationEmailSent,
          }
        : {
            requiresEmailVerification: false,
            verificationEmailSent: false,
          }),
    },
    { status: 200 },
  );
  setAuthCookie(res, token);
  return res;
}
