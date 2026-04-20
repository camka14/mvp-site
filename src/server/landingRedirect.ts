import { verifySessionToken } from '@/lib/authServer';
import { getHomePathForUser } from '@/lib/homePage';
import { prisma } from '@/lib/prisma';
import { isSessionTokenCurrent } from './authSessions';

type LandingRedirectClient = {
  authUser: {
    findUnique: (args: {
      where: { id: string };
      select: { emailVerifiedAt: true; sessionVersion: true };
    }) => Promise<{ emailVerifiedAt: Date | null; sessionVersion: number | null } | null>;
  };
  userData: {
    findUnique: (args: {
      where: { id: string };
      select: { homePageOrganizationId: true };
    }) => Promise<{ homePageOrganizationId: string | null } | null>;
  };
};

export const resolveLandingRedirectPathFromToken = async (
  token: string | null,
  client: LandingRedirectClient = prisma,
): Promise<string | null> => {
  if (!token) {
    return null;
  }

  const session = verifySessionToken(token);
  if (!session) {
    return null;
  }

  const authUser = await client.authUser.findUnique({
    where: { id: session.userId },
    select: { emailVerifiedAt: true, sessionVersion: true },
  });
  if (!authUser?.emailVerifiedAt || !isSessionTokenCurrent(session, authUser.sessionVersion)) {
    return null;
  }

  const profile = await client.userData.findUnique({
    where: { id: session.userId },
    select: { homePageOrganizationId: true },
  });

  return getHomePathForUser(profile);
};
