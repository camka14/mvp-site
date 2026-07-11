import crypto from 'crypto';
import { z } from 'zod';
import { getRedisClient, getRedisKeyPrefix } from '@/lib/redis';
import { matchPresentationStateV1Schema } from '@/server/broadcast/schemas';
import {
  BROADCAST_OVERLAY_ACTION_TYPES,
  type BroadcastOverlayRealtimeEvent,
  type BroadcastOverlayRealtimeMessage,
} from '@/server/broadcast/types';

type BroadcastOverlayRealtimeBroadcaster = (message: BroadcastOverlayRealtimeMessage) => number;

type BroadcastOverlayRealtimeGlobal = typeof globalThis & {
  __mvpBroadcastOverlayRealtimeBroadcast?: BroadcastOverlayRealtimeBroadcaster;
  __mvpBroadcastOverlayRealtimeOriginId?: string;
};

const realtimeIdSchema = z.string().trim().min(1).max(200);

const broadcastOverlayRealtimeEventSchema = z.object({
  type: z.union([
    z.literal('SNAPSHOT'),
    z.enum(BROADCAST_OVERLAY_ACTION_TYPES),
  ]),
  animate: z.boolean(),
}).strict().superRefine((event, context) => {
  if (event.type === 'SNAPSHOT' && event.animate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Snapshot events must not animate.',
    });
  }
});

const broadcastOverlayRealtimeMessageSchema = z.union([
  z.object({
    type: z.literal('overlay.subscribed'),
    overlayId: realtimeIdSchema,
    revision: z.number().int().nonnegative(),
  }).strict(),
  z.object({
    type: z.literal('overlay.state'),
    overlayId: realtimeIdSchema,
    revision: z.number().int().nonnegative(),
    state: matchPresentationStateV1Schema,
    event: broadcastOverlayRealtimeEventSchema,
  }).strict(),
  z.object({
    type: z.literal('overlay.revoked'),
    overlayId: realtimeIdSchema,
    accessTokenId: realtimeIdSchema,
  }).strict(),
]).superRefine((message, context) => {
  if (message.type === 'overlay.state' && message.revision !== message.state.revision) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['revision'],
      message: 'The message revision must match the presentation state revision.',
    });
  }
});

const broadcastOverlayRealtimeRedisEnvelopeSchema = z.object({
  version: z.literal(1),
  originId: realtimeIdSchema,
  message: broadcastOverlayRealtimeMessageSchema,
  sentAt: z.string().datetime(),
}).strict();

export const BROADCAST_OVERLAY_REALTIME_SCOPE = 'broadcast-overlay-state';
export const BROADCAST_OVERLAY_REALTIME_REDIS_CHANNEL = `${getRedisKeyPrefix()}:realtime:broadcast-overlays`;

export type BroadcastOverlayRealtimeRedisEnvelope = {
  version: 1;
  originId: string;
  message: BroadcastOverlayRealtimeMessage;
  sentAt: string;
};

export const parseBroadcastOverlayRealtimeMessage = (value: unknown): BroadcastOverlayRealtimeMessage => (
  broadcastOverlayRealtimeMessageSchema.parse(value) as BroadcastOverlayRealtimeMessage
);

export const parseBroadcastOverlayRealtimeRedisEnvelope = (value: unknown): BroadcastOverlayRealtimeRedisEnvelope => (
  broadcastOverlayRealtimeRedisEnvelopeSchema.parse(value) as BroadcastOverlayRealtimeRedisEnvelope
);

export const buildBroadcastOverlaySubscribedMessage = (input: {
  overlayId: string;
  revision: number;
}): BroadcastOverlayRealtimeMessage => parseBroadcastOverlayRealtimeMessage({
  type: 'overlay.subscribed',
  overlayId: input.overlayId,
  revision: input.revision,
});

export const buildBroadcastOverlayStateMessage = (input: {
  overlayId: string;
  state: unknown;
  event: BroadcastOverlayRealtimeEvent;
}): BroadcastOverlayRealtimeMessage => {
  const state = matchPresentationStateV1Schema.parse(input.state);

  return parseBroadcastOverlayRealtimeMessage({
    type: 'overlay.state',
    overlayId: input.overlayId,
    revision: state.revision,
    state,
    event: input.event,
  });
};

export const buildBroadcastOverlayRevokedMessage = (input: {
  overlayId: string;
  accessTokenId: string;
}): BroadcastOverlayRealtimeMessage => parseBroadcastOverlayRealtimeMessage({
  type: 'overlay.revoked',
  overlayId: input.overlayId,
  accessTokenId: input.accessTokenId,
});

export const getBroadcastOverlayRealtimeOriginId = (): string => {
  const fromEnv = process.env.MVP_REALTIME_ORIGIN_ID?.trim();
  if (fromEnv) {
    return realtimeIdSchema.parse(fromEnv);
  }

  const realtimeGlobal = globalThis as BroadcastOverlayRealtimeGlobal;
  if (!realtimeGlobal.__mvpBroadcastOverlayRealtimeOriginId) {
    realtimeGlobal.__mvpBroadcastOverlayRealtimeOriginId = crypto.randomUUID();
  }
  return realtimeGlobal.__mvpBroadcastOverlayRealtimeOriginId;
};

export const buildBroadcastOverlayRealtimeRedisEnvelope = (
  message: BroadcastOverlayRealtimeMessage,
  originId = getBroadcastOverlayRealtimeOriginId(),
): BroadcastOverlayRealtimeRedisEnvelope => parseBroadcastOverlayRealtimeRedisEnvelope({
  version: 1,
  originId,
  message,
  sentAt: new Date().toISOString(),
});

const publishBroadcastOverlayRealtimeRedisEnvelope = async (
  envelope: BroadcastOverlayRealtimeRedisEnvelope,
): Promise<void> => {
  const redis = await getRedisClient();
  if (!redis) {
    return;
  }

  try {
    await redis.publish(BROADCAST_OVERLAY_REALTIME_REDIS_CHANNEL, JSON.stringify(envelope));
  } catch (error) {
    console.error('[broadcast-overlay-realtime] Redis publish failed', error);
  }
};

/**
 * Fans a validated, presentation-only message out to both this process and
 * any peer custom-server processes listening through Redis. A missing custom
 * server is intentionally a no-op locally so route handlers remain usable in
 * normal Next.js test and build environments.
 */
export const publishBroadcastOverlayRealtimeMessage = (message: BroadcastOverlayRealtimeMessage): number => {
  const parsed = parseBroadcastOverlayRealtimeMessage(message);
  const broadcaster = (globalThis as BroadcastOverlayRealtimeGlobal).__mvpBroadcastOverlayRealtimeBroadcast;
  const sent = typeof broadcaster === 'function' ? broadcaster(parsed) : 0;

  void publishBroadcastOverlayRealtimeRedisEnvelope(
    buildBroadcastOverlayRealtimeRedisEnvelope(parsed),
  );

  return sent;
};

export const publishBroadcastOverlayState = (input: {
  overlayId: string;
  state: unknown;
  event: BroadcastOverlayRealtimeEvent;
}): number => publishBroadcastOverlayRealtimeMessage(buildBroadcastOverlayStateMessage(input));

export const publishBroadcastOverlayRevocation = (input: {
  overlayId: string;
  accessTokenId: string;
}): number => publishBroadcastOverlayRealtimeMessage(buildBroadcastOverlayRevokedMessage(input));
