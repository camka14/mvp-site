import type { View } from 'react-big-calendar';

import { isApiRequestError } from '@/lib/apiClient';
import {
  hasBracketConnections as isPlayoffBracketMatch,
  toBracketDivisionKey as toDivisionKey,
} from '@/lib/bracketViewCore';
import { formatLocalDateTime, parseLocalDateTime } from '@/lib/dateUtils';
import { getFieldDisplayName } from '@/lib/fieldUtils';
import type { BillDiscountSummary, Event, EventState, Field, Match, Sport, Team, TimeSlot } from '@/types';
import { validateAndNormalizeBracketGraph, type BracketNode } from '@/server/matches/bracketGraph';

import { MATCH_CONFLICT_RESOLUTION_MESSAGE } from '../lib/matchConflicts';

export const cloneValue = <T,>(value: T): T => {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  const structuredCloneFn = (globalThis as { structuredClone?: <U>(input: U) => U }).structuredClone;
  if (structuredCloneFn) {
    return structuredCloneFn(value);
  }

  // Fallback handles circular references by walking the graph manually
  const seen = new WeakMap<object, any>();
  const cloneRecursive = (input: any): any => {
    if (input === null || typeof input !== 'object') {
      return input;
    }

    if (seen.has(input)) {
      return seen.get(input);
    }

    if (Array.isArray(input)) {
      const arr: any[] = [];
      seen.set(input, arr);
      for (const item of input) {
        arr.push(cloneRecursive(item));
      }
      return arr;
    }

    if (input instanceof Date) {
      return new Date(input.getTime());
    }

    const cloned: Record<string, unknown> = {};
    seen.set(input, cloned);
    for (const key of Object.keys(input)) {
      cloned[key] = cloneRecursive(input[key]);
    }
    return cloned;
  };

  return cloneRecursive(value);
};

export const getActionErrorDetail = (error: unknown): string | null => {
  if (isApiRequestError(error)) {
    const apiError = error.data;
    if (apiError && typeof apiError === 'object' && 'error' in apiError) {
      const message = String((apiError as { error?: unknown }).error ?? '').trim();
      if (message) {
        const unknownKeys = Array.isArray((apiError as { unknownKeys?: unknown }).unknownKeys)
          ? (apiError as { unknownKeys?: unknown[] }).unknownKeys
            ?.map((key) => String(key).trim())
            .filter((key) => key.length > 0)
          : [];
        if (unknownKeys?.length) {
          return `${message} Unknown fields: ${unknownKeys.join(', ')}.`;
        }
        return message;
      }
    }
  }
  if (error instanceof Error) {
    const message = error.message.trim();
    return message || null;
  }
  if (typeof error === 'string') {
    const message = error.trim();
    return message || null;
  }
  return null;
};

export const formatActionErrorMessage = (fallback: string, error: unknown): string => {
  const detail = getActionErrorDetail(error);
  if (!detail || detail === fallback || detail.startsWith(fallback)) {
    return detail || fallback;
  }
  return `${fallback} ${detail}`;
};

export const formatLatLngLabel = (lat?: number, lng?: number): string => {
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return '';
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return '';
  }
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
};

export type DivisionOption = {
  value: string;
  label: string;
};

export type ParticipantInviteMode = 'existing' | 'email' | 'team';

export type ParticipantInviteRow = {
  firstName: string;
  lastName: string;
  email: string;
};

export type MatchCreateContext = 'schedule' | 'bracket';

export const EVENT_SCHEDULE_TABS = new Set(['details', 'participants', 'schedule', 'standings', 'bracket', 'finance']);

export type StagedMatchCreateMeta = {
  clientId: string;
  creationContext: MatchCreateContext;
  autoPlaceholderTeam: boolean;
};

export const CLIENT_MATCH_PREFIX = 'client:';
export const LOCAL_PLACEHOLDER_PREFIX = 'placeholder-local:';
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_TEAM_SEARCH_QUERY_LENGTH = 2;

export const collectTeamRosterUserIds = (team: Team): string[] => {
  const assistantCoachIds = Array.isArray(team.assistantCoachIds)
    ? team.assistantCoachIds
    : Array.isArray(team.coachIds)
      ? team.coachIds
      : [];

  return Array.from(
    new Set(
      [
        ...team.playerIds,
        team.captainId,
        team.managerId ?? '',
        team.headCoachId ?? '',
        ...assistantCoachIds,
      ]
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0),
    ),
  );
};

export const teamMatchesSearchQuery = (team: Team, normalizedQuery: string): boolean => {
  const teamName = (team.name ?? '').toLowerCase();
  const sportName = (team.sport ?? '').toLowerCase();
  const divisionName = (
    typeof team.division === 'string'
      ? team.division
      : team.division?.name ?? team.division?.id ?? ''
  ).toLowerCase();

  return (
    teamName.includes(normalizedQuery) ||
    sportName.includes(normalizedQuery) ||
    divisionName.includes(normalizedQuery)
  );
};

