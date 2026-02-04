import type {
  Division,
  Event,
  Field,
  LeagueScoringConfig,
  Match,
  Organization,
  Sport,
  Team,
  TimeSlot,
  UserData,
} from '@/types';

type ApiEntity = {
  $id?: string | number | null;
  id?: string | number | null;
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

const withLegacyId = <T extends ApiEntity | null | undefined>(input: T): T => {
  if (!input || typeof input !== 'object') {
    return input;
  }
  const next = { ...(input as Record<string, unknown>) } as Record<string, unknown>;
  const id = normalizeId((next.$id as unknown) ?? next.id);
  if (id && !next.$id) {
    next.$id = id;
  }
  return next as T;
};

export const normalizeApiMatch = (input: Match): Match => {
  const match = withLegacyId(input) as Match & {
    field?: Field | string | null;
    team1?: Team | string | null;
    team2?: Team | string | null;
    referee?: UserData | string | null;
    teamReferee?: Team | string | null;
    division?: Division | string | null;
    previousLeftMatch?: Match | null;
    previousRightMatch?: Match | null;
    winnerNextMatch?: Match | null;
    loserNextMatch?: Match | null;
  };

  return {
    ...match,
    field: withLegacyId(match.field as Field | null) ?? match.field,
    team1: withLegacyId(match.team1 as Team | null) ?? match.team1,
    team2: withLegacyId(match.team2 as Team | null) ?? match.team2,
    referee: withLegacyId(match.referee as UserData | null) ?? match.referee,
    teamReferee: withLegacyId(match.teamReferee as Team | null) ?? match.teamReferee,
    division: withLegacyId(match.division as Division | null) ?? match.division,
    previousLeftMatch: withLegacyId(match.previousLeftMatch as Match | null) ?? match.previousLeftMatch,
    previousRightMatch: withLegacyId(match.previousRightMatch as Match | null) ?? match.previousRightMatch,
    winnerNextMatch: withLegacyId(match.winnerNextMatch as Match | null) ?? match.winnerNextMatch,
    loserNextMatch: withLegacyId(match.loserNextMatch as Match | null) ?? match.loserNextMatch,
  };
};

const normalizeApiTimeSlot = (input: TimeSlot): TimeSlot => {
  const slot = withLegacyId(input) as TimeSlot & { event?: Event | string; field?: Field | string };
  return {
    ...slot,
    event: withLegacyId(slot.event as Event | null) ?? slot.event,
    field: withLegacyId(slot.field as Field | null) ?? slot.field,
  };
};

const normalizeApiField = (input: Field): Field => {
  const field = withLegacyId(input) as Field & {
    organization?: Organization | string;
    matches?: Match[];
    rentalSlots?: TimeSlot[];
  };

  return {
    ...field,
    organization: withLegacyId(field.organization as Organization | null) ?? field.organization,
    matches: Array.isArray(field.matches) ? field.matches.map(normalizeApiMatch) : field.matches,
    rentalSlots: Array.isArray(field.rentalSlots)
      ? field.rentalSlots.map(normalizeApiTimeSlot)
      : field.rentalSlots,
  };
};

const normalizeApiTeam = (input: Team): Team => {
  const team = withLegacyId(input) as Team & {
    division?: Division | string;
    players?: UserData[];
    captain?: UserData | string;
    pendingPlayers?: UserData[];
    matches?: Match[];
  };

  return {
    ...team,
    division: withLegacyId(team.division as Division | null) ?? team.division,
    players: Array.isArray(team.players) ? team.players.map((player) => withLegacyId(player) as UserData) : team.players,
    captain: withLegacyId(team.captain as UserData | null) ?? team.captain,
    pendingPlayers: Array.isArray(team.pendingPlayers)
      ? team.pendingPlayers.map((player) => withLegacyId(player) as UserData)
      : team.pendingPlayers,
    matches: Array.isArray(team.matches) ? team.matches.map(normalizeApiMatch) : team.matches,
  };
};

export const normalizeApiEvent = (input?: Event | null): Event | null => {
  if (!input) {
    return null;
  }
  const event = withLegacyId(input) as Event & {
    sport?: Sport | string;
    organization?: Organization | string;
    leagueScoringConfig?: LeagueScoringConfig | string;
    teams?: Team[];
    fields?: Field[];
    timeSlots?: TimeSlot[];
    matches?: Match[];
    referees?: UserData[];
    players?: UserData[];
  };

  return {
    ...event,
    sport: withLegacyId(event.sport as Sport | null) ?? event.sport,
    organization: withLegacyId(event.organization as Organization | null) ?? event.organization,
    leagueScoringConfig:
      withLegacyId(event.leagueScoringConfig as LeagueScoringConfig | null) ?? event.leagueScoringConfig,
    teams: Array.isArray(event.teams) ? event.teams.map(normalizeApiTeam) : event.teams,
    fields: Array.isArray(event.fields) ? event.fields.map(normalizeApiField) : event.fields,
    timeSlots: Array.isArray(event.timeSlots) ? event.timeSlots.map(normalizeApiTimeSlot) : event.timeSlots,
    matches: Array.isArray(event.matches) ? event.matches.map(normalizeApiMatch) : event.matches,
    referees: Array.isArray(event.referees)
      ? event.referees.map((ref) => withLegacyId(ref) as UserData)
      : event.referees,
    players: Array.isArray(event.players)
      ? event.players.map((player) => withLegacyId(player) as UserData)
      : event.players,
  };
};

const ensureApiId = <T extends Record<string, unknown> | null | undefined>(input: T): T => {
  if (!input || typeof input !== 'object') {
    return input;
  }
  const next = { ...input } as Record<string, unknown>;
  const id = normalizeId(next.$id ?? next.id);
  if (id && !next.id) {
    next.id = id;
  }
  return next as T;
};

export const normalizeOutgoingEventDocument = (eventDocument: Record<string, unknown>): Record<string, unknown> => {
  if (!eventDocument || typeof eventDocument !== 'object') {
    return eventDocument;
  }
  const next: Record<string, unknown> = { ...eventDocument };
  const rootId = normalizeId(next.$id ?? next.id);
  if (rootId && !next.id) {
    next.id = rootId;
  }

  const mapCollection = (key: string) => {
    const value = next[key];
    if (Array.isArray(value)) {
      next[key] = value.map((entry) => ensureApiId(entry as Record<string, unknown>));
    }
  };

  mapCollection('matches');
  mapCollection('fields');
  mapCollection('teams');
  mapCollection('timeSlots');
  mapCollection('referees');
  mapCollection('players');

  return next;
};
