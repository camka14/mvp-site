import { prisma } from '@/lib/prisma';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { extractDivisionTokenFromId } from '@/lib/divisionTypes';
import {
  isWeeklyParentEvent,
  resolveWeeklyOccurrence,
  type WeeklyOccurrenceInput,
} from '@/server/events/weeklyOccurrences';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export type RegistrationRegistrantType = 'SELF' | 'CHILD' | 'TEAM';
export type RegistrationRosterRole = 'PARTICIPANT' | 'WAITLIST' | 'FREE_AGENT';
export type RegistrationLifecycleStatus =
  | 'STARTED'
  | 'ACTIVE'
  | 'BLOCKED'
  | 'CANCELLED'
  | 'CONSENTFAILED'
  | 'PENDINGCONSENT';

type EventLike = {
  id: string;
  eventType?: unknown;
  parentEvent?: unknown;
  teamSignup?: unknown;
  singleDivision?: unknown;
  maxParticipants?: unknown;
  divisions?: unknown;
  timeSlotIds?: unknown;
};

type RegistrationRow = {
  id: string;
  eventId: string;
  registrantId: string;
  parentId: string | null;
  registrantType: RegistrationRegistrantType;
  rosterRole: RegistrationRosterRole | null;
  status: RegistrationLifecycleStatus | null;
  ageAtEvent: number | null;
  divisionId: string | null;
  divisionTypeId: string | null;
  divisionTypeKey: string | null;
  consentDocumentId: string | null;
  consentStatus: string | null;
  createdBy: string;
  slotId: string | null;
  occurrenceDate: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type EventParticipantEntry = {
  registrationId: string;
  registrantId: string;
  registrantType: RegistrationRegistrantType;
  rosterRole: RegistrationRosterRole;
  status: Exclude<RegistrationLifecycleStatus, 'PENDINGCONSENT'>;
  parentId: string | null;
  divisionId: string | null;
  divisionTypeId: string | null;
  divisionTypeKey: string | null;
  consentDocumentId: string | null;
  consentStatus: string | null;
  slotId: string | null;
  occurrenceDate: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type EventParticipantSnapshot = {
  participants: {
    teams: EventParticipantEntry[];
    users: EventParticipantEntry[];
    children: EventParticipantEntry[];
    waitlist: EventParticipantEntry[];
    freeAgents: EventParticipantEntry[];
  };
  teams: any[];
  users: any[];
  participantCount: number;
  participantCapacity: number | null;
  occurrence: { slotId: string; occurrenceDate: string } | null;
};

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeIdList = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(
      new Set(
        value
          .map((entry) => normalizeId(entry))
          .filter((entry): entry is string => Boolean(entry)),
      ),
    )
    : []
);

const normalizeRosterRole = (value: unknown): RegistrationRosterRole => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (normalized === 'WAITLIST' || normalized === 'FREE_AGENT') {
    return normalized;
  }
  return 'PARTICIPANT';
};

const normalizeLifecycleStatus = (value: unknown): Exclude<RegistrationLifecycleStatus, 'PENDINGCONSENT'> => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (normalized === 'ACTIVE' || normalized === 'BLOCKED' || normalized === 'CANCELLED' || normalized === 'CONSENTFAILED') {
    return normalized;
  }
  if (normalized === 'PENDINGCONSENT') {
    return 'STARTED';
  }
  return 'STARTED';
};

const positiveInt = (value: unknown): number | null => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Math.trunc(numeric);
};

const toEntry = (row: RegistrationRow): EventParticipantEntry => ({
  registrationId: row.id,
  registrantId: row.registrantId,
  registrantType: row.registrantType,
  rosterRole: normalizeRosterRole(row.rosterRole),
  status: normalizeLifecycleStatus(row.status),
  parentId: normalizeId(row.parentId),
  divisionId: normalizeId(row.divisionId),
  divisionTypeId: normalizeId(row.divisionTypeId),
  divisionTypeKey: normalizeId(row.divisionTypeKey),
  consentDocumentId: normalizeId(row.consentDocumentId),
  consentStatus: normalizeId(row.consentStatus),
  slotId: normalizeId(row.slotId),
  occurrenceDate: normalizeId(row.occurrenceDate),
  createdAt: row.createdAt ? row.createdAt.toISOString() : null,
  updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
});

