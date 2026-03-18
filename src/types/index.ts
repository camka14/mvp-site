import { formatDisplayDate, formatDisplayTime, parseLocalDateTime } from '@/lib/dateUtils';
import { normalizeEnumValue } from '@/lib/enumUtils';

// User types
export interface UserAccount {
  $id: string;
  email: string;
  name?: string;
  emailVerification?: boolean;
  phoneVerification?: boolean;
  prefs?: Record<string, any>;
}

// Division interface matching Python model
export type DivisionGender = 'M' | 'F' | 'C';
export type DivisionRatingType = 'AGE' | 'SKILL';
export type DivisionKind = 'LEAGUE' | 'PLAYOFF';

export interface DivisionType {
  id: string;
  name: string;
  ratingType: DivisionRatingType;
  sportKey?: string;
}

export interface Division {
  id: string;
  name: string;
  key?: string;
  kind?: DivisionKind;
  eventId?: string;
  organizationId?: string;
  sportId?: string;
  price?: number;
  maxParticipants?: number;
  playoffTeamCount?: number;
  playoffPlacementDivisionIds?: string[];
  standingsOverrides?: Record<string, number>;
  standingsConfirmedAt?: string;
  standingsConfirmedBy?: string;
  playoffConfig?: TournamentConfig;
  allowPaymentPlans?: boolean;
  installmentCount?: number;
  installmentDueDates?: string[];
  installmentAmounts?: number[];
  fieldIds?: string[];
  teamIds?: string[];
  skillLevel?: string;
  minRating?: number;
  maxRating?: number;
  divisionTypeId?: string;
  divisionTypeName?: string;
  ratingType?: DivisionRatingType;
  gender?: DivisionGender;
  ageCutoffDate?: string;
  ageCutoffLabel?: string;
  ageCutoffSource?: string;
}

export interface LeagueConfig {
  gamesPerOpponent: number;
  includePlayoffs: boolean;
  playoffTeamCount?: number;
  usesSets: boolean;
  matchDurationMinutes: number;
  restTimeMinutes?: number;
  setDurationMinutes?: number;
  setsPerMatch?: number;
  pointsToVictory?: number[];
}

export interface TournamentConfig {
  doubleElimination: boolean;
  winnerSetCount: number;
  loserSetCount: number;
  winnerBracketPointsToVictory: number[];
  loserBracketPointsToVictory: number[];
  prize: string;
  fieldCount: number;
  restTimeMinutes: number;
  usesSets: boolean;
  matchDurationMinutes: number;
  setDurationMinutes?: number;
}

export interface Sport {
  $id: string;
  name: string;
  usePointsForWin: boolean;
  usePointsForDraw: boolean;
  usePointsForLoss: boolean;
  usePointsForForfeitWin: boolean;
  usePointsForForfeitLoss: boolean;
  usePointsPerSetWin: boolean;
  usePointsPerSetLoss: boolean;
  usePointsPerGameWin: boolean;
  usePointsPerGameLoss: boolean;
  usePointsPerGoalScored: boolean;
  usePointsPerGoalConceded: boolean;
  useMaxGoalBonusPoints: boolean;
  useMinGoalBonusThreshold: boolean;
  usePointsForShutout: boolean;
  usePointsForCleanSheet: boolean;
  useApplyShutoutOnlyIfWin: boolean;
  usePointsPerGoalDifference: boolean;
  useMaxGoalDifferencePoints: boolean;
  usePointsPenaltyPerGoalDifference: boolean;
  usePointsForParticipation: boolean;
  usePointsForNoShow: boolean;
  usePointsForWinStreakBonus: boolean;
  useWinStreakThreshold: boolean;
  usePointsForOvertimeWin: boolean;
  usePointsForOvertimeLoss: boolean;
  useOvertimeEnabled: boolean;
  usePointsPerRedCard: boolean;
  usePointsPerYellowCard: boolean;
  usePointsPerPenalty: boolean;
  useMaxPenaltyDeductions: boolean;
  useMaxPointsPerMatch: boolean;
  useMinPointsPerMatch: boolean;
  useGoalDifferenceTiebreaker: boolean;
  useHeadToHeadTiebreaker: boolean;
  useTotalGoalsTiebreaker: boolean;
  useEnableBonusForComebackWin: boolean;
  useBonusPointsForComebackWin: boolean;
  useEnableBonusForHighScoringMatch: boolean;
  useHighScoringThreshold: boolean;
  useBonusPointsForHighScoringMatch: boolean;
  useEnablePenaltyUnsporting: boolean;
  usePenaltyPointsUnsporting: boolean;
  usePointPrecision: boolean;
  $createdAt: string;
  $updatedAt: string;
}

export interface LeagueScoringConfig {
  $id?: string;
  pointsForWin: number;
  pointsForDraw: number;
  pointsForLoss: number;
  pointsForForfeitWin: number;
  pointsForForfeitLoss: number;
  pointsPerSetWin: number;
  pointsPerSetLoss: number;
  pointsPerGameWin: number;
  pointsPerGameLoss: number;
  pointsPerGoalScored: number;
  pointsPerGoalConceded: number;
  maxGoalBonusPoints: number;
  minGoalBonusThreshold: number;
  pointsForShutout: number;
  pointsForCleanSheet: number;
  applyShutoutOnlyIfWin: boolean;
  pointsPerGoalDifference: number;
  maxGoalDifferencePoints: number;
  pointsPenaltyPerGoalDifference: number;
  pointsForParticipation: number;
  pointsForNoShow: number;
  pointsForWinStreakBonus: number;
  winStreakThreshold: number;
  pointsForOvertimeWin: number;
  pointsForOvertimeLoss: number;
  overtimeEnabled: boolean;
  pointsPerRedCard: number;
  pointsPerYellowCard: number;
  pointsPerPenalty: number;
  maxPenaltyDeductions: number;
  maxPointsPerMatch: number;
  minPointsPerMatch: number;
  goalDifferenceTiebreaker: boolean;
  headToHeadTiebreaker: boolean;
  totalGoalsTiebreaker: boolean;
  enableBonusForComebackWin: boolean;
  bonusPointsForComebackWin: number;
  enableBonusForHighScoringMatch: boolean;
  highScoringThreshold: number;
  bonusPointsForHighScoringMatch: number;
  enablePenaltyForUnsportingBehavior: boolean;
  penaltyPointsForUnsportingBehavior: number;
  pointPrecision: number;
  $createdAt: string;
  $updatedAt: string;
}

