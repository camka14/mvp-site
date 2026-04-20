import { NextRequest } from 'next/server';
import { getTokenFromRequest, verifySessionToken, SessionToken } from './authServer';
import { prisma } from '@/lib/prisma';
import { assertAuthUserIsActive } from '@/server/authState';
import { isSessionTokenCurrent } from '@/server/authSessions';

export type AuthContext = SessionToken & { rawToken: string };

export const requireSession = async (req: NextRequest): Promise<AuthContext> => {
  const token = getTokenFromRequest(req);
  if (!token) {
    throw new Response('Unauthorized', { status: 401 });
  }
  const decoded = verifySessionToken(token);
  if (!decoded) {
    throw new Response('Unauthorized', { status: 401 });
  }
  const authUser = await prisma.authUser.findUnique({
    where: { id: decoded.userId },
    select: { disabledAt: true, disabledReason: true, sessionVersion: true },
  });
  if (!authUser) {
    throw new Response('Unauthorized', { status: 401 });
  }
  assertAuthUserIsActive(authUser);
  if (!isSessionTokenCurrent(decoded, authUser.sessionVersion)) {
    throw new Response('Unauthorized', { status: 401 });
  }
  return { ...decoded, rawToken: token };
};

export const getOptionalSession = async (req: NextRequest): Promise<AuthContext | null> => {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  const decoded = verifySessionToken(token);
  if (!decoded) return null;
  const authUser = await prisma.authUser.findUnique({
    where: { id: decoded.userId },
    select: { disabledAt: true, disabledReason: true, sessionVersion: true },
  });
  if (!authUser) return null;
  if (authUser.disabledAt) return null;
  if (!isSessionTokenCurrent(decoded, authUser.sessionVersion)) return null;
  return { ...decoded, rawToken: token };
};

export const assertUserAccess = (session: SessionToken, targetUserId: string): void => {
  if (session.isAdmin) return;
  if (session.userId !== targetUserId) {
    throw new Response('Forbidden', { status: 403 });
  }
};