const isActiveParticipant = (row: RegistrationRow): boolean => (
  normalizeLifecycleStatus(row.status) === 'ACTIVE'
  && normalizeRosterRole(row.rosterRole) === 'PARTICIPANT'
);

const isCapacityHoldingParticipant = (row: RegistrationRow): boolean => {
  const status = normalizeLifecycleStatus(row.status);
  return normalizeRosterRole(row.rosterRole) === 'PARTICIPANT'
    && (status === 'ACTIVE' || status === 'STARTED');
};

const isDisplayableRole = (row: RegistrationRow, role: RegistrationRosterRole): boolean => (
  normalizeRosterRole(row.rosterRole) === role
  && normalizeLifecycleStatus(row.status) !== 'CANCELLED'
);

const buildOccurrenceWhere = (occurrence?: { slotId: string; occurrenceDate: string } | null) => (
  occurrence
    ? {
      slotId: occurrence.slotId,
      occurrenceDate: occurrence.occurrenceDate,
    }
    : {
      slotId: null,
      occurrenceDate: null,
    }
);

const registrationSelect = {
  id: true,
  eventId: true,
  registrantId: true,
  parentId: true,
  registrantType: true,
  rosterRole: true,
  status: true,
  ageAtEvent: true,
  divisionId: true,
  divisionTypeId: true,
  divisionTypeKey: true,
  consentDocumentId: true,
  consentStatus: true,
  createdBy: true,
  slotId: true,
  occurrenceDate: true,
  createdAt: true,
  updatedAt: true,
} as const;

const resolveDivisionAliases = (value: string | null): string[] => {
  const normalized = normalizeId(value)?.toLowerCase() ?? null;
  if (!normalized) {
    return [];
  }
  const token = extractDivisionTokenFromId(normalized);
  return Array.from(new Set([normalized, token].filter((entry): entry is string => Boolean(entry))));
};

const eventCapacityForDivisions = async (
  params: {
    event: EventLike;
    divisionIds?: string[];
  },
  client: PrismaLike = prisma,
): Promise<number | null> => {
  const fallbackCapacity = positiveInt(params.event.maxParticipants);
  const scopedDivisionIds = normalizeIdList(params.divisionIds ?? params.event.divisions);
  if (!scopedDivisionIds.length) {
    return fallbackCapacity;
  }

  const divisionRows = await client.divisions.findMany({
    where: {
      eventId: params.event.id,
      OR: [
        { id: { in: scopedDivisionIds } },
        { key: { in: scopedDivisionIds } },
      ],
    },
    select: {
      id: true,
      key: true,
      kind: true,
      maxParticipants: true,
    },
  });

  const leagueRows = divisionRows.filter((row) => String(row.kind ?? 'LEAGUE').toUpperCase() !== 'PLAYOFF');
  if (!leagueRows.length) {
    return fallbackCapacity;
  }

  if (Boolean(params.event.singleDivision)) {
    const preferredIds = scopedDivisionIds.map((divisionId) => divisionId.toLowerCase());
    const preferred = leagueRows.find((row) => {
      const aliases = resolveDivisionAliases(row.id).concat(resolveDivisionAliases(row.key));
      return aliases.some((alias) => preferredIds.includes(alias));
    }) ?? leagueRows[0];
    return positiveInt(preferred?.maxParticipants) ?? fallbackCapacity;
  }

  const summedCapacity = leagueRows.reduce((sum, row) => sum + (positiveInt(row.maxParticipants) ?? 0), 0);
  return summedCapacity > 0 ? summedCapacity : fallbackCapacity;
};

export const buildEventRegistrationId = (params: {
  eventId: string;
  registrantType: RegistrationRegistrantType;
  registrantId: string;
  slotId?: string | null;
  occurrenceDate?: string | null;
}): string => {
  const eventId = normalizeId(params.eventId);
  const registrantId = normalizeId(params.registrantId);
  if (!eventId || !registrantId) {
    throw new Error('Registration id requires event and registrant ids.');
  }

  const registrantType = params.registrantType.trim().toLowerCase();
  const slotId = normalizeId(params.slotId);
  const occurrenceDate = normalizeId(params.occurrenceDate);
  if (slotId && occurrenceDate) {
    return `${eventId}__${registrantType}__${registrantId}__${slotId}__${occurrenceDate}`;
  }
  return `${eventId}__${registrantType}__${registrantId}`;
};