// Match interface for tournaments (matching Python model)
export interface Match {
  $id: string;
  matchId?: number;
  eventId?: string;
  fieldId?: string | null;
  locked?: boolean;
  team1Id?: string | null;
  team2Id?: string | null;
  refereeId?: string | null;
  teamRefereeId?: string | null;
  team1Points: number[];
  team2Points: number[];
  previousLeftId?: string | null;
  previousRightId?: string | null;
  winnerNextMatchId?: string | null;
  loserNextMatchId?: string | null;
  start: string | null;
  end: string | null;
  losersBracket?: boolean;
  setResults: number[];
  side?: string | null;
  refCheckedIn?: boolean;
  refereeCheckedIn?: boolean;
  team1Seed?: number | null;
  team2Seed?: number | null;
  teamRefereeSeed?: number | null;

  // Relationship fields - hydrated when selected via Queries
  division?: Division | string | null;
  field?: Field;
  referee?: UserData;
  teamReferee?: Team;
  team1?: Team;
  team2?: Team;

  // Match relationships
  previousLeftMatch?: Match;
  previousRightMatch?: Match;
  winnerNextMatch?: Match;
  loserNextMatch?: Match;

  $createdAt?: string;
  $updatedAt?: string;
}

type MatchRelationKeys =
  | 'division'
  | 'field'
  | 'referee'
  | 'teamReferee'
  | 'team1'
  | 'team2'
  | 'previousLeftMatch'
  | 'previousRightMatch'
  | 'winnerNextMatch'
  | 'loserNextMatch';

export type MatchPayload = Omit<Match, MatchRelationKeys> & {
  division?: string | null;
};

export interface TimeSlot {
  $id: string;
  dayOfWeek?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  daysOfWeek?: Array<0 | 1 | 2 | 3 | 4 | 5 | 6>;
  divisions?: string[];
  startTimeMinutes?: number;
  endTimeMinutes?: number;
  startDate?: string;
  endDate?: string | null;
  repeating: boolean;
  price?: number;
  requiredTemplateIds?: string[];
  rentalDocumentTemplateId?: string | null;
  rentalDocumentTemplateIds?: string[];
  event?: Event;
  eventId?: string;
  field?: Field;
  scheduledFieldId?: string;
  scheduledFieldIds?: string[];
}

export type TimeSlotPayload = Omit<TimeSlot, 'event'>;

export interface UserData {
  $id: string;
  firstName: string;
  lastName: string;
  displayName?: string;
  dateOfBirth?: string;
  isMinor?: boolean;
  isIdentityHidden?: boolean;
  dobVerified?: boolean;
  dobVerifiedAt?: string;
  ageVerificationProvider?: string;
  teamIds: string[];
  friendIds: string[];
  friendRequestIds: string[];
  friendRequestSentIds: string[];
  followingIds: string[];
  userName: string;
  hasStripeAccount?: boolean;
  uploadedImages: string[];
  profileImageId?: string;
  homePageOrganizationId?: string | null;
  stripeAccountId?: string | null;
  $createdAt?: string;
  $updatedAt?: string;

  // Computed properties
  fullName: string;
  avatarUrl: string;
}

export type StaffMemberType = 'HOST' | 'REFEREE' | 'STAFF';
export type InviteType = 'STAFF' | 'TEAM' | 'EVENT';
export type InviteStatus = 'PENDING' | 'DECLINED' | 'FAILED';

export interface StaffMember {
  $id: string;
  organizationId: string;
  userId: string;
  types: StaffMemberType[];
  user?: UserData;
  invite?: Invite | null;
  $createdAt?: string;
  $updatedAt?: string;
}

export interface Invite {
  $id: string;
  type: InviteType;
  email?: string;
  status?: InviteStatus;
  staffTypes?: StaffMemberType[];
  userId?: string | null;
  eventId?: string | null;
  organizationId?: string | null;
  teamId?: string | null;
  createdBy?: string | null;
  firstName?: string;
  lastName?: string;
  $createdAt?: string;
  $updatedAt?: string;
}

export interface SensitiveUserData {
  $id: string;
  userId: string;
  email: string;
  $createdAt?: string;
  $updatedAt?: string;
}

// Updated Field interface
export interface Field {
  $id: string;
  name: string;
  location: string;
  lat: number;
  long: number;
  fieldNumber: number;
  heading?: number;
  inUse?: boolean;
  rentalSlotIds?: string[];

  // Relationships
  divisions?: (Division | string)[];
  matches?: Match[];
  events?: Event[];
  organization?: Organization;
  rentalSlots?: TimeSlot[];
}

export type EventType = 'EVENT' | 'TOURNAMENT' | 'LEAGUE' | 'WEEKLY_EVENT';

type FieldRelationKeys = 'matches' | 'events' | 'organization' | 'rentalSlots' | 'rentalSlotIds';

