import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTokenFromRequest, verifySessionToken, setAuthCookie, signSessionToken } from '@/lib/authServer';
import { withLegacyFields } from '@/server/legacyFormat';

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

  const profile = await prisma.userData.findUnique({ where: { id: user.id } });
  const refreshed = signSessionToken(decoded);
  const res = NextResponse.json(
    {
      user: toPublicUser(user),
      session: decoded,
      token: refreshed,
      profile: profile ? withLegacyFields(profile) : null,
    },
    { status: 200 },
  );
  setAuthCookie(res, refreshed);
  return res;
}
