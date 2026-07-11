import crypto from 'crypto';
import { getRedisClient, getRedisKeyPrefix } from '@/lib/redis';
import { refreshBroadcastPresentationForEvent } from '@/server/broadcast/presentation';

export type MatchRealtimeMessage = {
  type: 'match.changed';
  eventId: string;
  matches: unknown[];
  deleted: string[];
  sentAt: string;
};

type MatchRealtimeBroadcaster = (message: MatchRealtimeMessage) => number;

type MatchRealtimeGlobal = typeof globalThis & {
  __mvpMatchRealtimeBroadcast?: MatchRealtimeBroadcaster;
  __mvpMatchRealtimeOriginId?: string;
};

export const MATCH_REALTIME_SCOPE = 'event-match-updates';
export const MATCH_REALTIME_REDIS_CHANNEL = `${getRedisKeyPrefix()}:realtime:matches`;

export type MatchRealtimeRedisEnvelope = {
  version: 1;
  originId: string;
  message: MatchRealtimeMessage;
  sentAt: string;
};

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const matchIdFromPayload = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  return normalizeId(row.id) ?? normalizeId(row.$id);
};

export const buildMatchRealtimeMessage = (input: {
  eventId: string;
  matches?: unknown[];
  deleted?: string[];
  sentAt?: string;
}): MatchRealtimeMessage => ({
  type: 'match.changed',
  eventId: input.eventId,
  matches: Array.isArray(input.matches) ? input.matches : [],
  deleted: Array.from(
    new Set((input.deleted ?? []).map((id) => normalizeId(id)).filter((id): id is string => Boolean(id))),
  ),
  sentAt: input.sentAt ?? new Date().toISOString(),
});

export const getMatchRealtimeOriginId = (): string => {
  const fromEnv = process.env.MVP_REALTIME_ORIGIN_ID?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const realtimeGlobal = globalThis as MatchRealtimeGlobal;
  if (!realtimeGlobal.__mvpMatchRealtimeOriginId) {
    realtimeGlobal.__mvpMatchRealtimeOriginId = crypto.randomUUID();
  }
  return realtimeGlobal.__mvpMatchRealtimeOriginId;
};

export const buildMatchRealtimeRedisEnvelope = (
  message: MatchRealtimeMessage,
  originId = getMatchRealtimeOriginId(),
): MatchRealtimeRedisEnvelope => ({
  version: 1,
  originId,
  message,
  sentAt: new Date().toISOString(),
});

const publishMatchRealtimeRedisEnvelope = async (envelope: MatchRealtimeRedisEnvelope): Promise<void> => {
  const redis = await getRedisClient();
  if (!redis) {
    return;
  }

  try {
    await redis.publish(MATCH_REALTIME_REDIS_CHANNEL, JSON.stringify(envelope));
  } catch (error) {
    console.error('[realtime] Redis publish failed', error);
  }
};

export const publishEventMatchChanges = (input: {
  eventId: string;
  matches?: unknown[];
  deleted?: string[];
}): number => {
  const eventId = normalizeId(input.eventId);
  if (!eventId) return 0;

  const message = buildMatchRealtimeMessage({
    eventId,
    matches: input.matches,
    deleted: input.deleted,
  });

  // The legacy match channel intentionally remains unchanged. Broadcast
  // overlays refresh themselves from a fresh, sanitized projection only after
  // the committed mutation reaches this post-commit publication boundary.
  // Audit-remediation routes suppress this call for replayed operations, so a
  // retried client operation cannot create a second overlay revision.
  const changedMatchIds = [
    ...(input.matches ?? []).map(matchIdFromPayload),
    ...(input.deleted ?? []).map(normalizeId),
  ].filter((id): id is string => Boolean(id));
  void refreshBroadcastPresentationForEvent({
    eventId,
    changedMatchIds,
    reason: input.deleted?.length ? 'MATCH_DELETE' : 'OFFICIAL_MATCH_CHANGE',
  }).catch((error) => {
    console.error('[broadcast-overlay] Presentation refresh failed', {
      eventId,
      changedMatchCount: changedMatchIds.length,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  });

  const broadcaster = (globalThis as MatchRealtimeGlobal).__mvpMatchRealtimeBroadcast;
  if (typeof broadcaster !== 'function') {
    void publishMatchRealtimeRedisEnvelope(buildMatchRealtimeRedisEnvelope(message));
    return 0;
  }
  const sent = broadcaster(message);
  void publishMatchRealtimeRedisEnvelope(buildMatchRealtimeRedisEnvelope(message));
  return sent;
};
