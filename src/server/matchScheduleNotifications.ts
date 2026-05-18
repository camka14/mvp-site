import { prisma } from '@/lib/prisma';
import { sendPushToUsers, type PushDispatchResult } from '@/server/pushNotifications';

type PrismaLike = typeof prisma | any;

export type MatchScheduleSnapshotEntry = {
  id: string;
  matchNumber: number | null;
  start: string | null;
  end: string | null;
  fieldId: string | null;
  teamIds: string[];
  teamNames: string[];
};

export type MatchScheduleChange = {
  matchId: string;
  matchNumber: number | null;
  teamIds: string[];
  teamNames: string[];
  scheduleChanged: boolean;
  teamAdded: boolean;
  deleted: boolean;
};

export type MatchScheduleNotificationPlan = {
  eventId: string;
  eventName: string;
  forceBatch?: boolean;
  changes: MatchScheduleChange[];
};

const ACTIVE_EVENT_REGISTRATION_STATUSES = ['ACTIVE', 'PENDING', 'STARTED'] as const;

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const uniqueIds = (values: unknown[]): string[] => Array.from(
  new Set(
    values
      .map((value) => normalizeId(value))
      .filter((value): value is string => Boolean(value)),
  ),
);

const normalizeDateValue = (value: unknown): string | null => {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? null : value.toISOString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
  }
  return null;
};

const readRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' ? value as Record<string, unknown> : {}
);

const readTeamRef = (
  matchRecord: Record<string, unknown>,
  objectKey: 'team1' | 'team2',
  idKey: 'team1Id' | 'team2Id',
): { id: string | null; name: string | null } => {
  const teamRecord = readRecord(matchRecord[objectKey]);
  const id = normalizeId(teamRecord.id ?? teamRecord.$id ?? matchRecord[idKey]);
  const name = typeof teamRecord.name === 'string' && teamRecord.name.trim()
    ? teamRecord.name.trim()
    : null;
  return { id, name };
};

export const snapshotMatchScheduleState = (
  matches: Iterable<unknown>,
): Map<string, MatchScheduleSnapshotEntry> => {
  const snapshot = new Map<string, MatchScheduleSnapshotEntry>();

  for (const match of matches) {
    const matchRecord = readRecord(match);
    const id = normalizeId(matchRecord.id ?? matchRecord.$id);
    if (!id) {
      continue;
    }

    const teamRefs = [
      readTeamRef(matchRecord, 'team1', 'team1Id'),
      readTeamRef(matchRecord, 'team2', 'team2Id'),
    ];
    const teamIds = uniqueIds(teamRefs.map((team) => team.id));
    const teamNames = teamRefs
      .filter((team): team is { id: string; name: string } => Boolean(team.id && team.name))
      .map((team) => team.name);
    const fieldRecord = readRecord(matchRecord.field);
    const rawMatchNumber = Number(matchRecord.matchId);
    const matchNumber = Number.isInteger(rawMatchNumber) && rawMatchNumber > 0
      ? rawMatchNumber
      : null;

    snapshot.set(id, {
      id,
      matchNumber,
      start: normalizeDateValue(matchRecord.start),
      end: normalizeDateValue(matchRecord.end),
      fieldId: normalizeId(fieldRecord.id ?? fieldRecord.$id ?? matchRecord.fieldId),
      teamIds,
      teamNames,
    });
  }

  return snapshot;
};

const snapshotsDiffer = (
  before: MatchScheduleSnapshotEntry,
  after: MatchScheduleSnapshotEntry,
): boolean => (
  before.start !== after.start
  || before.end !== after.end
  || before.fieldId !== after.fieldId
);

export const collectMatchScheduleChanges = (params: {
  before: Map<string, MatchScheduleSnapshotEntry>;
  after: Map<string, MatchScheduleSnapshotEntry>;
  candidateMatchIds?: string[];
}): MatchScheduleChange[] => {
  const candidateIds = params.candidateMatchIds?.length
    ? uniqueIds(params.candidateMatchIds)
    : Array.from(new Set([...params.before.keys(), ...params.after.keys()]));
  const changes: MatchScheduleChange[] = [];

  for (const matchId of candidateIds) {
    const before = params.before.get(matchId) ?? null;
    const after = params.after.get(matchId) ?? null;
    if (!before && !after) {
      continue;
    }

    if (before && !after) {
      if (before.teamIds.length) {
        changes.push({
          matchId,
          matchNumber: before.matchNumber,
          teamIds: before.teamIds,
          teamNames: before.teamNames,
          scheduleChanged: true,
          teamAdded: false,
          deleted: true,
        });
      }
      continue;
    }

    if (!before || !after) {
      continue;
    }

    const addedTeamIds = after.teamIds.filter((teamId) => !before.teamIds.includes(teamId));
    const scheduleChanged = snapshotsDiffer(before, after);
    const teamAdded = addedTeamIds.length > 0;

    if (!scheduleChanged && !teamAdded) {
      continue;
    }

    changes.push({
      matchId,
      matchNumber: after.matchNumber ?? before.matchNumber,
      teamIds: uniqueIds([...before.teamIds, ...after.teamIds]),
      teamNames: after.teamNames.length ? after.teamNames : before.teamNames,
      scheduleChanged,
      teamAdded,
      deleted: false,
    });
  }

  return changes;
};

