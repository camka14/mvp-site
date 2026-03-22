import { Schedule } from './Schedule';
import {
  Division,
  League,
  Match,
  MINUTE_MS,
  PlayingField,
  Team,
  Tournament,
  UserData,
} from './types';
import { stripEventAvailabilityFromFieldRentalSlots } from './fieldAvailability';

type SchedulerEvent = League | Tournament;

const MIN_SCHEDULE_DURATION_MS = 5 * MINUTE_MS;
const OPEN_ENDED_RESCHEDULE_WEEKS = 52;

const isLeagueEvent = (event: SchedulerEvent): event is League => (
  event instanceof League || event.eventType === 'LEAGUE'
);

const isSplitPlayoffLeague = (event: SchedulerEvent): event is League => (
  isLeagueEvent(event)
  && Boolean(event.splitLeaguePlayoffDivisions)
  && Array.isArray(event.playoffDivisions)
  && event.playoffDivisions.length > 0
);

const normalizeDivisionId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

const schedulingDivisionsForEvent = (event: SchedulerEvent): Division[] => {
  const divisions: Division[] = [...event.divisions];
  if (!isSplitPlayoffLeague(event)) {
    return divisions;
  }
  const seenIds = new Set(divisions.map((division) => division.id));
  for (const playoffDivision of event.playoffDivisions) {
    if (seenIds.has(playoffDivision.id)) {
      continue;
    }
    seenIds.add(playoffDivision.id);
    divisions.push(playoffDivision);
  }
  return divisions;
};

const ensureSplitPlayoffTimeSlotCoverage = (event: SchedulerEvent): void => {
  if (!isSplitPlayoffLeague(event) || !event.timeSlots.length) {
    return;
  }

  const playoffDivisionById = new Map<string, Division>();
  for (const playoffDivision of event.playoffDivisions) {
    const normalizedId = normalizeDivisionId(playoffDivision.id);
    if (!normalizedId) {
      continue;
    }
    playoffDivisionById.set(normalizedId, playoffDivision);
  }
  if (!playoffDivisionById.size) {
    return;
  }

  const mappedPlayoffIdsByDivisionId = new Map<string, Set<string>>();
  for (const division of event.divisions) {
    const sourceDivisionId = normalizeDivisionId(division.id);
    if (!sourceDivisionId) {
      continue;
    }
    for (const mappedPlayoffDivisionIdRaw of division.playoffPlacementDivisionIds ?? []) {
      const mappedPlayoffDivisionId = normalizeDivisionId(mappedPlayoffDivisionIdRaw);
      if (!mappedPlayoffDivisionId || !playoffDivisionById.has(mappedPlayoffDivisionId)) {
        continue;
      }
      const bucket = mappedPlayoffIdsByDivisionId.get(sourceDivisionId) ?? new Set<string>();
      bucket.add(mappedPlayoffDivisionId);
      mappedPlayoffIdsByDivisionId.set(sourceDivisionId, bucket);
    }
  }

  if (!mappedPlayoffIdsByDivisionId.size) {
    return;
  }

  for (const slot of event.timeSlots) {
    const existingDivisions = Array.isArray(slot.divisions) ? slot.divisions : [];
    if (!existingDivisions.length) {
      continue;
    }
    const normalizedSlotDivisionIds = new Set<string>();
    for (const division of existingDivisions) {
      const normalizedId = normalizeDivisionId(division?.id);
      if (normalizedId) {
        normalizedSlotDivisionIds.add(normalizedId);
      }
    }
    if (!normalizedSlotDivisionIds.size) {
      continue;
    }

    const nextDivisions: Division[] = [...existingDivisions];
    let changed = false;
    for (const divisionId of normalizedSlotDivisionIds) {
      const mappedPlayoffIds = mappedPlayoffIdsByDivisionId.get(divisionId);
      if (!mappedPlayoffIds) {
        continue;
      }
      for (const playoffDivisionId of mappedPlayoffIds) {
        if (normalizedSlotDivisionIds.has(playoffDivisionId)) {
          continue;
        }
        const playoffDivision = playoffDivisionById.get(playoffDivisionId);
        if (!playoffDivision) {
          continue;
        }
        nextDivisions.push(playoffDivision);
        normalizedSlotDivisionIds.add(playoffDivisionId);
        changed = true;
      }
    }

    if (changed) {
      slot.divisions = nextDivisions;
    }
  }
};

