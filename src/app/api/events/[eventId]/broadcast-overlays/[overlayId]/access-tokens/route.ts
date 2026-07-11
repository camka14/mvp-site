import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireBroadcastOverlayForEvent, requireManagedBroadcastEvent } from '@/server/broadcast/access';
import { broadcastErrorResponse } from '@/server/broadcast/http';
import { createBroadcastOverlayAccessToken } from '@/server/broadcast/tokens';
import { requireSession } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const createTokenSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

const serializeToken = (token: any) => ({
  id: token.id,
  overlayId: token.overlayId,
  label: token.label,
  createdAt: token.createdAt,
  updatedAt: token.updatedAt,
  expiresAt: token.expiresAt,
  revokedAt: token.revokedAt,
  revokedByUserId: token.revokedByUserId,
  revokeReason: token.revokeReason,
  lastUsedAt: token.lastUsedAt,
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string; overlayId: string }> }) {
  let routeParams: { eventId: string; overlayId: string } | undefined;
  try {
    const [session, resolvedParams] = await Promise.all([requireSession(request), params]);
    routeParams = resolvedParams;
    await requireManagedBroadcastEvent({ eventId: routeParams.eventId, session });
    await requireBroadcastOverlayForEvent(routeParams);
    const tokens = await prisma.broadcastOverlayAccessTokens.findMany({
      where: { overlayId: routeParams.overlayId },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ tokens: tokens.map(serializeToken) });
  } catch (error) {
    return broadcastErrorResponse(error, {
      route: 'GET /api/events/[eventId]/broadcast-overlays/[overlayId]/access-tokens',
      eventId: routeParams?.eventId,
      overlayId: routeParams?.overlayId,
    });
  }
}

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
    const input = createTokenSchema.parse(body ?? {});
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    const { token, tokenRow } = await createBroadcastOverlayAccessToken({
      overlayId: routeParams.overlayId,
      createdByUserId: session.userId,
      label: input.label,
      expiresAt,
    });
    // The raw capability is intentionally returned once. It is never stored,
    // written to an action payload, or included in a token-list response.
    return NextResponse.json({ token, tokenRow: serializeToken(tokenRow) }, {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return broadcastErrorResponse(error, {
      route: 'POST /api/events/[eventId]/broadcast-overlays/[overlayId]/access-tokens',
      eventId: routeParams?.eventId,
      overlayId: routeParams?.overlayId,
    });
  }
}

