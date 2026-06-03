import jwt from 'jsonwebtoken';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthSecret } from '@/lib/authServer';
import { requireSession } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { canManageEvent } from '@/server/accessControl';
import { MATCH_REALTIME_SCOPE } from '@/server/realtime/matchRealtime';
import { applyRateLimit, RATE_LIMIT_POLICIES } from '@/server/rateLimit';

export const dynamic = 'force-dynamic';

const TOKEN_TTL_SECONDS = 5 * 60;
const MANAGER_ONLY_EVENT_STATES = new Set(['UNPUBLISHED', 'DRAFT', 'TEMPLATE']);

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export async function GET(req: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(req, RATE_LIMIT_POLICIES.realtimeToken);
    if (rateLimited) {
      return rateLimited;
    }

    const session = await requireSession(req);
    const eventId = normalizeId(req.nextUrl.searchParams.get('eventId'));
    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
    }

    const event = await prisma.events.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        hostId: true,
        assistantHostIds: true,
        organizationId: true,
        state: true,
      },
    });
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const normalizedState = typeof event.state === 'string'
      ? event.state.toUpperCase()
      : 'PUBLISHED';
    if (MANAGER_ONLY_EVENT_STATES.has(normalizedState) && !(await canManageEvent(session, event))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresAtSeconds = nowSeconds + TOKEN_TTL_SECONDS;
    const token = jwt.sign(
      {
        scope: MATCH_REALTIME_SCOPE,
        eventId,
        userId: session.userId,
      },
      getAuthSecret(),
      { expiresIn: TOKEN_TTL_SECONDS },
    );

    return NextResponse.json({
      token,
      expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
    }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Match realtime token creation failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