export const isClientMatchId = (id: string | null | undefined): boolean =>
  typeof id === 'string' && id.startsWith(CLIENT_MATCH_PREFIX);

export const getClientIdFromMatchId = (id: string): string =>
  id.slice(CLIENT_MATCH_PREFIX.length);

export const isLocalPlaceholderId = (id: string | null | undefined): boolean =>
  typeof id === 'string' && id.startsWith(LOCAL_PLACEHOLDER_PREFIX);

export const asBulkMatchRef = (value: string | null | undefined): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

export const nextMatchSequenceNumber = (matches: Match[]): number => {
  const maxCurrent = matches.reduce((maxValue, match) => {
    if (typeof match.matchId !== 'number' || !Number.isFinite(match.matchId)) {
      return maxValue;
    }
    return Math.max(maxValue, Math.trunc(match.matchId));
  }, 0);
  return maxCurrent + 1;
};

export const buildBracketNodes = (draftMatches: Match[]): BracketNode[] => (
  draftMatches.reduce<BracketNode[]>((nodes, match) => {
    const id = normalizeIdToken(match.$id);
    if (!id) {
      return nodes;
    }
    nodes.push({
      id,
      matchId: typeof match.matchId === 'number' ? match.matchId : null,
      previousLeftId: asBulkMatchRef(match.previousLeftId),
      previousRightId: asBulkMatchRef(match.previousRightId),
      winnerNextMatchId: asBulkMatchRef(match.winnerNextMatchId),
      loserNextMatchId: asBulkMatchRef(match.loserNextMatchId),
    });
    return nodes;
  }, [])
);

export const normalizeDraftBracketGraph = (draftMatches: Match[]): Match[] => {
  const graphValidation = validateAndNormalizeBracketGraph(buildBracketNodes(draftMatches));
  if (!graphValidation.ok) {
    return draftMatches;
  }

  return draftMatches.map((match) => {
    const matchId = normalizeIdToken(match.$id);
    if (!matchId) {
      return match;
    }

    const normalizedNode = graphValidation.normalizedById[matchId];
    if (!normalizedNode) {
      return match;
    }

    const normalizedPreviousLeftId = asBulkMatchRef(normalizedNode.previousLeftId);
    const normalizedPreviousRightId = asBulkMatchRef(normalizedNode.previousRightId);
    const currentPreviousLeftId = asBulkMatchRef(match.previousLeftId);
    const currentPreviousRightId = asBulkMatchRef(match.previousRightId);

    if (
      currentPreviousLeftId === normalizedPreviousLeftId
      && currentPreviousRightId === normalizedPreviousRightId
    ) {
      return match;
    }

    return {
      ...match,
      previousLeftId: normalizedPreviousLeftId,
      previousRightId: normalizedPreviousRightId,
      previousLeftMatch: undefined,
      previousRightMatch: undefined,
    };
  });
};

export const normalizeDivisionToken = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

export const normalizeIdToken = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

export type WeeklyOccurrenceOption = {
  id: string;
  slotId: string;
  occurrenceDate: string;
  label: string;
  start: string;
  end: string;
  startMinutes: number;
  endMinutes: number;
  fieldIds: string[];
  divisionIds: string[];
};

export type WeeklyOccurrenceSelection = {
  slotId: string;
  occurrenceDate: string;
};

export type ViewerWeeklyRegistrationRow = {
  slotId?: string | null;
  occurrenceDate?: string | null;
  rosterRole?: string | null;
  status?: string | null;
};

export const VIEWER_WEEKLY_REGISTRATION_STATUSES = new Set(['STARTED', 'ACTIVE', 'BLOCKED']);

export const buildParticipantSnapshotKey = (
  eventId: unknown,
  occurrence?: { slotId?: string | null; occurrenceDate?: string | null } | null,
): string | null => {
  const normalizedEventId = normalizeIdToken(eventId);
  if (!normalizedEventId) {
    return null;
  }

  const slotId = normalizeIdToken(occurrence?.slotId);
  const occurrenceDate = normalizeIdToken(occurrence?.occurrenceDate);
  return slotId && occurrenceDate
    ? `${normalizedEventId}:${slotId}:${occurrenceDate}`
    : `${normalizedEventId}:all`;
};

