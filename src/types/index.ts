import { storage } from "@/app/appwrite";
import { formatLocalDateTime, parseLocalDateTime } from '@/lib/dateUtils';

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
}

// Match interface for tournaments (matching Python model)
export interface Match {
  $id: string;
  matchId?: number;
  team1Points: number[];
  team2Points: number[];
  tournamentId?: string;
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
  team1Seed?: number;
  team2Seed?: number;

  // Relationship fields - hydrated when selected via Queries
  division?: Division;
  field?: Field;
  referee?: Team;
  team1?: Team;
  team2?: Team;
  event?: Event;

  // Match relationships
  previousLeftMatch?: Match;
  previousRightMatch?: Match;
  winnerNextMatch?: Match;
  loserNextMatch?: Match;

  $createdAt?: string;
  $updatedAt?: string;
}

export interface MatchPayload extends Omit<Match, 'field' | '$id'> {
  field?: FieldPayload;
}

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
  scheduledFieldId?: string;
}

export interface TimeSlotPayload extends Omit<TimeSlot, '$id'> {
}

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
  teamInvites: string[];
  eventInvites: string[];
  hasStripeAccount?: boolean;
  uploadedImages: string[];
  profileImageId?: string;
  $createdAt?: string;
  $updatedAt?: string;

  // Computed properties
  fullName: string;
  avatarUrl: string;
}

export interface UserDataPayload extends Omit<UserData, 'fullName' | 'avatarUrl'> { }

export interface Team {
  $id: string;
  name?: string;
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

export interface TeamPayload extends Omit<
  Team,
  'winRate' | 'currentSize' | 'isFull' | 'avatarUrl' | 'players' | 'pendingPlayers' | 'captain'
> {
  players?: UserDataPayload[];
  pendingPlayers?: UserDataPayload[];
  captain?: UserDataPayload;
}

// Updated Field interface
export interface Field {
  $id: string;
  name: string;
  location: string;
  lat: number;
  long: number;
  type: string;
  fieldNumber: number;

  // Relationships
  divisions?: Division[];
  matches?: Match[];
  events?: Event[];
  organization?: Organization | string;
  rentalSlots?: TimeSlot[];
}

export interface FieldPayload extends Omit<Field, 'matches' | 'events' | '$id'> { }

// Core Event interface with relationships
export interface Event {
  $id: string;
  name: string;
  description: string;
  start: string;
  end: string;
  location: string;
  coordinates: [number, number];
  fieldType: string;
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
  waitList?: string[];
  freeAgents?: string[];
  cancellationRefundHours: number;
  registrationCutoffHours: number;
  seedColor: number;
  $createdAt: string;
  $updatedAt: string;
  eventType: 'pickup' | 'tournament' | 'league';
  sport: string;
  organization?: Organization | string;

  // Relationship fields - can be IDs or expanded objects
  divisions: Division[] | string[];
  timeSlots?: TimeSlot[];

  // Tournament-specific fields
  doubleElimination?: boolean;
  winnerSetCount?: number;
  loserSetCount?: number;
  winnerBracketPointsToVictory?: number[];
  loserBracketPointsToVictory?: number[];
  winnerScoreLimitsPerSet?: number[];
  loserScoreLimitsPerSet?: number[];
  prize?: string;
  fieldCount?: number;
  fields?: Field[];
  matches?: Match[];
  teams?: Team[];
  players?: UserData[];

  // League-specific fields (flattened for DB compatibility)
  gamesPerOpponent?: number;
  includePlayoffs?: boolean;
  playoffTeamCount?: number;
  usesSets?: boolean;
  matchDurationMinutes?: number;
  setDurationMinutes?: number;
  setsPerMatch?: number;
  status?: EventStatus;
  leagueConfig?: LeagueConfig;

  // Computed properties
  attendees: number;
}

export interface EventPayload extends Omit<Event, 'attendees' | 'category' | 'players' | 'teams' | 'leagueConfig' | 'matches' | 'timeSlots'> {
  players?: string[];
  teams?: string[];
  matches?: string[];
  timeSlots?: TimeSlotPayload[];
}

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
  $createdAt?: string;
  $updatedAt?: string;

  // Relationships
  events?: Event[];
  teams?: Team[];
  fields?: Field[];
}

export enum Sports {
  Volleyball = 'Volleyball',
  Soccer = 'Soccer',
  Basketball = 'Basketball',
  Tennis = 'Tennis',
  Pickleball = 'Pickleball',
  Swimming = 'Swimming',
  Football = 'Football',
  Hockey = 'Hockey',
  Baseball = 'Baseball',
  Other = 'Other',
}

export const SPORTS_LIST: string[] = Object.values(Sports);

export type EventState = 'PUBLISHED' | 'UNPUBLISHED';

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
  return `${process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT}/avatars/initials?name=${encodeURIComponent(initials)}&width=${size}&height=${size}`;
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
  return `${process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT}/avatars/initials?name=${encodeURIComponent(initials)}&width=${size}&height=${size}`;
}

export function getEventImageUrl(params: {
  imageId: string;
  size?: number;
  width?: number;
  height?: number;
}): string {
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

export function formatPrice(price?: number) {
  if (!price) return 'Free';
  return `$${(price / 100).toFixed(2)}`;
}
