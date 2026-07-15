import type { NextRequest } from 'next/server';
import { getOptionalSession } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { canManageEvent } from '@/server/accessControl';

export type EventVisibilityRow = {
  id: string;
  state?: string | null;
  archivedAt?: Date | string | null;
  hostId: string | null;
  assistantHostIds?: unknown;
  organizationId?: string | null;
};

const normalizeState = (state: unknown): string | null => {
  if (typeof state !== 'string') return null;
  const normalized = state.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
};

/**
 * The same public-event contract is used by Discover and public SEO pages:
 * legacy rows without a state and explicitly PUBLISHED rows are public.
 * Everything else is an operations-only state and requires event management
 * authority before schedule, match, or realtime data is revealed.
 */
export const isPublicEventState = (state: unknown): boolean => {
  const normalized = normalizeState(state);
  return normalized === null || normalized === 'PUBLISHED';
};

const isArchived = (event: Pick<EventVisibilityRow, 'archivedAt'>): boolean => Boolean(event.archivedAt);

export const getVisibleEventIds = async (
  req: NextRequest,
  events: EventVisibilityRow[],
  client: typeof prisma = prisma,
): Promise<Set<string>> => {
  const visibleIds = new Set<string>();
  const restrictedEvents = events.filter((event) => {
    if (!event.id || isArchived(event)) return false;
    if (isPublicEventState(event.state)) {
      visibleIds.add(event.id);
      return false;
    }
    return true;
  });

  if (!restrictedEvents.length) {
    return visibleIds;
  }

  const session = await getOptionalSession(req);
  if (!session) {
    return visibleIds;
  }

  const permissions = await Promise.all(
    restrictedEvents.map(async (event) => ({
      eventId: event.id,
      canManage: await canManageEvent(session, event, client),
    })),
  );
  permissions.forEach(({ eventId, canManage }) => {
    if (canManage) {
      visibleIds.add(eventId);
    }
  });
  return visibleIds;
};

export const assertCanViewEventSchedule = async (
  req: NextRequest,
  event: EventVisibilityRow | null,
  client: typeof prisma = prisma,
): Promise<void> => {
  if (!event || isArchived(event)) {
    throw new Response('Event not found', { status: 404 });
  }
  if (isPublicEventState(event.state)) {
    return;
  }

  const session = await getOptionalSession(req);
  if (!session || !(await canManageEvent(session, event, client))) {
    throw new Response('Forbidden', { status: 403 });
  }
};