export const buildComplianceSnapshotKey = (
  eventId: unknown,
  participantIdsKey: string,
  occurrence: { slotId?: string | null; occurrenceDate?: string | null } | null | undefined,
  refreshKey: number,
): string | null => {
  const participantKey = participantIdsKey.trim();
  const snapshotKey = buildParticipantSnapshotKey(eventId, occurrence);
  if (!snapshotKey || !participantKey) {
    return null;
  }
  return `${snapshotKey}:${participantKey}:${refreshKey}`;
};

export const buildWeeklyOccurrenceRegistrationKey = (
  slotIdInput: unknown,
  occurrenceDateInput: unknown,
): string | null => {
  const slotId = normalizeIdToken(slotIdInput);
  const occurrenceDate = normalizeIdToken(occurrenceDateInput);
  return slotId && occurrenceDate ? `${slotId}:${occurrenceDate}` : null;
};

export const ID_LIST_KEY_SEPARATOR = '|';

export const buildStableIdListKey = (ids: string[]): string => ids.join(ID_LIST_KEY_SEPARATOR);

export const parseStableIdListKey = (key: string): string[] => (
  key
    ? key
        .split(ID_LIST_KEY_SEPARATOR)
        .map((id) => id.trim())
        .filter((id): id is string => id.length > 0)
    : []
);

