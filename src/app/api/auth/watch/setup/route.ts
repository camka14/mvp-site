import { NextRequest, NextResponse } from 'next/server';
import { WATCH_SETUP_TOKEN_TTL_SECONDS, signWatchSetupToken } from '@/lib/authServer';
import { requireSession } from '@/lib/permissions';

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const setupToken = signWatchSetupToken({
    userId: session.userId,
    sessionVersion: session.sessionVersion,
  });

  return NextResponse.json(
    {
      setupToken,
      expiresInSeconds: WATCH_SETUP_TOKEN_TTL_SECONDS,
    },
    { status: 200 },
  );
}
