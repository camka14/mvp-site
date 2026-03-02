import { prisma } from '@/lib/prisma';

type EventRowForAttendees = {
  id: string;
  eventType?: string | null;
  teamSignup?: boolean | null;
  teamIds?: unknown;
  userIds?: unknown;
};

type TeamLookupRow = {
  id: string;
  parentTeamId: string | null;
  name: string | null;
};

const normalizeIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0),
    ),
  );
};

const isSchedulableTeamEventType = (value: unknown): boolean => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return normalized === 'LEAGUE' || normalized === 'TOURNAMENT';
};

const hasLinkedParentTeam = (value: unknown): boolean => (
  typeof value === 'string' && value.trim().length > 0
);

const isPlaceholderName = (value: unknown): boolean => (
  typeof value === 'string' && value.trim().toLowerCase().startsWith('place holder')
);

const countTeamAttendees = (
  event: EventRowForAttendees,
  teamsById: Map<string, TeamLookupRow>,
): number => {
  const teamIds = normalizeIds(event.teamIds);
  if (!teamIds.length) {
    return 0;
  }

  if (!isSchedulableTeamEventType(event.eventType)) {
    return teamIds.length;
  }

  let linkedCount = 0;
  let knownCount = 0;
  let placeholderCount = 0;

  teamIds.forEach((teamId) => {
    const team = teamsById.get(teamId);
    if (!team) {
      return;
    }
    knownCount += 1;
    if (hasLinkedParentTeam(team.parentTeamId)) {
      linkedCount += 1;
    }
    if (isPlaceholderName(team.name)) {
      placeholderCount += 1;
    }
  });

  if (linkedCount > 0) {
    return linkedCount;
  }

  if (knownCount > 0 && knownCount === teamIds.length && placeholderCount === knownCount) {
    return 0;
  }

  return teamIds.length;
};

export const withEventAttendeeCounts = async <T extends EventRowForAttendees>(
  events: T[],
): Promise<Array<T & { attendees: number }>> => {
  const teamIds = Array.from(
    new Set(
      events.flatMap((event) => {
        if (!event?.teamSignup) {
          return [];
        }
        return normalizeIds(event.teamIds);
      }),
    ),
  );

  const teamsById = new Map<string, TeamLookupRow>();
  if (teamIds.length > 0) {
    const rows = await prisma.teams.findMany({
      where: { id: { in: teamIds } },
      select: {
        id: true,
        parentTeamId: true,
        name: true,
      },
    });
    rows.forEach((row) => {
      teamsById.set(row.id, row);
    });
  }

  return events.map((event) => {
    const attendees = event.teamSignup
      ? countTeamAttendees(event, teamsById)
      : normalizeIds(event.userIds).length;
    return {
      ...event,
      attendees,
    };
  });
};
