import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { broadcastCapabilityHeaders, broadcastErrorResponse, readBearerCapability } from '@/server/broadcast/http';
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
    return NextResponse.json({
      config: parseBroadcastOverlayConfig(overlay.publishedConfig),
      state: parseMatchPresentationState(state.presentationState),
    }, { headers: broadcastCapabilityHeaders });
  } catch (error) {
    return broadcastErrorResponse(error, { route: 'GET /api/public/broadcast-overlays/[overlayId]/snapshot', overlayId });
  }
}

