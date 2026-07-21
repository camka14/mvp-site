import { formatDisplayDate, formatDisplayTime, parseLocalDateTime } from '@/lib/dateUtils';
import { normalizeEnumValue } from '@/lib/enumUtils';
import { formatNameParts } from '@/lib/nameCase';
import type { AccountVisibility } from '@/lib/accountVisibility';
import type { NotificationSettings } from '@/lib/notificationSettings';
import type { OnboardingIntent } from '@/lib/onboardingIntent';
import type {
  OrganizationVerificationReviewStatus,
  OrganizationVerificationStatus,
} from '@/lib/organizationVerification';
import type {
  EventTaxHandling,
  OrganizationDefaultEventTaxHandling,
  OrganizationTaxClassification,
  RentalTaxHandling,
  Taxability,
  TaxCollectionStrategy,
  TaxLiabilityParty,
  TaxMode,
} from '@/lib/taxPolicy';
import type { OrganizationStatus } from '@/lib/organizationStatus';

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
export type DivisionScope = 'ORGANIZATION' | 'EVENT';
export type DivisionStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type OrganizationFeature = 'CLUB_TEAMS' | 'FACILITIES_RENTALS' | 'EVENT_MANAGEMENT';

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
  scope?: DivisionScope;
  status?: DivisionStatus;
  sourceDivisionId?: string;
  sportId?: string;
  price?: number;
  maxParticipants?: number;
  playoffTeamCount?: number;
  poolCount?: number;
  poolTeamCount?: number;
  playoffPlacementDivisionIds?: string[];
  standingsOverrides?: Record<string, number>;
  standingsConfirmedAt?: string;
  standingsConfirmedBy?: string;
  playoffConfig?: TournamentConfig;
  gamesPerOpponent?: number;
  restTimeMinutes?: number;
  usesSets?: boolean;
  matchDurationMinutes?: number | null;
  setDurationMinutes?: number | null;
  setsPerMatch?: number;
  pointsToVictory?: number[];
  allowPaymentPlans?: boolean;
  installmentCount?: number;
  installmentDueDates?: string[];
  installmentDueRelativeDays?: number[];
  installmentAmounts?: number[];
  fieldIds?: string[];
  teamIds?: string[];
  minRating?: number;
  maxRating?: number;
  divisionTypeId?: string;
  skillDivisionTypeId?: string;
  ageDivisionTypeId?: string;
  divisionTypeName?: string;
  /** @deprecated Use skillDivisionTypeId and divisionTypeName for new code. */
  skillLevel?: string;
  ratingType?: DivisionRatingType;
  gender?: DivisionGender;
  ageCutoffDate?: string;
  ageCutoffLabel?: string;
  ageCutoffSource?: string;
  description?: string;
  registrationUrl?: string;
  sourceUrl?: string;
  lastVerifiedAt?: string;
}

export interface LeagueConfig {
  gamesPerOpponent: number;
  includePlayoffs: boolean;
  playoffTeamCount?: number;
  usesSets: boolean;
  matchDurationMinutes?: number | null;
  restTimeMinutes?: number;
  setDurationMinutes?: number | null;
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
  matchDurationMinutes?: number | null;
  setDurationMinutes?: number | null;
}

export type OfficialSchedulingMode = 'STAFFING' | 'TEAM_STAFFING' | 'SCHEDULE' | 'OFF';

export interface SportOfficialPositionTemplate {
  name: string;
  count: number;
}

export interface EventOfficialPosition {
  id: string;
  name: string;
  count: number;
  order: number;
}

export interface EventOfficial {
  id: string;
  userId: string;
  positionIds: string[];
  fieldIds: string[];
  isActive?: boolean;
}

export interface MatchOfficialAssignment {
  positionId: string;
  slotIndex: number;
  holderType: 'OFFICIAL' | 'PLAYER';
  userId: string;
  eventOfficialId?: string;
  checkedIn?: boolean;
  hasConflict?: boolean;
}

export type MatchScoringModel = 'SETS' | 'PERIODS' | 'INNINGS' | 'POINTS_ONLY';
export type MatchLifecycleStatus = 'SCHEDULED' | 'READY' | 'IN_PROGRESS' | 'COMPLETE' | 'CANCELLED' | 'FORFEIT' | 'SUSPENDED';
export type MatchResultStatus = 'PENDING' | 'OFFICIAL' | 'OVERRIDDEN' | 'DISPUTED';
export type MatchResultType = 'REGULATION' | 'OVERTIME' | 'SHOOTOUT' | 'FORFEIT' | 'NO_CONTEST' | 'DRAW';
export type TeamCheckInMode = 'OFF' | 'EVENT' | 'MATCH';
export type MatchSegmentStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE' | 'VOID';
export type MatchTimerMode = 'NONE' | 'COUNT_UP';
export type MatchIncidentDefinitionKind = 'SCORING' | 'DISCIPLINE' | 'NOTE' | 'ADMIN';
export type MatchIncidentCardColor = 'yellow' | 'red' | 'blue';

