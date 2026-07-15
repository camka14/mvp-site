import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { broadcastCapabilityHeaders, broadcastErrorResponse, readBearerCapability } from '@/server/broadcast/http';
import { buildMatchPresentationState } from '@/server/broadcast/presentation';
import { parseBroadcastOverlayConfig, parseMatchPresentationState } from '@/server/broadcast/schemas';
import { validateBroadcastOverlayAccessToken } from '@/server/broadcast/tokens';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ overlayId: string }> }) {
  let overlayId: string | undefined;
  try {
    ({ overlayId } = await params);
    const token = readBearerCapability(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: broadcastCapabilityHeaders });
    }
    const { overlay } = await validateBroadcastOverlayAccessToken({ overlayId, token });
    const state = await prisma.broadcastOverlayStates.findUnique({ where: { overlayId: overlay.id } });
    if (!state) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: broadcastCapabilityHeaders });
    }
    const storedState = parseMatchPresentationState(state.presentationState);
    // A score can be recorded by another app or server process. Rebuild the
    // automatic projection on each protected snapshot so an OBS source can
    // reconcile from the official match rows even if it missed a socket fanout.
    const presentationState = storedState.scoringMode === 'AUTOMATIC' && state.activeMatchId
      ? await buildMatchPresentationState({
        overlay,
        state,
        eventId: overlay.eventId,
        matchId: state.activeMatchId,
      })
      : storedState;

    return NextResponse.json({
      config: parseBroadcastOverlayConfig(overlay.publishedConfig),
      state: presentationState,
    }, { headers: broadcastCapabilityHeaders });
  } catch (error) {
    return broadcastErrorResponse(error, { route: 'GET /api/public/broadcast-overlays/[overlayId]/snapshot', overlayId });
  }
}
