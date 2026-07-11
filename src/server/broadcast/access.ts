import { prisma } from '@/lib/prisma';
import type { AuthContext } from '@/lib/permissions';
import { canManageEvent } from '@/server/accessControl';

export class BroadcastOverlayNotFoundError extends Error {
  constructor() {
    super('Broadcast overlay not found.');
    this.name = 'BroadcastOverlayNotFoundError';
  }
}

export class BroadcastOverlayForbiddenError extends Error {
  constructor() {
    super('You do not have permission to manage broadcast overlays for this event.');
    this.name = 'BroadcastOverlayForbiddenError';
  }
}

const normalizeId = (value: string): string => value.trim();

/**
 * The event is always reloaded before an overlay is authorized. A copied
 * organization ID is useful for indexing/audit, never as an authorization
 * source of truth.
 */
export const requireManagedBroadcastEvent = async (input: {
  eventId: string;
  session: AuthContext;
}) => {
  const eventId = normalizeId(input.eventId);
  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      organizationId: true,
      hostId: true,
      assistantHostIds: true,
      archivedAt: true,
      name: true,
      location: true,
      address: true,
      organizerName: true,
      imageId: true,
      sportId: true,
      matchRulesOverride: true,
    },
  });
  if (!event || event.archivedAt) {
    throw new BroadcastOverlayNotFoundError();
  }

  const allowed = await canManageEvent(input.session, event);
  if (!allowed) {
    throw new BroadcastOverlayForbiddenError();
  }
  return event;
};

export const requireBroadcastOverlayForEvent = async (input: {
  eventId: string;
  overlayId: string;
  includeArchived?: boolean;
}) => {
  const overlay = await prisma.broadcastOverlays.findFirst({
    where: {
      id: normalizeId(input.overlayId),
      eventId: normalizeId(input.eventId),
      ...(input.includeArchived ? {} : { archivedAt: null }),
    },
  });
  if (!overlay) {
    throw new BroadcastOverlayNotFoundError();
  }
  return overlay;
};

export const getPublishedBroadcastOverlay = async (overlayId: string) => {
  const overlay = await prisma.broadcastOverlays.findFirst({
    where: {
      id: normalizeId(overlayId),
      status: 'PUBLISHED',
      archivedAt: null,
    },
  });
  if (!overlay) {
    throw new BroadcastOverlayNotFoundError();
  }
  const event = await prisma.events.findUnique({
    where: { id: overlay.eventId },
    select: { id: true, archivedAt: true },
  });
  if (!event || event.archivedAt) {
    throw new BroadcastOverlayNotFoundError();
  }
  return overlay;
};