export type FieldPayload = Omit<Field, FieldRelationKeys> & {
  divisions?: string[];
  matchIds?: string[];
  eventIds?: string[];
  organizationId?: string;
  rentalSlotIds?: string[];
};

export interface Team {
  $id: string;
  name: string;
  division: Division | string; // Can be expanded or just ID
  divisionTypeId?: string;
  divisionTypeName?: string;
  sport: string;
  playerIds: string[];
  captainId: string;
  managerId?: string;
  headCoachId?: string | null;
  assistantCoachIds?: string[];
  // Legacy alias used by older clients; mirrors assistantCoachIds.
  coachIds?: string[];
  parentTeamId?: string | null;
  pending: string[];
  teamSize: number;
  profileImageId?: string;
  $createdAt?: string;
  $updatedAt?: string;
  // Expanded relationships
  players?: UserData[];
  captain?: UserData;
  manager?: UserData;
  headCoach?: UserData;
  assistantCoaches?: UserData[];
  // Legacy alias used by older clients; mirrors assistantCoaches.
  coaches?: UserData[];
  pendingPlayers?: UserData[];
  matches?: Match[]; // Tournament matches this team participates in
  // Computed properties
  currentSize: number;
  isFull: boolean;
  avatarUrl: string;
}

export type TeamPayload = Omit<Team, 'matches'> & {
  matchIds?: string[];
};

// Core Event interface with relationships
export interface Event {
  $id: string;
  name: string;
  description: string;
  start: string;
  end: string | null;
  location: string;
  coordinates: [number, number];
  price: number;
  minAge?: number;
  maxAge?: number;
  rating?: number;
  imageId: string;
  hostId: string;
  noFixedEndDateTime?: boolean;
  state: EventState;
  maxParticipants: number;
  teamSizeLimit: number;
  restTimeMinutes?: number;
  teamSignup: boolean;
  singleDivision: boolean;
  waitListIds: string[];
  freeAgentIds: string[];
  teamIds?: string[];
  userIds?: string[];
  fieldIds?: string[];
  timeSlotIds?: string[];
  refereeIds?: string[];
  assistantHostIds?: string[];
  waitList?: string[];
  freeAgents?: string[];
  cancellationRefundHours: number;
  registrationCutoffHours: number;
  seedColor: number;
  $createdAt: string;
  $updatedAt: string;
  eventType: EventType;
  sport: Sport;
  sportId?: string;
  leagueScoringConfigId?: string | null;
  organizationId?: string | null;
  parentEvent?: string | null;
  organization?: Organization | string;
  requiredTemplateIds?: string[];
  divisionFieldIds?: Record<string, string[]>;
  allowPaymentPlans?: boolean;
  installmentCount?: number;
  installmentDueDates?: string[];
  installmentAmounts?: number[];
  allowTeamSplitDefault?: boolean;
  registrationByDivisionType?: boolean;
  splitLeaguePlayoffDivisions?: boolean;

  // Relationship fields - can be IDs or expanded objects
  divisions: Division[] | string[];
  divisionDetails?: Division[];
  playoffDivisionDetails?: Division[];
  timeSlots?: TimeSlot[];

  // Tournament-specific fields
  doubleElimination?: boolean;
  winnerSetCount?: number;
  loserSetCount?: number;
  winnerBracketPointsToVictory?: number[];
  loserBracketPointsToVictory?: number[];
  prize?: string;
  fieldCount?: number;
  fields?: Field[];
  matches?: Match[];
  teams?: Team[];
  players?: UserData[];
  referees?: UserData[];
  assistantHosts?: UserData[];
  staffInvites?: Invite[];

  // League-specific fields (flattened for DB compatibility)
  gamesPerOpponent?: number;
  includePlayoffs?: boolean;
  playoffTeamCount?: number;
  usesSets?: boolean;
  matchDurationMinutes?: number;
  setDurationMinutes?: number;
  setsPerMatch?: number;
  doTeamsRef?: boolean;
  teamRefsMaySwap?: boolean;
  refType?: string;
  pointsToVictory?: number[];
  status?: EventStatus;
  leagueConfig?: LeagueConfig;
  leagueScoringConfig?: LeagueScoringConfig | null;

  // Computed properties
  attendees: number;
}

export type EventPayload = Omit<Event, 'fields' | 'matches' | 'teams' | 'timeSlots' | 'organization' | 'attendees' | 'referees' | 'assistantHosts' | 'staffInvites'> & {
  fields?: FieldPayload[];
  matches?: MatchPayload[];
  teams?: TeamPayload[];
  timeSlots?: TimeSlotPayload[];
  organization?: string | null;
};

export interface TournamentBracket {
  tournament: Event;
  matches: Record<string, Match>;
  teams: Team[];
  isHost: boolean;
  canManage: boolean;
}

// Organization interfaces
export interface Organization {
  $id: string;
  name: string;
  description?: string;
  website?: string;
  sports?: string[];
  logoId?: string;
  location?: string;
  coordinates?: [number, number];
  ownerId?: string;
  hostIds?: string[];
  hasStripeAccount?: boolean;
  fieldIds?: string[];
  refIds?: string[];
  staffMembers?: StaffMember[];
  staffInvites?: Invite[];
  staffEmailsByUserId?: Record<string, string>;
  productIds?: string[];
  teamIds?: string[];
  $createdAt?: string;
  $updatedAt?: string;

  // Relationships
  events?: Event[];
  teams?: Team[];
  fields?: Field[];
  referees?: UserData[];
  hosts?: UserData[];
  owner?: UserData;
  products?: Product[];
}

