import { prisma } from '@/lib/prisma';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { extractDivisionTokenFromId } from '@/lib/divisionTypes';
import {
  isWeeklyParentEvent,
  resolveWeeklyOccurrence,
  type WeeklyOccurrenceInput,
} from '@/server/events/weeklyOccurrences';
import { isTournamentPoolPlayEnabled } from '@/server/events/tournamentPools';
import { withDerivedCanonicalTeamIds } from '@/server/teams/teamMembership';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export type RegistrationRegistrantType = 'SELF' | 'CHILD' | 'TEAM';
export type RegistrationRosterRole = 'PARTICIPANT' | 'WAITLIST' | 'FREE_AGENT';
export type RegistrationLifecycleStatus =
  | 'STARTED'
  | 'PENDING'
  | 'PAYMENT_FAILED'
  | 'ACTIVE'
  | 'BLOCKED'
  | 'CANCELLED'
  | 'CONSENTFAILED';

type EventLike = {
  id: string;
  eventType?: unknown;
  includePlayoffs?: unknown;
  includePlayoffsOrPools?: unknown;
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
  eventTeamId: string | null;
  sourceTeamRegistrationId: string | null;
  ageAtEvent: number | null;
  divisionId: string | null;
  divisionTypeId: string | null;
  divisionTypeKey: string | null;
  jerseyNumber: string | null;
  position: string | null;
  isCaptain: boolean | null;
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
  status: RegistrationLifecycleStatus;
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

export type EventParticipantDivisionIds = {
  divisionId: string | null;
  divisionTypeId: string | null;
  divisionTypeKey: string | null;
  teamIds: string[];
  userIds: string[];
  waitListIds: string[];
  freeAgentIds: string[];
};

export type EventParticipantDivisionWarning = {
  divisionId: string;
  code: 'OVER_CAPACITY' | 'MISSING_PLACEHOLDERS';
  message: string;
  filledCount: number;
  slotCount: number;
  maxTeams: number;
};

export type EventParticipantIdsSnapshot = {
  teamIds: string[];
  userIds: string[];
  waitListIds: string[];
  freeAgentIds: string[];
  divisions: EventParticipantDivisionIds[];
};

export type EventParticipantIds = {
  teamIds: string[];
  userIds: string[];
  waitListIds: string[];
  freeAgentIds: string[];
};

export type EventParticipantRegistrationSections = {
  teams: EventParticipantEntry[];
  users: EventParticipantEntry[];
  children: EventParticipantEntry[];
  waitlist: EventParticipantEntry[];
  freeAgents: EventParticipantEntry[];
};

export type EventParticipantSnapshot = {
  participants: EventParticipantIdsSnapshot;
  registrations?: EventParticipantRegistrationSections;
  teams: any[];
  users: any[];
  participantCount: number;
  participantCapacity: number | null;
  occurrence: { slotId: string; occurrenceDate: string } | null;
  divisionWarnings: EventParticipantDivisionWarning[];
};

const DISPLAY_MEMBER_STATUSES = new Set<RegistrationLifecycleStatus>(['PENDING', 'ACTIVE', 'BLOCKED']);
const CAPACITY_HOLDING_STATUSES = new Set<RegistrationLifecycleStatus>(['STARTED', 'PENDING', 'ACTIVE', 'BLOCKED']);

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

const emptyParticipantIds = (): EventParticipantIds => ({
  teamIds: [],
  userIds: [],
  waitListIds: [],
  freeAgentIds: [],
});

const pushUnique = (values: string[], value: string | null): void => {
  if (!value || values.includes(value)) {
    return;
  }
  values.push(value);
};

const normalizeRosterRole = (value: unknown): RegistrationRosterRole => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (normalized === 'WAITLIST' || normalized === 'FREE_AGENT') {
    return normalized;
  }
  return 'PARTICIPANT';
};