export const parseDateValue = (value?: string | null): Date | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split('-').map(Number);
    if (![year, month, day].some(Number.isNaN)) {
      return new Date(year, (month ?? 1) - 1, day ?? 1);
    }
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const toLocalIsoDate = (value: Date): string => {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const toMondayIndex = (value: Date): number => (value.getDay() + 6) % 7;

export const startOfDay = (value: Date): Date => {
  const copy = new Date(value.getTime());
  copy.setHours(0, 0, 0, 0);
  return copy;
};

export const startOfMonth = (value: Date): Date => new Date(value.getFullYear(), value.getMonth(), 1);

export const endOfMonth = (value: Date): Date => new Date(value.getFullYear(), value.getMonth() + 1, 0);

export const startOfCalendarWeek = (value: Date): Date => {
  const copy = startOfDay(value);
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
};

export const addDays = (value: Date, days: number): Date => {
  const copy = new Date(value.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
};

export const formatWeeklyOccurrenceLabel = (occurrence: Date, startMinutes: number, endMinutes: number): string => {
  const start = new Date(occurrence.getTime());
  start.setHours(0, startMinutes, 0, 0);
  const end = new Date(occurrence.getTime());
  end.setHours(0, endMinutes, 0, 0);
  const dayLabel = start.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
  });
  const timeLabel = `${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}-${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
  return `${dayLabel} · ${timeLabel}`;
};

export const getWeeklyScheduleCalendarRange = (value: Date, calendarView: View): { start: Date; end: Date } => {
  const safeDate = Number.isNaN(value.getTime()) ? new Date() : value;
  if (calendarView === 'day') {
    const day = startOfDay(safeDate);
    return { start: day, end: day };
  }
  if (calendarView === 'week') {
    const start = startOfCalendarWeek(safeDate);
    return { start, end: addDays(start, 6) };
  }
  return {
    start: startOfMonth(safeDate),
    end: endOfMonth(safeDate),
  };
};

export const buildWeeklyOccurrenceOptionsInRange = (
  event: Event | null,
  rangeStart: Date,
  rangeEnd: Date,
): WeeklyOccurrenceOption[] => {
  if (
    !event
    || event.eventType !== 'WEEKLY_EVENT'
    || event.parentEvent
    || !Array.isArray(event.timeSlots)
  ) {
    return [];
  }

  const normalizedRangeStart = startOfDay(rangeStart);
  const normalizedRangeEnd = startOfDay(rangeEnd);
  if (normalizedRangeEnd.getTime() < normalizedRangeStart.getTime()) {
    return [];
  }

  const options: WeeklyOccurrenceOption[] = [];

  event.timeSlots.forEach((slot) => {
    const slotId = normalizeIdToken(slot.$id ?? (slot as { id?: string }).id);
    const slotStartDate = parseDateValue(slot.startDate ?? null);
    if (!slotId || !slotStartDate) {
      return;
    }
    slotStartDate.setHours(0, 0, 0, 0);
    const slotEndDate = parseDateValue(slot.endDate ?? null);
    if (slotEndDate) {
      slotEndDate.setHours(0, 0, 0, 0);
    }

    const startMinutes = typeof slot.startTimeMinutes === 'number' ? slot.startTimeMinutes : null;
    const endMinutes = typeof slot.endTimeMinutes === 'number' ? slot.endTimeMinutes : null;
    const weekdays = Array.from(new Set(
      (Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length
        ? slot.daysOfWeek
        : typeof slot.dayOfWeek === 'number'
          ? [slot.dayOfWeek]
          : [])
        .map((entry) => Number(entry))
        .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 6),
    )).sort((left, right) => left - right);
    if (!weekdays.length || startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
      return;
    }

    const fieldIds = Array.from(new Set(
      (Array.isArray(slot.scheduledFieldIds) ? slot.scheduledFieldIds : [])
        .concat(typeof slot.scheduledFieldId === 'string' ? [slot.scheduledFieldId] : [])
        .map((entry) => normalizeIdToken(entry))
        .filter((entry): entry is string => Boolean(entry)),
    ));
    const divisionIds = Array.from(new Set(
      (Array.isArray(slot.divisions) ? slot.divisions : [])
        .map((entry) => normalizeIdToken(typeof entry === 'string' ? entry : null))
        .filter((entry): entry is string => Boolean(entry)),
    ));

    const searchStart = startOfDay(new Date(Math.max(normalizedRangeStart.getTime(), slotStartDate.getTime())));
    const searchEnd = startOfDay(new Date(
      Math.min(normalizedRangeEnd.getTime(), slotEndDate?.getTime() ?? normalizedRangeEnd.getTime()),
    ));

    if (searchEnd.getTime() < searchStart.getTime()) {
      return;
    }

    for (let occurrence = new Date(searchStart.getTime()); occurrence.getTime() <= searchEnd.getTime(); occurrence = addDays(occurrence, 1)) {
      if (!weekdays.includes(toMondayIndex(occurrence))) {
        continue;
      }

      const occurrenceStart = new Date(occurrence.getTime());
      occurrenceStart.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
      const occurrenceEnd = new Date(occurrence.getTime());
      occurrenceEnd.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);
      options.push({
        id: `${slotId}:${toLocalIsoDate(occurrence)}`,
        slotId,
        occurrenceDate: toLocalIsoDate(occurrence),
        label: formatWeeklyOccurrenceLabel(occurrence, startMinutes, endMinutes),
        start: formatLocalDateTime(occurrenceStart),
        end: formatLocalDateTime(occurrenceEnd),
        startMinutes,
        endMinutes,
        fieldIds,
        divisionIds,
      });
    }
  });

  return options.sort((left, right) => (
    left.occurrenceDate.localeCompare(right.occurrenceDate)
    || left.startMinutes - right.startMinutes
    || left.slotId.localeCompare(right.slotId)
  ));
};

export const resolveSelectedWeeklyOccurrenceOption = (
  event: Event | null,
  selection: WeeklyOccurrenceSelection | null,
): WeeklyOccurrenceOption | null => {
  if (!selection) {
    return null;
  }

  const occurrenceDate = parseDateValue(selection.occurrenceDate);
  if (!occurrenceDate) {
    return null;
  }

  const resolvedDate = startOfDay(occurrenceDate);
  return buildWeeklyOccurrenceOptionsInRange(event, resolvedDate, resolvedDate).find((option) => (
    option.slotId === selection.slotId
    && option.occurrenceDate === selection.occurrenceDate
  )) ?? null;
};

export const collectMatchAssignmentUserIds = (match: Match): string[] => {
  const ids = new Set<string>();
  const officialId = normalizeIdToken(match.officialId ?? match.official?.$id);
  if (officialId) {
    ids.add(officialId);
  }
  if (Array.isArray(match.officialIds)) {
    match.officialIds.forEach((assignment) => {
      const userId = normalizeIdToken(assignment?.userId);
      if (userId) {
        ids.add(userId);
      }
    });
  }
  return Array.from(ids);
};

export const clearMatchReferencesToTarget = (match: Match, removedMatchId: string): Match => {
  const targetId = normalizeIdToken(removedMatchId);
  if (!targetId) {
    return match;
  }

  let next = match;
  const previousLeftId = normalizeIdToken(next.previousLeftId);
  const previousRightId = normalizeIdToken(next.previousRightId);
  const winnerNextMatchId = normalizeIdToken(next.winnerNextMatchId);
  const loserNextMatchId = normalizeIdToken(next.loserNextMatchId);

  if (previousLeftId === targetId) {
    next = { ...next, previousLeftId: undefined, previousLeftMatch: undefined };
  }
  if (previousRightId === targetId) {
    next = { ...next, previousRightId: undefined, previousRightMatch: undefined };
  }
  if (winnerNextMatchId === targetId) {
    next = { ...next, winnerNextMatchId: undefined, winnerNextMatch: undefined };
  }
  if (loserNextMatchId === targetId) {
    next = { ...next, loserNextMatchId: undefined, loserNextMatch: undefined };
  }

  return next;
};

export const getDivisionKind = (division: unknown): 'LEAGUE' | 'PLAYOFF' | null => {
  if (!division || typeof division !== 'object') {
    return null;
  }
  const kind = (division as { kind?: unknown }).kind;
  if (typeof kind !== 'string') {
    return null;
  }
  const normalized = kind.trim().toUpperCase();
  if (normalized === 'PLAYOFF') {
    return 'PLAYOFF';
  }
  if (normalized === 'LEAGUE') {
    return 'LEAGUE';
  }
  return null;
};

export const getDivisionPlacementDivisionIds = (division: unknown): string[] => {
  if (!division || typeof division !== 'object') {
    return [];
  }
  const rawPlacementIds = (division as { playoffPlacementDivisionIds?: unknown }).playoffPlacementDivisionIds;
  if (!Array.isArray(rawPlacementIds)) {
    return [];
  }
  return rawPlacementIds
    .map((entry) => normalizeIdToken(entry))
    .filter((entry): entry is string => Boolean(entry));
};

export const divisionReferencesBracket = (division: unknown, bracketDivisionId: string | null | undefined): boolean => {
  const bracketKey = toDivisionKey(bracketDivisionId);
  if (!bracketKey) {
    return false;
  }
  return getDivisionPlacementDivisionIds(division).some((placementDivisionId) => (
    toDivisionKey(placementDivisionId) === bracketKey
  ));
};

export const isTournamentPoolPlayViewEnabled = (event: Event | null | undefined): boolean => (
  Boolean(
    event
      && event.eventType === 'TOURNAMENT'
      && (event.includePlayoffsOrPools === true || event.includePlayoffs === true),
  )
);

export const isDivisionStandingsConfirmed = (division: unknown): boolean => {
  if (!division || typeof division !== 'object') {
    return false;
  }
  const confirmedAt = (division as { standingsConfirmedAt?: unknown }).standingsConfirmedAt;
  if (confirmedAt instanceof Date) {
    return !Number.isNaN(confirmedAt.getTime());
  }
  if (typeof confirmedAt === 'string') {
    return confirmedAt.trim().length > 0;
  }
  return false;
};

export const getDivisionTeamIds = (division: unknown): string[] => {
  if (!division || typeof division !== 'object') {
    return [];
  }
  const rawTeamIds = (division as { teamIds?: unknown }).teamIds;
  if (!Array.isArray(rawTeamIds)) {
    return [];
  }
  return Array.from(
    new Set(
      rawTeamIds
        .map((teamId) => normalizeIdToken(teamId))
        .filter((teamId): teamId is string => Boolean(teamId)),
    ),
  );
};

export const shouldResetBracketMatchForRebuild = (event: Event, match: Match): boolean => {
  if (event.eventType === 'TOURNAMENT') {
    return true;
  }
  if (event.eventType === 'LEAGUE' && event.includePlayoffs) {
    return isPlayoffBracketMatch(match);
  }
  return false;
};

export const toClearedBracketMatchUpdate = (match: Match): Partial<Match> & { $id: string } => ({
  $id: match.$id,
  team1Points: [],
  team2Points: [],
  setResults: [],
  officialCheckedIn: false,
  locked: false,
});

export type MatchConflictPair = {
  firstId: string;
  secondId: string;
};

export const listMatchConflictPairs = (conflictsById: Record<string, string[]>): MatchConflictPair[] => {
  const seenPairs = new Set<string>();
  const pairs: MatchConflictPair[] = [];

  Object.keys(conflictsById)
    .sort()
    .forEach((matchId) => {
      const conflictIds = Array.isArray(conflictsById[matchId]) ? conflictsById[matchId] : [];
      conflictIds.forEach((rawConflictId) => {
        const conflictId = normalizeIdToken(rawConflictId);
        if (!conflictId || conflictId === matchId) {
          return;
        }
        const [firstId, secondId] = matchId < conflictId
          ? [matchId, conflictId]
          : [conflictId, matchId];
        const pairKey = `${firstId}|${secondId}`;
        if (seenPairs.has(pairKey)) {
          return;
        }
        seenPairs.add(pairKey);
        pairs.push({ firstId, secondId });
      });
    });

  return pairs.sort((left, right) => {
    if (left.firstId === right.firstId) {
      return left.secondId.localeCompare(right.secondId);
    }
    return left.firstId.localeCompare(right.firstId);
  });
};

export const getConflictMatchLabel = (match: Match): string => {
  if (typeof match.matchId === 'number' && Number.isFinite(match.matchId)) {
    return `Match #${Math.trunc(match.matchId)}`;
  }
  return `Match ${match.$id}`;
};

