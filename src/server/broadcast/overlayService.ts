import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { BroadcastOverlayNotFoundError } from './access';
import {
  DEFAULT_BROADCAST_OVERLAY_CONFIG,
  parseBroadcastOverlayConfig,
} from './schemas';
import {
  buildMatchPresentationState,
  createEmptyMatchPresentationState,
} from './presentation';
import type { BroadcastOverlayConfigV1, MatchPresentationStateV1 } from './types';

const normalizeName = (value: string): string => {
  const name = value.trim();
  if (!name) throw new Error('An overlay name is required.');
  return name.slice(0, 120);
};

const parseConfig = (value: unknown): BroadcastOverlayConfigV1 => parseBroadcastOverlayConfig(value);

export const listBroadcastOverlaysForEvent = async (eventId: string) => {
  const [overlays, states] = await Promise.all([
    prisma.broadcastOverlays.findMany({
      where: { eventId, archivedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    }),
    prisma.broadcastOverlayStates.findMany({ where: { eventId } }),
  ]);
  const statesByOverlayId = new Map(states.map((state) => [state.overlayId, state]));
  return overlays.map((overlay) => ({ ...overlay, state: statesByOverlayId.get(overlay.id) ?? null }));
};

export const createBroadcastOverlay = async (input: {
  eventId: string;
  organizationId: string | null;
  name: string;
  createdByUserId: string;
  activeMatchId?: string | null;
  draftConfig?: unknown;
}) => {
  const event = await prisma.events.findUnique({
    where: { id: input.eventId },
    select: { id: true, name: true, organizerName: true, location: true, address: true, archivedAt: true },
  });
  if (!event || event.archivedAt) {
    throw new BroadcastOverlayNotFoundError();
  }
  const config = input.draftConfig ? parseConfig(input.draftConfig) : DEFAULT_BROADCAST_OVERLAY_CONFIG;
  const overlayId = randomUUID();
  const stateId = randomUUID();
  const initialState = createEmptyMatchPresentationState({
    eventId: event.id,
    eventName: event.name,
    organizerName: event.organizerName,
    venue: event.location || event.address,
  });
  const overlay = await prisma.$transaction(async (tx) => {
    const created = await tx.broadcastOverlays.create({
      data: {
        id: overlayId,
        eventId: event.id,
        organizationId: input.organizationId,
        name: normalizeName(input.name),
        templateKey: 'COMPACT_SCOREBUG',
        status: 'DRAFT',
        draftConfig: config as any,
        createdByUserId: input.createdByUserId,
        updatedByUserId: input.createdByUserId,
      },
    });
    await tx.broadcastOverlayStates.create({
      data: {
        id: stateId,
        overlayId,
        eventId: event.id,
        activeMatchId: input.activeMatchId ?? null,
        presentationState: initialState as any,
        automaticShadowState: initialState as any,
        updatedByUserId: input.createdByUserId,
      },
    });
    await tx.broadcastOverlayActions.create({
      data: {
        id: randomUUID(),
        overlayId,
        organizationId: input.organizationId,
        eventId: event.id,
        matchId: input.activeMatchId ?? null,
        actorUserId: input.createdByUserId,
        actorKind: 'USER',
        actionType: 'OVERLAY_CREATED',
        presentationRevision: 0,
        requestId: `overlay-create:${overlayId}`,
        payload: { templateKey: 'COMPACT_SCOREBUG' },
      },
    });
    return created;
  });

  if (input.activeMatchId) {
    const state = await prisma.broadcastOverlayStates.findUnique({ where: { overlayId } });
    if (state) {
      const projected = await buildMatchPresentationState({
        overlay,
        state,
        eventId: event.id,
        matchId: input.activeMatchId,
      });
      await prisma.broadcastOverlayStates.update({
        where: { id: state.id },
        data: { presentationState: projected as any, automaticShadowState: projected as any },
      });
    }
  }
  return overlay;
};

export const updateBroadcastOverlayDraft = async (input: {
  overlayId: string;
  updatedByUserId: string;
  name?: string;
  draftConfig?: unknown;
}) => {
  const existing = await prisma.broadcastOverlays.findUnique({ where: { id: input.overlayId } });
  if (!existing || existing.archivedAt) {
    throw new BroadcastOverlayNotFoundError();
  }
  const draftConfig = input.draftConfig === undefined ? undefined : parseConfig(input.draftConfig);
  const updated = await prisma.broadcastOverlays.update({
    where: { id: existing.id },
    data: {
      ...(input.name !== undefined ? { name: normalizeName(input.name) } : {}),
      ...(draftConfig ? { draftConfig: draftConfig as any } : {}),
      updatedByUserId: input.updatedByUserId,
    },
  });
  await prisma.broadcastOverlayActions.create({
    data: {
      id: randomUUID(),
      overlayId: existing.id,
      organizationId: existing.organizationId,
      eventId: existing.eventId,
      actorUserId: input.updatedByUserId,
      actorKind: 'USER',
      actionType: 'OVERLAY_UPDATED',
      presentationRevision: 0,
      requestId: `overlay-update:${existing.id}:${randomUUID()}`,
      payload: {
        updatedName: input.name !== undefined,
        updatedDraftConfig: input.draftConfig !== undefined,
      },
    },
  });
  return updated;
};

export const publishBroadcastOverlay = async (input: {
  eventId: string;
  overlayId: string;
  publishedByUserId: string;
}) => {
  const overlay = await prisma.broadcastOverlays.findFirst({
    where: { id: input.overlayId, eventId: input.eventId, archivedAt: null },
  });
  const state = await prisma.broadcastOverlayStates.findUnique({ where: { overlayId: input.overlayId } });
  if (!overlay || !state) {
    throw new BroadcastOverlayNotFoundError();
  }
  const config = parseConfig(overlay.draftConfig);
  const projection = await buildMatchPresentationState({
    overlay: { ...overlay, publishedConfig: config as any },
    state,
    eventId: input.eventId,
    matchId: state.activeMatchId,
  });
  const nextRevision = state.revision + 1;
  const publishedState: MatchPresentationStateV1 = { ...projection, revision: nextRevision };
  await prisma.$transaction(async (tx) => {
    await tx.broadcastOverlays.update({
      where: { id: overlay.id },
      data: {
        status: 'PUBLISHED',
        publishedConfig: config as any,
        publishedConfigRevision: overlay.publishedConfigRevision + 1,
        publishedAt: new Date(),
        publishedByUserId: input.publishedByUserId,
        updatedByUserId: input.publishedByUserId,
      },
    });
    await tx.broadcastOverlayStates.update({
      where: { id: state.id },
      data: {
        revision: nextRevision,
        presentationState: publishedState as any,
        automaticShadowState: publishedState as any,
        updatedByUserId: input.publishedByUserId,
      },
    });
    await tx.broadcastOverlayActions.create({
      data: {
        id: randomUUID(),
        overlayId: overlay.id,
        organizationId: overlay.organizationId,
        eventId: overlay.eventId,
        matchId: state.activeMatchId,
        actorUserId: input.publishedByUserId,
        actorKind: 'USER',
        actionType: 'PUBLISHED_CONFIG',
        baseRevision: state.revision,
        presentationRevision: nextRevision,
        requestId: `publish:${overlay.id}:${overlay.publishedConfigRevision + 1}`,
        payload: { configRevision: overlay.publishedConfigRevision + 1 },
      },
    });
  });
  const { publishBroadcastOverlayState } = await import('@/server/realtime/broadcastOverlayRealtime');
  publishBroadcastOverlayState({
    overlayId: overlay.id,
    state: publishedState,
    event: { type: 'PUBLISHED_CONFIG', animate: false },
  });
  return { ...overlay, status: 'PUBLISHED', publishedConfig: config, publishedConfigRevision: overlay.publishedConfigRevision + 1 };
};

export const archiveBroadcastOverlay = async (input: {
  eventId: string;
  overlayId: string;
  archivedByUserId: string;
  reason?: string;
}) => {
  const overlay = await prisma.broadcastOverlays.findFirst({
    where: { id: input.overlayId, eventId: input.eventId, archivedAt: null },
  });
  if (!overlay) {
    throw new BroadcastOverlayNotFoundError();
  }
  const activeTokens = await prisma.broadcastOverlayAccessTokens.findMany({
    where: { overlayId: overlay.id, revokedAt: null },
    select: { id: true },
  });
  await prisma.$transaction(async (tx) => {
    await tx.broadcastOverlays.update({
      where: { id: overlay.id },
      data: {
        status: 'ARCHIVED',
        archivedAt: new Date(),
        archivedByUserId: input.archivedByUserId,
        archiveReason: input.reason?.trim() || 'ARCHIVED',
      },
    });
    await tx.broadcastOverlayAccessTokens.updateMany({
      where: { overlayId: overlay.id, revokedAt: null },
      data: {
        revokedAt: new Date(),
        revokedByUserId: input.archivedByUserId,
        revokeReason: 'OVERLAY_ARCHIVED',
      },
    });
    await tx.broadcastOverlayActions.create({
      data: {
        id: randomUUID(),
        overlayId: overlay.id,
        organizationId: overlay.organizationId,
        eventId: overlay.eventId,
        actorUserId: input.archivedByUserId,
        actorKind: 'USER',
        actionType: 'OVERLAY_ARCHIVED',
        presentationRevision: 0,
        requestId: `overlay-archive:${overlay.id}`,
        payload: { reason: input.reason?.trim() || 'ARCHIVED' },
      },
    });
  });
  if (activeTokens.length) {
    const { publishBroadcastOverlayRevocation } = await import('@/server/realtime/broadcastOverlayRealtime');
    activeTokens.forEach((token) => publishBroadcastOverlayRevocation({ overlayId: overlay.id, accessTokenId: token.id }));
  }
};