const normalizeLifecycleStatus = (value: unknown): RegistrationLifecycleStatus => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (
    normalized === 'PENDING'
    || normalized === 'PAYMENT_FAILED'
    || normalized === 'ACTIVE'
    || normalized === 'BLOCKED'
    || normalized === 'CANCELLED'
    || normalized === 'CONSENTFAILED'
  ) {
    return normalized;
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

const isRegisteredLifecycleStatus = (value: unknown): boolean => (
  DISPLAY_MEMBER_STATUSES.has(normalizeLifecycleStatus(value))
);

const isRegisteredParticipant = (row: RegistrationRow): boolean => (
  normalizeRosterRole(row.rosterRole) === 'PARTICIPANT'
  && isRegisteredLifecycleStatus(row.status)
);

const isPlaceholderTeamRow = (row?: { kind?: unknown; captainId?: unknown; parentTeamId?: unknown } | null): boolean => {
  if (!row) {
    return false;
  }
  const kind = String(row.kind ?? '').trim().toUpperCase();
  if (kind === 'PLACEHOLDER') {
    return true;
  }
  const hasSlotShape = Object.prototype.hasOwnProperty.call(row, 'captainId')
    || Object.prototype.hasOwnProperty.call(row, 'parentTeamId');
  return hasSlotShape && !normalizeId(row.captainId) && !normalizeId(row.parentTeamId);
};

const normalizeIdKey = (value: unknown): string | null => normalizeId(value)?.toLowerCase() ?? null;

const loadPlaceholderTeamIdKeys = async (
  teamIds: string[],
  client: PrismaLike,
): Promise<Set<string>> => {
  const normalizedTeamIds = Array.from(new Set(
    teamIds
      .map((teamId) => normalizeId(teamId))
      .filter((teamId): teamId is string => Boolean(teamId)),
  ));
  const teamsDelegate = (client as any).teams;
  if (!normalizedTeamIds.length || typeof teamsDelegate?.findMany !== 'function') {
    return new Set();
  }

  const rows = await teamsDelegate.findMany({
    where: {
      id: { in: normalizedTeamIds },
    },
    select: {
      id: true,
      kind: true,
      captainId: true,
      parentTeamId: true,
    },
  });

  return new Set(
    (Array.isArray(rows) ? rows : [])
      .filter(isPlaceholderTeamRow)
      .map((row) => normalizeIdKey(row.id))
      .filter((teamId): teamId is string => Boolean(teamId)),
  );
};

const isCapacityHoldingParticipant = (row: RegistrationRow): boolean => {
  return normalizeRosterRole(row.rosterRole) === 'PARTICIPANT'
    && CAPACITY_HOLDING_STATUSES.has(normalizeLifecycleStatus(row.status));
};

const isDisplayableRole = (row: RegistrationRow, role: RegistrationRosterRole): boolean => (
  normalizeRosterRole(row.rosterRole) === role
  && isRegisteredLifecycleStatus(row.status)
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
  eventTeamId: true,
  sourceTeamRegistrationId: true,
  ageAtEvent: true,
  divisionId: true,
  divisionTypeId: true,
  divisionTypeKey: true,
  jerseyNumber: true,
  position: true,
  isCaptain: true,
  consentDocumentId: true,
  consentStatus: true,
  createdBy: true,
  slotId: true,
  occurrenceDate: true,
  createdAt: true,
  updatedAt: true,
} as const;

const participantDivisionSelect = {
  id: true,
  key: true,
  kind: true,
  divisionTypeId: true,
  maxParticipants: true,
  teamIds: true,
} as const;

const resolveDivisionAliases = (value: string | null): string[] => {
  const normalized = normalizeId(value)?.toLowerCase() ?? null;
  if (!normalized) {
    return [];
  }
  const token = extractDivisionTokenFromId(normalized);
  return Array.from(new Set([normalized, token].filter((entry): entry is string => Boolean(entry))));
};

const registerUniqueDivisionReference = (
  references: Map<string, string | null>,
  value: unknown,
  divisionId: string,
) => {
  const normalized = normalizeId(value)?.toLowerCase() ?? null;
  if (!normalized) {
    return;
  }
  const existing = references.get(normalized);
  if (existing === undefined) {
    references.set(normalized, divisionId);
    return;
  }
  if (existing !== divisionId) {
    references.set(normalized, null);
  }
};

const eventCapacityForDivisions = async (
  params: {
    event: EventLike;
    divisionIds?: string[];
  },
  client: PrismaLike = prisma,
): Promise<number | null> => {
  const fallbackCapacity = positiveInt(params.event.maxParticipants);
  const scopedDivisionIds = normalizeIdList(params.divisionIds);
  if (params.divisionIds && !scopedDivisionIds.length) {
    return fallbackCapacity;
  }

  const divisionRows = await client.divisions.findMany({
    where: scopedDivisionIds.length
      ? {
          eventId: params.event.id,
          OR: [
            { id: { in: scopedDivisionIds } },
            { key: { in: scopedDivisionIds } },
          ],
        }
      : {
          eventId: params.event.id,
          OR: [
            { kind: 'LEAGUE' as any },
            { kind: null },
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
    return positiveInt(preferred?.maxParticipants);
  }

  const summedCapacity = leagueRows.reduce((sum, row) => sum + (positiveInt(row.maxParticipants) ?? 0), 0);
  return summedCapacity > 0 ? summedCapacity : null;
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
  registrationId?: string | null;
  rosterRole: RegistrationRosterRole;
  status: RegistrationLifecycleStatus;
  createdBy: string;
  parentId?: string | null;
  eventTeamId?: string | null;
  sourceTeamRegistrationId?: string | null;
  ageAtEvent?: number | null;
  divisionId?: string | null;
  divisionTypeId?: string | null;
  divisionTypeKey?: string | null;
  jerseyNumber?: string | null;
  position?: string | null;
  isCaptain?: boolean | null;
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
  const registrationId = normalizeId(params.registrationId) ?? buildEventRegistrationId({
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
      eventTeamId: normalizeId(params.eventTeamId),
      sourceTeamRegistrationId: normalizeId(params.sourceTeamRegistrationId),
      slotId: occurrence?.slotId ?? null,
      occurrenceDate: occurrence?.occurrenceDate ?? null,
      ageAtEvent: params.ageAtEvent ?? null,
      divisionId: normalizeId(params.divisionId),
      divisionTypeId: normalizeId(params.divisionTypeId),
      divisionTypeKey: normalizeId(params.divisionTypeKey),
      jerseyNumber: normalizeId(params.jerseyNumber),
      position: normalizeId(params.position),
      isCaptain: params.isCaptain ?? false,
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
      eventTeamId: normalizeId(params.eventTeamId),
      sourceTeamRegistrationId: normalizeId(params.sourceTeamRegistrationId),
      slotId: occurrence?.slotId ?? null,
      occurrenceDate: occurrence?.occurrenceDate ?? null,
      ageAtEvent: params.ageAtEvent ?? null,
      divisionId: normalizeId(params.divisionId),
      divisionTypeId: normalizeId(params.divisionTypeId),
      divisionTypeKey: normalizeId(params.divisionTypeKey),
      jerseyNumber: normalizeId(params.jerseyNumber),
      position: normalizeId(params.position),
      isCaptain: params.isCaptain ?? false,
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
  await client.eventRegistrations.updateMany({
    where: { id: registrationId },
    data: {
      status: 'CANCELLED',
      updatedAt: new Date(),
    },
  });
};

export const syncDivisionTeamMembershipFromRegistrations = async (
  event: EventLike,
  client: PrismaLike = prisma,
): Promise<string[]> => {
  if (!Boolean(event.teamSignup) || isWeeklyParentEvent(event)) {
    return [];
  }
  if (isTournamentPoolPlayEnabled(event)) {
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
      status: { in: Array.from(DISPLAY_MEMBER_STATUSES) },
      slotId: null,
      occurrenceDate: null,
    },
    select: {
      registrantId: true,
      divisionId: true,
    },
  });

  const activeRegisteredTeamIds = Array.from(new Set(activeTeamRows.map((row) => row.registrantId).filter(Boolean)));
  const currentTeamIdsByDivisionId = new Map<string, string[]>();
  leagueRows.forEach((row) => {
    currentTeamIdsByDivisionId.set(row.id, normalizeIdList(row.teamIds));
  });
  const currentDivisionTeamIds = Array.from(new Set(
    Array.from(currentTeamIdsByDivisionId.values()).flat(),
  ));
  const teamIdsToInspect = Array.from(new Set([...currentDivisionTeamIds, ...activeRegisteredTeamIds]));
  const placeholderTeamIdKeys = await loadPlaceholderTeamIdKeys(teamIdsToInspect, client);
  const activeTeamRowsForSync = activeTeamRows.filter((row) => !placeholderTeamIdKeys.has(normalizeIdKey(row.registrantId) ?? ''));
  const activeTeamIds = Array.from(new Set(activeTeamRowsForSync.map((row) => row.registrantId).filter(Boolean)));

  const divisionIdByExactId = new Map<string, string>();
  const divisionIdByUniqueKey = new Map<string, string | null>();
  const divisionIdByUniqueToken = new Map<string, string | null>();
  leagueRows.forEach((row) => {
    const rowId = normalizeId(row.id);
    if (!rowId) {
      return;
    }
    divisionIdByExactId.set(rowId.toLowerCase(), row.id);
    registerUniqueDivisionReference(divisionIdByUniqueKey, row.key, row.id);
    registerUniqueDivisionReference(divisionIdByUniqueToken, extractDivisionTokenFromId(row.id), row.id);
    registerUniqueDivisionReference(divisionIdByUniqueToken, extractDivisionTokenFromId(row.key), row.id);
  });

  const resolveDivisionReference = (value: unknown): string | null => {
    const normalized = normalizeId(value)?.toLowerCase() ?? null;
    if (!normalized) {
      return null;
    }

    const exactIdMatch = divisionIdByExactId.get(normalized);
    if (exactIdMatch) {
      return exactIdMatch;
    }

    const keyMatch = divisionIdByUniqueKey.get(normalized);
    if (keyMatch) {
      return keyMatch;
    }
    if (keyMatch === null) {
      return null;
    }

    const token = extractDivisionTokenFromId(normalized);
    const tokenMatch = token ? divisionIdByUniqueToken.get(token) : undefined;
    return tokenMatch ?? null;
  };

  const teamIdsByDivisionId = new Map<string, string[]>();
  activeTeamRowsForSync.forEach((row) => {
    const divisionId = resolveDivisionReference(row.divisionId);
    if (!divisionId) {
      return;
    }
    const existing = teamIdsByDivisionId.get(divisionId) ?? [];
    if (!existing.includes(row.registrantId)) {
      existing.push(row.registrantId);
    }
    teamIdsByDivisionId.set(divisionId, existing);
  });

  const now = new Date();
  const eventDivisionIds = leagueRows.map((row) => row.id.toLowerCase());
  const primaryDivisionId = eventDivisionIds
    .map((divisionId) => resolveDivisionReference(divisionId))
    .find((divisionId): divisionId is string => Boolean(divisionId));
  const primaryDivision = leagueRows.find((row) => row.id === primaryDivisionId) ?? leagueRows[0];
  const buildNextTeamIds = (divisionId: string, assignedTeamIds: string[]): string[] => {
    const assigned = new Set(assignedTeamIds);
    const nextTeamIds = (currentTeamIdsByDivisionId.get(divisionId) ?? [])
      .filter((teamId) => assigned.has(teamId) || placeholderTeamIdKeys.has(normalizeIdKey(teamId) ?? ''));
    assignedTeamIds.forEach((teamId) => {
      if (!nextTeamIds.includes(teamId)) {
        nextTeamIds.push(teamId);
      }
    });
    return Array.from(new Set(nextTeamIds));
  };

  await Promise.all(
    leagueRows.map((row) => {
      const nextTeamIds = Boolean(event.singleDivision)
        ? (row.id === primaryDivision.id ? buildNextTeamIds(row.id, activeTeamIds) : buildNextTeamIds(row.id, []))
        : buildNextTeamIds(row.id, teamIdsByDivisionId.get(row.id) ?? []);
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
  includeRegistrations?: boolean;
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

  const eventDivisionIds = normalizeIdList(params.event.divisions);
  const divisionRows = await client.divisions.findMany({
    where: eventDivisionIds.length
      ? {
          eventId: params.event.id,
          OR: [
            { id: { in: eventDivisionIds } },
            { key: { in: eventDivisionIds } },
          ],
        }
      : {
          eventId: params.event.id,
          OR: [
            { kind: 'LEAGUE' as any },
            { kind: null },
          ],
        },
    select: participantDivisionSelect,
    orderBy: [
      { sortOrder: 'asc' } as any,
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
  });

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

  const [teams, selectedUsers] = await Promise.all([
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
  const users = await withDerivedCanonicalTeamIds(selectedUsers, client);
  const parentTeamIds = Array.from(new Set(
    (teams as Array<{ parentTeamId?: unknown }>)
      .map((team) => normalizeId(team.parentTeamId))
      .filter((teamId): teamId is string => Boolean(teamId)),
  ));
  const parentTeams = parentTeamIds.length
    && typeof (client as any).canonicalTeams?.findMany === 'function'
    ? await client.canonicalTeams.findMany({
      where: { id: { in: parentTeamIds } },
      select: {
        id: true,
        organizationId: true,
        createdBy: true,
        openRegistration: true,
        joinPolicy: true,
        registrationPriceCents: true,
        requiredTemplateIds: true,
        visibility: true,
      },
    })
    : [];
  const parentTeamsById = new Map(
    parentTeams.map((team) => [team.id, team]),
  );
  const enrichEventTeamRegistrationMetadata = (team: any) => {
    const parentTeamId = normalizeId(team?.parentTeamId);
    const parentTeam = parentTeamId ? parentTeamsById.get(parentTeamId) : null;
    if (!parentTeam) {
      return team;
    }
    return {
      ...team,
      organizationId: parentTeam.organizationId ?? team.organizationId ?? null,
      createdBy: parentTeam.createdBy ?? team.createdBy ?? null,
      openRegistration: parentTeam.openRegistration,
      joinPolicy: parentTeam.joinPolicy,
      registrationPriceCents: parentTeam.registrationPriceCents,
      requiredTemplateIds: parentTeam.requiredTemplateIds ?? [],
      visibility: parentTeam.visibility,
    };
  };
  const placeholderTeamIds = new Set<string>(
    (teams as Array<{ id?: unknown; kind?: unknown; captainId?: unknown; parentTeamId?: unknown }>)
      .filter(isPlaceholderTeamRow)
      .map((team) => normalizeIdKey(team.id))
      .filter((teamId): teamId is string => Boolean(teamId)),
  );
  const teamsById = new Map<string, any>(
    (teams as any[])
      .map((team) => [normalizeIdKey(team.id), team])
      .filter((entry): entry is [string, any] => Boolean(entry[0])),
  );
  const isDisplayableTeamRegistration = (row: RegistrationRow): boolean => (
    row.registrantType !== 'TEAM'
    || (
      !placeholderTeamIds.has(normalizeIdKey(row.registrantId) ?? '')
      && !placeholderTeamIds.has(normalizeIdKey(row.eventTeamId) ?? '')
    )
  );
  const teamRegistrationIdentityKey = (row: RegistrationRow): string | null => {
    if (row.registrantType !== 'TEAM') {
      return null;
    }
    const eventTeam = teamsById.get(normalizeIdKey(row.eventTeamId) ?? '')
      ?? teamsById.get(normalizeIdKey(row.registrantId) ?? '');
    return normalizeIdKey(row.parentId)
      ?? normalizeIdKey(eventTeam?.parentTeamId)
      ?? normalizeIdKey(row.eventTeamId)
      ?? normalizeIdKey(row.registrantId);
  };
  const compareTeamRegistrationFreshness = (left: RegistrationRow, right: RegistrationRow): number => {
    const leftUpdatedAt = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
    const rightUpdatedAt = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;
    if (leftUpdatedAt !== rightUpdatedAt) {
      return leftUpdatedAt - rightUpdatedAt;
    }
    const leftCreatedAt = left.createdAt ? new Date(left.createdAt).getTime() : 0;
    const rightCreatedAt = right.createdAt ? new Date(right.createdAt).getTime() : 0;
    if (leftCreatedAt !== rightCreatedAt) {
      return leftCreatedAt - rightCreatedAt;
    }
    return String(left.id).localeCompare(String(right.id));
  };
  const dedupeTeamParticipantEntries = (rows: RegistrationRow[]): RegistrationRow[] => {
    if (!Boolean(params.event.teamSignup)) {
      return rows;
    }
    const selectedByIdentity = new Map<string, RegistrationRow>();
    const passthroughRows: RegistrationRow[] = [];
    rows.forEach((row) => {
      if (row.registrantType !== 'TEAM') {
        passthroughRows.push(row);
        return;
      }
      const identityKey = teamRegistrationIdentityKey(row);
      if (!identityKey) {
        passthroughRows.push(row);
        return;
      }
      const existing = selectedByIdentity.get(identityKey);
      if (!existing || compareTeamRegistrationFreshness(existing, row) < 0) {
        selectedByIdentity.set(identityKey, row);
      }
    });
    const selectedIds = new Set(Array.from(selectedByIdentity.values()).map((row) => row.id));
    return rows.filter((row) => row.registrantType !== 'TEAM' || selectedIds.has(row.id));
  };

  const participantEntries = dedupeTeamParticipantEntries(
    registrations.filter(isRegisteredParticipant).filter(isDisplayableTeamRegistration),
  );
  const waitlistEntries = registrations.filter((row) => isDisplayableRole(row, 'WAITLIST'));
  const freeAgentEntries = registrations.filter((row) => isDisplayableRole(row, 'FREE_AGENT'));
  const participantCount = Boolean(params.event.teamSignup)
    ? participantEntries.filter((row) => row.registrantType === 'TEAM').length
    : participantEntries.filter((row) => row.registrantType === 'SELF' || row.registrantType === 'CHILD').length;

  const participantCapacity = await eventCapacityForDivisions({
    event: params.event,
    divisionIds: occurrence?.divisionIds,
  }, client);

  const uniqueRegistrantIds = (rows: RegistrationRow[], allowedTypes: RegistrationRegistrantType[]) => (
    Array.from(new Set(
      rows
        .filter((row) => allowedTypes.includes(row.registrantType))
        .map((row) => normalizeId(row.registrantId))
        .filter((value): value is string => Boolean(value)),
    ))
  );

  const divisionRowReferences = new Map<string, typeof divisionRows[number] | null>();
  const registerDivisionRowReference = (value: unknown, row: typeof divisionRows[number]) => {
    resolveDivisionAliases(normalizeId(value))
      .forEach((alias) => {
        const existing = divisionRowReferences.get(alias);
        if (existing === undefined) {
          divisionRowReferences.set(alias, row);
        } else if (existing?.id !== row.id) {
          divisionRowReferences.set(alias, null);
        }
      });
  };
  divisionRows.forEach((row) => {
    registerDivisionRowReference(row.id, row);
    registerDivisionRowReference(row.key, row);
  });
  const findCanonicalDivisionRow = (value: unknown): typeof divisionRows[number] | null => {
    const normalized = normalizeId(value)?.toLowerCase() ?? null;
    if (!normalized) {
      return null;
    }
    const direct = divisionRowReferences.get(normalized);
    if (direct) {
      return direct;
    }
    const token = extractDivisionTokenFromId(normalized);
    return token ? (divisionRowReferences.get(token) ?? null) : null;
  };

  const resolveDivisionIdentity = (row?: Pick<RegistrationRow, 'divisionId' | 'divisionTypeId' | 'divisionTypeKey'> | null): {
    divisionId: string | null;
    divisionTypeId: string | null;
    divisionTypeKey: string | null;
  } => {
    const explicitDivisionId = normalizeId(row?.divisionId);
    const canonicalDivision = findCanonicalDivisionRow(explicitDivisionId);
    const divisionId = normalizeId(canonicalDivision?.id)
      ?? explicitDivisionId
      ?? normalizeId(divisionRows[0]?.id)
      ?? normalizeId(eventDivisionIds[0]);
    const matchingDivision = canonicalDivision ?? divisionRows.find((entry) => entry.id === divisionId);
    const divisionTypeId = normalizeId(matchingDivision?.divisionTypeId)
      ?? normalizeId(row?.divisionTypeId);
    const divisionTypeKey = normalizeId(matchingDivision?.key)
      ?? normalizeId(row?.divisionTypeKey)
      ?? (divisionId ? extractDivisionTokenFromId(divisionId) : null)
      ?? null;
    return {
      divisionId,
      divisionTypeId,
      divisionTypeKey,
    };
  };

  const divisionGroups = new Map<string, EventParticipantDivisionIds>();
  const toDivisionKey = (identity: { divisionId: string | null; divisionTypeId: string | null; divisionTypeKey: string | null }) => (
    `${identity.divisionId ?? ''}::${identity.divisionTypeId ?? ''}::${identity.divisionTypeKey ?? ''}`
  );
  const ensureDivisionGroup = (identity: { divisionId: string | null; divisionTypeId: string | null; divisionTypeKey: string | null }) => {
    const key = toDivisionKey(identity);
    const existing = divisionGroups.get(key);
    if (existing) {
      return existing;
    }
    const created: EventParticipantDivisionIds = {
      divisionId: identity.divisionId,
      divisionTypeId: identity.divisionTypeId,
      divisionTypeKey: identity.divisionTypeKey,
      teamIds: [],
      userIds: [],
      waitListIds: [],
      freeAgentIds: [],
    };
    divisionGroups.set(key, created);
    return created;
  };
  const pushUnique = (values: string[], value: string | null) => {
    if (!value || values.includes(value)) {
      return;
    }
    values.push(value);
  };

  divisionRows.forEach((row) => {
    ensureDivisionGroup(resolveDivisionIdentity({
      divisionId: row.id,
      divisionTypeId: row.divisionTypeId,
      divisionTypeKey: row.key ?? extractDivisionTokenFromId(row.id) ?? null,
    }));
  });

  participantEntries.forEach((row) => {
    const group = ensureDivisionGroup(resolveDivisionIdentity(row));
    if (row.registrantType === 'TEAM') {
      pushUnique(group.teamIds, normalizeId(row.registrantId));
    } else {
      pushUnique(group.userIds, normalizeId(row.registrantId));
    }
  });
  waitlistEntries.forEach((row) => {
    const group = ensureDivisionGroup(resolveDivisionIdentity(row));
    pushUnique(group.waitListIds, normalizeId(row.registrantId));
  });
  freeAgentEntries.forEach((row) => {
    const group = ensureDivisionGroup(resolveDivisionIdentity(row));
    pushUnique(group.freeAgentIds, normalizeId(row.registrantId));
  });

  const divisionWarnings: EventParticipantDivisionWarning[] = [];
  if (Boolean(params.event.teamSignup)) {
    const filledCountsByDivisionId = new Map<string, number>();
    participantEntries
      .filter((row) => row.registrantType === 'TEAM')
      .forEach((row) => {
        const divisionId = resolveDivisionIdentity(row).divisionId;
        if (!divisionId) {
          return;
        }
        filledCountsByDivisionId.set(divisionId, (filledCountsByDivisionId.get(divisionId) ?? 0) + 1);
      });

    divisionRows.forEach((row) => {
      const divisionId = normalizeId(row.id);
      if (!divisionId || String(row.kind ?? 'LEAGUE').toUpperCase() === 'PLAYOFF') {
        return;
      }
      const maxTeams = positiveInt(row.maxParticipants)
        ?? (Boolean(params.event.singleDivision) ? positiveInt(params.event.maxParticipants) : null);
      if (!maxTeams) {
        return;
      }
      const filledCount = filledCountsByDivisionId.get(divisionId) ?? 0;
      const slotCount = normalizeIdList(row.teamIds).length;
      if (filledCount > maxTeams) {
        divisionWarnings.push({
          divisionId,
          code: 'OVER_CAPACITY',
          message: `This division has ${filledCount} teams, which is over the ${maxTeams}-team limit.`,
          filledCount,
          slotCount,
          maxTeams,
        });
      }
      if (slotCount < maxTeams) {
        divisionWarnings.push({
          divisionId,
          code: 'MISSING_PLACEHOLDERS',
          message: `This division has ${slotCount} team slots for a ${maxTeams}-team max. Rebuilding the event will create the missing placeholders.`,
          filledCount,
          slotCount,
          maxTeams,
        });
      }
    });
  }

  return {
    participants: {
      teamIds: uniqueRegistrantIds(participantEntries, ['TEAM']),
      userIds: uniqueRegistrantIds(participantEntries, ['SELF', 'CHILD']),
      waitListIds: Array.from(new Set(
        waitlistEntries
          .map((row) => normalizeId(row.registrantId))
          .filter((value): value is string => Boolean(value)),
      )),
      freeAgentIds: Array.from(new Set(
        freeAgentEntries
          .map((row) => normalizeId(row.registrantId))
          .filter((value): value is string => Boolean(value)),
      )),
      divisions: Array.from(divisionGroups.values()),
    },
    registrations: params.includeRegistrations
      ? {
        teams: participantEntries
          .filter((row) => row.registrantType === 'TEAM')
          .map(toEntry),
        users: participantEntries
          .filter((row) => row.registrantType === 'SELF')
          .map(toEntry),
        children: participantEntries
          .filter((row) => row.registrantType === 'CHILD')
          .map(toEntry),
        waitlist: waitlistEntries.map(toEntry),
        freeAgents: freeAgentEntries.map(toEntry),
      }
      : undefined,
    teams: (() => {
      const displayableTeamIds = new Set(uniqueRegistrantIds(participantEntries, ['TEAM']).map((teamId) => teamId.toLowerCase()));
      return (teams as any[]).filter((team) => {
        const teamId = normalizeIdKey(team.id);
        return Boolean(teamId && displayableTeamIds.has(teamId) && !placeholderTeamIds.has(teamId));
      }).map(enrichEventTeamRegistrationMetadata);
    })(),
    users,
    participantCount,
    participantCapacity,
    occurrence: occurrence
      ? {
        slotId: occurrence.slotId,
        occurrenceDate: occurrence.occurrenceDate,
      }
      : null,
    divisionWarnings,
  };
};

export const reserveCapacityRows = (rows: RegistrationRow[]): number => rows.filter(isCapacityHoldingParticipant).length;

export const getEventParticipantIds = async (
  eventIds: string[],
  client: PrismaLike = prisma,
  occurrence?: WeeklyOccurrenceInput | null,
): Promise<Map<string, EventParticipantIds>> => {
  const normalizedEventIds = normalizeIdList(eventIds);
  const response = new Map<string, EventParticipantIds>();
  normalizedEventIds.forEach((eventId) => response.set(eventId, emptyParticipantIds()));
  if (!normalizedEventIds.length || typeof (client as any).eventRegistrations?.findMany !== 'function') {
    return response;
  }
  const occurrenceSlotId = normalizeId(occurrence?.slotId);
  const occurrenceDate = normalizeId(occurrence?.occurrenceDate);
  const occurrenceWhere = occurrenceSlotId && occurrenceDate
    ? { slotId: occurrenceSlotId, occurrenceDate }
    : { slotId: null, occurrenceDate: null };

  const rows = await client.eventRegistrations.findMany({
    where: {
      eventId: { in: normalizedEventIds },
      status: { in: Array.from(DISPLAY_MEMBER_STATUSES) },
      ...occurrenceWhere,
    },
    select: {
      eventId: true,
      registrantId: true,
      eventTeamId: true,
      registrantType: true,
      rosterRole: true,
      createdAt: true,
      id: true,
    },
    orderBy: [
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
  });

  const placeholderTeamIdKeys = await loadPlaceholderTeamIdKeys(
    rows
      .filter((row) => row.registrantType === 'TEAM')
      .flatMap((row) => [row.registrantId, row.eventTeamId])
      .filter((teamId): teamId is string => Boolean(teamId)),
    client,
  );

  rows.forEach((row) => {
    const eventId = normalizeId(row.eventId);
    const registrantId = normalizeId(row.registrantId);
    if (!eventId || !registrantId) {
      return;
    }
    if (
      row.registrantType === 'TEAM'
      && (
        placeholderTeamIdKeys.has(normalizeIdKey(row.registrantId) ?? '')
        || placeholderTeamIdKeys.has(normalizeIdKey(row.eventTeamId) ?? '')
      )
    ) {
      return;
    }
    const ids = response.get(eventId) ?? emptyParticipantIds();
    const role = normalizeRosterRole(row.rosterRole);
    if (role === 'PARTICIPANT') {
      if (row.registrantType === 'TEAM') {
        pushUnique(ids.teamIds, registrantId);
      } else if (row.registrantType === 'SELF' || row.registrantType === 'CHILD') {
        pushUnique(ids.userIds, registrantId);
      }
    } else if (role === 'WAITLIST') {
      pushUnique(ids.waitListIds, registrantId);
    } else if (role === 'FREE_AGENT') {
      pushUnique(ids.freeAgentIds, registrantId);
    }
    response.set(eventId, ids);
  });

  return response;
};

export const getEventParticipantIdsForEvent = async (
  eventId: string,
  client: PrismaLike = prisma,
  occurrence?: WeeklyOccurrenceInput | null,
): Promise<EventParticipantIds> => {
  const ids = await getEventParticipantIds([eventId], client, occurrence);
  return ids.get(eventId) ?? emptyParticipantIds();
};

export const withDerivedEventParticipantIds = async <T extends { id: string }>(
  events: T[],
  client: PrismaLike = prisma,
): Promise<Array<T & EventParticipantIds>> => {
  const idsByEventId = await getEventParticipantIds(events.map((event) => event.id), client);
  return events.map((event) => ({
    ...event,
    ...(idsByEventId.get(event.id) ?? emptyParticipantIds()),
  }));
};

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
      status: { in: Array.from(DISPLAY_MEMBER_STATUSES) },
    },
    select: {
      eventId: true,
      registrantId: true,
      eventTeamId: true,
      registrantType: true,
      rosterRole: true,
      slotId: true,
      occurrenceDate: true,
    },
  });

  const placeholderTeamIdKeys = await loadPlaceholderTeamIdKeys(
    registrations
      .filter((row) => row.registrantType === 'TEAM')
      .flatMap((row) => [row.registrantId, row.eventTeamId])
      .filter((teamId): teamId is string => Boolean(teamId)),
    client,
  );

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
    if (
      Boolean(event.teamSignup)
      && row.registrantType === 'TEAM'
      && (
        placeholderTeamIdKeys.has(normalizeIdKey(row.registrantId) ?? '')
        || placeholderTeamIdKeys.has(normalizeIdKey(row.eventTeamId) ?? '')
      )
    ) {
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
