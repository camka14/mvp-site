import type {
  Division,
  Event,
  Facility,
  Field,
  LeagueScoringConfig,
  Match,
  Organization,
  Sport,
  Team,
  TimeSlot,
  UserData,
} from '@/types';
import { normalizeBracketSeed } from '@/lib/bracketSeeds';

type ApiEntity = {
  $id?: string | number | null;
  id?: string | number | null;
  $createdAt?: string | Date | null;
  createdAt?: string | Date | null;
  $updatedAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

const normalizeId = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
};

export const normalizeApiEntity = <T extends ApiEntity | null | undefined>(input: T): T => {
  if (!input || typeof input !== 'object') {
    return input;
  }
  const next = { ...(input as Record<string, unknown>) } as Record<string, unknown>;
  const id = normalizeId(next.id ?? (next.$id as unknown));
  if (id) {
    next.$id = id;
  }
  if (next.createdAt !== undefined) {
    next.$createdAt = next.createdAt;
  }
  if (next.updatedAt !== undefined) {
    next.$updatedAt = next.updatedAt;
  }
  return next as T;
};

export const normalizeApiMatch = (input: Match): Match => {
  const match = normalizeApiEntity(input) as Match & {
    field?: Field | string | null;
    team1?: Team | string | null;
    team2?: Team | string | null;
    official?: UserData | string | null;
    teamOfficial?: Team | string | null;
    division?: Division | string | null;
    previousLeftMatch?: Match | null;
    previousRightMatch?: Match | null;
    winnerNextMatch?: Match | null;
    loserNextMatch?: Match | null;
  };

  return {
    ...match,
    locked: Boolean((match as any).locked),
    team1Seed: normalizeBracketSeed((match as any).team1Seed),
    team2Seed: normalizeBracketSeed((match as any).team2Seed),
    segments: Array.isArray(match.segments)
      ? match.segments.map((segment) => normalizeApiEntity(segment))
      : match.segments,
    incidents: Array.isArray(match.incidents)
      ? match.incidents.map((incident) => normalizeApiEntity(incident))
      : match.incidents,
    field: normalizeApiEntity(match.field as Field | null) ?? match.field,
    team1: normalizeApiEntity(match.team1 as Team | null) ?? match.team1,
    team2: normalizeApiEntity(match.team2 as Team | null) ?? match.team2,
    official: normalizeApiEntity(match.official as UserData | null) ?? match.official,
    teamOfficial: normalizeApiEntity(match.teamOfficial as Team | null) ?? match.teamOfficial,
    division: normalizeApiEntity(match.division as Division | null) ?? match.division,
    previousLeftMatch: normalizeApiEntity(match.previousLeftMatch as Match | null) ?? match.previousLeftMatch,
    previousRightMatch: normalizeApiEntity(match.previousRightMatch as Match | null) ?? match.previousRightMatch,
    winnerNextMatch: normalizeApiEntity(match.winnerNextMatch as Match | null) ?? match.winnerNextMatch,
    loserNextMatch: normalizeApiEntity(match.loserNextMatch as Match | null) ?? match.loserNextMatch,
  };
};

export const normalizeApiTimeSlot = (input: TimeSlot): TimeSlot => {
  const slot = normalizeApiEntity(input) as TimeSlot & { event?: Event | string; field?: Field | string };
  const normalizedFieldIds: string[] = Array.from(
    new Set<string>(
      (Array.isArray((slot as any).scheduledFieldIds) && (slot as any).scheduledFieldIds.length
        ? (slot as any).scheduledFieldIds
        : slot.scheduledFieldId
          ? [slot.scheduledFieldId]
          : []
      )
        .map((value: unknown) => String(value).trim())
        .filter((value: string) => value.length > 0),
    ),
  );
  const normalizedDays = Array.from(
    new Set(
      (Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length
        ? slot.daysOfWeek
        : slot.dayOfWeek !== undefined
          ? [slot.dayOfWeek]
          : []
      )
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
    ),
  ) as Array<0 | 1 | 2 | 3 | 4 | 5 | 6>;

  return {
    ...slot,
    dayOfWeek: normalizedDays[0] ?? slot.dayOfWeek,
    daysOfWeek: normalizedDays,
    scheduledFieldId: normalizedFieldIds[0] ?? slot.scheduledFieldId,
    scheduledFieldIds: normalizedFieldIds,
    divisions: Array.isArray((slot as any).divisions)
      ? Array.from(
          new Set(
            ((slot as any).divisions as unknown[])
              .map((value) => String(value).trim().toLowerCase())
              .filter((value) => value.length > 0),
          ),
        )
      : [],
    event: normalizeApiEntity(slot.event as Event | null) ?? slot.event,
    field: normalizeApiEntity(slot.field as Field | null) ?? slot.field,
  };
};

