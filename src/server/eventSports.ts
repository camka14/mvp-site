export const MULTI_SPORT_EVENT_TYPES = new Set(['EVENT', 'WEEKLY_EVENT']);

export const isMultiSportEventType = (eventType: unknown): boolean => (
  typeof eventType === 'string'
    && MULTI_SPORT_EVENT_TYPES.has(eventType.trim().toUpperCase())
);

const normalizeSportId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

export const normalizeEventSportIds = (input: unknown): string[] => {
  const values = Array.isArray(input) ? input : [];
  const normalized = values
    .map(normalizeSportId)
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set(normalized));
};

export const primaryEventSportId = (
  sportIds: string[],
): string | null => sportIds[0] ?? null;

export const validateEventSportIds = (params: {
  eventType: unknown;
  sportIds: string[];
}): void => {
  if (params.sportIds.length <= 1 || isMultiSportEventType(params.eventType)) {
    return;
  }
  const eventType = typeof params.eventType === 'string'
    ? params.eventType.trim().toUpperCase()
    : 'EVENT';
  throw new Error(
    `Multiple sports are supported only for regular and weekly events. ${eventType} events must use one sport.`,
  );
};

export const validateEventSportIdsExist = async (
  client: any,
  sportIds: string[],
): Promise<void> => {
  if (!sportIds.length || typeof client?.sports?.findMany !== 'function') {
    return;
  }
  const rows = await client.sports.findMany({
    where: { id: { in: sportIds } },
    select: { id: true },
  });
  const found = new Set(rows.map((row: { id?: unknown }) => String(row.id ?? '')));
  const missing = sportIds.filter((sportId) => !found.has(sportId));
  if (missing.length) {
    throw new Error(`Unknown event sport id(s): ${missing.join(', ')}.`);
  }
};
