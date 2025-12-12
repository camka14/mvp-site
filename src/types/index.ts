import { avatars, storage } from "@/app/appwrite";
import { formatLocalDateTime, parseLocalDateTime } from '@/lib/dateUtils';
import { normalizeEnumValue } from '@/lib/enumUtils';
import { Avatars } from "appwrite";

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
export interface Division {
  id: string;
  name: string;
  skillLevel?: string;
  minRating?: number;
  maxRating?: number;
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
  team1Id?: string | null;
  team2Id?: string | null;
  refereeId?: string | null;
  teamRefereeId?: string | null;
  team1Points: number[];
  team2Points: number[];
  previousLeftId?: string;
  previousRightId?: string;
  winnerNextMatchId?: string;
  loserNextMatchId?: string;
  start: string;
  end: string;
  losersBracket?: boolean;
  setResults: number[];
  side?: string;
  refCheckedIn?: boolean;
  refereeCheckedIn?: boolean;
  team1Seed?: number;
  team2Seed?: number;

  // Relationship fields - hydrated when selected via Queries
  division?: Division;
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
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startTimeMinutes?: number;
  endTimeMinutes?: number;
  startDate?: string;
  endDate?: string | null;
  repeating: boolean;
  price?: number;
  event?: Event;
  eventId?: string;
  scheduledFieldId?: string;
}

export type TimeSlotPayload = Omit<TimeSlot, 'event'>;

export interface UserData {
  $id: string;
  firstName: string;
  lastName: string;
  teamIds: string[];
  friendIds: string[];
  friendRequestIds: string[];
  friendRequestSentIds: string[];
  followingIds: string[];
  userName: string;
  email?: string;
  teamInvites: string[];
  eventInvites: string[];
  hasStripeAccount?: boolean;
  uploadedImages: string[];
  profileImageId?: string;
  stripeAccountId?: string | null;
  $createdAt?: string;
  $updatedAt?: string;

  // Computed properties
  fullName: string;
  avatarUrl: string;
}

// Updated Field interface
export interface Field {
  $id: string;
  name: string;
  location: string;
  lat: number;
  long: number;
  type: FieldSurfaceType;
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

export type FieldSurfaceType = Uppercase<string>;
export type EventType = 'EVENT' | 'TOURNAMENT' | 'LEAGUE';

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
  seed: number;
  division: Division | string; // Can be expanded or just ID
  sport: string;
  wins: number;
  losses: number;
  playerIds: string[];
  captainId: string;
  pending: string[];
  teamSize: number;
  profileImageId?: string;
  $createdAt?: string;
  $updatedAt?: string;
  // Expanded relationships
  players?: UserData[];
  captain?: UserData;
  pendingPlayers?: UserData[];
  matches?: Match[]; // Tournament matches this team participates in
  // Computed properties
  winRate: number;
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
  end: string;
  location: string;
  coordinates: [number, number];
  fieldType: FieldSurfaceType;
  price: number;
  rating?: number;
  imageId: string;
  hostId: string;
  state: EventState;
  maxParticipants: number;
  teamSizeLimit: number;
  restTimeMinutes?: number;
  teamSignup: boolean;
  singleDivision: boolean;
  waitListIds: string[];
  freeAgentIds: string[];
  playerIds?: string[];
  teamIds?: string[];
  userIds?: string[];
  fieldIds?: string[];
  timeSlotIds?: string[];
  refereeIds?: string[];
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
  organization?: Organization | string;
  allowPaymentPlans?: boolean;
  installmentCount?: number;
  installmentDueDates?: string[];
  installmentAmounts?: number[];
  allowTeamSplitDefault?: boolean;

  // Relationship fields - can be IDs or expanded objects
  divisions: Division[] | string[];
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

  // League-specific fields (flattened for DB compatibility)
  gamesPerOpponent?: number;
  includePlayoffs?: boolean;
  playoffTeamCount?: number;
  usesSets?: boolean;
  matchDurationMinutes?: number;
  setDurationMinutes?: number;
  setsPerMatch?: number;
  doTeamsRef?: boolean;
  refType?: string;
  pointsToVictory?: number[];
  status?: EventStatus;
  leagueConfig?: LeagueConfig;
  leagueScoringConfig?: LeagueScoringConfig | null;

  // Computed properties
  attendees: number;
}

export type EventPayload = Omit<Event, 'fields' | 'matches' | 'teams' | 'timeSlots' | 'organization' | 'attendees' | 'referees'> & {
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
  logoId?: string;
  location?: string;
  coordinates?: [number, number];
  ownerId?: string;
  hasStripeAccount?: boolean;
  fieldIds?: string[];
  refIds?: string[];
  $createdAt?: string;
  $updatedAt?: string;

  // Relationships
  events?: Event[];
  teams?: Team[];
  fields?: Field[];
  referees?: UserData[];
}