export const findEventRegistration = async (params: {
  eventId: string;
  registrantType: RegistrationRegistrantType;
  registrantId: string;
  occurrence?: WeeklyOccurrenceInput | null;
}, client: PrismaLike = prisma) => {
  const registrationId = buildEventRegistrationId({
    eventId: params.eventId,
    registrantType: params.registrantType,
    registrantId: params.registrantId,
    slotId: params.occurrence?.slotId ?? null,
    occurrenceDate: params.occurrence?.occurrenceDate ?? null,
  });
  return client.eventRegistrations.findUnique({
    where: { id: registrationId },
    select: registrationSelect,
  }) as Promise<RegistrationRow | null>;
};

export const upsertEventRegistration = async (params: {
  eventId: string;
  registrantType: RegistrationRegistrantType;
  registrantId: string;
  rosterRole: RegistrationRosterRole;
  status: Exclude<RegistrationLifecycleStatus, 'PENDINGCONSENT'>;
  createdBy: string;
  parentId?: string | null;
  ageAtEvent?: number | null;
  divisionId?: string | null;
  divisionTypeId?: string | null;
  divisionTypeKey?: string | null;
  consentDocumentId?: string | null;
  consentStatus?: string | null;
  occurrence?: WeeklyOccurrenceInput | null;
}, client: PrismaLike = prisma) => {
  const occurrence = params.occurrence
    ? {
      slotId: normalizeId(params.occurrence.slotId),
      occurrenceDate: normalizeId(params.occurrence.occurrenceDate),
    }
    : null;
  const registrationId = buildEventRegistrationId({
    eventId: params.eventId,
    registrantType: params.registrantType,
    registrantId: params.registrantId,
    slotId: occurrence?.slotId ?? null,
    occurrenceDate: occurrence?.occurrenceDate ?? null,
  });
  const now = new Date();

  return client.eventRegistrations.upsert({
    where: { id: registrationId },
    create: {
      id: registrationId,
      eventId: params.eventId,
      registrantId: params.registrantId,
      parentId: normalizeId(params.parentId),
      registrantType: params.registrantType,
      rosterRole: params.rosterRole,
      status: params.status,
      slotId: occurrence?.slotId ?? null,
      occurrenceDate: occurrence?.occurrenceDate ?? null,
      ageAtEvent: params.ageAtEvent ?? null,
      divisionId: normalizeId(params.divisionId),
      divisionTypeId: normalizeId(params.divisionTypeId),
      divisionTypeKey: normalizeId(params.divisionTypeKey),
      consentDocumentId: normalizeId(params.consentDocumentId),
      consentStatus: normalizeId(params.consentStatus),
      createdBy: params.createdBy,
      createdAt: now,
      updatedAt: now,
    },
    update: {
      parentId: normalizeId(params.parentId),
      rosterRole: params.rosterRole,
      status: params.status,
      slotId: occurrence?.slotId ?? null,
      occurrenceDate: occurrence?.occurrenceDate ?? null,
      ageAtEvent: params.ageAtEvent ?? null,
      divisionId: normalizeId(params.divisionId),
      divisionTypeId: normalizeId(params.divisionTypeId),
      divisionTypeKey: normalizeId(params.divisionTypeKey),
      consentDocumentId: normalizeId(params.consentDocumentId),
      consentStatus: normalizeId(params.consentStatus),
      updatedAt: now,
    },
    select: registrationSelect,
  }) as Promise<RegistrationRow>;
};

export const deleteEventRegistration = async (params: {
  eventId: string;
  registrantType: RegistrationRegistrantType;
  registrantId: string;
  occurrence?: WeeklyOccurrenceInput | null;
}, client: PrismaLike = prisma) => {
  const registrationId = buildEventRegistrationId({
    eventId: params.eventId,
    registrantType: params.registrantType,
    registrantId: params.registrantId,
    slotId: params.occurrence?.slotId ?? null,
    occurrenceDate: params.occurrence?.occurrenceDate ?? null,
  });
  await client.eventRegistrations.deleteMany({
    where: { id: registrationId },
  });
};

