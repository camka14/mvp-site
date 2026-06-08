import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { setAuthCookie, signSessionToken, verifyWatchSetupToken } from '@/lib/authServer';
import { applyNameCaseToUserFields } from '@/lib/nameCase';
import { withLegacyFields } from '@/server/legacyFormat';
import { buildProfileCompletionState } from '@/server/profileCompletion';
import { ACCOUNT_SUSPENDED_CODE, isAuthUserSuspended } from '@/server/authState';
import { isSessionTokenCurrent } from '@/server/authSessions';
import { withDerivedCanonicalTeamIds } from '@/server/teams/teamMembership';
import { applyRateLimit, RATE_LIMIT_POLICIES } from '@/server/rateLimit';

const exchangeSchema = z.object({
  setupToken: z.string().trim().min(1),
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
  const rateLimited = await applyRateLimit(req, RATE_LIMIT_POLICIES.authLogin);
  if (rateLimited) {
    return rateLimited;
  }

  const body = await req.json().catch(() => null);
  const parsed = exchangeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const setup = verifyWatchSetupToken(parsed.data.setupToken);
  if (!setup) {
    return NextResponse.json({ error: 'Invalid watch setup token' }, { status: 401 });
  }

  const user = await prisma.authUser.findUnique({ where: { id: setup.userId } });
  if (!user) {
    return NextResponse.json({ error: 'Invalid watch setup token' }, { status: 401 });
  }

  if (!isSessionTokenCurrent(setup, user.sessionVersion)) {
    return NextResponse.json({ error: 'Invalid watch setup token' }, { status: 401 });
  }

  if (isAuthUserSuspended(user)) {
    return NextResponse.json(
      { error: 'Account suspended', code: ACCOUNT_SUSPENDED_CODE },
      { status: 403 },
    );
  }

  const profile = await prisma.userData.findUnique({ where: { id: user.id } });
  const [profileWithDerivedTeamIds] = profile
    ? await withDerivedCanonicalTeamIds([profile], prisma)
    : [null];
  const session = {
    userId: user.id,
    isAdmin: false,
    sessionVersion: user.sessionVersion ?? 0,
    device: 'watch' as const,
  };
  const token = signSessionToken(session);
  const res = NextResponse.json(
    {
      user: toPublicUser(user),
      session,
      token,
      profile: profileWithDerivedTeamIds ? withLegacyFields(applyNameCaseToUserFields(profileWithDerivedTeamIds)) : null,
      ...buildProfileCompletionState({ authUser: user, profile }),
      requiresEmailVerification: !user.emailVerifiedAt,
      verificationEmailSent: false,
    },
    { status: 200 },
  );
  setAuthCookie(res, token);
  return res;
}
