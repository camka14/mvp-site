import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/permissions';
import { evaluateRazumlyAdminAccess } from '@/server/razumlyAdmin';

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(req);
    const status = await evaluateRazumlyAdminAccess(session.userId);
    return NextResponse.json({
      allowed: status.allowed,
      email: status.email,
      verified: status.verified,
      reason: status.reason ?? null,
    }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Admin access check failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