export const syncDivisionTeamMembershipFromRegistrations = async (
  event: EventLike,
  client: PrismaLike = prisma,
): Promise<string[]> => {
  if (!Boolean(event.teamSignup) || isWeeklyParentEvent(event)) {
    return [];
  }

  const divisionRows = await client.divisions.findMany({
    where: { eventId: event.id },
    select: {
      id: true,
      key: true,
      kind: true,
      teamIds: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  const leagueRows = divisionRows.filter((row) => String(row.kind ?? 'LEAGUE').toUpperCase() !== 'PLAYOFF');
  if (!leagueRows.length) {
    return [];
  }

  const activeTeamRows = await client.eventRegistrations.findMany({
    where: {
      eventId: event.id,
      registrantType: 'TEAM',
      rosterRole: 'PARTICIPANT',
      status: 'ACTIVE',
      slotId: null,
      occurrenceDate: null,
    },
    select: {
      registrantId: true,
      divisionId: true,
    },
  });

  const activeTeamIds = Array.from(new Set(activeTeamRows.map((row) => row.registrantId).filter(Boolean)));
  const teamIdsByDivisionAlias = new Map<string, string[]>();
  activeTeamRows.forEach((row) => {
    const aliases = resolveDivisionAliases(row.divisionId);
    aliases.forEach((alias) => {
      const existing = teamIdsByDivisionAlias.get(alias) ?? [];
      if (!existing.includes(row.registrantId)) {
        existing.push(row.registrantId);
      }
      teamIdsByDivisionAlias.set(alias, existing);
    });
  });

  const now = new Date();
  const eventDivisionIds = normalizeIdList(event.divisions).map((divisionId) => divisionId.toLowerCase());
  const primaryDivision = leagueRows.find((row) => {
    const aliases = resolveDivisionAliases(row.id).concat(resolveDivisionAliases(row.key));
    return aliases.some((alias) => eventDivisionIds.includes(alias));
  }) ?? leagueRows[0];

  await Promise.all(
    leagueRows.map((row) => {
      const nextTeamIds = Boolean(event.singleDivision)
        ? (row.id === primaryDivision.id ? activeTeamIds : [])
        : (() => {
          const aliases = resolveDivisionAliases(row.id).concat(resolveDivisionAliases(row.key));
          const combined = aliases.flatMap((alias) => teamIdsByDivisionAlias.get(alias) ?? []);
          return Array.from(new Set(combined));
        })();
      return client.divisions.update({
        where: { id: row.id },
        data: {
          teamIds: nextTeamIds,
          updatedAt: now,
        },
      });
    }),
  );

  return activeTeamIds;
};

export const buildEventParticipantSnapshot = async (params: {
  event: EventLike;
  occurrence?: WeeklyOccurrenceInput | null;
}, client: PrismaLike = prisma): Promise<EventParticipantSnapshot> => {
  const resolvedOccurrence = isWeeklyParentEvent(params.event)
    ? (() => {
      if (!params.occurrence?.slotId || !params.occurrence?.occurrenceDate) {
        return null;
      }
      return resolveWeeklyOccurrence({
        event: params.event,
        occurrence: params.occurrence,
      }, client);
    })()
    : null;

  const occurrenceResult = resolvedOccurrence ? await resolvedOccurrence : null;
  if (occurrenceResult && !occurrenceResult.ok) {
    throw new Error(occurrenceResult.error);
  }
  const occurrence = occurrenceResult?.ok ? occurrenceResult.value : null;

  const registrations = await client.eventRegistrations.findMany({
    where: {
      eventId: params.event.id,
      ...buildOccurrenceWhere(occurrence ? {
        slotId: occurrence.slotId,
        occurrenceDate: occurrence.occurrenceDate,
      } : null),
    },
    select: registrationSelect,
    orderBy: [
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
  }) as RegistrationRow[];

  const teamIds = Array.from(new Set(
    registrations
      .filter((row) => row.registrantType === 'TEAM')
      .map((row) => row.registrantId),
  ));
  const userIds = Array.from(new Set(
    registrations
      .filter((row) => row.registrantType === 'SELF' || row.registrantType === 'CHILD')
      .map((row) => row.registrantId),
  ));

  const [teams, users] = await Promise.all([
    teamIds.length
      ? client.teams.findMany({
        where: { id: { in: teamIds } },
      })
      : Promise.resolve([]),
    userIds.length
      ? client.userData.findMany({
        where: { id: { in: userIds } },
      })
      : Promise.resolve([]),
  ]);

  const participantEntries = registrations.filter(isActiveParticipant);
  const participantCount = Boolean(params.event.teamSignup)
    ? participantEntries.filter((row) => row.registrantType === 'TEAM').length
    : participantEntries.filter((row) => row.registrantType === 'SELF' || row.registrantType === 'CHILD').length;

  const participantCapacity = await eventCapacityForDivisions({
    event: params.event,
    divisionIds: occurrence?.divisionIds,
  }, client);

  return {
    participants: {
      teams: participantEntries
        .filter((row) => row.registrantType === 'TEAM')
        .map(toEntry),
      users: participantEntries
        .filter((row) => row.registrantType === 'SELF')
        .map(toEntry),
      children: participantEntries
        .filter((row) => row.registrantType === 'CHILD')
        .map(toEntry),
      waitlist: registrations
        .filter((row) => isDisplayableRole(row, 'WAITLIST'))
        .map(toEntry),
      freeAgents: registrations
        .filter((row) => isDisplayableRole(row, 'FREE_AGENT'))
        .map(toEntry),
    },
    teams,
    users,
    participantCount,
    participantCapacity,
    occurrence: occurrence
      ? {
        slotId: occurrence.slotId,
        occurrenceDate: occurrence.occurrenceDate,
      }
      : null,
  };
};

export const reserveCapacityRows = (rows: RegistrationRow[]): number => rows.filter(isCapacityHoldingParticipant).length;

export const getEventParticipantAggregates = async (
  events: EventLike[],
  client: PrismaLike = prisma,
): Promise<Map<string, { participantCount: number | null; participantCapacity: number | null }>> => {
  const eventMap = new Map(events.map((event) => [event.id, event]));
  const nonWeeklyIds = events
    .filter((event) => !isWeeklyParentEvent(event))
    .map((event) => event.id);

  const response = new Map<string, { participantCount: number | null; participantCapacity: number | null }>();
  events.forEach((event) => {
    response.set(event.id, {
      participantCount: isWeeklyParentEvent(event) ? null : 0,
      participantCapacity: isWeeklyParentEvent(event) ? null : positiveInt(event.maxParticipants),
    });
  });

  if (!nonWeeklyIds.length) {
    return response;
  }

  const registrations = await client.eventRegistrations.findMany({
    where: {
      eventId: { in: nonWeeklyIds },
      status: 'ACTIVE',
    },
    select: {
      eventId: true,
      registrantType: true,
      rosterRole: true,
      slotId: true,
      occurrenceDate: true,
    },
  });

  registrations.forEach((row) => {
    if (normalizeRosterRole(row.rosterRole) !== 'PARTICIPANT') {
      return;
    }
    if (normalizeId(row.slotId) || normalizeId(row.occurrenceDate)) {
      return;
    }
    const event = eventMap.get(row.eventId);
    if (!event || isWeeklyParentEvent(event)) {
      return;
    }

    const aggregate = response.get(row.eventId) ?? { participantCount: 0, participantCapacity: null };
    const shouldCount = Boolean(event.teamSignup)
      ? row.registrantType === 'TEAM'
      : row.registrantType === 'SELF' || row.registrantType === 'CHILD';
    if (!shouldCount) {
      return;
    }
    aggregate.participantCount = (aggregate.participantCount ?? 0) + 1;
    response.set(row.eventId, aggregate);
  });

  const capacities = await Promise.all(
    nonWeeklyIds.map(async (eventId) => {
      const event = eventMap.get(eventId)!;
      return {
        eventId,
        capacity: await eventCapacityForDivisions({ event }, client),
      };
    }),
  );

  capacities.forEach(({ eventId, capacity }) => {
    const current = response.get(eventId) ?? { participantCount: 0, participantCapacity: null };
    current.participantCapacity = capacity;
    response.set(eventId, current);
  });

  return response;
};
