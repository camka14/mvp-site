import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/permissions';
import { requireManagedBroadcastEvent } from '@/server/broadcast/access';
import { broadcastErrorResponse } from '@/server/broadcast/http';
import { publishBroadcastOverlay } from '@/server/broadcast/overlayService';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string; overlayId: string }> }) {
  let routeParams: { eventId: string; overlayId: string } | undefined;
  try {
    const [session, resolvedParams] = await Promise.all([requireSession(request), params]);
    routeParams = resolvedParams;
    await requireManagedBroadcastEvent({ eventId: routeParams.eventId, session });
    const overlay = await publishBroadcastOverlay({
      eventId: routeParams.eventId,
      overlayId: routeParams.overlayId,
      publishedByUserId: session.userId,
    });
    return NextResponse.json({ overlay });
  } catch (error) {
    return broadcastErrorResponse(error, {
      route: 'POST /api/events/[eventId]/broadcast-overlays/[overlayId]/publish',
      eventId: routeParams?.eventId,
      overlayId: routeParams?.overlayId,
    });
  }
}

