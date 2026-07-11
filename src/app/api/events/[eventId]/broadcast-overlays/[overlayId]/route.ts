import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/permissions';
import { requireBroadcastOverlayForEvent, requireManagedBroadcastEvent } from '@/server/broadcast/access';
import { broadcastErrorResponse } from '@/server/broadcast/http';
import { archiveBroadcastOverlay, updateBroadcastOverlayDraft } from '@/server/broadcast/overlayService';
import { parseBroadcastOverlayConfig } from '@/server/broadcast/schemas';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  draftConfig: z.unknown().optional(),
}).refine((value) => value.name !== undefined || value.draftConfig !== undefined, {
  message: 'Provide a name or draftConfig.',
});

type RouteParams = { eventId: string; overlayId: string };

export async function GET(request: NextRequest, { params }: { params: Promise<RouteParams> }) {
  let routeParams: RouteParams | undefined;
  try {
    const session = await requireSession(request);
    routeParams = await params;
    await requireManagedBroadcastEvent({ eventId: routeParams.eventId, session });
    const overlay = await requireBroadcastOverlayForEvent(routeParams);
    const state = await prisma.broadcastOverlayStates.findUnique({ where: { overlayId: overlay.id } });
    return NextResponse.json({ overlay, state });
  } catch (error) {
    return broadcastErrorResponse(error, {
      route: 'GET /api/events/[eventId]/broadcast-overlays/[overlayId]',
      eventId: routeParams?.eventId,
      overlayId: routeParams?.overlayId,
    });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<RouteParams> }) {
  let routeParams: RouteParams | undefined;
  try {
    const [session, resolvedParams, body] = await Promise.all([
      requireSession(request),
      params,
      request.json().catch(() => null),
    ]);
    routeParams = resolvedParams;
    await requireManagedBroadcastEvent({ eventId: routeParams.eventId, session });
    await requireBroadcastOverlayForEvent(routeParams);
    const input = patchSchema.parse(body ?? {});
    const overlay = await updateBroadcastOverlayDraft({
      overlayId: routeParams.overlayId,
      updatedByUserId: session.userId,
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.draftConfig === undefined ? {} : { draftConfig: parseBroadcastOverlayConfig(input.draftConfig) }),
    });
    return NextResponse.json({ overlay });
  } catch (error) {
    return broadcastErrorResponse(error, {
      route: 'PATCH /api/events/[eventId]/broadcast-overlays/[overlayId]',
      eventId: routeParams?.eventId,
      overlayId: routeParams?.overlayId,
    });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<RouteParams> }) {
  let routeParams: RouteParams | undefined;
  try {
    const [session, resolvedParams] = await Promise.all([requireSession(request), params]);
    routeParams = resolvedParams;
    await requireManagedBroadcastEvent({ eventId: routeParams.eventId, session });
    await archiveBroadcastOverlay({
      eventId: routeParams.eventId,
      overlayId: routeParams.overlayId,
      archivedByUserId: session.userId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return broadcastErrorResponse(error, {
      route: 'DELETE /api/events/[eventId]/broadcast-overlays/[overlayId]',
      eventId: routeParams?.eventId,
      overlayId: routeParams?.overlayId,
    });
  }
}

