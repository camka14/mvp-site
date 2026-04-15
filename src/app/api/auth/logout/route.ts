import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, setAuthCookie, verifySessionToken } from '@/lib/authServer';
import { revokeAuthUserSessions } from '@/server/authSessions';

export async function POST(req: NextRequest) {
  const session = verifySessionToken(getTokenFromRequest(req) ?? '');
  if (session?.userId) {
    await revokeAuthUserSessions(session.userId);
  }
  const res = NextResponse.json({ ok: true }, { status: 200 });
  setAuthCookie(res, '');
  return res;
}
