import { NextRequest, NextResponse } from 'next/server';
import { broadcastCapabilityHeaders, broadcastErrorResponse, readBearerCapability } from '@/server/broadcast/http';
import {
  BROADCAST_OVERLAY_SOCKET_TTL_SECONDS,
  createBroadcastOverlaySocketTicket,
  validateBroadcastOverlayAccessToken,
} from '@/server/broadcast/tokens';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ overlayId: string }> }) {
  let overlayId: string | undefined;
  try {
    ({ overlayId } = await params);
    const token = readBearerCapability(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: broadcastCapabilityHeaders });
    }
    const { tokenRow } = await validateBroadcastOverlayAccessToken({ overlayId, token });
    const ticket = createBroadcastOverlaySocketTicket({ overlayId, accessTokenId: tokenRow.id });
    return NextResponse.json({ ticket, expiresInSeconds: BROADCAST_OVERLAY_SOCKET_TTL_SECONDS }, {
      headers: broadcastCapabilityHeaders,
    });
  } catch (error) {
    return broadcastErrorResponse(error, { route: 'POST /api/public/broadcast-overlays/[overlayId]/stream-token', overlayId });
  }
}
