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
};

export const MATCH_REALTIME_SCOPE = 'event-match-updates';

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

  const broadcaster = (globalThis as MatchRealtimeGlobal).__mvpMatchRealtimeBroadcast;
  if (typeof broadcaster !== 'function') {
    return 0;
  }
  return broadcaster(message);
};