const formatEventName = (eventName: string): string => {
  const normalized = eventName.trim();
  return normalized.length > 0 ? normalized : 'Event';
};

const formatMatchLabel = (change: MatchScheduleChange): string => {
  const matchLabel = change.matchNumber ? `Match ${change.matchNumber}` : 'a match';
  if (change.teamNames.length >= 2) {
    return `${matchLabel}: ${change.teamNames[0]} vs ${change.teamNames[1]}`;
  }
  return matchLabel;
};

const resolveTeamNotificationUserIds = async (
  params: {
    eventId: string;
    teamIds: string[];
    client?: PrismaLike;
  },
): Promise<string[]> => {
  const client = params.client ?? prisma;
  const teamIds = uniqueIds(params.teamIds);
  if (!teamIds.length) {
    return [];
  }

  const [teams, registrationRows, staffRows] = await Promise.all([
    typeof client.teams?.findMany === 'function'
      ? client.teams.findMany({
        where: { id: { in: teamIds } },
        select: {
          id: true,
          captainId: true,
          managerId: true,
          headCoachId: true,
          coachIds: true,
          playerIds: true,
        },
      })
      : Promise.resolve([]),
    typeof client.eventRegistrations?.findMany === 'function'
      ? client.eventRegistrations.findMany({
        where: {
          eventId: params.eventId,
          eventTeamId: { in: teamIds },
          rosterRole: 'PARTICIPANT',
          status: { in: [...ACTIVE_EVENT_REGISTRATION_STATUSES] },
        },
        select: {
          registrantId: true,
          parentId: true,
          eventTeamId: true,
        },
      })
      : Promise.resolve([]),
    typeof client.eventTeamStaffAssignments?.findMany === 'function'
      ? client.eventTeamStaffAssignments.findMany({
        where: {
          eventTeamId: { in: teamIds },
          status: 'ACTIVE',
        },
        select: {
          userId: true,
        },
      })
      : Promise.resolve([]),
  ]);

  const directUserIds = uniqueIds([
    ...teams.flatMap((team: any) => [
      team.captainId,
      team.managerId,
      team.headCoachId,
      ...(Array.isArray(team.coachIds) ? team.coachIds : []),
      ...(Array.isArray(team.playerIds) ? team.playerIds : []),
    ]),
    ...registrationRows.map((row: any) => row.registrantId),
    ...registrationRows.map((row: any) => row.parentId),
    ...staffRows.map((row: any) => row.userId),
  ]);

  const childIds = uniqueIds([
    ...teams.flatMap((team: any) => Array.isArray(team.playerIds) ? team.playerIds : []),
    ...registrationRows.map((row: any) => row.registrantId),
  ]);
  const parentRows = childIds.length && typeof client.parentChildLinks?.findMany === 'function'
    ? await client.parentChildLinks.findMany({
      where: {
        childId: { in: childIds },
        status: 'ACTIVE',
      },
      select: { parentId: true },
    })
    : [];

  return uniqueIds([
    ...directUserIds,
    ...parentRows.map((row: any) => row.parentId),
  ]);
};

export const notifyTeamsOfMatchScheduleUpdate = async (
  plan: MatchScheduleNotificationPlan | null | undefined,
  client: PrismaLike = prisma,
): Promise<PushDispatchResult | null> => {
  if (!plan || !plan.changes.length) {
    return null;
  }

  const eventName = formatEventName(plan.eventName);
  const changes = plan.changes.filter((change) => change.teamIds.length > 0);
  if (!changes.length) {
    return null;
  }

  const isBatch = Boolean(plan.forceBatch) || changes.length > 1;
  const teamIds = uniqueIds(changes.flatMap((change) => change.teamIds));
  const userIds = await resolveTeamNotificationUserIds({
    eventId: plan.eventId,
    teamIds,
    client,
  });

  if (!userIds.length) {
    return null;
  }

  const title = isBatch
    ? `${eventName} schedule updated`
    : `${eventName} match updated`;
  const body = isBatch
    ? `${eventName} has updated the schedule. Please review the changes.`
    : (() => {
      const change = changes[0];
      const verb = change.scheduleChanged && !change.deleted ? 'rescheduled' : 'updated';
      return `${eventName} has ${verb} ${formatMatchLabel(change)}. Please review the changes.`;
    })();

  return sendPushToUsers({
    userIds,
    notificationType: 'matchScheduleUpdates',
    title,
    body,
    data: {
      type: 'match_schedule_update',
      eventId: plan.eventId,
      updateScope: isBatch ? 'event' : 'match',
      matchIds: changes.map((change) => change.matchId),
      teamIds,
      ...(isBatch ? {} : { matchId: changes[0].matchId }),
    },
  });
};
