import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  BroadcastOverlayForbiddenError,
  BroadcastOverlayNotFoundError,
} from './access';
import {
  BroadcastOverlayCapabilityError,
} from './tokens';
import {
  BroadcastOverlayCommandError,
  BroadcastOverlayRevisionConflictError,
} from './commands';
import { logServerError } from '@/server/http/errorLogging';

export const broadcastCapabilityHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex',
} as const;

export const readBearerCapability = (request: Request): string | null => {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
};

export const broadcastErrorResponse = (error: unknown, context: {
  route: string;
  eventId?: string;
  overlayId?: string;
}) => {
  if (error instanceof Response) {
    const headers = new Headers(error.headers);
    Object.entries(broadcastCapabilityHeaders).forEach(([name, value]) => headers.set(name, value));
    return new NextResponse(error.body, { status: error.status, statusText: error.statusText, headers });
  }
  if (error instanceof BroadcastOverlayNotFoundError) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: broadcastCapabilityHeaders });
  }
  if (error instanceof BroadcastOverlayForbiddenError) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: broadcastCapabilityHeaders });
  }
  if (error instanceof BroadcastOverlayCapabilityError) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: broadcastCapabilityHeaders });
  }
  if (error instanceof BroadcastOverlayRevisionConflictError) {
    return NextResponse.json({ error: error.message, state: error.state }, { status: 409, headers: broadcastCapabilityHeaders });
  }
  if (error instanceof BroadcastOverlayCommandError) {
    return NextResponse.json({ error: error.message }, { status: 400, headers: broadcastCapabilityHeaders });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: 'Invalid request.', details: error.flatten() }, { status: 400, headers: broadcastCapabilityHeaders });
  }
  logServerError({
    message: 'Broadcast overlay route failed',
    error,
    route: context.route,
    context: { eventId: context.eventId, overlayId: context.overlayId },
  });
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: broadcastCapabilityHeaders });
};