export const getConflictFieldLabel = (match: Match): string => {
  return getFieldDisplayName(
    {
      $id: normalizeIdToken(match.field?.$id) ?? normalizeIdToken(match.fieldId) ?? undefined,
      name: typeof match.field?.name === 'string' ? match.field.name : '',
    },
    'an unassigned field',
  );
};

export const buildMatchConflictAlertMessage = ({
  matches,
  pairs,
}: {
  matches: Match[];
  pairs: MatchConflictPair[];
}): string => {
  if (pairs.length === 0) {
    return MATCH_CONFLICT_RESOLUTION_MESSAGE;
  }

  const matchesById = new Map<string, Match>();
  matches.forEach((match) => {
    const matchId = normalizeIdToken(match.$id);
    if (matchId) {
      matchesById.set(matchId, match);
    }
  });

  const firstPair = pairs[0];
  const firstMatch = firstPair ? matchesById.get(firstPair.firstId) : null;
  const secondMatch = firstPair ? matchesById.get(firstPair.secondId) : null;

  if (!firstMatch || !secondMatch) {
    return MATCH_CONFLICT_RESOLUTION_MESSAGE;
  }

  return `${getConflictMatchLabel(firstMatch)} overlaps ${getConflictMatchLabel(secondMatch)} on ${getConflictFieldLabel(firstMatch)} - ${MATCH_CONFLICT_RESOLUTION_MESSAGE}`;
};