export type TemplateDocumentType = 'PDF' | 'TEXT';
export type TemplateRequiredSignerType =
  | 'PARTICIPANT'
  | 'PARENT_GUARDIAN'
  | 'CHILD'
  | 'PARENT_GUARDIAN_CHILD';

export interface TemplateDocument {
  $id: string;
  templateId?: string;
  organizationId: string;
  title: string;
  description?: string;
  signOnce: boolean;
  status?: string;
  roleIndex?: number;
  roleIndexes?: number[];
  signerRoles?: string[];
  requiredSignerType?: TemplateRequiredSignerType;
  type?: TemplateDocumentType;
  content?: string;
  $createdAt?: string;
}

export type ProductPeriod = 'week' | 'month' | 'year';

export interface Product {
  $id: string;
  organizationId: string;
  name: string;
  description?: string;
  priceCents: number;
  period: ProductPeriod;
  createdBy?: string;
  isActive?: boolean;
  $createdAt?: string;
}

export interface Subscription {
  $id: string;
  productId: string;
  userId: string;
  organizationId?: string;
  startDate: string;
  priceCents: number;
  period: ProductPeriod;
  status?: 'ACTIVE' | 'CANCELLED';
}

export interface RefundRequest {
  $id: string;
  eventId: string;
  userId: string;
  hostId?: string;
  teamId?: string;
  organizationId?: string;
  reason: string;
  status?: 'WAITING' | 'APPROVED' | 'REJECTED';
  $createdAt?: string;
  $updatedAt?: string;
}

export enum Sports {
  IndoorVolleyball = 'Indoor Volleyball',
  BeachVolleyball = 'Beach Volleyball',
  GrassVolleyball = 'Grass Volleyball',
  IndoorSoccer = 'Indoor Soccer',
  BeachSoccer = 'Beach Soccer',
  GrassSoccer = 'Grass Soccer',
  Basketball = 'Basketball',
  Tennis = 'Tennis',
  Pickleball = 'Pickleball',
  Football = 'Football',
  Hockey = 'Hockey',
  Baseball = 'Baseball',
  Other = 'Other',
}

export const SPORTS_LIST: string[] = Object.values(Sports);

export type EventState = 'PUBLISHED' | 'UNPUBLISHED' | 'TEMPLATE' | 'DRAFT';

export type EventStatus = 'draft' | 'published' | 'archived' | 'cancelled' | 'completed';

export interface CreateLeagueFnInput {
  eventId: string;
  dryRun?: boolean;
}

export interface LocationCoordinates {
  lat: number;
  lng: number;
}

export interface LocationInfo extends LocationCoordinates {
  city?: string;
  state?: string;
  country?: string;
  zipCode?: string;
}

const extractId = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as { $id?: unknown; id?: unknown };
  if (typeof candidate.$id === 'string' && candidate.$id.length > 0) {
    return candidate.$id;
  }
  if (typeof candidate.id === 'string' && candidate.id.length > 0) {
    return candidate.id;
  }
  return undefined;
};

const uniqueIds = (values: (string | undefined | null)[]): string[] => {
  const seen = new Set<string>();
  values.forEach((value) => {
    if (typeof value === 'string' && value.length > 0) {
      seen.add(value);
    }
  });
  return Array.from(seen);
};

const normalizeTournamentConfigForPayload = (value: unknown): TournamentConfig | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const row = value as Record<string, unknown>;
  const hasConfigValue = [
    'doubleElimination',
    'winnerSetCount',
    'loserSetCount',
    'winnerBracketPointsToVictory',
    'loserBracketPointsToVictory',
    'prize',
    'fieldCount',
    'restTimeMinutes',
    'usesSets',
    'matchDurationMinutes',
    'setDurationMinutes',
  ].some((key) => Object.prototype.hasOwnProperty.call(row, key) && row[key] !== null && row[key] !== undefined);
  if (!hasConfigValue) {
    return undefined;
  }

  const normalizeNumber = (input: unknown, fallback: number, min: number = 0): number => {
    const parsed = typeof input === 'number' ? input : Number(input);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(min, Math.trunc(parsed));
  };

  const normalizePoints = (input: unknown, expectedLength: number): number[] => {
    const values = Array.isArray(input)
      ? input
          .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
          .filter((entry) => Number.isFinite(entry))
          .map((entry) => Math.max(1, Math.trunc(entry)))
      : [];
    const next = values.slice(0, expectedLength);
    while (next.length < expectedLength) {
      next.push(21);
    }
    return next;
  };

  const winnerSetCount = normalizeNumber(row.winnerSetCount, 1, 1);
  const doubleElimination = Boolean(row.doubleElimination);
  const loserSetCount = normalizeNumber(row.loserSetCount, 1, 1);
  const normalizedLoserSetCount = doubleElimination ? loserSetCount : 1;
  const usesSets = Boolean(row.usesSets);

  return {
    doubleElimination,
    winnerSetCount,
    loserSetCount: normalizedLoserSetCount,
    winnerBracketPointsToVictory: normalizePoints(row.winnerBracketPointsToVictory, winnerSetCount),
    loserBracketPointsToVictory: normalizePoints(row.loserBracketPointsToVictory, normalizedLoserSetCount),
    prize: typeof row.prize === 'string' ? row.prize : '',
    fieldCount: normalizeNumber(row.fieldCount, 1, 1),
    restTimeMinutes: normalizeNumber(row.restTimeMinutes, 0, 0),
    usesSets,
    matchDurationMinutes: normalizeNumber(row.matchDurationMinutes, 60, 0),
    setDurationMinutes: usesSets ? normalizeNumber(row.setDurationMinutes, 20, 0) : undefined,
  };
};