export type LockedScheduleWarning = {
  code: 'LOCKED_MATCH_OUTSIDE_WINDOW';
  message: string;
  matchIds: string[];
};

export type LockedPreservingRescheduleResult = {
  event: SchedulerEvent;
  matches: Match[];
  warnings: LockedScheduleWarning[];
};

const buildScheduleParticipants = (
  event: SchedulerEvent,
  schedulingDivisions: Division[],
): Record<string, Team | UserData> => {
  const participants: Record<string, Team | UserData> = { ...event.teams };
  for (const official of event.officials) {
    if (!official.divisions.length) {
      official.divisions = [...schedulingDivisions];
    }
    participants[official.id] = official;
  }
  return participants;
};

const resetScheduleCollections = (event: SchedulerEvent): void => {
  for (const field of Object.values(event.fields)) {
    field.matches = [];
  }
  for (const team of Object.values(event.teams)) {
    team.matches = [];
  }
  for (const official of event.officials) {
    official.matches = [];
  }
};

const appendMatchToParticipant = (participant: { matches?: Match[] } | null | undefined, match: Match): void => {
  if (!participant) {
    return;
  }
  if (!participant.matches) {
    participant.matches = [];
  }
  if (!participant.matches.includes(match)) {
    participant.matches.push(match);
  }
};

const attachMatchToParticipants = (match: Match): void => {
  for (const participant of match.getParticipants()) {
    appendMatchToParticipant(participant, match);
  }
};

const attachLockedMatchToField = (event: SchedulerEvent, match: Match): void => {
  if (!match.field) return;
  const field = event.fields[match.field.id] ?? null;
  match.field = field;
  if (!field) return;
  if (!field.matches.includes(match)) {
    field.matches.push(match);
  }
};

const compareMatches = (left: Match, right: Match): number => {
  const leftMatchId = left.matchId ?? Number.MAX_SAFE_INTEGER;
  const rightMatchId = right.matchId ?? Number.MAX_SAFE_INTEGER;
  if (leftMatchId !== rightMatchId) {
    return leftMatchId - rightMatchId;
  }
  const startDiff = left.start.getTime() - right.start.getTime();
  if (startDiff !== 0) return startDiff;
  const endDiff = left.end.getTime() - right.end.getTime();
  if (endDiff !== 0) return endDiff;
  return left.id.localeCompare(right.id);
};

const compareScheduledOrder = (left: Match, right: Match): number => {
  const startDiff = left.start.getTime() - right.start.getTime();
  if (startDiff !== 0) return startDiff;
  const endDiff = left.end.getTime() - right.end.getTime();
  if (endDiff !== 0) return endDiff;
  const fieldDiff = (left.field?.id ?? '').localeCompare(right.field?.id ?? '');
  if (fieldDiff !== 0) return fieldDiff;
  return left.id.localeCompare(right.id);
};

const durationForReschedule = (match: Match): number => {
  const durationMs = match.end.getTime() - match.start.getTime();
  if (durationMs >= MIN_SCHEDULE_DURATION_MS) {
    return durationMs;
  }
  return MIN_SCHEDULE_DURATION_MS;
};

const normalizeDayOfWeek = (date: Date): number => (date.getDay() + 6) % 7;

const minuteOfDay = (date: Date): number => date.getHours() * 60 + date.getMinutes();

const toValidDayIndex = (value: unknown): number | null => {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > 6) {
    return null;
  }
  return numeric;
};

const normalizeSlotDayIndexes = (slot: { daysOfWeek?: unknown; dayOfWeek?: unknown }): number[] => {
  const rawDays = Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length
    ? slot.daysOfWeek
    : [slot.dayOfWeek];
  return Array.from(
    new Set(
      rawDays
        .map((value) => toValidDayIndex(value))
        .filter((value): value is number => value !== null),
    ),
  );
};

const normalizeSlotFieldIds = (slot: {
  scheduledFieldIds?: unknown;
  fieldIds?: unknown;
  field?: unknown;
  scheduledFieldId?: unknown;
}): string[] => {
  const rawFieldIds = Array.isArray(slot.scheduledFieldIds) && slot.scheduledFieldIds.length
    ? slot.scheduledFieldIds
    : Array.isArray(slot.fieldIds) && slot.fieldIds.length
      ? slot.fieldIds
      : [slot.field ?? slot.scheduledFieldId];
  return Array.from(
    new Set(
      rawFieldIds
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0),
    ),
  );
};

