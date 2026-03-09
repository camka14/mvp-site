import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { reconcileBoldSignOperations } from '@/lib/boldsignWebhookSync';
import { advisoryLockId } from '@/server/repositories/locks';

export const dynamic = 'force-dynamic';
const BOLDSIGN_RECONCILE_LOCK_ID = 'boldsign-reconcile-global';
const BOLDSIGN_RECONCILE_INTERVAL_MS = 30 * 60 * 1000;

const isAuthorized = (req: NextRequest): boolean => {
  const configuredSecret = process.env.BOLDSIGN_RECONCILE_SECRET?.trim();
  if (!configuredSecret) {
    return false;
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

const reserveReconcileWindow = async (): Promise<{ allowed: boolean; nextRunAt: Date }> => {
  return prisma.$transaction(async (tx) => {
    const lockId = advisoryLockId(BOLDSIGN_RECONCILE_LOCK_ID);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockId})`;

    const now = new Date();
    const existing = await tx.lockFiles.findUnique({
      where: { id: BOLDSIGN_RECONCILE_LOCK_ID },
      select: { expires: true },
    });

    if (existing?.expires && existing.expires.getTime() > now.getTime()) {
      return {
        allowed: false,
        nextRunAt: existing.expires,
      };
    }

    const nextRunAt = new Date(now.getTime() + BOLDSIGN_RECONCILE_INTERVAL_MS);
    await tx.lockFiles.upsert({
      where: { id: BOLDSIGN_RECONCILE_LOCK_ID },
      create: {
        id: BOLDSIGN_RECONCILE_LOCK_ID,
        createdAt: now,
        updatedAt: now,
        docId: null,
        expires: nextRunAt,
      },
      update: {
        updatedAt: now,
        expires: nextRunAt,
      },
    });

    return {
      allowed: true,
      nextRunAt,
    };
  });
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

  const windowReservation = await reserveReconcileWindow();
  if (!windowReservation.allowed) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'THROTTLED',
      nextRunAt: windowReservation.nextRunAt.toISOString(),
    }, { status: 200 });
  }

  const result = await reconcileBoldSignOperations({ limit: 200, includeConfirmed });
  return NextResponse.json({
    ok: true,
    ...result,
    nextRunAt: windowReservation.nextRunAt.toISOString(),
  }, { status: 200 });
}