export function toMatchPayload(match: Match): MatchPayload {
  const {
    division,
    field,
    referee,
    teamReferee,
    team1,
    team2,
    previousLeftMatch,
    previousRightMatch,
    winnerNextMatch,
    loserNextMatch,
    ...base
  } = match;

  const payload: MatchPayload = {
    ...base,
  };

  const divisionId = extractId(division);
  if (divisionId) {
    payload.division = divisionId;
  }

  if (payload.fieldId == null) {
    const fieldId = extractId(field);
    if (fieldId) {
      payload.fieldId = fieldId;
    }
  }

  if (payload.refereeId == null) {
    const refereeId = extractId(referee);
    if (refereeId) {
      payload.refereeId = refereeId;
    }
  }

  if (payload.teamRefereeId == null) {
    const teamRefereeId = extractId(teamReferee);
    if (teamRefereeId) {
      payload.teamRefereeId = teamRefereeId;
    }
  }

  if (payload.team1Id == null) {
    const team1Id = extractId(team1);
    if (team1Id) {
      payload.team1Id = team1Id;
    }
  }

  if (payload.team2Id == null) {
    const team2Id = extractId(team2);
    if (team2Id) {
      payload.team2Id = team2Id;
    }
  }

  if (!payload.previousLeftId) {
    const previousLeftId = extractId(previousLeftMatch);
    if (previousLeftId) {
      payload.previousLeftId = previousLeftId;
    }
  }

  if (!payload.previousRightId) {
    const previousRightId = extractId(previousRightMatch);
    if (previousRightId) {
      payload.previousRightId = previousRightId;
    }
  }

  if (!payload.winnerNextMatchId) {
    const winnerNextId = extractId(winnerNextMatch);
    if (winnerNextId) {
      payload.winnerNextMatchId = winnerNextId;
    }
  }

  if (!payload.loserNextMatchId) {
    const loserNextId = extractId(loserNextMatch);
    if (loserNextId) {
      payload.loserNextMatchId = loserNextId;
    }
  }

  return payload;
}

export function toFieldPayload(field: Field, matchIdsByField?: Map<string, string[]>): FieldPayload {
  const {
    divisions,
    matches,
    events,
    organization,
    rentalSlots,
    rentalSlotIds,
    ...base
  } = field;

  const payload: FieldPayload = {
    ...base,
  };

  const divisionIds = Array.isArray(divisions)
    ? uniqueIds(
        divisions.map((divisionEntry) =>
          typeof divisionEntry === 'string' ? divisionEntry : extractId(divisionEntry),
        ),
      )
    : [];
  if (divisionIds.length) {
    payload.divisions = divisionIds;
  }

  const matchIdSet = new Set<string>();
  if (Array.isArray(matches)) {
    matches.forEach((matchEntry) => {
      const id = extractId(matchEntry);
      if (id) {
        matchIdSet.add(id);
      }
    });
  }
  if (field.$id && matchIdsByField?.has(field.$id)) {
    matchIdsByField.get(field.$id)?.forEach((id) => {
      if (id) {
        matchIdSet.add(id);
      }
    });
  }
  if (matchIdSet.size) {
    payload.matchIds = Array.from(matchIdSet);
  }

  const eventIds = Array.isArray(events)
    ? uniqueIds(events.map((eventEntry) => extractId(eventEntry)))
    : [];
  if (eventIds.length) {
    payload.eventIds = eventIds;
  }

  const organizationId = extractId(organization);
  if (organizationId) {
    payload.organizationId = organizationId;
  }

  return payload;
}