export interface MatchIncidentTypeDefinition {
  code: string;
  label: string;
  kind: MatchIncidentDefinitionKind;
  cardColor?: MatchIncidentCardColor | null;
  requiresTeam?: boolean;
  requiresParticipant?: boolean;
  defaultEnabled?: boolean;
  linkedPointDelta?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface MatchTimekeepingConfig {
  timerMode?: MatchTimerMode;
  segmentDurationMinutes?: number | null;
  segmentDurationMinutesBySequence?: number[];
  canUseAddedTime?: boolean;
  addedTimeEnabled?: boolean;
  stopAtRegulationEnd?: boolean;
}

export interface ResolvedMatchTimekeepingConfig {
  timerMode: MatchTimerMode;
  segmentDurationMinutes: number | null;
  segmentDurationMinutesBySequence: number[];
  canUseAddedTime: boolean;
  addedTimeEnabled: boolean;
  stopAtRegulationEnd: boolean;
}

export interface MatchRulesConfig {
  scoringModel?: MatchScoringModel;
  segmentCount?: number;
  segmentLabel?: string;
  setPointTargets?: number[];
  supportsDraw?: boolean;
  supportsOvertime?: boolean;
  supportsShootout?: boolean;
  canUseOvertime?: boolean;
  canUseShootout?: boolean;
  officialRoles?: string[];
  supportedIncidentTypes?: string[];
  incidentTypeDefinitions?: MatchIncidentTypeDefinition[];
  autoCreatePointIncidentType?: string;
  pointIncidentRequiresParticipant?: boolean;
  timekeeping?: MatchTimekeepingConfig;
}

export interface ResolvedMatchRules {
  scoringModel: MatchScoringModel;
  segmentCount: number;
  segmentLabel: string;
  setPointTargets?: number[];
  supportsDraw: boolean;
  supportsOvertime: boolean;
  supportsShootout: boolean;
  canUseOvertime: boolean;
  canUseShootout: boolean;
  officialRoles: string[];
  supportedIncidentTypes: string[];
  incidentTypeDefinitions: MatchIncidentTypeDefinition[];
  autoCreatePointIncidentType: string | null;
  pointIncidentRequiresParticipant: boolean;
  timekeeping: ResolvedMatchTimekeepingConfig;
}

export interface MatchSegment {
  id: string;
  $id?: string;
  eventId?: string | null;
  matchId: string;
  sequence: number;
  status: MatchSegmentStatus;
  scores: Record<string, number>;
  winnerEventTeamId?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  resultType?: MatchResultType | string | null;
  statusReason?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface MatchIncident {
  id: string;
  $id?: string;
  eventId?: string | null;
  matchId: string;
  segmentId?: string | null;
  eventTeamId?: string | null;
  eventRegistrationId?: string | null;
  participantUserId?: string | null;
  officialUserId?: string | null;
  incidentType: string;
  sequence: number;
  minute?: number | null;
  clock?: string | null;
  clockSeconds?: number | null;
  linkedPointDelta?: number | null;
  note?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface MatchLifecycleOperation {
  status?: MatchLifecycleStatus;
  resultStatus?: MatchResultStatus;
  resultType?: MatchResultType;
  actualStart?: string | null;
  actualEnd?: string | null;
  statusReason?: string | null;
  winnerEventTeamId?: string | null;
}

export interface MatchSegmentOperation {
  id?: string;
  sequence: number;
  status?: MatchSegmentStatus;
  scores?: Record<string, number>;
  winnerEventTeamId?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  resultType?: MatchResultType | string | null;
  statusReason?: string | null;
  metadata?: Record<string, unknown> | null;
  clientOperationId?: string;
  clientDeviceId?: string;
  clientCreatedAt?: string;
  clientSequence?: number;
  sourceDevice?: string;
}

export interface MatchIncidentOperation {
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  id?: string;
  segmentId?: string | null;
  eventTeamId?: string | null;
  eventRegistrationId?: string | null;
  participantUserId?: string | null;
  officialUserId?: string | null;
  incidentType?: string;
  sequence?: number;
  minute?: number | null;
  clock?: string | null;
  clockSeconds?: number | null;
  linkedPointDelta?: number | null;
  note?: string | null;
  metadata?: Record<string, unknown> | null;
  clientOperationId?: string;
  clientDeviceId?: string;
  clientCreatedAt?: string;
  clientSequence?: number;
  sourceDevice?: string;
}

export interface MatchOfficialCheckInOperation {
  positionId?: string;
  slotIndex?: number;
  userId?: string;
  checkedIn: boolean;
}

export interface TeamPlayerRegistration {
  id: string;
  teamId?: string | null;
  userId: string;
  registrantId?: string;
  parentId?: string | null;
  registrantType?: string;
  rosterRole?: string;
  status: string;
  jerseyNumber?: string | null;
  position?: string | null;
  isCaptain?: boolean;
  consentDocumentId?: string | null;
  consentStatus?: string | null;
  createdBy?: string | null;
}

export type TeamJoinPolicy = 'CLOSED' | 'OPEN_REGISTRATION' | 'REQUEST_TO_JOIN';
export type TeamJoinRequestStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'WITHDRAWN' | 'CANCELLED';
export type RegistrationQuestionScopeType = 'TEAM' | 'EVENT';
export type RegistrationQuestionAnswerType = 'TEXT' | 'LONG_TEXT';
export type RegistrationQuestionResponseSubjectType = 'TEAM_JOIN_REQUEST' | 'TEAM_REGISTRATION' | 'EVENT_REGISTRATION';

export interface RegistrationQuestion {
  id: string;
  scopeType: RegistrationQuestionScopeType;
  scopeId: string;
  prompt: string;
  answerType: RegistrationQuestionAnswerType;
  required: boolean;
  sortOrder: number;
  isActive?: boolean;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
}

export interface RegistrationQuestionDraft {
  id?: string | null;
  prompt: string;
  answerType?: RegistrationQuestionAnswerType;
  required?: boolean;
  sortOrder?: number;
}

export interface RegistrationQuestionAnswerInput {
  questionId: string;
  answer: string;
}

export interface RegistrationQuestionAnswerSnapshotItem {
  questionId: string;
  prompt: string;
  answerType: RegistrationQuestionAnswerType;
  required: boolean;
  sortOrder: number;
  answer: string;
}

export interface RegistrationQuestionResponse {
  id: string;
  scopeType: RegistrationQuestionScopeType;
  scopeId: string;
  subjectType: RegistrationQuestionResponseSubjectType;
  subjectId: string;
  responderUserId: string;
  registrantUserId: string;
  registrantType: string;
  answersSnapshot: RegistrationQuestionAnswerSnapshotItem[];
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
}

export interface TeamJoinRequest {
  id: string;
  teamId: string;
  requesterUserId: string;
  registrantUserId: string;
  parentId?: string | null;
  registrantType: 'SELF' | 'CHILD';
  status: TeamJoinRequestStatus;
  reviewedByUserId?: string | null;
  reviewedAt?: string | Date | null;
  reviewNote?: string | null;
  approvedRegistrationId?: string | null;
  answers?: RegistrationQuestionAnswerSnapshotItem[];
  requester?: UserData | null;
  registrant?: UserData | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
}

export interface Sport {
  $id: string;
  name: string;
  officialPositionTemplates?: SportOfficialPositionTemplate[];
  matchRulesTemplate?: MatchRulesConfig | null;
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
  pointsPerSetWin: number;
  pointsPerSetLoss: number;
  pointsPerGameWin: number;
  pointsPerGameLoss: number;
  pointsPerGoalScored: number;
  pointsPerGoalConceded: number;
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
  status?: MatchLifecycleStatus | string | null;
  resultStatus?: MatchResultStatus | string | null;
  resultType?: MatchResultType | string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  statusReason?: string | null;
  winnerEventTeamId?: string | null;
  matchRulesSnapshot?: ResolvedMatchRules | MatchRulesConfig | Record<string, unknown> | null;
  resolvedMatchRules?: ResolvedMatchRules | null;
  segments?: MatchSegment[];
  incidents?: MatchIncident[];
  team1Id?: string | null;
  team2Id?: string | null;
  officialId?: string | null;
  officialIds?: MatchOfficialAssignment[];
  teamOfficialId?: string | null;
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
  officialCheckedIn?: boolean;
  team1Seed?: number | null;
  team2Seed?: number | null;
  teamOfficialSeed?: number | null;

  // Relationship fields - hydrated when selected via Queries
  division?: Division | string | null;
  field?: Field;
  official?: UserData;
  teamOfficial?: Team;
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
  | 'official'
  | 'teamOfficial'
  | 'team1'
  | 'team2'
  | 'previousLeftMatch'
  | 'previousRightMatch'
  | 'winnerNextMatch'
  | 'loserNextMatch';

export type MatchPayload = Omit<Match, MatchRelationKeys | '$id'> & {
  id: string;
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
  timeZone?: string;
  repeating: boolean;
  price?: number;
  taxHandling?: RentalTaxHandling;
  requiredTemplateIds?: string[];
  hostRequiredTemplateIds?: string[];
  sourceType?: string | null;
  rentalBookingId?: string | null;
  rentalBookingItemId?: string | null;
  rentalLocked?: boolean;
  event?: Event;
  eventId?: string;
  field?: Field;
  scheduledFieldId?: string;
  scheduledFieldIds?: string[];
}

export type TimeSlotPayload = Omit<TimeSlot, 'event' | 'field' | '$id'> & {
  id: string;
};

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
  blockedUserIds: string[];
  hiddenEventIds: string[];
  userName: string;
  hasStripeAccount?: boolean;
  uploadedImages: string[];
  profileImageId?: string;
  homePageOrganizationId?: string | null;
  chatTermsAcceptedAt?: string | null;
  chatTermsVersion?: string | null;
  onboardingIntent?: OnboardingIntent | null;
  accountVisibility?: AccountVisibility | null;
  notificationSettings?: NotificationSettings | null;
  stripeAccountId?: string | null;
  $createdAt?: string;
  $updatedAt?: string;

  // Computed properties
  fullName: string;
  avatarUrl: string;
}

export type StaffMemberType = 'HOST' | 'OFFICIAL' | 'STAFF';
export type InviteType = 'STAFF' | 'TEAM' | 'EVENT';
export type InviteStatus = 'PENDING' | 'DECLINED' | 'FAILED';
export type OrganizationRoleKind = 'OWNER' | 'STAFF' | 'HOST' | 'OFFICIAL';

export interface OrganizationRole {
  $id: string;
  organizationId: string;
  name: string;
  kind: OrganizationRoleKind;
  systemKey?: string | null;
  isSystem: boolean;
  isDefault: boolean;
  permissions: string[];
  $createdAt?: string;
  $updatedAt?: string;
}

export interface StaffMember {
  $id: string;
  organizationId: string;
  userId: string;
  types: StaffMemberType[];
  roleId?: string | null;
  role?: OrganizationRole | null;
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
  childUserId?: string | null;
  childFirstName?: string | null;
  childLastName?: string | null;
  childFullName?: string | null;
  viewerCanAcceptForChild?: boolean;
  $createdAt?: string;
  $updatedAt?: string;
}

export interface SensitiveUserData {
  $id: string;
  userId: string;
  email: string;
  billingAddressLine1?: string | null;
  billingAddressLine2?: string | null;
  billingCity?: string | null;
  billingState?: string | null;
  billingPostalCode?: string | null;
  billingCountryCode?: string | null;
  $createdAt?: string;
  $updatedAt?: string;
}

export interface FacilityOperatingInterval {
  openMinutes: number;
  closeMinutes: number;
}

export interface FacilityOperatingDay {
  dayOfWeek: number;
  closed: boolean;
  intervals: FacilityOperatingInterval[];
}

export interface FacilityOperatingHours {
  version: 1;
  weekly: FacilityOperatingDay[];
}

export interface Facility {
  $id: string;
  organizationId: string;
  name: string;
  location: string;
  address?: string | null;
  affiliateUrl?: string | null;
  coordinates?: [number, number] | Record<string, unknown> | null;
  operatingHours?: FacilityOperatingHours | null;
  timeZone?: string;
  status?: string;
  isDefault?: boolean;
  sortOrder?: number | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  $createdAt?: string | null;
  $updatedAt?: string | null;
}

// Updated Field interface
export interface Field {
  $id: string;
  name: string;
  location: string;
  lat: number;
  long: number;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  $createdAt?: string | null;
  $updatedAt?: string | null;
  heading?: number;
  inUse?: boolean;
  facilityId?: string | null;
  sportIds?: string[];
  rentalSlotIds?: string[];

  // Relationships
  divisions?: (Division | string)[];
  matches?: Match[];
  events?: Event[];
  organization?: Organization;
  facility?: Facility | string | null;
  rentalSlots?: TimeSlot[];
}

export type EventType = 'EVENT' | 'TOURNAMENT' | 'LEAGUE' | 'WEEKLY_EVENT' | 'TRYOUT' | 'AFFILIATE';
export type RegistrationPaymentMode = 'ONLINE' | 'MANUAL';
export type ManualPaymentProvider = 'CASH_APP' | 'VENMO' | 'PAYPAL' | 'STRIPE' | 'ZELLE' | 'OTHER';

export interface ManualPaymentLink {
  id: string;
  provider: ManualPaymentProvider;
  label: string;
  url: string;
}

type FieldRelationKeys = 'matches' | 'events' | 'organization' | 'facility' | 'rentalSlots' | 'rentalSlotIds';

export type FieldPayload = Omit<Field, FieldRelationKeys | '$id'> & {
  id: string;
  divisions?: string[];
  matchIds?: string[];
  eventIds?: string[];
  organizationId?: string;
  facilityId?: string | null;
  sportIds?: string[];
  rentalSlotIds?: string[];
};

export interface Team {
  $id: string;
  name: string;
  division: Division | string; // Can be expanded or just ID
  divisionTypeId?: string | null;
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
  organizationId?: string | null;
  createdBy?: string | null;
  joinPolicy?: TeamJoinPolicy;
  openRegistration?: boolean;
  registrationPriceCents?: number;
  affiliateUrl?: string | null;
  requiredTemplateIds?: string[];
  visibility?: 'PUBLIC' | 'ADMIN_ONLY' | string;
  $createdAt?: string;
  $updatedAt?: string;
  // Expanded relationships
  players?: UserData[];
  playerRegistrations?: TeamPlayerRegistration[];
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

export type TeamPayload = Omit<Team, 'matches' | '$id'> & {
  id: string;
  matchIds?: string[];
};

export interface EventTag {
  id?: string;
  $id?: string;
  name: string;
  slug?: string;
  eventCount?: number;
  isSystem?: boolean;
}

export interface OrganizationTag {
  id?: string;
  $id?: string;
  name: string;
  slug?: string;
  organizationCount?: number;
  isSystem?: boolean;
}

// Core Event interface with relationships
export interface Event {
  $id: string;
  name: string;
  description: string;
  affiliateUrl?: string | null;
  affiliateActionUrl?: string | null;
  sourceUrl?: string | null;
  organizerName?: string | null;
  scheduleText?: string | null;
  dateDisplayMode?: 'SCHEDULED' | 'NO_FIXED_DATE' | 'ONGOING' | string | null;
  dateDisplayText?: string | null;
  priceText?: string | null;
  statusText?: string | null;
  tags?: EventTag[];
  start: string;
  end: string | null;
  timeZone?: string;
  location: string;
  address?: string;
  coordinates: [number, number];
  price: number;
  registrationPaymentMode?: RegistrationPaymentMode;
  manualPaymentLinks?: ManualPaymentLink[];
  manualPaymentInstructions?: string | null;
  taxHandling?: EventTaxHandling;
  organizerManualTaxRateBps?: number;
  minAge?: number;
  maxAge?: number;
  rating?: number;
  imageId: string | null;
  hostId: string | null;
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
  officialIds?: string[];
  officialSchedulingMode?: OfficialSchedulingMode;
  officialPositions?: EventOfficialPosition[];
  eventOfficials?: EventOfficial[];
  assistantHostIds?: string[];
  waitList?: string[];
  freeAgents?: string[];
  cancellationRefundHours: number | null;
  registrationCutoffHours: number | null;
  seedColor: number;
  $createdAt: string;
  $updatedAt: string;
  eventType: EventType;
  sport: Sport;
  sportId?: string;
  leagueScoringConfigId?: string | null;
  organizationId?: string | null;
  parentEvent?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  rentalBookingId?: string | null;
  rentalBookingItemId?: string | null;
  organization?: Organization | string;
  requiredTemplateIds?: string[];
  divisionFieldIds?: Record<string, string[]>;
  allowPaymentPlans?: boolean;
  installmentCount?: number;
  installmentDueDates?: string[];
  installmentDueRelativeDays?: number[];
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
  officials?: UserData[];
  assistantHosts?: UserData[];
  staffInvites?: Invite[];

  // League-specific fields (flattened for DB compatibility)
  gamesPerOpponent?: number;
  includePlayoffs?: boolean;
  includePlayoffsOrPools?: boolean;
  playoffTeamCount?: number;
  usesSets?: boolean;
  matchDurationMinutes?: number | null;
  setDurationMinutes?: number | null;
  setsPerMatch?: number;
  doTeamsOfficiate?: boolean;
  teamOfficialsMaySwap?: boolean;
  teamCheckInMode?: TeamCheckInMode;
  teamCheckInOpenMinutesBefore?: number;
  allowMatchRosterEdits?: boolean;
  allowTemporaryMatchPlayers?: boolean;
  matchRulesOverride?: MatchRulesConfig | null;
  autoCreatePointMatchIncidents?: boolean;
  resolvedMatchRules?: ResolvedMatchRules | null;
  refType?: string;
  pointsToVictory?: number[];
  status?: EventStatus;
  leagueConfig?: LeagueConfig;
  leagueScoringConfig?: LeagueScoringConfig | null;
  participantCount?: number | null;
  participantCapacity?: number | null;

  // Computed properties
  attendees: number;
}

export type EventPayload = Omit<Event, 'fields' | 'matches' | 'teams' | 'timeSlots' | 'organization' | 'attendees' | 'officials' | 'assistantHosts' | 'staffInvites' | '$id'> & {
  id: string;
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
  enabledFeatures?: OrganizationFeature[];
  logoId?: string;
  logoUrl?: string;
  imageUrl?: string;
  location?: string;
  address?: string;
  coordinates?: [number, number];
  ownerId?: string;
  status?: OrganizationStatus;
  hasStripeAccount?: boolean;
  taxOrganizationType?: OrganizationTaxClassification;
  operatesAthleticFacility?: boolean;
  defaultEventTaxHandling?: OrganizationDefaultEventTaxHandling;
  defaultRentalTaxHandling?: RentalTaxHandling;
  taxResponsibilityAcceptedAt?: string;
  taxResponsibilityAcceptedByUserId?: string;
  taxResponsibilityAgreementVersion?: string;
  taxResponsibilityAgreementAccepted?: boolean;
  verificationStatus?: OrganizationVerificationStatus;
  verifiedAt?: string;
  verificationReviewStatus?: OrganizationVerificationReviewStatus;
  verificationReviewNotes?: string;
  verificationReviewUpdatedAt?: string;
  staffMembers?: StaffMember[];
  staffInvites?: Invite[];
  staffRoles?: OrganizationRole[];
  staffEmailsByUserId?: Record<string, string>;
  productIds?: string[];
  publicSlug?: string | null;
  publicPageEnabled?: boolean;
  publicWidgetsEnabled?: boolean;
  brandPrimaryColor?: string | null;
  brandAccentColor?: string | null;
  publicHeadline?: string | null;
  publicIntroText?: string | null;
  embedAllowedDomains?: string[];
  publicCompletionRedirectUrl?: string | null;
  viewerCanManageOrganization?: boolean;
  viewerCanAccessUsers?: boolean;
  viewerPermissions?: string[];
  tags?: OrganizationTag[];
  divisionSummary?: {
    count: number;
    minPrice: number | null;
    maxPrice: number | null;
  };
  $createdAt?: string;
  $updatedAt?: string;

  // Relationships
  events?: Event[];
  teams?: Team[];
  divisions?: Division[];
  fields?: Field[];
  facilities?: Facility[];
  officials?: UserData[];
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

export type ProductPeriod = 'single' | 'week' | 'month' | 'year';
export type ProductType =
  | 'MEMBERSHIP'
  | 'MERCHANDISE'
  | 'DAY_PASS'
  | 'EQUIPMENT_RENTAL'
  | 'NON_TAXABLE_ITEM';

export interface Product {
  $id: string;
  organizationId: string;
  name: string;
  description?: string;
  priceCents: number;
  period: ProductPeriod;
  productType?: ProductType;
  taxCategory?: 'ONE_TIME_PRODUCT' | 'DAY_PASS' | 'EQUIPMENT_RENTAL' | 'SUBSCRIPTION' | 'NON_TAXABLE';
  createdBy?: string;
  isActive?: boolean;
  stripeProductId?: string | null;
  stripePriceId?: string | null;
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
  stripeSubscriptionId?: string | null;
}

export interface RefundRequest {
  $id: string;
  eventId: string;
  userId: string;
  requestedByUserId?: string;
  hostId?: string;
  teamId?: string;
  organizationId?: string;
  reason: string;
  status?: 'WAITING' | 'APPROVED' | 'REJECTED';
  slotId?: string;
  occurrenceDate?: string;
  billIds?: string[];
  paymentIds?: string[];
  paymentScope?: RefundRequestPaymentScope[];
  requestedAmountCents?: number;
  currency?: string;
  policyDecision?: string;
  scopeVersion?: number;
  scopeHash?: string;
  approvalPreview?: RefundRequestApprovalPreview;
  $createdAt?: string;
  $updatedAt?: string;
}

export interface RefundRequestPaymentScope {
  paymentId: string;
  billId: string;
  refundableAmountCents: number;
  currency: string;
}

export interface RefundRequestApprovalPreview {
  paymentScope: RefundRequestPaymentScope[];
  paymentCount: number;
  billIds: string[];
  paymentIds: string[];
  refundableAmountCents: number;
  currency: string;
  occurrence: {
    slotId: string | null;
    occurrenceDate: string | null;
  };
  policyDecision: string | null;
  scopeVersion: number;
  scopeHash: string | null;
  isValid: boolean;
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

export type EventState = 'PUBLISHED' | 'UNPUBLISHED' | 'PRIVATE' | 'TEMPLATE' | 'DRAFT';

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
  if (typeof candidate.id === 'string' && candidate.id.length > 0) {
    return candidate.id;
  }
  if (typeof candidate.$id === 'string' && candidate.$id.length > 0) {
    return candidate.$id;
  }
  return undefined;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

export const normalizePayloadIdentifiers = <T>(
  value: T,
  seen: WeakMap<object, unknown> = new WeakMap(),
): T => {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizePayloadIdentifiers(entry, seen)) as T;
  }
  if (!isPlainObject(value)) {
    return value;
  }
  if (seen.has(value)) {
    return seen.get(value) as T;
  }

  const next: Record<string, unknown> = {};
  seen.set(value, next);

  const normalizedId = extractId(value);
  if (normalizedId) {
    next.id = normalizedId;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (key === '$id') {
      continue;
    }
    next[key] = normalizePayloadIdentifiers(entry, seen);
  }

  if (normalizedId) {
    next.id = normalizedId;
  }

  return next as T;
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
  const normalizeOptionalDuration = (input: unknown): number | undefined => {
    if (input === null || input === undefined || input === '') {
      return undefined;
    }
    const parsed = typeof input === 'number' ? input : Number(input);
    if (!Number.isFinite(parsed)) {
      return undefined;
    }
    return Math.max(0, Math.trunc(parsed));
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
    matchDurationMinutes: normalizeOptionalDuration(row.matchDurationMinutes),
    setDurationMinutes: usesSets ? normalizeOptionalDuration(row.setDurationMinutes) : undefined,
  };
};

export function toMatchPayload(match: Match): MatchPayload {
  const {
    division,
    field,
    official,
    teamOfficial,
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
    id: extractId(match) ?? '',
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

  if (payload.officialId == null) {
    const officialId = extractId(official);
    if (officialId) {
      payload.officialId = officialId;
    }
  }

  if (payload.teamOfficialId == null) {
    const teamOfficialId = extractId(teamOfficial);
    if (teamOfficialId) {
      payload.teamOfficialId = teamOfficialId;
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

  return normalizePayloadIdentifiers(payload);
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
    id: extractId(field) ?? '',
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
  const fieldId = extractId(field);
  if (fieldId && matchIdsByField?.has(fieldId)) {
    matchIdsByField.get(fieldId)?.forEach((id) => {
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

  return normalizePayloadIdentifiers(payload);
}

export function toTimeSlotPayload(slot: TimeSlot): TimeSlotPayload {
  const { event, field, ...rest } = slot;
  const id = extractId(slot);

  return normalizePayloadIdentifiers({
    ...rest,
    id: id ?? '',
  });
}

export function toEventPayload(event: Event): EventPayload {
  const { matches, fields, teams, timeSlots, organization, officials, assistantHosts, ...rest } = event;

  const matchPayloads = Array.isArray(matches) && matches.length
    ? matches.map(toMatchPayload)
    : undefined;

  const matchIdsByField = new Map<string, string[]>();
  matchPayloads?.forEach((match) => {
    if (!match.id) {
      return;
    }
    const fieldId = typeof match.fieldId === 'string' && match.fieldId.length > 0 ? match.fieldId : undefined;
    if (!fieldId) {
      return;
    }
    const bucket = matchIdsByField.get(fieldId) ?? [];
    bucket.push(match.id);
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
          id: extractId(team) ?? '',
        };
        if (teamMatchIds.length) {
          teamPayload.matchIds = teamMatchIds;
        }
        return normalizePayloadIdentifiers(teamPayload);
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
        const normalizedDays = normalizeSlotDays(slot);
        return {
          ...toTimeSlotPayload(slot),
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
    id: extractId(event) ?? '',
  };
  const includePlayoffsOrPools =
    typeof rest.includePlayoffsOrPools === 'boolean'
      ? rest.includePlayoffsOrPools
      : typeof rest.includePlayoffs === 'boolean'
        ? rest.includePlayoffs
        : undefined;
  if (typeof includePlayoffsOrPools === 'boolean') {
    payload.includePlayoffs = includePlayoffsOrPools;
    payload.includePlayoffsOrPools = includePlayoffsOrPools;
  }

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
          poolCount:
            typeof division.poolCount === 'number'
              ? division.poolCount
              : Number.isFinite(Number(division.poolCount))
                ? Number(division.poolCount)
                : undefined,
          poolTeamCount:
            typeof division.poolTeamCount === 'number'
              ? division.poolTeamCount
              : Number.isFinite(Number(division.poolTeamCount))
                ? Number(division.poolTeamCount)
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
          gamesPerOpponent:
            typeof division.gamesPerOpponent === 'number'
              ? division.gamesPerOpponent
              : Number.isFinite(Number(division.gamesPerOpponent))
                ? Number(division.gamesPerOpponent)
                : undefined,
          restTimeMinutes:
            typeof division.restTimeMinutes === 'number'
              ? division.restTimeMinutes
              : Number.isFinite(Number(division.restTimeMinutes))
                ? Number(division.restTimeMinutes)
                : undefined,
          usesSets:
            typeof division.usesSets === 'boolean'
              ? division.usesSets
              : undefined,
          matchDurationMinutes:
            typeof division.matchDurationMinutes === 'number'
              ? division.matchDurationMinutes
              : Number.isFinite(Number(division.matchDurationMinutes))
                ? Number(division.matchDurationMinutes)
                : undefined,
          setDurationMinutes:
            typeof division.setDurationMinutes === 'number'
              ? division.setDurationMinutes
              : Number.isFinite(Number(division.setDurationMinutes))
                ? Number(division.setDurationMinutes)
                : undefined,
          setsPerMatch:
            typeof division.setsPerMatch === 'number'
              ? division.setsPerMatch
              : Number.isFinite(Number(division.setsPerMatch))
                ? Number(division.setsPerMatch)
                : undefined,
          pointsToVictory: Array.isArray(division.pointsToVictory)
            ? division.pointsToVictory
                .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
                .filter((entry) => Number.isFinite(entry))
            : undefined,
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
          installmentDueRelativeDays: Array.isArray(division.installmentDueRelativeDays)
            ? division.installmentDueRelativeDays
                .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
                .filter((entry) => Number.isFinite(entry))
                .map((entry) => Math.trunc(entry))
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
          poolCount:
            typeof division.poolCount === 'number'
              ? division.poolCount
              : Number.isFinite(Number(division.poolCount))
                ? Number(division.poolCount)
                : undefined,
          poolTeamCount:
            typeof division.poolTeamCount === 'number'
              ? division.poolTeamCount
              : Number.isFinite(Number(division.poolTeamCount))
                ? Number(division.poolTeamCount)
                : undefined,
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
          installmentDueRelativeDays: Array.isArray(division.installmentDueRelativeDays)
            ? division.installmentDueRelativeDays
                .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
                .filter((entry) => Number.isFinite(entry))
                .map((entry) => Math.trunc(entry))
            : undefined,
          installmentAmounts: Array.isArray(division.installmentAmounts)
            ? division.installmentAmounts
                .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
                .filter((entry) => Number.isFinite(entry))
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

  const hasExplicitOfficials = Object.prototype.hasOwnProperty.call(rest, 'officialIds');
  const explicitOfficialIds = Array.isArray(rest.officialIds)
    ? uniqueIds(rest.officialIds.map((id) => (typeof id === 'string' ? id : extractId(id))))
    : [];
  if (hasExplicitOfficials) {
    payload.officialIds = explicitOfficialIds;
  } else if (Array.isArray(officials)) {
    const derivedOfficialIds = uniqueIds(officials.map((official) => extractId(official)));
    if (derivedOfficialIds.length) {
      payload.officialIds = derivedOfficialIds;
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

  if (typeof payload.doTeamsOfficiate === 'boolean' && payload.doTeamsOfficiate !== true) {
    payload.teamOfficialsMaySwap = false;
  } else if (typeof payload.teamOfficialsMaySwap === 'boolean') {
    payload.teamOfficialsMaySwap = Boolean(payload.teamOfficialsMaySwap);
  }

  const normalizedTeamCheckInMode = typeof payload.teamCheckInMode === 'string'
    ? payload.teamCheckInMode.trim().toUpperCase()
    : undefined;
  if (normalizedTeamCheckInMode === 'EVENT' || normalizedTeamCheckInMode === 'MATCH') {
    payload.teamCheckInMode = normalizedTeamCheckInMode;
  } else {
    payload.teamCheckInMode = 'OFF';
  }
  const openMinutes = Number(payload.teamCheckInOpenMinutesBefore);
  payload.teamCheckInOpenMinutesBefore = Number.isFinite(openMinutes)
    ? Math.max(0, Math.trunc(openMinutes))
    : 60;
  payload.allowMatchRosterEdits = Boolean(payload.teamSignup) && Boolean(payload.allowMatchRosterEdits);
  payload.allowTemporaryMatchPlayers = Boolean(payload.allowMatchRosterEdits) && Boolean(payload.allowTemporaryMatchPlayers);

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

  return normalizePayloadIdentifiers(payload);
}

export function getUserFullName(user: UserData): string {
  const explicitDisplayName = user.displayName?.trim();
  if (explicitDisplayName) {
    return explicitDisplayName;
  }

  const fullName = formatNameParts(user.firstName, user.lastName);
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

const buildInitialsAvatarUrl = (name: string, size: number, colorSeed?: string | null): string => {
  const params = new URLSearchParams({
    name,
    size: String(size),
  });
  const normalizedColorSeed = colorSeed?.trim();
  if (normalizedColorSeed) {
    params.set('colorSeed', normalizedColorSeed);
  }
  return `/api/avatars/initials?${params.toString()}`;
};

export function getUserAvatarUrl(
  user: UserData,
  size: number = 64,
  jerseyNumber?: string | null,
): string {
  const normalizedJerseyNumber = jerseyNumber?.trim();
  if (normalizedJerseyNumber) {
    return buildInitialsAvatarUrl(normalizedJerseyNumber, size);
  }

  if (user.profileImageId) {
    return buildPreviewUrl(user.profileImageId, size, size);
  }

  const fullName = getUserFullName(user);
  const initials = fullName || user.userName || 'User';
  const colorSeed = user.isIdentityHidden
    ? initials
    : [initials, user.userName?.trim()].filter(Boolean).join('|');
  return buildInitialsAvatarUrl(initials, size, colorSeed);
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
    const displayUrl = organization.logoUrl?.trim() || organization.imageUrl?.trim();
    if (displayUrl) {
      return displayUrl;
    }
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
    const displayUrl = organizationInput.logoUrl?.trim() || organizationInput.imageUrl?.trim();
    if (displayUrl) {
      return displayUrl;
    }
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

export interface BillingAddress {
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string;
}

export interface BillingAddressProfile {
  billingAddress: BillingAddress | null;
  email?: string | null;
}

export interface PaymentIntent {
  paymentIntent?: string;
  ephemeralKey?: string;
  customer?: string;
  publishableKey: string;
  checkoutMode?: 'PAYMENT_INTENT' | 'CHECKOUT_SESSION';
  checkoutUrl?: string | null;
  checkoutSessionId?: string | null;
  registrationId?: string | null;
  registrationHoldExpiresAt?: string | null;
  registrationHoldTtlSeconds?: number | null;
  feeBreakdown: FeeBreakdown;
  taxCalculationId?: string;
  taxCategory?: string;
  taxMode?: TaxMode;
  taxReasonCode?: string;
  taxJurisdictionState?: string | null;
  taxability?: Taxability;
  taxLiabilityParty?: TaxLiabilityParty;
  taxCollectionStrategy?: TaxCollectionStrategy;
  taxPolicyRuleId?: string;
  taxPolicyRuleVersion?: string;
  organizerResponsibilityMessage?: string;
  error?: string;
  billId?: string | null;
  billPaymentId?: string | null;
  productId?: string | null;
  productPeriod?: string | null;
}

export interface FeeBreakdown {
  eventPrice: number;
  stripeFee: number;
  stripeProcessingFee?: number;
  stripeTaxServiceFee?: number;
  processingFee: number;
  mvpFee?: number;
  taxAmount?: number;
  totalCharge: number;
  hostReceives: number;
  feePercentage: number;
  paymentMethodType?: string;
  paymentMethodLabel?: string;
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
  status: 'PENDING' | 'PARTIAL' | 'PROCESSING' | 'FAILED' | 'DISPUTED' | 'PAID' | 'VOID';
  paidAmountCents?: number;
  paidAt?: string;
  paymentIntentId?: string;
  payerUserId?: string;
  refundedAmountCents?: number;
}

export interface BillDiscountSummary {
  id: string;
  discountId: string;
  discountCodeId: string;
  code: string;
  name?: string | null;
  originalAmountCents: number;
  discountedAmountCents: number;
  discountAmountCents: number;
  paymentIntentId?: string | null;
  registrationId?: string | null;
}

export type BillLineItemType = 'EVENT' | 'FEE' | 'TAX' | 'PRODUCT' | 'RENTAL' | 'OTHER';

export interface BillLineItem {
  id?: string;
  type: BillLineItemType;
  label: string;
  amountCents: number;
  quantity?: number;
}

export type BillOwnerType = 'USER' | 'TEAM' | 'ORGANIZATION';
export type BillSourceType = 'EVENT' | 'RENTAL_BOOKING' | 'PRODUCT' | 'TEAM_REGISTRATION' | 'BILL' | string;

export interface Bill {
  $id: string;
  ownerType: BillOwnerType;
  ownerId: string;
  organizationId?: string | null;
  eventId?: string | null;
  slotId?: string | null;
  occurrenceDate?: string | null;
  sourceType?: BillSourceType | null;
  sourceId?: string | null;
  totalAmountCents: number;
  paidAmountCents: number;
  originalAmountCents?: number;
  discountAmountCents?: number;
  discountedAmountCents?: number;
  discounts?: BillDiscountSummary[];
  nextPaymentDue?: string | null;
  nextPaymentAmountCents?: number | null;
  parentBillId?: string | null;
  allowSplit?: boolean;
  status: 'OPEN' | 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  paymentPlanEnabled?: boolean;
  createdBy?: string | null;
  lineItems?: BillLineItem[];
  payments?: BillPayment[];
}

const normalizePriceCentsValue = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.round(parsed));
};

const normalizeDivisionLookupKey = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

const collectEventDivisionPriceCents = (
  event?: Pick<Event, 'price' | 'divisions' | 'divisionDetails'> | null,
): number[] => {
  if (!event) {
    return [0];
  }

  const defaultPriceCents = normalizePriceCentsValue(event.price);
  const divisionEntries = Array.isArray(event.divisions) ? event.divisions : [];
  const detailEntries = Array.isArray(event.divisionDetails) ? event.divisionDetails : [];
  const detailsByLookup = new Map<string, Division>();

  detailEntries.forEach((detail) => {
    const detailId = normalizeDivisionLookupKey(detail.id);
    const detailKey = normalizeDivisionLookupKey(detail.key);
    if (detailId) {
      detailsByLookup.set(detailId, detail);
    }
    if (detailKey) {
      detailsByLookup.set(detailKey, detail);
    }
  });

  const resolvePrice = (detail?: Partial<Division> | null): number | null => (
    detail && Number.isFinite(Number(detail.price))
      ? normalizePriceCentsValue(detail.price)
      : null
  );

  const prices: number[] = [];

  if (divisionEntries.length > 0) {
    divisionEntries.forEach((entry) => {
      if (entry && typeof entry === 'object') {
        const division = entry as Division;
        const explicitPrice = Number.isFinite(Number(division.price))
          ? normalizePriceCentsValue(division.price)
          : null;
        const divisionId = normalizeDivisionLookupKey(division.id);
        const divisionKey = normalizeDivisionLookupKey(division.key);
        const detail = (divisionId ? detailsByLookup.get(divisionId) : null)
          ?? (divisionKey ? detailsByLookup.get(divisionKey) : null);
        const resolvedPrice = explicitPrice ?? resolvePrice(detail);
        if (resolvedPrice !== null) {
          prices.push(resolvedPrice);
        }
        return;
      }

      const lookupKey = normalizeDivisionLookupKey(entry);
      const detail = lookupKey ? detailsByLookup.get(lookupKey) : null;
      const resolvedPrice = resolvePrice(detail);
      if (resolvedPrice !== null) {
        prices.push(resolvedPrice);
      }
    });
  } else if (detailEntries.length > 0) {
    detailEntries.forEach((detail) => {
      const resolvedPrice = resolvePrice(detail);
      if (resolvedPrice !== null) {
        prices.push(resolvedPrice);
      }
    });
  }

  if (divisionEntries.length > 0 || detailEntries.length > 0) {
    return prices;
  }

  return [defaultPriceCents];
};

export function formatPrice(price?: number) {
  if (!price) return 'Free';
  return `$${(price / 100).toFixed(2)}`;
}

const formatPriceRange = (minPriceCents: number, maxPriceCents: number) => {
  if (minPriceCents === maxPriceCents) {
    return formatPrice(minPriceCents);
  }
  return `${formatPrice(minPriceCents)} - ${formatPrice(maxPriceCents)}`;
};

export function getEventDivisionPriceRange(
  event?: Pick<Event, 'price' | 'divisions' | 'divisionDetails'> | null,
) {
  const prices = collectEventDivisionPriceCents(event);
  return prices.reduce(
    (range, priceCents) => ({
      minPriceCents: Math.min(range.minPriceCents, priceCents),
      maxPriceCents: Math.max(range.maxPriceCents, priceCents),
    }),
    {
      minPriceCents: prices[0] ?? 0,
      maxPriceCents: prices[0] ?? 0,
    },
  );
}

export function formatEventDivisionPriceRange(
  event?: Pick<Event, 'price' | 'divisions' | 'divisionDetails'> | null,
) {
  const prices = collectEventDivisionPriceCents(event);
  if (!prices.length) {
    return 'Price not set';
  }
  const { minPriceCents, maxPriceCents } = getEventDivisionPriceRange(event);
  return formatPriceRange(minPriceCents, maxPriceCents);
}

export function formatAffiliateEventPriceRange(
  event?: Pick<Event, 'price' | 'divisions' | 'divisionDetails'> | null,
) {
  const hasDivisionEntries = Array.isArray(event?.divisions) && event.divisions.length > 0
    || Array.isArray(event?.divisionDetails) && event.divisionDetails.length > 0;
  const divisionPriceDisplay = formatEventDivisionPriceRange(event);
  if (divisionPriceDisplay === 'Price not set') {
    return 'Price not specified';
  }

  const eventPrice = Number(event?.price);
  if (
    divisionPriceDisplay === 'Free'
    && !hasDivisionEntries
    && (!Number.isFinite(eventPrice) || eventPrice <= 0)
  ) {
    return 'Price not specified';
  }

  return divisionPriceDisplay;
}

export function formatBillAmount(amountCents: number) {
  return `$${(amountCents / 100).toFixed(2)}`;
}

