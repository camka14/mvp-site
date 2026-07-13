export type SchedulePagePagination = {
  hasMore: boolean;
  nextCursor?: string | null;
  isComplete?: boolean;
};

export type SchedulePage<
  TEvent = Record<string, unknown>,
  TMatch = Record<string, unknown>,
  TField = Record<string, unknown>,
  TTeam = Record<string, unknown>,
> = {
  events?: TEvent[];
  matches?: TMatch[];
  fields?: TField[];
  teams?: TTeam[];
  pagination?: SchedulePagePagination;
};

const MAX_SCHEDULE_PAGES = 100;

const entityKey = (entity: unknown, fallback: string): string => {
  if (entity && typeof entity === 'object') {
    const row = entity as { id?: unknown; $id?: unknown };
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    const legacyId = typeof row.$id === 'string' ? row.$id.trim() : '';
    if (id || legacyId) return id || legacyId;
  }
  return fallback;
};

const appendCursor = (endpoint: string, cursor: string): string => {
  const hashIndex = endpoint.indexOf('#');
  const base = hashIndex >= 0 ? endpoint.slice(0, hashIndex) : endpoint;
  const hash = hashIndex >= 0 ? endpoint.slice(hashIndex) : '';
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}cursor=${encodeURIComponent(cursor)}${hash}`;
};

/** Loads a cursor-backed schedule to an explicitly complete client snapshot. */
export async function loadCompleteSchedulePayload<
  TEvent = Record<string, unknown>,
  TMatch = Record<string, unknown>,
  TField = Record<string, unknown>,
  TTeam = Record<string, unknown>,
>(
  endpoint: string,
  loadPage: (pageEndpoint: string) => Promise<SchedulePage<TEvent, TMatch, TField, TTeam>>,
): Promise<Required<Pick<SchedulePage<TEvent, TMatch, TField, TTeam>, 'events' | 'matches' | 'fields' | 'teams'>>> {
  const collections = {
    events: new Map<string, TEvent>(),
    matches: new Map<string, TMatch>(),
    fields: new Map<string, TField>(),
    teams: new Map<string, TTeam>(),
  };
  const seenCursors = new Set<string>();
  let pageEndpoint = endpoint;

  for (let pageIndex = 0; pageIndex < MAX_SCHEDULE_PAGES; pageIndex += 1) {
    const page = await loadPage(pageEndpoint);
    page.events?.forEach((entity, entityIndex) => {
      collections.events.set(entityKey(entity, `${pageIndex}:events:${entityIndex}`), entity);
    });
    page.matches?.forEach((entity, entityIndex) => {
      collections.matches.set(entityKey(entity, `${pageIndex}:matches:${entityIndex}`), entity);
    });
    page.fields?.forEach((entity, entityIndex) => {
      collections.fields.set(entityKey(entity, `${pageIndex}:fields:${entityIndex}`), entity);
    });
    page.teams?.forEach((entity, entityIndex) => {
      collections.teams.set(entityKey(entity, `${pageIndex}:teams:${entityIndex}`), entity);
    });

    const pagination = page.pagination;
    if (!pagination) {
      if (pageIndex > 0) {
        throw new Error('Schedule endpoint dropped pagination metadata during continuation');
      }
      break; // Compatibility with endpoints that still return one bounded page.
    }
    if (!pagination.hasMore) {
      if (pagination.isComplete === false) {
        throw new Error('Schedule endpoint returned an incomplete final page');
      }
      return {
        events: Array.from(collections.events.values()),
        matches: Array.from(collections.matches.values()),
        fields: Array.from(collections.fields.values()),
        teams: Array.from(collections.teams.values()),
      };
    }

    const nextCursor = pagination.nextCursor?.trim();
    if (!nextCursor) {
      throw new Error('Schedule endpoint omitted its continuation cursor');
    }
    if (!seenCursors.add(nextCursor)) {
      throw new Error('Schedule endpoint repeated its continuation cursor');
    }
    pageEndpoint = appendCursor(endpoint, nextCursor);
  }

  if (seenCursors.size >= MAX_SCHEDULE_PAGES) {
    throw new Error('Schedule endpoint exceeded the safe pagination limit');
  }

  return {
    events: Array.from(collections.events.values()),
    matches: Array.from(collections.matches.values()),
    fields: Array.from(collections.fields.values()),
    teams: Array.from(collections.teams.values()),
  };
}