export function toEventPayload(event: Event): EventPayload {
  const { matches, fields, teams, timeSlots, organization, referees, assistantHosts, ...rest } = event;

  const matchPayloads = Array.isArray(matches) && matches.length
    ? matches.map(toMatchPayload)
    : undefined;

  const matchIdsByField = new Map<string, string[]>();
  matchPayloads?.forEach((match) => {
    if (!match.$id) {
      return;
    }
    const fieldId = typeof match.fieldId === 'string' && match.fieldId.length > 0 ? match.fieldId : undefined;
    if (!fieldId) {
      return;
    }
    const bucket = matchIdsByField.get(fieldId) ?? [];
    bucket.push(match.$id);
    matchIdsByField.set(fieldId, bucket);
  });

  const fieldPayloads = Array.isArray(fields) && fields.length
    ? fields.map((field) => toFieldPayload(field, matchIdsByField))
    : undefined;

  const teamPayloads = Array.isArray(teams) && teams.length
    ? teams.map((team) => {
        const { matches: teamMatches, ...teamRest } = team;
        const teamMatchIds = Array.isArray(teamMatches)
          ? uniqueIds(teamMatches.map((teamMatch) => extractId(teamMatch)))
          : [];
        const teamPayload: TeamPayload = {
          ...teamRest,
        };
        if (teamMatchIds.length) {
          teamPayload.matchIds = teamMatchIds;
        }
        return teamPayload;
      })
    : undefined;

  const normalizeSlotDays = (
    slot: Pick<TimeSlot, 'dayOfWeek' | 'daysOfWeek'>,
  ): Array<0 | 1 | 2 | 3 | 4 | 5 | 6> => {
    const rawValues = Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length
      ? slot.daysOfWeek
      : slot.dayOfWeek !== undefined
        ? [slot.dayOfWeek]
        : [];
    return Array.from(
      new Set(
        rawValues
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
      ),
    ) as Array<0 | 1 | 2 | 3 | 4 | 5 | 6>;
  };

  const timeSlotPayloads = Array.isArray(timeSlots) && timeSlots.length
    ? timeSlots.map((slot) => {
        const { event: slotEvent, ...slotRest } = slot;
        const normalizedDays = normalizeSlotDays(slot);
        return {
          ...slotRest,
          dayOfWeek: normalizedDays[0] ?? slot.dayOfWeek,
          daysOfWeek: normalizedDays,
        };
      })
    : undefined;

  const resolvedOrganizationId =
    extractId(organization) ??
    (typeof rest.organizationId === 'string' ? rest.organizationId : undefined);

  const payload: EventPayload = {
    ...rest,
  };

  const divisionIds = Array.isArray(rest.divisions)
    ? uniqueIds(
        rest.divisions.map((divisionEntry) =>
          typeof divisionEntry === 'string' ? divisionEntry : extractId(divisionEntry),
        ),
      )
    : [];
  if (divisionIds.length) {
    payload.divisions = divisionIds;
  } else if (Array.isArray(payload.divisions)) {
    payload.divisions = uniqueIds((payload.divisions as unknown[]).map((entry) => String(entry)));
  }

  const explicitDivisionDetails = (rest as { divisionDetails?: Array<Division | string> }).divisionDetails;
  if (Array.isArray(explicitDivisionDetails)) {
    payload.divisionDetails = explicitDivisionDetails
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }
        const id = extractId(entry);
        if (!id) {
          return null;
        }
        const division = entry as Division;
        const hasTeamIds = Object.prototype.hasOwnProperty.call(division, 'teamIds');
        return {
          id,
          name: typeof division.name === 'string' ? division.name : id,
          key: typeof division.key === 'string' ? division.key : undefined,
          kind:
            division.kind === 'PLAYOFF' || division.kind === 'LEAGUE'
              ? division.kind
              : undefined,
          divisionTypeId:
            typeof division.divisionTypeId === 'string' ? division.divisionTypeId : undefined,
          divisionTypeName:
            typeof division.divisionTypeName === 'string' ? division.divisionTypeName : undefined,
          ratingType:
            division.ratingType === 'AGE' || division.ratingType === 'SKILL'
              ? division.ratingType
              : undefined,
          gender:
            division.gender === 'M' || division.gender === 'F' || division.gender === 'C'
              ? division.gender
              : undefined,
          sportId: typeof division.sportId === 'string' ? division.sportId : undefined,
          fieldIds: Array.isArray(division.fieldIds)
            ? uniqueIds(division.fieldIds.map((fieldId) => String(fieldId)))
            : [],
          ...(hasTeamIds
            ? {
                teamIds: Array.isArray(division.teamIds)
                  ? uniqueIds(division.teamIds.map((teamId) => String(teamId)))
                  : [],
              }
            : {}),
          ageCutoffDate: typeof division.ageCutoffDate === 'string' ? division.ageCutoffDate : undefined,
          ageCutoffLabel: typeof division.ageCutoffLabel === 'string' ? division.ageCutoffLabel : undefined,
          ageCutoffSource: typeof division.ageCutoffSource === 'string' ? division.ageCutoffSource : undefined,
          price:
            typeof division.price === 'number'
              ? division.price
              : Number.isFinite(Number(division.price))
                ? Number(division.price)
                : undefined,
          maxParticipants:
            typeof division.maxParticipants === 'number'
              ? division.maxParticipants
              : Number.isFinite(Number(division.maxParticipants))
                ? Number(division.maxParticipants)
                : undefined,
          playoffTeamCount:
            typeof division.playoffTeamCount === 'number'
              ? division.playoffTeamCount
              : Number.isFinite(Number(division.playoffTeamCount))
                ? Number(division.playoffTeamCount)
                : undefined,
          playoffPlacementDivisionIds: Array.isArray(division.playoffPlacementDivisionIds)
            ? division.playoffPlacementDivisionIds.map((divisionId) => String(divisionId ?? '').trim())
            : undefined,
          standingsOverrides:
            division.standingsOverrides && typeof division.standingsOverrides === 'object'
              ? { ...division.standingsOverrides }
              : undefined,
          standingsConfirmedAt:
            typeof division.standingsConfirmedAt === 'string' ? division.standingsConfirmedAt : undefined,
          standingsConfirmedBy:
            typeof division.standingsConfirmedBy === 'string' ? division.standingsConfirmedBy : undefined,
          playoffConfig: normalizeTournamentConfigForPayload(
            Object.prototype.hasOwnProperty.call(division, 'playoffConfig')
              ? (division as unknown as { playoffConfig?: unknown }).playoffConfig
              : undefined,
          ),
          allowPaymentPlans:
            typeof division.allowPaymentPlans === 'boolean'
              ? division.allowPaymentPlans
              : undefined,
          installmentCount:
            typeof division.installmentCount === 'number'
              ? division.installmentCount
              : Number.isFinite(Number(division.installmentCount))
                ? Number(division.installmentCount)
                : undefined,
          installmentDueDates: Array.isArray(division.installmentDueDates)
            ? division.installmentDueDates
                .map((entry) => (typeof entry === 'string' ? entry : String(entry)))
                .filter((entry) => entry.trim().length > 0)
            : undefined,
          installmentAmounts: Array.isArray(division.installmentAmounts)
            ? division.installmentAmounts
                .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
                .filter((entry) => Number.isFinite(entry))
            : undefined,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  }

  const explicitPlayoffDivisionDetails = (rest as { playoffDivisionDetails?: Array<Division | string> }).playoffDivisionDetails;
  if (Array.isArray(explicitPlayoffDivisionDetails)) {
    payload.playoffDivisionDetails = explicitPlayoffDivisionDetails
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }
        const id = extractId(entry);
        if (!id) {
          return null;
        }
        const division = entry as Division;
        const hasTeamIds = Object.prototype.hasOwnProperty.call(division, 'teamIds');
        const playoffConfig = normalizeTournamentConfigForPayload(
          Object.prototype.hasOwnProperty.call(division, 'playoffConfig')
            ? (division as unknown as { playoffConfig?: unknown }).playoffConfig
            : division,
        );
        return {
          id,
          name: typeof division.name === 'string' ? division.name : id,
          key: typeof division.key === 'string' ? division.key : undefined,
          kind: 'PLAYOFF' as const,
          maxParticipants:
            typeof division.maxParticipants === 'number'
              ? division.maxParticipants
              : Number.isFinite(Number(division.maxParticipants))
                ? Number(division.maxParticipants)
                : undefined,
          playoffTeamCount:
            typeof division.playoffTeamCount === 'number'
              ? division.playoffTeamCount
              : Number.isFinite(Number(division.playoffTeamCount))
                ? Number(division.playoffTeamCount)
                : undefined,
          ...(hasTeamIds
            ? {
                teamIds: Array.isArray(division.teamIds)
                  ? uniqueIds(division.teamIds.map((teamId) => String(teamId)))
                  : [],
              }
            : {}),
          playoffConfig,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  }

  const hasExplicitReferees = Object.prototype.hasOwnProperty.call(rest, 'refereeIds');
  const explicitRefereeIds = Array.isArray(rest.refereeIds)
    ? uniqueIds(rest.refereeIds.map((id) => (typeof id === 'string' ? id : extractId(id))))
    : [];
  if (hasExplicitReferees) {
    payload.refereeIds = explicitRefereeIds;
  } else if (Array.isArray(referees)) {
    const derivedRefereeIds = uniqueIds(referees.map((referee) => extractId(referee)));
    if (derivedRefereeIds.length) {
      payload.refereeIds = derivedRefereeIds;
    }
  }

  const hasExplicitAssistantHosts = Object.prototype.hasOwnProperty.call(rest, 'assistantHostIds');
  const explicitAssistantHostIds = Array.isArray(rest.assistantHostIds)
    ? uniqueIds(rest.assistantHostIds.map((id) => (typeof id === 'string' ? id : extractId(id))))
    : [];
  if (hasExplicitAssistantHosts) {
    payload.assistantHostIds = explicitAssistantHostIds;
  } else if (Array.isArray(assistantHosts)) {
    const derivedAssistantHostIds = uniqueIds(assistantHosts.map((host) => extractId(host)));
    if (derivedAssistantHostIds.length) {
      payload.assistantHostIds = derivedAssistantHostIds;
    }
  }

  const normalizedEventType = normalizeEnumValue(payload.eventType);
  if (normalizedEventType) {
    payload.eventType = normalizedEventType as EventType;
  }

  if (typeof payload.doTeamsRef === 'boolean' && payload.doTeamsRef !== true) {
    payload.teamRefsMaySwap = false;
  } else if (typeof payload.teamRefsMaySwap === 'boolean') {
    payload.teamRefsMaySwap = Boolean(payload.teamRefsMaySwap);
  }

  if (payload.eventType && payload.eventType !== 'LEAGUE') {
    delete payload.leagueScoringConfig;
    delete payload.leagueScoringConfigId;
  }

  if (resolvedOrganizationId) {
    payload.organization = resolvedOrganizationId;
    payload.organizationId = resolvedOrganizationId;
  } else if (typeof payload.organizationId === 'undefined') {
    payload.organizationId = null;
  }

  if (matchPayloads?.length) {
    payload.matches = matchPayloads;
  }

  if (fieldPayloads?.length) {
    payload.fields = fieldPayloads;
  }

  if (teamPayloads?.length) {
    payload.teams = teamPayloads;
  }

  if (timeSlotPayloads?.length) {
    payload.timeSlots = timeSlotPayloads;
  }

  return payload;
}