export const getTeamWarningLabel = (team: Team): string => {
  const name = typeof team.name === 'string' ? team.name.trim() : '';
  return name.length > 0 ? name : 'Unnamed Team';
};


export type StandingsSortField = 'team' | 'wins' | 'losses' | 'draws' | 'points';

export type StandingsRow = {
  teamId: string;
  teamName: string;
  wins: number;
  losses: number;
  draws: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  matchesPlayed: number;
  points: number;
  basePoints?: number;
  finalPoints?: number;
  pointsDelta?: number;
};

export type RankedStandingsRow = StandingsRow & { rank: number };

export type LocationDefaults = {
  location?: string;
  address?: string;
  coordinates?: [number, number];
};

export type EventLifecycleStatus = 'DRAFT' | 'PRIVATE' | 'PUBLISHED';
export type NotificationAudienceKey = 'managers' | 'players' | 'parents' | 'officials' | 'hosts';
export type NotificationAudienceState = Record<NotificationAudienceKey, boolean>;

export type TeamBillingUserOption = {
  id: string;
  displayName: string;
};

export type TeamBillingPaymentSnapshot = {
  $id: string;
  billId: string;
  sequence: number;
  status: string | null;
  amountCents: number;
  refundedAmountCents: number;
  refundableAmountCents: number;
  paidAt?: string | null;
  paymentIntentId?: string | null;
  isRefundable: boolean;
  manualPaymentProofs?: Array<{
    id: string;
    status: string | null;
    fileId: string;
    fileUrl: string;
    amountAcceptedCents?: number | null;
  }>;
};

export type TeamBillingBillSnapshot = {
  $id: string;
  ownerType: 'TEAM' | 'USER';
  ownerId: string;
  ownerName: string;
  totalAmountCents: number;
  paidAmountCents: number;
  originalAmountCents?: number;
  discountAmountCents?: number;
  discountedAmountCents?: number;
  discounts?: BillDiscountSummary[];
  refundedAmountCents: number;
  refundableAmountCents: number;
  status: string | null;
  allowSplit?: boolean | null;
  lineItems?: Array<{
    id?: string;
    type?: string;
    label?: string;
    amountCents?: number;
    quantity?: number;
  }>;
  payments: TeamBillingPaymentSnapshot[];
};

export type TeamBillingSnapshot = {
  team: {
    id: string;
    name?: string | null;
    playerIds?: string[];
  };
  users: TeamBillingUserOption[];
  bills: TeamBillingBillSnapshot[];
  totals: {
    paidAmountCents: number;
    refundedAmountCents: number;
    refundableAmountCents: number;
  };
};

export type PendingRentalCheckoutContext = {
  eventDraft: Event;
  draftToSave: Partial<Event>;
  rentalSlot: TimeSlot;
  requiresPayment: boolean;
};

export type PendingSaveChangeItem = {
  id: string;
  category: 'event' | 'match';
  label: string;
  detail?: string;
  sortOrder: number;
};

export type RentalSelectionQuery = {
  key: string;
  scheduledFieldIds: string[];
  startDate: string;
  endDate: string;
  repeating: boolean;
  dayOfWeek?: number;
  daysOfWeek?: number[];
  startTimeMinutes?: number;
  endTimeMinutes?: number;
};

export const parseIdListQueryParam = (value?: string | null): string[] => (
  value
    ? Array.from(
      new Set(
        value
          .split(',')
          .map((id) => id.trim())
          .filter((id) => id.length > 0),
      ),
    )
    : []
);

