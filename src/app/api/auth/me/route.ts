import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTokenFromRequest, verifySessionToken, setAuthCookie, signSessionToken } from '@/lib/authServer';
import { applyNameCaseToUserFields } from '@/lib/nameCase';
import { withLegacyFields } from '@/server/legacyFormat';
import { buildProfileCompletionState } from '@/server/profileCompletion';
import { ACCOUNT_SUSPENDED_CODE, isAuthUserSuspended } from '@/server/authState';
import { isSessionTokenCurrent } from '@/server/authSessions';

const toPublicUser = (user: { id: string; email: string; name: string | null; createdAt: Date | null; updatedAt: Date | null }) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

export async function GET(req: NextRequest) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return NextResponse.json({ user: null, session: null }, { status: 200 });
  }

  const decoded = verifySessionToken(token);
  if (!decoded) {
    const res = NextResponse.json({ user: null, session: null }, { status: 200 });
    setAuthCookie(res, '');
    return res;
  }

  const user = await prisma.authUser.findUnique({ where: { id: decoded.userId } });
  if (!user) {
    const res = NextResponse.json({ user: null, session: null }, { status: 200 });
    setAuthCookie(res, '');
    return res;
  }

  if (!isSessionTokenCurrent(decoded, user.sessionVersion)) {
    const res = NextResponse.json({ user: null, session: null }, { status: 200 });
    setAuthCookie(res, '');
    return res;
  }

  if (isAuthUserSuspended(user)) {
    const res = NextResponse.json({ user: null, session: null, code: ACCOUNT_SUSPENDED_CODE }, { status: 200 });
    setAuthCookie(res, '');
    return res;
  }

  if (!user.emailVerifiedAt) {
    const res = NextResponse.json({ user: null, session: null, code: 'EMAIL_NOT_VERIFIED' }, { status: 200 });
    setAuthCookie(res, '');
    return res;
  }

  const profile = await prisma.userData.findUnique({ where: { id: user.id } });
  const refreshed = signSessionToken({
    userId: user.id,
    isAdmin: decoded.isAdmin,
    sessionVersion: user.sessionVersion ?? 0,
  });
  const res = NextResponse.json(
    {
      user: toPublicUser(user),
      session: {
        userId: user.id,
        isAdmin: decoded.isAdmin,
        sessionVersion: user.sessionVersion ?? 0,
      },
      token: refreshed,
      profile: profile ? withLegacyFields(applyNameCaseToUserFields(profile)) : null,
      ...buildProfileCompletionState({ authUser: user, profile }),
    },
    { status: 200 },
  );
  setAuthCookie(res, refreshed);
  return res;
}
