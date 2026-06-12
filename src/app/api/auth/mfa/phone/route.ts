import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/permissions';
import { getPhoneMfaStatus } from '@/server/authPhoneMfa';

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  const mfa = await getPhoneMfaStatus(session.userId);
  return NextResponse.json({ mfa }, { status: 200 });
}