const startOfDay = (date: Date): Date => {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
};

const slotAllowsField = (
  slot: {
    scheduledFieldIds?: unknown;
    fieldIds?: unknown;
    field?: unknown;
    scheduledFieldId?: unknown;
  },
  fieldId: string,
): boolean => {
  const allowedFieldIds = normalizeSlotFieldIds(slot);
  if (!allowedFieldIds.length) {
    return true;
  }
  return allowedFieldIds.includes(fieldId);
};

const slotAllowsDivision = (slot: { divisions?: Division[] }, divisionId: string): boolean => {
  if (!Array.isArray(slot.divisions) || !slot.divisions.length) {
    return true;
  }
  return slot.divisions.some((division) => division.id === divisionId);
};

const slotAllowsDate = (
  slot: { startDate: Date; endDate: Date | null },
  matchStart: Date,
): boolean => {
  const matchDayMs = startOfDay(matchStart).getTime();
  const slotStartMs = startOfDay(slot.startDate).getTime();
  if (matchDayMs < slotStartMs) return false;
  if (!slot.endDate) return true;
  const slotEndMs = startOfDay(slot.endDate).getTime();
  return matchDayMs <= slotEndMs;
};

const slotAllowsTime = (
  slot: {
    dayOfWeek?: number;
    daysOfWeek?: number[];
    startTimeMinutes: number;
    endTimeMinutes: number;
  },
  matchStart: Date,
  matchEnd: Date,
): boolean => {
  const allowedDays = normalizeSlotDayIndexes(slot);
  if (allowedDays.length && !allowedDays.includes(normalizeDayOfWeek(matchStart))) {
    return false;
  }
  if (startOfDay(matchStart).getTime() !== startOfDay(matchEnd).getTime()) {
    return false;
  }
  const startMinutes = minuteOfDay(matchStart);
  const endMinutes = minuteOfDay(matchEnd);
  return startMinutes >= slot.startTimeMinutes && endMinutes <= slot.endTimeMinutes;
};

const slotAllowsDateTime = (
  slot: {
    repeating?: boolean;
    startDate: Date;
    endDate: Date | null;
    dayOfWeek: number;
    startTimeMinutes: number;
    endTimeMinutes: number;
  },
  matchStart: Date,
  matchEnd: Date,
): boolean => {
  if (slot.repeating === false) {
    if (!(slot.startDate instanceof Date) || Number.isNaN(slot.startDate.getTime())) {
      return false;
    }
    if (!(slot.endDate instanceof Date) || Number.isNaN(slot.endDate.getTime())) {
      return false;
    }
    return matchStart.getTime() >= slot.startDate.getTime()
      && matchEnd.getTime() <= slot.endDate.getTime();
  }
  return slotAllowsDate(slot, matchStart) && slotAllowsTime(slot, matchStart, matchEnd);
};

const isOpenEndedSchedule = (event: SchedulerEvent): boolean => {
  if (typeof event.noFixedEndDateTime === 'boolean') {
    return event.noFixedEndDateTime;
  }
  return event.start.getTime() === event.end.getTime();
};

const resolveRescheduleEndTime = (event: SchedulerEvent): Date => {
  if (!isOpenEndedSchedule(event)) {
    return event.end;
  }
  const baseline = Math.max(event.start.getTime(), event.end.getTime());
  return new Date(baseline + OPEN_ENDED_RESCHEDULE_WEEKS * 7 * 24 * 60 * MINUTE_MS);
};

const lockedMatchFitsUpdatedWindow = (event: SchedulerEvent, rescheduleEndTime: Date, match: Match): boolean => {
  if (match.start.getTime() < event.start.getTime() || match.end.getTime() > rescheduleEndTime.getTime()) {
    return false;
  }
  if (!event.timeSlots.length) {
    return true;
  }
  if (!match.field) {
    return false;
  }
  return event.timeSlots.some((slot) =>
    slotAllowsField(slot, match.field?.id ?? '')
    && slotAllowsDivision(slot, match.division?.id ?? '')
    && slotAllowsDateTime(slot, match.start, match.end),
  );
};