const normalizeRentalSelectionDateRange = (
  selection: Record<string, unknown>,
): { start: string; end: string } | null => {
  const explicitStart = formatLocalDateTime(
    typeof selection.startDate === 'string' ? selection.startDate : null,
  );
  const explicitEnd = formatLocalDateTime(
    typeof selection.endDate === 'string' ? selection.endDate : null,
  );
  if (explicitStart && explicitEnd) {
    const startDate = parseLocalDateTime(explicitStart);
    const endDate = parseLocalDateTime(explicitEnd);
    if (startDate && endDate && endDate.getTime() > startDate.getTime()) {
      return { start: explicitStart, end: explicitEnd };
    }
  }

  const startBoundary = parseLocalDateTime(explicitStart ?? null);
  const daysSource = Array.isArray(selection.daysOfWeek)
    ? selection.daysOfWeek
    : [selection.dayOfWeek];
  const daysOfWeek = Array.from(
    new Set(
      daysSource
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
    ),
  ).sort((left, right) => left - right);
  const startTimeMinutes = Number(selection.startTimeMinutes);
  const endTimeMinutes = Number(selection.endTimeMinutes);
  if (!startBoundary || !daysOfWeek.length || !Number.isFinite(startTimeMinutes) || !Number.isFinite(endTimeMinutes)) {
    return null;
  }

  const startSeed = new Date(startBoundary.getTime());
  startSeed.setHours(0, 0, 0, 0);
  const seedDay = (startSeed.getDay() + 6) % 7;
  const firstDay = daysOfWeek[0];
  let diff = firstDay - seedDay;
  if (diff < 0) diff += 7;
  startSeed.setDate(startSeed.getDate() + diff);
  startSeed.setMinutes(startTimeMinutes);

  const endSeed = new Date(startSeed.getTime());
  endSeed.setHours(0, 0, 0, 0);
  endSeed.setMinutes(endTimeMinutes);
  if (endSeed.getTime() <= startSeed.getTime()) {
    endSeed.setTime(startSeed.getTime() + 60 * 60 * 1000);
  }

  const normalizedStart = formatLocalDateTime(startSeed);
  const normalizedEnd = formatLocalDateTime(endSeed);
  if (!normalizedStart || !normalizedEnd) {
    return null;
  }
  return { start: normalizedStart, end: normalizedEnd };
};

export const parseRentalSelectionsQueryParam = (value?: string | null): RentalSelectionQuery[] => {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const normalizedSelections: RentalSelectionQuery[] = [];
    parsed.forEach((rawSelection, index) => {
      if (!rawSelection || typeof rawSelection !== 'object') {
        return;
      }
      const selection = rawSelection as Record<string, unknown>;
      const dateRange = normalizeRentalSelectionDateRange(selection);
      if (!dateRange) {
        return;
      }
      const scheduledFieldIds = Array.from(
        new Set(
          (Array.isArray(selection.scheduledFieldIds) ? selection.scheduledFieldIds : [])
            .map((fieldId) => (typeof fieldId === 'string' ? fieldId.trim() : ''))
            .filter((fieldId) => fieldId.length > 0),
        ),
      );
      if (!scheduledFieldIds.length) {
        return;
      }
      const startDate = parseLocalDateTime(dateRange.start);
      const endDate = parseLocalDateTime(dateRange.end);
      if (!startDate || !endDate || endDate.getTime() <= startDate.getTime()) {
        return;
      }
      const derivedDayOfWeek = ((startDate.getDay() + 6) % 7);
      const startTimeMinutes = startDate.getHours() * 60 + startDate.getMinutes();
      const endTimeMinutes = endDate.getHours() * 60 + endDate.getMinutes();
      const normalizedDays = Array.from(
        new Set(
          (Array.isArray(selection.daysOfWeek) ? selection.daysOfWeek : [selection.dayOfWeek])
            .map((day) => Number(day))
            .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
        ),
      ).sort((left, right) => left - right);
      const daysOfWeek = normalizedDays.length ? normalizedDays : [derivedDayOfWeek];
      normalizedSelections.push({
        key: typeof selection.key === 'string' && selection.key.trim().length > 0
          ? selection.key.trim()
          : `rental-selection-${index + 1}`,
        scheduledFieldIds,
        dayOfWeek: daysOfWeek[0] ?? derivedDayOfWeek,
        daysOfWeek,
        startTimeMinutes,
        endTimeMinutes,
        startDate: dateRange.start,
        endDate: dateRange.end,
        repeating: false,
      });
    });
    return normalizedSelections;
  } catch (error) {
    console.warn('Invalid rentalSelections query payload:', error);
    return [];
  }
};

