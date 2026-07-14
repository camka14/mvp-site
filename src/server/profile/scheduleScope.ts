import { getCanonicalTeamIdsByUserIds } from '@/server/teams/teamMembership';

type PrismaLike = any;

const SCHEDULE_REGISTRATION_STATUSES = ['ACTIVE', 'PENDING', 'STARTED', 'BLOCKED'] as const;

export const uniqueScheduleIds = (values: Array<string | null | undefined>): string[] => (
  Array.from(
    new Set(
      values
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean),
    ),
  )
);

export const getScheduleTeamsDelegate = (client: PrismaLike) => (
  client?.teams ?? client?.volleyBallTeams
);

export type ProfileScheduleScope = {
  userId: string;
  relevantTeamIds: string[];
  involvedEventIds: string[];
  involvementFilters: Record<string, unknown>[];
};

/**
 * Resolves the canonical ways a user can participate in a schedule. Keeping this
 * in one place prevents the full schedule and the tiny next-action endpoint from
 * disagreeing about registrations, team slots, officials, or hosted events.
 */
export async function loadProfileScheduleScope(
  client: PrismaLike,
  userId: string,
): Promise<ProfileScheduleScope | null> {
  const user = await client.userData.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) return null;

  const teamIdsByUserId = await getCanonicalTeamIdsByUserIds([user.id], client);
  const teamIds = teamIdsByUserId.get(user.id) ?? [];

  const teamsDelegate = getScheduleTeamsDelegate(client);
  const slotTeamRows = teamIds.length && teamsDelegate?.findMany
    ? await teamsDelegate.findMany({
        where: { parentTeamId: { in: teamIds } },
        select: { id: true },
      })
    : [];
  const slotTeamIds = uniqueScheduleIds(
    slotTeamRows.map((row: { id?: unknown }) => String(row.id ?? '').trim()),
  );
  const relevantTeamIds = uniqueScheduleIds([...teamIds, ...slotTeamIds]);

  const registrationRows = await client.eventRegistrations.findMany({
    where: {
      status: { in: [...SCHEDULE_REGISTRATION_STATUSES] },
      OR: [
        {
          registrantId: user.id,
          registrantType: { in: ['SELF', 'CHILD'] },
        },
        ...(relevantTeamIds.length
          ? [{
              registrantId: { in: relevantTeamIds },
              registrantType: 'TEAM' as const,
            }]
          : []),
      ],
    },
    select: { eventId: true },
  });
  const registeredEventIds = uniqueScheduleIds(
    registrationRows.map((row: { eventId?: unknown }) => String(row.eventId ?? '').trim()),
  );

  const officialRows = typeof client?.eventOfficials?.findMany === 'function'
    ? await client.eventOfficials.findMany({
        where: {
          userId: user.id,
          isActive: { not: false },
        },
        select: { eventId: true },
      })
    : [];
  const officialEventIds = uniqueScheduleIds(
    officialRows.map((row: { eventId?: unknown }) => String(row.eventId ?? '').trim()),
  );
  const involvedEventIds = uniqueScheduleIds([...registeredEventIds, ...officialEventIds]);
  const involvementFilters: Record<string, unknown>[] = [{ hostId: user.id }];
  if (involvedEventIds.length) {
    involvementFilters.push({ id: { in: involvedEventIds } });
  }

  return {
    userId: user.id,
    relevantTeamIds,
    involvedEventIds,
    involvementFilters,
  };
}