const collectWarnings = (
  event: SchedulerEvent,
  lockedMatches: Match[],
  rescheduleEndTime: Date,
): LockedScheduleWarning[] => {
  if (!lockedMatches.length) return [];
  const outOfWindowIds = lockedMatches
    .filter((match) => !lockedMatchFitsUpdatedWindow(event, rescheduleEndTime, match))
    .map((match) => match.id);
  if (!outOfWindowIds.length) {
    return [];
  }
  const subject = outOfWindowIds.length === 1 ? 'Locked match is' : 'Locked matches are';
  const preservedVerb = outOfWindowIds.length === 1 ? 'was' : 'were';
  return [
    {
      code: 'LOCKED_MATCH_OUTSIDE_WINDOW',
      message: `${subject} outside the updated start/time-slot window and ${preservedVerb} preserved.`,
      matchIds: outOfWindowIds,
    },
  ];
};

const latestMatchEnd = (matches: Match[]): Date | null => {
  let latest: Date | null = null;
  for (const match of matches) {
    if (!latest || match.end.getTime() > latest.getTime()) {
      latest = match.end;
    }
  }
  return latest;
};

const isMatchCompleted = (match: Match): boolean => {
  if (!Array.isArray(match.setResults) || match.setResults.length === 0) {
    return false;
  }
  const team1Wins = match.setResults.filter((result) => result === 1).length;
  const team2Wins = match.setResults.filter((result) => result === 2).length;
  const setsToWin = Math.ceil(match.setResults.length / 2);
  return team1Wins >= setsToWin || team2Wins >= setsToWin;
};

const detachMatchFromParticipant = (participant: { matches?: Match[] } | null | undefined, match: Match): void => {
  if (!participant?.matches) {
    return;
  }
  participant.matches = participant.matches.filter((existing) => existing.id !== match.id);
};

type PendingDependencyAssignment = {
  match: Match;
  team1: Team | null;
  team2: Team | null;
  teamOfficial: Team | null;
  team1Seed: number | null;
  team2Seed: number | null;
};

const detachPendingDependencyAssignments = (match: Match): PendingDependencyAssignment => {
  const snapshot: PendingDependencyAssignment = {
    match,
    team1: match.team1,
    team2: match.team2,
    teamOfficial: match.teamOfficial,
    team1Seed: match.team1Seed ?? null,
    team2Seed: match.team2Seed ?? null,
  };
  detachMatchFromParticipant(match.team1, match);
  detachMatchFromParticipant(match.team2, match);
  detachMatchFromParticipant(match.teamOfficial, match);
  match.team1 = null;
  match.team2 = null;
  match.teamOfficial = null;
  return snapshot;
};

const restorePendingDependencyAssignments = (snapshot: PendingDependencyAssignment): void => {
  const { match } = snapshot;
  match.team1 = snapshot.team1;
  match.team2 = snapshot.team2;
  match.teamOfficial = snapshot.teamOfficial;
  match.team1Seed = snapshot.team1Seed;
  match.team2Seed = snapshot.team2Seed;
  attachMatchToParticipants(match);
};

const dependenciesAreScheduled = (match: Match, pendingIds: Set<string>): boolean => {
  for (const dependency of match.getDependencies()) {
    if (pendingIds.has(dependency.id)) {
      return false;
    }
  }
  return true;
};

const assignMissingUserOfficials = (
  event: SchedulerEvent,
  schedule: Schedule<Match, PlayingField, Team | UserData, Division>,
  matches: Match[],
): void => {
  if (!event.officials.length) {
    matches.forEach(attachMatchToParticipants);
    return;
  }
  const officialCycle = [...event.officials];
  const ordered = [...matches].sort(compareScheduledOrder);
  for (const match of ordered) {
    attachMatchToParticipants(match);
    if (match.official || !match.division) continue;
    const availableRefs = schedule
      .freeParticipants(match.division, match.start, match.end)
      .filter((participant) => participant instanceof UserData) as UserData[];
    if (!availableRefs.length || !officialCycle.length) continue;
    for (let i = 0; i < officialCycle.length; i += 1) {
      const candidate = officialCycle.shift() as UserData;
      if (availableRefs.some((available) => available.id === candidate.id)) {
        match.official = candidate;
        appendMatchToParticipant(candidate, match);
        attachMatchToParticipants(match);
        officialCycle.push(candidate);
        break;
      }
      officialCycle.push(candidate);
    }
  }
};

