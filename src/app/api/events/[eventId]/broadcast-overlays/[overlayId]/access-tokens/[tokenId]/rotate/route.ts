import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBroadcastOverlayForEvent, requireManagedBroadcastEvent } from '@/server/broadcast/access';
import { broadcastErrorResponse } from '@/server/broadcast/http';
import { rotateBroadcastOverlayAccessToken } from '@/server/broadcast/tokens';
import { requireSession } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const rotateSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string; overlayId: string; tokenId: string }> }) {
  let routeParams: { eventId: string; overlayId: string; tokenId: string } | undefined;
  try {
    const [session, resolvedParams, body] = await Promise.all([
      requireSession(request),
      params,
      request.json().catch(() => null),
    ]);
    routeParams = resolvedParams;
    await requireManagedBroadcastEvent({ eventId: routeParams.eventId, session });
    await requireBroadcastOverlayForEvent(routeParams);
    const input = rotateSchema.parse(body ?? {});
    const result = await rotateBroadcastOverlayAccessToken({
      overlayId: routeParams.overlayId,
      tokenId: routeParams.tokenId,
      rotatedByUserId: session.userId,
      label: input.label,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    });
    return NextResponse.json({
      token: result.token,
      tokenRow: {
        id: result.tokenRow.id,
        overlayId: result.tokenRow.overlayId,
        label: result.tokenRow.label,
        createdAt: result.tokenRow.createdAt,
        expiresAt: result.tokenRow.expiresAt,
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return broadcastErrorResponse(error, {
      route: 'POST /api/events/[eventId]/broadcast-overlays/[overlayId]/access-tokens/[tokenId]/rotate',
      eventId: routeParams?.eventId,
      overlayId: routeParams?.overlayId,
    });
  }
}

