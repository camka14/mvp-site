import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { RegistrationLifecycleStatus } from '@/server/events/eventRegistrations';
import { getTeamChatBaseMemberIds, syncTeamChatInTx } from '@/server/teamChatSync';
import {
  claimOrCreateEventTeamSnapshot,
  getEventTeamsDelegate,
  loadCanonicalTeamById,
  normalizeId,
} from '@/server/teams/teamMembership';

type PrismaLike = PrismaClient | Prisma.TransactionClient | any;

const ACTIVE_EVENT_REGISTRATION_STATUSES = ['STARTED', 'PENDING', 'ACTIVE', 'BLOCKED'] as const;
const ACTIVE_EVENT_REGISTRATION_STATUS_SET = new Set<string>(ACTIVE_EVENT_REGISTRATION_STATUSES);

export type FutureRegisteredTeamRef = {
  eventId: string;
  teamId: string;
  status: RegistrationLifecycleStatus;
  divisionId: string | null;
  divisionTypeId: string | null;
  divisionTypeKey: string | null;
};

const normalizeActiveEventRegistrationStatus = (value: unknown): RegistrationLifecycleStatus => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return ACTIVE_EVENT_REGISTRATION_STATUS_SET.has(normalized)
    ? normalized as RegistrationLifecycleStatus
    : 'ACTIVE';
};

export const findFutureRegisteredTeamRefs = async (
  client: PrismaLike,
  teamIds: string[],
  now: Date,
): Promise<FutureRegisteredTeamRef[]> => {
  const normalizedTeamIds = Array.from(new Set(
    teamIds
      .map((teamId) => normalizeId(teamId))
      .filter((teamId): teamId is string => Boolean(teamId)),
  ));
  if (
    !normalizedTeamIds.length
    || typeof client.eventRegistrations?.findMany !== 'function'
    || typeof client.events?.findMany !== 'function'
  ) {
    return [];
  }

  const registrationRows = await client.eventRegistrations.findMany({
    where: {
      registrantType: 'TEAM',
      rosterRole: 'PARTICIPANT',
      status: { in: [...ACTIVE_EVENT_REGISTRATION_STATUSES] },
      OR: [
        { registrantId: { in: normalizedTeamIds } },
        { eventTeamId: { in: normalizedTeamIds } },
      ],
      slotId: null,
      occurrenceDate: null,
    },
    select: {
      eventId: true,
      registrantId: true,
      eventTeamId: true,
      status: true,
      divisionId: true,
      divisionTypeId: true,
      divisionTypeKey: true,
    },
  });
  const eventIds = Array.from(new Set(
    registrationRows
      .map((row: { eventId?: unknown }) => normalizeId(row.eventId))
      .filter((eventId: string | null): eventId is string => Boolean(eventId)),
  ));
  if (!eventIds.length) {
    return [];
  }

  const futureEvents = await client.events.findMany({
    where: {
      id: { in: eventIds },
      end: { gte: now },
    },
    select: { id: true },
  });
  const futureEventIds = new Set(
    futureEvents
      .map((event: { id?: unknown }) => normalizeId(event.id))
      .filter((eventId: string | null): eventId is string => Boolean(eventId)),
  );
  if (!futureEventIds.size) {
    return [];
  }

  const requestedTeamIds = new Set(normalizedTeamIds);
  const refsByKey = new Map<string, FutureRegisteredTeamRef>();
  registrationRows.forEach((row: {
    eventId?: unknown;
    registrantId?: unknown;
    eventTeamId?: unknown;
    status?: unknown;
    divisionId?: unknown;
    divisionTypeId?: unknown;
    divisionTypeKey?: unknown;
  }) => {
    const eventId = normalizeId(row.eventId);
    const teamId = normalizeId(row.eventTeamId) ?? normalizeId(row.registrantId);
    if (!eventId || !futureEventIds.has(eventId) || !teamId || !requestedTeamIds.has(teamId)) {
      return;
    }
    refsByKey.set(`${eventId}:${teamId}`, {
      eventId,
      teamId,
      status: normalizeActiveEventRegistrationStatus(row.status),
      divisionId: normalizeId(row.divisionId),
      divisionTypeId: normalizeId(row.divisionTypeId),
      divisionTypeKey: normalizeId(row.divisionTypeKey),
    });
  });

  return Array.from(refsByKey.values());
};

export const syncCanonicalTeamFutureEventSnapshots = async ({
  tx,
  canonicalTeamId,
  canonicalTeam,
  createdBy,
  now = new Date(),
}: {
  tx: PrismaLike;
  canonicalTeamId: string | null;
  canonicalTeam?: Record<string, any> | null;
  createdBy?: string | null;
  now?: Date;
}): Promise<string[]> => {
  const normalizedCanonicalTeamId = normalizeId(canonicalTeamId);
  if (!normalizedCanonicalTeamId) {
    return [];
  }

  const eventTeamsDelegate = getEventTeamsDelegate(tx);
  if (!eventTeamsDelegate?.findMany) {
    return [];
  }

  const derivedTeams = await eventTeamsDelegate.findMany({
    where: { parentTeamId: normalizedCanonicalTeamId },
    select: {
      id: true,
      captainId: true,
      managerId: true,
      headCoachId: true,
      coachIds: true,
      playerIds: true,
      pending: true,
    },
  });
  const derivedTeamById = new Map(
    (Array.isArray(derivedTeams) ? derivedTeams : [])
      .map((team: any) => {
        const teamId = normalizeId(team?.id);
        return teamId ? [teamId, team] as const : null;
      })
      .filter((entry): entry is readonly [string, Record<string, any>] => Boolean(entry)),
  );
  const teamIdsToInspect = Array.from(new Set([
    normalizedCanonicalTeamId,
    ...Array.from(derivedTeamById.keys()),
  ]));
  const teamRefsToUpdate = await findFutureRegisteredTeamRefs(tx, teamIdsToInspect, now);
  if (!teamRefsToUpdate.length) {
    return [];
  }

  const canonicalSnapshot = canonicalTeam ?? await loadCanonicalTeamById(normalizedCanonicalTeamId, tx);
  if (!canonicalSnapshot) {
    throw new Error('Canonical team not found after roster update.');
  }

  const updatedTeamIds = new Set<string>();
  const fallbackCreatedBy = normalizeId(createdBy)
    ?? normalizeId((canonicalSnapshot as any).createdBy)
    ?? normalizedCanonicalTeamId;
  for (const teamRef of teamRefsToUpdate) {
    const previousTeam = derivedTeamById.get(teamRef.teamId);
    const syncedEventTeam = await claimOrCreateEventTeamSnapshot({
      tx,
      eventId: teamRef.eventId,
      canonicalTeamId: normalizedCanonicalTeamId,
      createdBy: fallbackCreatedBy,
      canonicalTeam: canonicalSnapshot as Record<string, any>,
      divisionId: teamRef.divisionId,
      divisionTypeId: teamRef.divisionTypeId,
      divisionTypeKey: teamRef.divisionTypeKey,
      registrationStatus: teamRef.status,
    });
    const syncedTeamId = normalizeId((syncedEventTeam as any)?.id) ?? teamRef.teamId;
    updatedTeamIds.add(syncedTeamId);
    await syncTeamChatInTx(tx, syncedTeamId, {
      previousMemberIds: previousTeam ? getTeamChatBaseMemberIds(previousTeam) : undefined,
    });
  }

  return Array.from(updatedTeamIds);
};
