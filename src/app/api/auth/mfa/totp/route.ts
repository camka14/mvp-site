import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/permissions';
import { getTotpMfaStatus, isLocalAuthMfaBypassEnabled } from '@/server/authTotpMfa';

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  const mfa = await getTotpMfaStatus(session.userId);
  return NextResponse.json({
    mfa: {
      ...mfa,
      localBypassEnabled: isLocalAuthMfaBypassEnabled(req),
    },
  }, { status: 200 });
}
