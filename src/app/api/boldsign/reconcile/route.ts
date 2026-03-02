import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/permissions';
import { reconcileBoldSignOperations } from '@/lib/boldsignWebhookSync';

export const dynamic = 'force-dynamic';

const isAuthorized = (req: NextRequest): boolean => {
  const configuredSecret = process.env.BOLDSIGN_RECONCILE_SECRET?.trim();
  if (!configuredSecret) {
    return true;
  }

  const byHeader = req.headers.get('x-reconcile-secret')?.trim();
  if (byHeader && byHeader === configuredSecret) {
    return true;
  }

  const authHeader = req.headers.get('authorization')?.trim();
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (token === configuredSecret) {
      return true;
    }
  }

  return false;
};

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    const session = await requireSession(req).catch(() => null);
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const includeConfirmedParam = req.nextUrl.searchParams.get('includeConfirmed');
  const includeConfirmed = typeof includeConfirmedParam === 'string'
    ? ['1', 'true', 'yes', 'on'].includes(includeConfirmedParam.trim().toLowerCase())
    : false;

  const result = await reconcileBoldSignOperations({ limit: 200, includeConfirmed });
  return NextResponse.json({ ok: true, ...result }, { status: 200 });
}
