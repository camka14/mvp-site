import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/permissions';
import { requireBroadcastOverlayForEvent, requireManagedBroadcastEvent } from '@/server/broadcast/access';
import { applyBroadcastOverlayCommand } from '@/server/broadcast/commands';
import { broadcastErrorResponse } from '@/server/broadcast/http';
import { parseBroadcastOverlayCommand } from '@/server/broadcast/schemas';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string; overlayId: string }> }) {
  let routeParams: { eventId: string; overlayId: string } | undefined;
  try {
    const [session, resolvedParams, body] = await Promise.all([
      requireSession(request),
      params,
      request.json().catch(() => null),
    ]);
    routeParams = resolvedParams;
    await requireManagedBroadcastEvent({ eventId: routeParams.eventId, session });
    await requireBroadcastOverlayForEvent(routeParams);
    const result = await applyBroadcastOverlayCommand({
      eventId: routeParams.eventId,
      overlayId: routeParams.overlayId,
      actorUserId: session.userId,
      command: parseBroadcastOverlayCommand(body ?? {}),
    });
    return NextResponse.json(result);
  } catch (error) {
    return broadcastErrorResponse(error, {
      route: 'POST /api/events/[eventId]/broadcast-overlays/[overlayId]/commands',
      eventId: routeParams?.eventId,
      overlayId: routeParams?.overlayId,
    });
  }
}