export const normalizeApiField = (input: Field): Field => {
  const field = normalizeApiEntity(input) as Field & {
    organization?: Organization | string;
    facility?: Facility | string | null;
    matches?: Match[];
    rentalSlots?: TimeSlot[];
  };

  return {
    ...field,
    organization: normalizeApiEntity(field.organization as Organization | null) ?? field.organization,
    facility: normalizeApiEntity(field.facility as Facility | null) ?? field.facility,
    matches: Array.isArray(field.matches) ? field.matches.map(normalizeApiMatch) : field.matches,
    rentalSlots: Array.isArray(field.rentalSlots)
      ? field.rentalSlots.map(normalizeApiTimeSlot)
      : field.rentalSlots,
  };
};

export const normalizeApiTeam = (input: Team): Team => {
  const team = normalizeApiEntity(input) as Team & {
    division?: Division | string;
    players?: UserData[];
    captain?: UserData | string;
    pendingPlayers?: UserData[];
    matches?: Match[];
  };

  return {
    ...team,
    division: normalizeApiEntity(team.division as Division | null) ?? team.division,
    players: Array.isArray(team.players) ? team.players.map((player) => normalizeApiEntity(player) as UserData) : team.players,
    captain: normalizeApiEntity(team.captain as UserData | null) ?? team.captain,
    pendingPlayers: Array.isArray(team.pendingPlayers)
      ? team.pendingPlayers.map((player) => normalizeApiEntity(player) as UserData)
      : team.pendingPlayers,
    matches: Array.isArray(team.matches) ? team.matches.map(normalizeApiMatch) : team.matches,
  };
};

export const normalizeApiEvent = (input?: Event | null): Event | null => {
  if (!input) {
    return null;
  }
  const event = normalizeApiEntity(input) as Event & {
    sport?: Sport | string;
    organization?: Organization | string;
    leagueScoringConfig?: LeagueScoringConfig | string;
    teams?: Team[];
    fields?: Field[];
    timeSlots?: TimeSlot[];
    matches?: Match[];
    officials?: UserData[];
    players?: UserData[];
  };

  return {
    ...event,
    sport: normalizeApiEntity(event.sport as Sport | null) ?? event.sport,
    organization: normalizeApiEntity(event.organization as Organization | null) ?? event.organization,
    leagueScoringConfig:
      normalizeApiEntity(event.leagueScoringConfig as LeagueScoringConfig | null) ?? event.leagueScoringConfig,
    teams: Array.isArray(event.teams) ? event.teams.map(normalizeApiTeam) : event.teams,
    fields: Array.isArray(event.fields) ? event.fields.map(normalizeApiField) : event.fields,
    timeSlots: Array.isArray(event.timeSlots) ? event.timeSlots.map(normalizeApiTimeSlot) : event.timeSlots,
    matches: Array.isArray(event.matches) ? event.matches.map(normalizeApiMatch) : event.matches,
    officials: Array.isArray(event.officials)
      ? event.officials.map((official) => normalizeApiEntity(official) as UserData)
      : event.officials,
    players: Array.isArray(event.players)
      ? event.players.map((player) => normalizeApiEntity(player) as UserData)
      : event.players,
  };
};
