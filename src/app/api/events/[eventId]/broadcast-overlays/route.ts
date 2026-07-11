import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/permissions';
import { requireManagedBroadcastEvent } from '@/server/broadcast/access';
import { broadcastErrorResponse } from '@/server/broadcast/http';
import { createBroadcastOverlay, listBroadcastOverlaysForEvent } from '@/server/broadcast/overlayService';
import { parseBroadcastOverlayConfig } from '@/server/broadcast/schemas';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  activeMatchId: z.string().trim().min(1).nullable().optional(),
  draftConfig: z.unknown().optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  let eventId: string | undefined;
  try {
    const session = await requireSession(request);
    ({ eventId } = await params);
    await requireManagedBroadcastEvent({ eventId, session });
    const overlays = await listBroadcastOverlaysForEvent(eventId);
    return NextResponse.json({ overlays });
  } catch (error) {
    return broadcastErrorResponse(error, { route: 'GET /api/events/[eventId]/broadcast-overlays', eventId });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  let eventId: string | undefined;
  try {
    const [session, routeParams, body] = await Promise.all([
      requireSession(request),
      params,
      request.json().catch(() => null),
    ]);
    eventId = routeParams.eventId;
    const input = createSchema.parse(body ?? {});
    const event = await requireManagedBroadcastEvent({ eventId, session });
    const overlay = await createBroadcastOverlay({
      eventId,
      organizationId: event.organizationId,
      name: input.name,
      createdByUserId: session.userId,
      activeMatchId: input.activeMatchId ?? null,
      ...(input.draftConfig === undefined ? {} : { draftConfig: parseBroadcastOverlayConfig(input.draftConfig) }),
    });
    return NextResponse.json({ overlay }, { status: 201 });
  } catch (error) {
    return broadcastErrorResponse(error, { route: 'POST /api/events/[eventId]/broadcast-overlays', eventId });
  }
}

