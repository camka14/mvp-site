import { NextRequest } from 'next/server';
import { getTokenFromRequest, verifySessionToken, SessionToken } from './authServer';

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
  return { ...decoded, rawToken: token };
};

export const assertUserAccess = (session: SessionToken, targetUserId: string): void => {
  if (session.isAdmin) return;
  if (session.userId !== targetUserId) {
    throw new Response('Forbidden', { status: 403 });
  }
};
