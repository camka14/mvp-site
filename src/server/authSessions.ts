import type { VerifiedSessionToken } from '@/lib/authServer';
import { prisma } from '@/lib/prisma';

type AuthUserSessionVersion = {
  sessionVersion: number | null;
};

type AuthSessionClient = {
  authUser: {
    update: (args: {
      where: { id: string };
      data: { sessionVersion: { increment: number }; updatedAt: Date };
      select: { sessionVersion: true };
    }) => Promise<{ sessionVersion: number }>;
  };
};

export const isSessionTokenCurrent = (
  session: Pick<VerifiedSessionToken, 'sessionVersion'>,
  authUserSessionVersion: number | null | undefined,
): boolean => {
  return (authUserSessionVersion ?? 0) === session.sessionVersion;
};

export const revokeAuthUserSessions = async (
  userId: string,
  client: AuthSessionClient = prisma,
): Promise<number | null> => {
  try {
    const updated = await client.authUser.update({
      where: { id: userId },
      data: {
        sessionVersion: { increment: 1 },
        updatedAt: new Date(),
      },
      select: { sessionVersion: true },
    });
    return updated.sessionVersion;
  } catch {
    return null;
  }
};