export const getRentalSelectionRange = (
  selections: RentalSelectionQuery[],
): { start: string | undefined; end: string | undefined } => {
  if (!selections.length) {
    return { start: undefined, end: undefined };
  }

  let earliest: Date | null = null;
  let latest: Date | null = null;
  selections.forEach((selection) => {
    const selectionStart = parseLocalDateTime(selection.startDate);
    const selectionEnd = parseLocalDateTime(selection.endDate);
    if (!selectionStart || !selectionEnd || selectionEnd.getTime() <= selectionStart.getTime()) {
      return;
    }
    if (!earliest || selectionStart < earliest) {
      earliest = selectionStart;
    }
    if (!latest || selectionEnd > latest) {
      latest = selectionEnd;
    }
  });

  return {
    start: earliest ? formatLocalDateTime(earliest) : undefined,
    end: latest ? formatLocalDateTime(latest) : undefined,
  };
};

export const collectRentalSelectionFieldIds = (selections: RentalSelectionQuery[]): string[] => (
  Array.from(new Set(selections.flatMap((selection) => selection.scheduledFieldIds)))
);

export const DEFAULT_NOTIFICATION_AUDIENCE: NotificationAudienceState = {
  managers: false,
  players: false,
  parents: false,
  officials: false,
  hosts: false,
};

export const DRAFT_LIKE_EVENT_STATES = new Set(['UNPUBLISHED', 'DRAFT']);
export const HIDDEN_EVENT_STATES = new Set(['UNPUBLISHED', 'DRAFT']);

export const EVENT_LIFECYCLE_OPTIONS: Array<{ value: EventLifecycleStatus; label: string }> = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PRIVATE', label: 'Private' },
  { value: 'PUBLISHED', label: 'Published' },
];

export const getEventLifecycleStatus = (eventInput: Pick<Event, 'state'> | null | undefined): EventLifecycleStatus => {
  if (!eventInput) {
    return 'DRAFT';
  }

  const normalizedState = typeof eventInput.state === 'string' ? eventInput.state.toUpperCase() : 'PUBLISHED';
  if (normalizedState === 'PRIVATE') {
    return 'PRIVATE';
  }
  if (DRAFT_LIKE_EVENT_STATES.has(normalizedState)) {
    return 'DRAFT';
  }

  return 'PUBLISHED';
};

export const toStoredEventLifecycleState = (
  lifecycleStatus: EventLifecycleStatus,
  currentState: Event['state'] | null | undefined,
): EventState => {
  if (lifecycleStatus === 'PUBLISHED') {
    return 'PUBLISHED';
  }
  if (lifecycleStatus === 'PRIVATE') {
    return 'PRIVATE';
  }
  return typeof currentState === 'string' && currentState.toUpperCase() === 'DRAFT'
    ? 'DRAFT'
    : 'UNPUBLISHED';
};

export const getLifecycleStatusLabel = (status: EventLifecycleStatus): string => (
  EVENT_LIFECYCLE_OPTIONS.find((option) => option.value === status)?.label ?? status
);

export const DEFAULT_SPORT: Sport = {
  $id: '',
  name: '',
  usePointsForWin: false,
  usePointsForDraw: false,
  usePointsForLoss: false,
  usePointsForForfeitWin: false,
  usePointsForForfeitLoss: false,
  usePointsPerSetWin: false,
  usePointsPerSetLoss: false,
  usePointsPerGameWin: false,
  usePointsPerGameLoss: false,
  usePointsPerGoalScored: false,
  usePointsPerGoalConceded: false,
  useMaxGoalBonusPoints: false,
  useMinGoalBonusThreshold: false,
  usePointsForShutout: false,
  usePointsForCleanSheet: false,
  useApplyShutoutOnlyIfWin: false,
  usePointsPerGoalDifference: false,
  useMaxGoalDifferencePoints: false,
  usePointsPenaltyPerGoalDifference: false,
  usePointsForParticipation: false,
  usePointsForNoShow: false,
  usePointsForWinStreakBonus: false,
  useWinStreakThreshold: false,
  usePointsForOvertimeWin: false,
  usePointsForOvertimeLoss: false,
  useOvertimeEnabled: false,
  usePointsPerRedCard: false,
  usePointsPerYellowCard: false,
  usePointsPerPenalty: false,
  useMaxPenaltyDeductions: false,
  useMaxPointsPerMatch: false,
  useMinPointsPerMatch: false,
  useGoalDifferenceTiebreaker: false,
  useHeadToHeadTiebreaker: false,
  useTotalGoalsTiebreaker: false,
  useEnableBonusForComebackWin: false,
  useBonusPointsForComebackWin: false,
  useEnableBonusForHighScoringMatch: false,
  useHighScoringThreshold: false,
  useBonusPointsForHighScoringMatch: false,
  useEnablePenaltyUnsporting: false,
  usePenaltyPointsUnsporting: false,
  usePointPrecision: false,
  $createdAt: '',
  $updatedAt: '',
};
