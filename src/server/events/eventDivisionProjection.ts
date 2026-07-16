type PrismaLike = {
  divisions: {
    findMany: (args: any) => Promise<any>;
  };
};

const uniqueIds = (values: unknown[]): string[] => Array.from(new Set(
  values
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean),
));

export async function loadRelationalEventDivisionIdsByEventId(
  client: PrismaLike,
  eventIds: string[],
): Promise<Map<string, string[]>> {
  const normalizedEventIds = uniqueIds(eventIds);
  const idsByEventId = new Map(normalizedEventIds.map((eventId) => [eventId, [] as string[]]));
  if (!normalizedEventIds.length) return idsByEventId;

  const rows = await client.divisions.findMany({
    where: {
      eventId: { in: normalizedEventIds },
      scope: 'EVENT',
      status: 'ACTIVE',
      OR: [
        { kind: 'LEAGUE' },
        { kind: null },
      ],
    },
    orderBy: [
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
      { name: 'asc' },
      { id: 'asc' },
    ],
    select: {
      eventId: true,
      id: true,
    },
  }) ?? [];

  for (const row of rows) {
    const eventId = typeof row.eventId === 'string'
      ? row.eventId.trim()
      : normalizedEventIds.length === 1
        ? normalizedEventIds[0]
        : '';
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    if (!eventId || !id || !idsByEventId.has(eventId)) continue;
    const existing = idsByEventId.get(eventId) ?? [];
    if (!existing.includes(id)) existing.push(id);
    idsByEventId.set(eventId, existing);
  }

  return idsByEventId;
}

export async function projectRelationalEventDivisionIds<T extends { id: string }>(
  client: PrismaLike,
  events: T[],
): Promise<Array<T & {
  divisions: string[];
  divisionDetails?: undefined;
  playoffDivisionDetails?: undefined;
}>> {
  const idsByEventId = await loadRelationalEventDivisionIdsByEventId(
    client,
    events.map((event) => event.id),
  );
  return events.map((event) => ({
    ...event,
    divisions: idsByEventId.get(event.id) ?? [],
    // Lightweight projections expose relational membership only. Detailed
    // division records come from the full event endpoint.
    divisionDetails: undefined,
    playoffDivisionDetails: undefined,
  }));
}
