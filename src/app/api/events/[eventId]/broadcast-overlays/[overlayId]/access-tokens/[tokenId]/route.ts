import { NextRequest, NextResponse } from 'next/server';
import { requireBroadcastOverlayForEvent, requireManagedBroadcastEvent } from '@/server/broadcast/access';
import { broadcastErrorResponse } from '@/server/broadcast/http';
import { revokeBroadcastOverlayAccessToken } from '@/server/broadcast/tokens';
import { requireSession } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ eventId: string; overlayId: string; tokenId: string }> }) {
  let routeParams: { eventId: string; overlayId: string; tokenId: string } | undefined;
  try {
    const [session, resolvedParams] = await Promise.all([requireSession(request), params]);
    routeParams = resolvedParams;
    await requireManagedBroadcastEvent({ eventId: routeParams.eventId, session });
    await requireBroadcastOverlayForEvent(routeParams);
    await revokeBroadcastOverlayAccessToken({
      overlayId: routeParams.overlayId,
      tokenId: routeParams.tokenId,
      revokedByUserId: session.userId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return broadcastErrorResponse(error, {
      route: 'DELETE /api/events/[eventId]/broadcast-overlays/[overlayId]/access-tokens/[tokenId]',
      eventId: routeParams?.eventId,
      overlayId: routeParams?.overlayId,
    });
  }
}