export function getUserFullName(user: UserData): string {
  const explicitDisplayName = user.displayName?.trim();
  if (explicitDisplayName) {
    return explicitDisplayName;
  }

  const fullName = `${user.firstName} ${user.lastName}`.trim();
  if (fullName) {
    return fullName;
  }

  if (user.isIdentityHidden) {
    return 'Name Hidden';
  }

  const fallbackHandle = user.userName?.trim();
  return fallbackHandle || 'User';
}

export function isUserSocialInteractionRestricted(user: UserData): boolean {
  return Boolean(user.isMinor || user.isIdentityHidden);
}

export function getUserHandle(
  user: Pick<UserData, 'userName' | 'isIdentityHidden'> | null | undefined,
  options: { includeAt?: boolean; showWhenHidden?: boolean } = {},
): string | null {
  if (!user) {
    return null;
  }
  const includeAt = options.includeAt ?? true;
  const showWhenHidden = options.showWhenHidden ?? false;
  if (user.isIdentityHidden && !showWhenHidden) {
    return null;
  }

  const normalizedHandle = user.userName?.trim();
  const resolved = normalizedHandle?.length ? normalizedHandle : 'user';
  return includeAt ? `@${resolved}` : resolved;
}

const buildPreviewUrl = (fileId: string, width?: number, height?: number): string => {
  const params = new URLSearchParams();
  if (width) params.set('w', String(width));
  if (height) params.set('h', String(height));
  if (width && height) params.set('fit', 'cover');
  const query = params.toString();
  return `/api/files/${fileId}/preview${query ? `?${query}` : ''}`;
};

const buildInitialsAvatarUrl = (name: string, size: number): string => {
  const params = new URLSearchParams({
    name,
    size: String(size),
  });
  return `/api/avatars/initials?${params.toString()}`;
};