export enum Sports {
  Volleyball = 'Volleyball',
  Soccer = 'Soccer',
  Basketball = 'Basketball',
  Tennis = 'Tennis',
  Pickleball = 'Pickleball',
  Football = 'Football',
  Hockey = 'Hockey',
  Baseball = 'Baseball',
  Other = 'Other',
}

export const SPORTS_LIST: string[] = Object.values(Sports);

export type EventState = 'PUBLISHED' | 'UNPUBLISHED' | 'DRAFT';

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

  if (typeof payload.type === 'string') {
    const normalizedType = normalizeEnumValue(payload.type);
    if (normalizedType) {
      payload.type = normalizedType as FieldSurfaceType;
    }
  }

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
  const { matches, fields, teams, timeSlots, organization, referees, ...rest } = event;

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

  const timeSlotPayloads = Array.isArray(timeSlots) && timeSlots.length
    ? timeSlots.map((slot) => {
        const { event: slotEvent, ...slotRest } = slot;
        return slotRest;
      })
    : undefined;

  const resolvedOrganizationId =
    extractId(organization) ??
    (typeof rest.organizationId === 'string' ? rest.organizationId : undefined);

  const payload: EventPayload = {
    ...rest,
  };

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

  const normalizedEventType = normalizeEnumValue(payload.eventType);
  if (normalizedEventType) {
    payload.eventType = normalizedEventType as EventType;
  }

  const normalizedFieldType = normalizeEnumValue(payload.fieldType);
  if (normalizedFieldType) {
    payload.fieldType = normalizedFieldType as FieldSurfaceType;
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
  return `${user.firstName} ${user.lastName}`.trim();
}

export function getUserAvatarUrl(user: UserData, size: number = 64): string {
  if (user.profileImageId) {
    return storage.getFilePreview({
      bucketId: process.env.NEXT_PUBLIC_IMAGES_BUCKET_ID!,
      fileId: user.profileImageId,
      width: size,
      height: size
    });
  }

  const fullName = getUserFullName(user);
  const initials = fullName || user.userName || 'User';
  if (avatars && typeof avatars.getInitials === 'function') {
    return avatars.getInitials({
      name: initials,
      width: size,
      height: size
    });
  }
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&size=${size}`;
}

export function getTeamAvatarUrl(team: Team, size: number = 64): string {
  if (team.profileImageId) {
    return storage.getFilePreview({
      bucketId: process.env.NEXT_PUBLIC_IMAGES_BUCKET_ID!,
      fileId: team.profileImageId,
      width: size,
      height: size
    });
  }

  const teamName = team.name || 'Team';
  const initials = teamName.split(' ')
    .map(word => word.charAt(0))
    .join('')
    .substring(0, 2)
    .toUpperCase();
  if (avatars && typeof avatars.getInitials === 'function') {
    return avatars.getInitials({
      name: initials,
      width: size,
      height: size
    });
  }
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&size=${size}`;
}

export function getEventImageUrl(params: {
  imageId?: string | null;
  size?: number;
  width?: number;
  height?: number;
  placeholderUrl?: string;
}): string {
  const fallback =
    params.placeholderUrl ??
    'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=800&h=200&fit=crop';
  if (!params.imageId) {
    return fallback;
  }
  if (params.width || params.height) {
    return storage.getFilePreview({
      bucketId: process.env.NEXT_PUBLIC_IMAGES_BUCKET_ID!,
      fileId: params.imageId,
      width: params.width,
      height: params.height
    });
  }
  return storage.getFilePreview({
    bucketId: process.env.NEXT_PUBLIC_IMAGES_BUCKET_ID!,
    fileId: params.imageId,
    width: params.size,
    height: params.size
  });
}

export function getTeamWinRate(team: Team): number {
  const totalGames = team.wins + team.losses;
  if (totalGames === 0) return 0;
  return Math.round((team.wins / totalGames) * 100);
}

export function getEventDateTime(event: Event): { date: string; time: string } {
  const startDate = parseLocalDateTime(event.start);
  if (!startDate) {
    return { date: '', time: '' };
  }
  const [datePart] = formatLocalDateTime(startDate).split('T');
  return {
    date: datePart ?? '',
    time: startDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
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
}

export interface FeeBreakdown {
  eventPrice: number;
  stripeFee: number;
  processingFee: number;
  totalCharge: number;
  hostReceives: number;
  feePercentage: number;
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
  payments?: BillPayment[];
}

export function formatPrice(price?: number) {
  if (!price) return 'Free';
  return `$${(price / 100).toFixed(2)}`;
}

export function formatBillAmount(amountCents: number) {
  return `$${(amountCents / 100).toFixed(2)}`;
}