const assignMissingTeamOfficials = (
  event: SchedulerEvent,
  schedule: Schedule<Match, PlayingField, Team | UserData, Division>,
  matches: Match[],
): void => {
  if (!event.doTeamsOfficiate) {
    return;
  }
  const requireCaptains = isLeagueEvent(event);
  const teams = Object.values(event.teams).filter((team) => (
    requireCaptains ? team.captainId.trim().length > 0 : true
  ));
  const unassigned = [...teams];
  const ordered = [...matches].sort(compareScheduledOrder);
  for (const match of ordered) {
    attachMatchToParticipants(match);
    if (match.teamOfficial || !match.division || !(match.team1 && match.team2)) continue;
    const availableTeams = schedule
      .freeParticipants(match.division, match.start, match.end)
      .filter(
        (participant) => (
          participant instanceof Team
          && (requireCaptains ? participant.captainId.trim().length > 0 : true)
        ),
      ) as Team[];
    const filtered = availableTeams.filter((team) => team !== match.team1 && team !== match.team2);
    if (!filtered.length) continue;

    let candidate: Team | null = null;
    for (let i = 0; i < unassigned.length; i += 1) {
      const candidateTeam = unassigned[0];
      unassigned.push(unassigned.shift() as Team);
      if (filtered.includes(candidateTeam)) {
        candidate = candidateTeam;
        const idx = unassigned.indexOf(candidateTeam);
        if (idx >= 0) unassigned.splice(idx, 1);
        break;
      }
    }
    if (!candidate) {
      candidate = filtered[0] ?? null;
    }
    if (!candidate) continue;

    match.teamOfficial = candidate;
    appendMatchToParticipant(candidate, match);
    attachMatchToParticipants(match);
  }
};

export const rescheduleEventMatchesPreservingLocks = (
  event: SchedulerEvent,
): LockedPreservingRescheduleResult => {
  const allMatches = Object.values(event.matches);
  if (!allMatches.length) {
    return { event, matches: [], warnings: [] };
  }

  stripEventAvailabilityFromFieldRentalSlots(event);
  ensureSplitPlayoffTimeSlotCoverage(event);
  const schedulingDivisions = schedulingDivisionsForEvent(event);
  const rescheduleEndTime = resolveRescheduleEndTime(event);

  const lockedMatches = allMatches.filter((match) => match.locked);
  const warnings = collectWarnings(event, lockedMatches, rescheduleEndTime);
  resetScheduleCollections(event);

  for (const match of lockedMatches) {
    attachLockedMatchToField(event, match);
    attachMatchToParticipants(match);
  }

  const participants = buildScheduleParticipants(event, schedulingDivisions);
  const schedule = new Schedule<Match, PlayingField, Team | UserData, Division>(
    event.start,
    event.fields,
    participants,
    schedulingDivisions,
    event.start,
    { endTime: rescheduleEndTime, timeSlots: event.timeSlots },
  );

  const unlockedMatches = allMatches
    .filter((match) => !match.locked)
    .sort(compareMatches);
  const unlockedById = new Map(unlockedMatches.map((match) => [match.id, match]));
  const pendingIds = new Set(unlockedMatches.map((match) => match.id));
  const detachedPendingAssignments: PendingDependencyAssignment[] = [];

  for (const match of unlockedMatches) {
    const hasUnresolvedDependency = match.getDependencies().some((dependency) => !isMatchCompleted(dependency));
    if (hasUnresolvedDependency) {
      detachedPendingAssignments.push(detachPendingDependencyAssignments(match));
    }
    match.unschedule();
  }

  try {
    while (pendingIds.size > 0) {
      const readyMatches = unlockedMatches
        .filter((match) => pendingIds.has(match.id) && dependenciesAreScheduled(match, pendingIds))
        .sort(compareMatches);

      const nextBatch = readyMatches.length
        ? readyMatches
        : [unlockedById.get(Array.from(pendingIds.values())[0]) as Match];

      for (const match of nextBatch) {
        schedule.scheduleEvent(match, durationForReschedule(match));
        attachMatchToParticipants(match);
        pendingIds.delete(match.id);
      }
    }
  } finally {
    detachedPendingAssignments.forEach(restorePendingDependencyAssignments);
  }

  assignMissingUserOfficials(event, schedule, allMatches);
  assignMissingTeamOfficials(event, schedule, allMatches);

  const latestEnd = latestMatchEnd(allMatches);
  if (latestEnd) {
    event.end = latestEnd;
  }

  return {
    event,
    matches: allMatches.sort(compareMatches),
    warnings,
  };
};