export function getUserAvatarUrl(user: UserData, size: number = 64): string {
  if (user.profileImageId) {
    return buildPreviewUrl(user.profileImageId, size, size);
  }

  const fullName = getUserFullName(user);
  const initials = fullName || user.userName || 'User';
  return buildInitialsAvatarUrl(initials, size);
}

export function getTeamAvatarUrl(team: Team, size: number = 64): string {
  if (team.profileImageId) {
    return buildPreviewUrl(team.profileImageId, size, size);
  }

  const teamName = team.name || 'Team';
  return buildInitialsAvatarUrl(teamName, size);
}

export function getOrganizationAvatarUrl(
  organization?: Organization | string | null,
  size: number = 64,
): string {
  if (organization && typeof organization === 'object') {
    if (organization.logoId) {
      return buildPreviewUrl(organization.logoId, size, size);
    }
    const label = organization.name?.trim() || 'Org';
    return buildInitialsAvatarUrl(label, size);
  }
  return buildInitialsAvatarUrl('Org', size);
}

export function getEventImageFallbackUrl(params: {
  event?: Pick<Event, 'organization' | 'hostId'> | null;
  size?: number;
  width?: number;
  height?: number;
  hostLabel?: string | null;
  organization?: Organization | string | null;
}): string {
  const resolvedWidth = params.width ?? params.size;
  const resolvedHeight = params.height ?? params.size;
  const resolvedSize = Math.max(
    resolvedWidth ?? 0,
    resolvedHeight ?? 0,
    params.size ?? 0,
    64,
  );

  const organizationInput = params.organization ?? params.event?.organization;
  if (organizationInput && typeof organizationInput === 'object') {
    if (organizationInput.logoId) {
      return buildPreviewUrl(organizationInput.logoId, resolvedWidth, resolvedHeight);
    }
    const orgLabel = organizationInput.name?.trim();
    if (orgLabel) {
      return buildInitialsAvatarUrl(orgLabel, resolvedSize);
    }
  }

  const hostLabel = params.hostLabel?.trim() || params.event?.hostId?.trim() || 'Host';
  return buildInitialsAvatarUrl(hostLabel, resolvedSize);
}

export function getEventImageUrl(params: {
  imageId?: string | null;
  size?: number;
  width?: number;
  height?: number;
  placeholderUrl?: string;
}): string {
  const resolvedWidth = params.width ?? params.size;
  const resolvedHeight = params.height ?? params.size;
  const fallbackSize = Math.max(
    resolvedWidth ?? 0,
    resolvedHeight ?? 0,
    params.size ?? 0,
    64,
  );
  const fallback =
    params.placeholderUrl ??
    buildInitialsAvatarUrl('Event', fallbackSize);
  if (!params.imageId) {
    return fallback;
  }
  return buildPreviewUrl(params.imageId, resolvedWidth, resolvedHeight);
}

export function getEventDateTime(event: Event): { date: string; time: string } {
  const startDate = parseLocalDateTime(event.start);
  if (!startDate) {
    return { date: '', time: '' };
  }
  return {
    date: formatDisplayDate(startDate),
    time: formatDisplayTime(startDate),
  };
}

// API and form interfaces remain the same...
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface LoginFormData {
  email: string;
  password: string;
}

export interface RegisterFormData extends LoginFormData {
  name: string;
  confirmPassword: string;
}

export interface SearchFilters {
  query?: string;
  date?: string;
  location?: string;
  priceRange?: {
    min: number;
    max: number;
  };
}

export interface NavItem {
  label: string;
  href: string;
  icon?: React.ComponentType<any>;
  badge?: string | number;
}

export interface PaymentIntent {
  paymentIntent: string;
  ephemeralKey?: string;
  customer?: string;
  publishableKey: string;
  feeBreakdown: FeeBreakdown;
  error?: string;
  billId?: string | null;
  billPaymentId?: string | null;
  productId?: string | null;
  productPeriod?: string | null;
}

export interface FeeBreakdown {
  eventPrice: number;
  stripeFee: number;
  processingFee: number;
  totalCharge: number;
  hostReceives: number;
  feePercentage: number;
  purchaseType?: string;
}

export interface PaymentResult {
  success: boolean;
  error?: string;
  paymentIntentId?: string;
}

export interface BillPayment {
  $id: string;
  billId: string;
  sequence: number;
  dueDate: string;
  amountCents: number;
  status: 'PENDING' | 'PAID' | 'VOID';
  paidAt?: string;
  paymentIntentId?: string;
  payerUserId?: string;
  refundedAmountCents?: number;
}

export type BillLineItemType = 'EVENT' | 'FEE' | 'TAX' | 'PRODUCT' | 'RENTAL' | 'OTHER';

export interface BillLineItem {
  id?: string;
  type: BillLineItemType;
  label: string;
  amountCents: number;
  quantity?: number;
}

export interface Bill {
  $id: string;
  ownerType: 'USER' | 'TEAM';
  ownerId: string;
  organizationId?: string | null;
  eventId?: string | null;
  totalAmountCents: number;
  paidAmountCents: number;
  nextPaymentDue?: string | null;
  nextPaymentAmountCents?: number | null;
  parentBillId?: string | null;
  allowSplit?: boolean;
  status: 'OPEN' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  paymentPlanEnabled?: boolean;
  createdBy?: string | null;
  lineItems?: BillLineItem[];
  payments?: BillPayment[];
}

export function formatPrice(price?: number) {
  if (!price) return 'Free';
  return `$${(price / 100).toFixed(2)}`;
}

export function formatBillAmount(amountCents: number) {
  return `$${(amountCents / 100).toFixed(2)}`;
}
