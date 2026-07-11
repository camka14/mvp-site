import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireBroadcastOverlayForEvent, requireManagedBroadcastEvent } from '@/server/broadcast/access';
import { broadcastErrorResponse } from '@/server/broadcast/http';
import { requireSession } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string; overlayId: string }> }) {
  let routeParams: { eventId: string; overlayId: string } | undefined;
  try {
    const [session, resolvedParams] = await Promise.all([requireSession(request), params]);
    routeParams = resolvedParams;
    await requireManagedBroadcastEvent({ eventId: routeParams.eventId, session });
    await requireBroadcastOverlayForEvent(routeParams);
    const { limit } = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const actions = await prisma.broadcastOverlayActions.findMany({
      where: { overlayId: routeParams.overlayId },
      orderBy: [{ presentationRevision: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
    return NextResponse.json({ actions });
  } catch (error) {
    return broadcastErrorResponse(error, {
      route: 'GET /api/events/[eventId]/broadcast-overlays/[overlayId]/actions',
      eventId: routeParams?.eventId,
      overlayId: routeParams?.overlayId,
    });
  }
}

