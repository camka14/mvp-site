'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useParams, useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Container, Title, Text, Group, Button, Paper, Alert, Tabs, Stack, Table, UnstyledButton, Modal, Select, SimpleGrid, TextInput, Loader, NumberInput, Checkbox, Badge, ActionIcon, Textarea, Popover } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useMediaQuery } from '@mantine/hooks';
import { ListChecks, Megaphone } from 'lucide-react';

import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import { useApp } from '@/app/providers';
import { useLocation } from '@/app/hooks/useLocation';
import { eventService } from '@/lib/eventService';
import { leagueService } from '@/lib/leagueService';
import { tournamentService, type LeagueStandingsDivisionResponse } from '@/lib/tournamentService';
import { organizationService } from '@/lib/organizationService';
import { sportsService } from '@/lib/sportsService';
import { teamService } from '@/lib/teamService';
import { userService } from '@/lib/userService';
import { paymentService } from '@/lib/paymentService';
import { boldsignService, type SignStep } from '@/lib/boldsignService';
import { signedDocumentService } from '@/lib/signedDocumentService';
import { familyService } from '@/lib/familyService';
import { apiRequest } from '@/lib/apiClient';
import { hasStaffMemberType } from '@/lib/staff';
import { normalizeApiEvent, normalizeApiMatch } from '@/lib/apiMappers';
import { formatLocalDateTime, parseLocalDateTime } from '@/lib/dateUtils';
import { calculateMvpAndStripeFees } from '@/lib/billingFees';
import { createClientId } from '@/lib/clientId';
import { createId } from '@/lib/id';
import { cloneEventAsTemplate, seedEventFromTemplate } from '@/lib/eventTemplates';
import { toEventPayload } from '@/types';
import { formatBillAmount } from '@/types';
import type { Event, EventState, Field, LeagueConfig, Match, Team, TournamentBracket, Organization, Sport, PaymentIntent, TimeSlot, UserData } from '@/types';
import { createLeagueScoringConfig } from '@/types/defaults';
import type {
  EventTeamComplianceResponse,
  EventUserComplianceResponse,
  TeamComplianceSummary,
  TeamComplianceUserSummary,
} from '@/lib/eventTeamCompliance';
import { validateAndNormalizeBracketGraph, type BracketNode } from '@/server/matches/bracketGraph';
import LeagueCalendarView from './components/LeagueCalendarView';
import TournamentBracketView from './components/TournamentBracketView';
import MatchEditModal from './components/MatchEditModal';
import EventForm, { EventFormHandle } from './components/EventForm';
import { detectMatchConflictsById, MATCH_CONFLICT_RESOLUTION_MESSAGE } from './lib/matchConflicts';
import EventDetailSheet from '@/app/discover/components/EventDetailSheet';
import ScoreUpdateModal from './components/ScoreUpdateModal';
import PaymentModal, { PaymentEventSummary } from '@/components/ui/PaymentModal';
import TeamCard from '@/components/ui/TeamCard';
import TeamDetailModal from '@/components/ui/TeamDetailModal';
import UserCard from '@/components/ui/UserCard';
import DivisionTeamComplianceCard from './components/DivisionTeamComplianceCard';

const cloneValue = <T,>(value: T): T => {
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

const formatLatLngLabel = (lat?: number, lng?: number): string => {
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return '';
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return '';
  }
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
};

type DivisionOption = {
  value: string;
  label: string;
};

type MatchCreateContext = 'schedule' | 'bracket';

type StagedMatchCreateMeta = {
  clientId: string;
  creationContext: MatchCreateContext;
  autoPlaceholderTeam: boolean;
};

const CLIENT_MATCH_PREFIX = 'client:';
const LOCAL_PLACEHOLDER_PREFIX = 'placeholder-local:';

const isClientMatchId = (id: string | null | undefined): boolean =>
  typeof id === 'string' && id.startsWith(CLIENT_MATCH_PREFIX);

const getClientIdFromMatchId = (id: string): string =>
  id.slice(CLIENT_MATCH_PREFIX.length);

const isLocalPlaceholderId = (id: string | null | undefined): boolean =>
  typeof id === 'string' && id.startsWith(LOCAL_PLACEHOLDER_PREFIX);

const asBulkMatchRef = (value: string | null | undefined): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const nextMatchSequenceNumber = (matches: Match[]): number => {
  const maxCurrent = matches.reduce((maxValue, match) => {
    if (typeof match.matchId !== 'number' || !Number.isFinite(match.matchId)) {
      return maxValue;
    }
    return Math.max(maxValue, Math.trunc(match.matchId));
  }, 0);
  return maxCurrent + 1;
};

const normalizeDivisionToken = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeIdToken = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const collectMatchAssignmentUserIds = (match: Match): string[] => {
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

const clearMatchReferencesToTarget = (match: Match, removedMatchId: string): Match => {
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

const toDivisionKey = (divisionId: string | null | undefined): string | null => {
  const normalized = normalizeDivisionToken(divisionId);
  return normalized ? normalized.toLowerCase() : null;
};

const getDivisionId = (division: unknown): string | null => {
  if (typeof division === 'string') {
    return normalizeDivisionToken(division);
  }

  if (!division || typeof division !== 'object') {
    return null;
  }

  const divisionRecord = division as Record<string, unknown>;
  return (
    normalizeDivisionToken(divisionRecord.id) ??
    normalizeDivisionToken(divisionRecord.$id) ??
    normalizeDivisionToken(divisionRecord.key) ??
    normalizeDivisionToken(divisionRecord.name)
  );
};

const getDivisionLabel = (division: unknown): string | null => {
  if (typeof division === 'string') {
    return normalizeDivisionToken(division);
  }

  if (!division || typeof division !== 'object') {
    return null;
  }

  const divisionRecord = division as Record<string, unknown>;
  return (
    normalizeDivisionToken(divisionRecord.name) ??
    normalizeDivisionToken(divisionRecord.id) ??
    normalizeDivisionToken(divisionRecord.$id) ??
    normalizeDivisionToken(divisionRecord.key)
  );
};

const getDivisionKind = (division: unknown): 'LEAGUE' | 'PLAYOFF' | null => {
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

const isDivisionStandingsConfirmed = (division: unknown): boolean => {
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

const getDivisionTeamIds = (division: unknown): string[] => {
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

const getTeamDivision = (team: Match['team1'] | Match['team2']): unknown => {
  if (!team) {
    return null;
  }

  return team.division;
};

const getMatchDivisionId = (match: Match): string | null =>
  getDivisionId(match.division) ??
  getDivisionId(getTeamDivision(match.team1)) ??
  getDivisionId(getTeamDivision(match.team2));

const getMatchDivisionLabel = (match: Match): string | null =>
  getDivisionLabel(match.division) ??
  getDivisionLabel(getTeamDivision(match.team1)) ??
  getDivisionLabel(getTeamDivision(match.team2));

const isPlayoffBracketMatch = (match: Match): boolean =>
  Boolean(
    match.previousLeftId ||
    match.previousRightId ||
    match.winnerNextMatchId ||
    match.loserNextMatchId,
  );

const shouldResetBracketMatchForRebuild = (event: Event, match: Match): boolean => {
  if (event.eventType === 'TOURNAMENT') {
    return true;
  }
  if (event.eventType === 'LEAGUE' && event.includePlayoffs) {
    return isPlayoffBracketMatch(match);
  }
  return false;
};

const toClearedBracketMatchUpdate = (match: Match): Partial<Match> & { $id: string } => ({
  $id: match.$id,
  team1Points: [],
  team2Points: [],
  setResults: [],
  officialCheckedIn: false,
  locked: false,
});

const pickPreferredRootMatch = (matches: Match[]): Match | null => {
  if (matches.length === 0) {
    return null;
  }

  return matches.reduce<Match>((best, current) => {
    const bestMatchId = Number.isFinite(best.matchId) ? Number(best.matchId) : Number.NEGATIVE_INFINITY;
    const currentMatchId = Number.isFinite(current.matchId) ? Number(current.matchId) : Number.NEGATIVE_INFINITY;

    if (currentMatchId > bestMatchId) {
      return current;
    }
    if (currentMatchId < bestMatchId) {
      return best;
    }
    return current.$id.localeCompare(best.$id) < 0 ? current : best;
  }, matches[0]);
};

const collectConnectedMatchIds = (matches: Record<string, Match>, rootMatchId: string): Set<string> => {
  if (!matches[rootMatchId]) {
    return new Set<string>();
  }

  const adjacency = new Map<string, Set<string>>();
  const ensureNode = (id: string) => {
    if (!adjacency.has(id)) {
      adjacency.set(id, new Set<string>());
    }
  };
  const connectNodes = (firstId?: string | null, secondId?: string | null) => {
    if (!firstId || !secondId || !matches[firstId] || !matches[secondId]) {
      return;
    }
    ensureNode(firstId);
    ensureNode(secondId);
    adjacency.get(firstId)?.add(secondId);
    adjacency.get(secondId)?.add(firstId);
  };

  Object.keys(matches).forEach(ensureNode);
  Object.values(matches).forEach((match) => {
    connectNodes(match.$id, match.previousLeftId);
    connectNodes(match.$id, match.previousRightId);
    connectNodes(match.$id, match.winnerNextMatchId);
    connectNodes(match.$id, match.loserNextMatchId);
  });

  const visited = new Set<string>();
  const stack: string[] = [rootMatchId];

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId || visited.has(currentId) || !matches[currentId]) {
      continue;
    }

    visited.add(currentId);
    const neighbors = adjacency.get(currentId);
    if (!neighbors) {
      continue;
    }

    neighbors.forEach((neighborId) => {
      if (!visited.has(neighborId)) {
        stack.push(neighborId);
      }
    });
  }

  return visited;
};

type MatchConflictPair = {
  firstId: string;
  secondId: string;
};

const listMatchConflictPairs = (conflictsById: Record<string, string[]>): MatchConflictPair[] => {
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

const getConflictMatchLabel = (match: Match): string => {
  if (typeof match.matchId === 'number' && Number.isFinite(match.matchId)) {
    return `Match #${Math.trunc(match.matchId)}`;
  }
  return `Match ${match.$id}`;
};

const getConflictFieldLabel = (match: Match): string => {
  const relationFieldName = typeof match.field?.name === 'string' ? match.field.name.trim() : '';
  if (relationFieldName.length > 0) {
    return relationFieldName;
  }
  if (typeof match.field?.fieldNumber === 'number' && Number.isFinite(match.field.fieldNumber) && match.field.fieldNumber > 0) {
    return `Field ${match.field.fieldNumber}`;
  }
  const relationFieldId = normalizeIdToken(match.field?.$id);
  if (relationFieldId) {
    return `field ${relationFieldId}`;
  }
  const fieldId = normalizeIdToken(match.fieldId);
  if (fieldId) {
    return `field ${fieldId}`;
  }
  return 'an unassigned field';
};

const buildMatchConflictAlertMessage = ({
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


type StandingsSortField = 'team' | 'draws' | 'points';

type StandingsRow = {
  teamId: string;
  teamName: string;
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

type RankedStandingsRow = StandingsRow & { rank: number };

type LocationDefaults = {
  location?: string;
  address?: string;
  coordinates?: [number, number];
};

type EventLifecycleStatus = 'DRAFT' | 'PUBLISHED';
type NotificationAudienceKey = 'managers' | 'players' | 'parents' | 'officials' | 'hosts';
type NotificationAudienceState = Record<NotificationAudienceKey, boolean>;

type TeamBillingUserOption = {
  id: string;
  displayName: string;
};

type TeamBillingPaymentSnapshot = {
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
};

type TeamBillingBillSnapshot = {
  $id: string;
  ownerType: 'TEAM' | 'USER';
  ownerId: string;
  ownerName: string;
  totalAmountCents: number;
  paidAmountCents: number;
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

type TeamBillingSnapshot = {
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

type PendingRentalCheckoutContext = {
  eventDraft: Event;
  draftToSave: Partial<Event>;
  rentalSlot: TimeSlot;
  requiresPayment: boolean;
};

type PendingSaveChangeItem = {
  id: string;
  category: 'event' | 'match';
  label: string;
  detail?: string;
  sortOrder: number;
};

type RentalSelectionQuery = {
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

const DEFAULT_NOTIFICATION_AUDIENCE: NotificationAudienceState = {
  managers: false,
  players: false,
  parents: false,
  officials: false,
  hosts: false,
};

const EVENT_LIFECYCLE_OPTIONS: Array<{ value: EventLifecycleStatus; label: string }> = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHED', label: 'Published' },
];

const getEventLifecycleStatus = (eventInput: Pick<Event, 'state'> | null | undefined): EventLifecycleStatus => {
  if (!eventInput) {
    return 'DRAFT';
  }

  const normalizedState = typeof eventInput.state === 'string' ? eventInput.state.toUpperCase() : 'PUBLISHED';
  if (normalizedState === 'UNPUBLISHED' || normalizedState === 'DRAFT') {
    return 'DRAFT';
  }

  return 'PUBLISHED';
};

const DEFAULT_SPORT: Sport = {
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

// Main schedule page component that protects access and renders league schedule/bracket content.
function EventScheduleContent() {
  const { user, authUser, loading: authLoading, isAuthenticated, isGuest } = useApp();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const eventId = params?.id as string | undefined;
  const isPreview = searchParams?.get('preview') === '1';
  const isEditParam = searchParams?.get('mode') === 'edit';
  const isCreateMode = searchParams?.get('create') === '1';
  const orgIdParam = searchParams?.get('orgId') || undefined;
  const hostOrgIdParam = searchParams?.get('hostOrgId') || undefined;
  const templateIdParam = searchParams?.get('templateId')?.trim() || undefined;
  const skipTemplatePromptParam = searchParams?.get('skipTemplatePrompt') === '1';
  const rentalOrgIdParam = searchParams?.get('rentalOrgId') || undefined;
  const rentalStartParam = searchParams?.get('rentalStart') || undefined;
  const rentalEndParam = searchParams?.get('rentalEnd') || undefined;
  const rentalFieldIdParam = searchParams?.get('rentalFieldId') || undefined;
  const rentalFieldNameParam = searchParams?.get('rentalFieldName') || undefined;
  const rentalFieldNumberParam = searchParams?.get('rentalFieldNumber') || undefined;
  const rentalLocationParam = searchParams?.get('rentalLocation') || undefined;
  const rentalLatParam = searchParams?.get('rentalLat') || undefined;
  const rentalLngParam = searchParams?.get('rentalLng') || undefined;
  const rentalPriceParam = searchParams?.get('rentalPriceCents') || undefined;
  const rentalRequiredTemplateIdsParam = searchParams?.get('rentalRequiredTemplateIds') || undefined;
  const rentalDocumentTemplateIdParam = searchParams?.get('rentalDocumentTemplateId') || undefined;
  const rentalDocumentTemplateIdsParam = searchParams?.get('rentalDocumentTemplateIds') || undefined;
  const rentalSelectionsParam = searchParams?.get('rentalSelections') || undefined;
  const rentalDocumentTemplateIds = useMemo(
    () => Array.from(
      new Set(
        [
          ...(rentalDocumentTemplateIdsParam
            ? rentalDocumentTemplateIdsParam
              .split(',')
              .map((id) => id.trim())
              .filter((id) => id.length > 0)
            : []),
          ...(rentalDocumentTemplateIdParam && rentalDocumentTemplateIdParam.trim().length > 0
            ? [rentalDocumentTemplateIdParam.trim()]
            : []),
        ],
      ),
    ),
    [rentalDocumentTemplateIdParam, rentalDocumentTemplateIdsParam],
  );
  const rentalDocumentTemplateId = rentalDocumentTemplateIds[0];
  const rentalRequiredTemplateIds = useMemo(
    () => (
      rentalRequiredTemplateIdsParam
        ? Array.from(
          new Set(
            rentalRequiredTemplateIdsParam
              .split(',')
              .map((id) => id.trim())
              .filter((id) => id.length > 0),
          ),
        )
        : []
    ),
    [rentalRequiredTemplateIdsParam],
  );
  const rentalSelections = useMemo<RentalSelectionQuery[]>(() => {
    if (!rentalSelectionsParam) {
      return [];
    }

    const normalizeSelectionDateRange = (selection: Record<string, unknown>): { start: string; end: string } | null => {
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

    try {
      const parsed = JSON.parse(rentalSelectionsParam);
      if (!Array.isArray(parsed)) {
        return [];
      }
      const normalizedSelections: RentalSelectionQuery[] = [];
      parsed.forEach((rawSelection, index) => {
        if (!rawSelection || typeof rawSelection !== 'object') {
          return;
        }
        const selection = rawSelection as Record<string, unknown>;
        const dateRange = normalizeSelectionDateRange(selection);
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
  }, [rentalSelectionsParam]);
  const rentalRangeFromSelections = useMemo(() => {
    if (!rentalSelections.length) {
      return { start: undefined, end: undefined };
    }

    let earliest: Date | null = null;
    let latest: Date | null = null;
    rentalSelections.forEach((selection) => {
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
  }, [rentalSelections]);
  const normalizedRentalStart = useMemo(
    () => formatLocalDateTime(rentalStartParam) || rentalRangeFromSelections.start,
    [rentalRangeFromSelections.start, rentalStartParam],
  );
  const normalizedRentalEnd = useMemo(
    () => formatLocalDateTime(rentalEndParam) || rentalRangeFromSelections.end,
    [rentalEndParam, rentalRangeFromSelections.end],
  );
  const rentalFieldIdsFromSelections = useMemo(
    () => Array.from(new Set(rentalSelections.flatMap((selection) => selection.scheduledFieldIds))),
    [rentalSelections],
  );
  const isRentalFlow = Boolean((normalizedRentalStart && normalizedRentalEnd) || rentalSelections.length > 0);
  const resolvedHostOrgId = hostOrgIdParam ?? (!isRentalFlow ? orgIdParam : undefined);
  const resolvedRentalOrgId = rentalOrgIdParam ?? (isRentalFlow ? orgIdParam : undefined);

  const [event, setEvent] = useState<Event | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [changesEvent, setChangesEvent] = useState<Event | null>(null);
  const [changesMatches, setChangesMatches] = useState<Match[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [formHasUnsavedChanges, setFormHasUnsavedChanges] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [dismissedMatchConflictSignature, setDismissedMatchConflictSignature] = useState<string | null>(null);
  const [matchConflictOverrideMessage, setMatchConflictOverrideMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [reschedulingMatches, setReschedulingMatches] = useState(false);
  const [pendingScheduleAction, setPendingScheduleAction] = useState<'reschedule' | 'rebuild' | null>(null);
  const [selectedLifecycleStatus, setSelectedLifecycleStatus] = useState<EventLifecycleStatus | null>(null);
  const [isPendingChangesPopoverOpen, setIsPendingChangesPopoverOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('details');
  const [selectedScheduleDivision, setSelectedScheduleDivision] = useState<string>('all');
  const [selectedBracketDivision, setSelectedBracketDivision] = useState<string | null>(null);
  const [selectedStandingsDivision, setSelectedStandingsDivision] = useState<string | null>(null);
  const [participantTeams, setParticipantTeams] = useState<Team[]>([]);
  const [participantUsers, setParticipantUsers] = useState<UserData[]>([]);
  const [participantOfficials, setParticipantOfficials] = useState<UserData[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantsError, setParticipantsError] = useState<string | null>(null);
  const [participantsUpdatingTeamId, setParticipantsUpdatingTeamId] = useState<string | null>(null);
  const [teamComplianceById, setTeamComplianceById] = useState<Record<string, TeamComplianceSummary>>({});
  const [teamComplianceLoading, setTeamComplianceLoading] = useState(false);
  const [teamComplianceError, setTeamComplianceError] = useState<string | null>(null);
  const [userComplianceById, setUserComplianceById] = useState<Record<string, TeamComplianceUserSummary>>({});
  const [userComplianceLoading, setUserComplianceLoading] = useState(false);
  const [userComplianceError, setUserComplianceError] = useState<string | null>(null);
  const [teamComplianceRefreshKey, setTeamComplianceRefreshKey] = useState(0);
  const [selectedComplianceTeamId, setSelectedComplianceTeamId] = useState<string | null>(null);
  const [expandedComplianceUserIds, setExpandedComplianceUserIds] = useState<string[]>([]);
  const [selectedRefundTeam, setSelectedRefundTeam] = useState<Team | null>(null);
  const [refundSnapshot, setRefundSnapshot] = useState<TeamBillingSnapshot | null>(null);
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [refundAmountDraftByPaymentId, setRefundAmountDraftByPaymentId] = useState<Record<string, number>>({});
  const [refundingPaymentId, setRefundingPaymentId] = useState<string | null>(null);
  const [createBillTeam, setCreateBillTeam] = useState<Team | null>(null);
  const [createBillError, setCreateBillError] = useState<string | null>(null);
  const [creatingBill, setCreatingBill] = useState(false);
  const [createBillOwnerType, setCreateBillOwnerType] = useState<'TEAM' | 'USER'>('TEAM');
  const [createBillOwnerId, setCreateBillOwnerId] = useState<string | null>(null);
  const [createBillAmountDollars, setCreateBillAmountDollars] = useState<number>(0);
  const [createBillTaxDollars, setCreateBillTaxDollars] = useState<number>(0);
  const [createBillAllowSplit, setCreateBillAllowSplit] = useState(false);
  const [createBillLabel, setCreateBillLabel] = useState('Event registration');
  const [isAddTeamModalOpen, setIsAddTeamModalOpen] = useState(false);
  const [selectedParticipantTeam, setSelectedParticipantTeam] = useState<Team | null>(null);
  const [selectedAddTeamDivisionId, setSelectedAddTeamDivisionId] = useState<string | null>(null);
  const [teamSearchQuery, setTeamSearchQuery] = useState('');
  const [organizationTeamsForPicker, setOrganizationTeamsForPicker] = useState<Team[]>([]);
  const [organizationTeamsLoading, setOrganizationTeamsLoading] = useState(false);
  const [searchTeamPool, setSearchTeamPool] = useState<Team[]>([]);
  const [searchTeamsLoading, setSearchTeamsLoading] = useState(false);
  const [isMatchEditorOpen, setIsMatchEditorOpen] = useState(false);
  const [matchEditorContext, setMatchEditorContext] = useState<MatchCreateContext>('bracket');
  const [pendingCreateMatchId, setPendingCreateMatchId] = useState<string | null>(null);
  const [stagedMatchCreates, setStagedMatchCreates] = useState<Record<string, StagedMatchCreateMeta>>({});
  const [stagedMatchDeletes, setStagedMatchDeletes] = useState<string[]>([]);
  const [standingsSort, setStandingsSort] = useState<{ field: StandingsSortField; direction: 'asc' | 'desc' }>({
    field: 'points',
    direction: 'desc',
  });
  const [standingsDivisionData, setStandingsDivisionData] = useState<LeagueStandingsDivisionResponse | null>(null);
  const [standingsDraftOverrides, setStandingsDraftOverrides] = useState<Record<string, number>>({});
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [savingStandings, setSavingStandings] = useState(false);
  const [confirmingStandings, setConfirmingStandings] = useState(false);
  const [applyStandingsReassignment, setApplyStandingsReassignment] = useState(true);
  const [standingsActionError, setStandingsActionError] = useState<string | null>(null);
  const [matchBeingEdited, setMatchBeingEdited] = useState<Match | null>(null);
  const [scoreUpdateMatch, setScoreUpdateMatch] = useState<Match | null>(null);
  const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);
  const [organizationForCreate, setOrganizationForCreate] = useState<Organization | null>(null);
  const [rentalOrganization, setRentalOrganization] = useState<Organization | null>(null);
  const [formSeedEvent, setFormSeedEvent] = useState<Event | null>(null);
  const [rentalPaymentData, setRentalPaymentData] = useState<PaymentIntent | null>(null);
  const [showRentalPayment, setShowRentalPayment] = useState(false);
  const [showRentalSignModal, setShowRentalSignModal] = useState(false);
  const [rentalSignLinks, setRentalSignLinks] = useState<SignStep[]>([]);
  const [rentalSignIndex, setRentalSignIndex] = useState(0);
  const [rentalTextAccepted, setRentalTextAccepted] = useState(false);
  const [rentalSignError, setRentalSignError] = useState<string | null>(null);
  const [recordingRentalSignature, setRecordingRentalSignature] = useState(false);
  const [pendingRentalSignedDocumentId, setPendingRentalSignedDocumentId] = useState<string | null>(null);
  const [pendingRentalSignatureOperationId, setPendingRentalSignatureOperationId] = useState<string | null>(null);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [templateSummaries, setTemplateSummaries] = useState<Array<{ id: string; name: string }>>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templatePromptOpen, setTemplatePromptOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedTemplateStartDate, setSelectedTemplateStartDate] = useState<Date | null>(null);
  const [templateSeedKey, setTemplateSeedKey] = useState(0);
  const [eventFormResetVersion, setEventFormResetVersion] = useState(0);
  const [childUserIds, setChildUserIds] = useState<string[]>([]);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
  const [notificationTitle, setNotificationTitle] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationAudience, setNotificationAudience] = useState<NotificationAudienceState>({ ...DEFAULT_NOTIFICATION_AUDIENCE });
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [sendingNotification, setSendingNotification] = useState(false);
  const templatePromptResolvedRef = useRef(false);
  const templateIdSeedResolvedRef = useRef<string | null>(null);
  const [failedTemplateSeedId, setFailedTemplateSeedId] = useState<string | null>(null);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const pendingRentalCheckoutRef = useRef<PendingRentalCheckoutContext | null>(null);
  const isMobile = useMediaQuery('(max-width: 36em)');
  const eventFormRef = useRef<EventFormHandle>(null);
  const { location: userLocation, locationInfo: userLocationInfo } = useLocation();
  const rentalCoordinates = useMemo<[number, number] | undefined>(() => {
    const lat = rentalLatParam ? Number(rentalLatParam) : undefined;
    const lng = rentalLngParam ? Number(rentalLngParam) : undefined;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return [lng as number, lat as number];
    }
    return undefined;
  }, [rentalLatParam, rentalLngParam]);

  const userLocationLabel = useMemo(() => {
    if (userLocationInfo) {
      const parts = [userLocationInfo.city, userLocationInfo.state]
        .filter((part): part is string => Boolean(part && part.trim().length > 0));
      if (parts.length) {
        return parts.join(', ');
      }
      if (userLocationInfo.zipCode && userLocationInfo.zipCode.trim().length > 0) {
        return userLocationInfo.zipCode;
      }
      if (userLocationInfo.country && userLocationInfo.country.trim().length > 0) {
        return userLocationInfo.country;
      }
      if (typeof userLocationInfo.lat === 'number' && typeof userLocationInfo.lng === 'number') {
        return formatLatLngLabel(userLocationInfo.lat, userLocationInfo.lng);
      }
    }
    if (userLocation) {
      return formatLatLngLabel(userLocation.lat, userLocation.lng);
    }
    return '';
  }, [userLocationInfo, userLocation]);

  const userCoordinates = useMemo<[number, number] | null>(() => {
    if (!userLocation) {
      return null;
    }
    if (
      typeof userLocation.lat !== 'number' ||
      typeof userLocation.lng !== 'number' ||
      !Number.isFinite(userLocation.lat) ||
      !Number.isFinite(userLocation.lng)
    ) {
      return null;
    }
    return [userLocation.lng, userLocation.lat];
  }, [userLocation]);

  const buildLocationDefaults = useCallback(
    (organizationInput?: Organization | null): LocationDefaults | undefined => {
      const orgLabel = organizationInput?.location?.trim() ?? '';
      const orgAddress = organizationInput?.address?.trim() ?? '';
      const orgCoordinates =
        Array.isArray(organizationInput?.coordinates) &&
          typeof organizationInput.coordinates[0] === 'number' &&
          typeof organizationInput.coordinates[1] === 'number'
          ? (organizationInput.coordinates as [number, number])
          : undefined;

      if (organizationInput && (orgLabel || orgCoordinates)) {
        return {
          location: orgLabel || userLocationLabel,
          address: orgAddress || undefined,
          coordinates: orgCoordinates ?? userCoordinates ?? undefined,
        };
      }

      if (userLocationLabel || userCoordinates) {
        return {
          location: userLocationLabel,
          address: undefined,
          coordinates: userCoordinates ?? undefined,
        };
      }

      return undefined;
    },
    [userCoordinates, userLocationLabel],
  );

  const createLocationDefaults = useMemo(
    () => buildLocationDefaults(organizationForCreate),
    [buildLocationDefaults, organizationForCreate],
  );

  const rentalImmutableDefaults = useMemo<Partial<Event> | undefined>(() => {
    if (!isCreateMode || (!normalizedRentalStart && !normalizedRentalEnd && rentalSelections.length === 0)) {
      return undefined;
    }

    const normalizedStart = normalizedRentalStart;
    const normalizedEnd = normalizedRentalEnd;
    if (!normalizedStart || !normalizedEnd) {
      return undefined;
    }

    const rentalFieldsById = new Map(
      (rentalOrganization?.fields || [])
        .filter((field): field is Field => Boolean(field?.$id))
        .map((field) => [field.$id, field as Field]),
    );
    const allRentalFieldIds = Array.from(
      new Set([
        ...(rentalFieldIdParam ? [rentalFieldIdParam] : []),
        ...rentalFieldIdsFromSelections,
      ]),
    );
    const primaryRentalFieldId = allRentalFieldIds[0];
    const rentalFieldFromOrg = primaryRentalFieldId
      ? rentalFieldsById.get(primaryRentalFieldId)
      : undefined;

    const fallbackFieldNumber = (() => {
      if (typeof rentalFieldFromOrg?.fieldNumber === 'number') {
        return rentalFieldFromOrg.fieldNumber;
      }
      const parsed = rentalFieldNumberParam ? Number(rentalFieldNumberParam) : NaN;
      return Number.isFinite(parsed) ? parsed : 1;
    })();

    const rentalField: Field | undefined = (() => {
      if (rentalFieldFromOrg) {
        return rentalFieldFromOrg as Field;
      }
      if (!primaryRentalFieldId) {
        return undefined;
      }
      return {
        $id: primaryRentalFieldId,
        name: rentalFieldNameParam?.trim() || `Field ${fallbackFieldNumber}`,
        fieldNumber: fallbackFieldNumber,
        location: rentalLocationParam ?? '',
        lat: rentalCoordinates?.[1] ?? 0,
        long: rentalCoordinates?.[0] ?? 0,
      };
    })();

    const resolvedField = rentalFieldFromOrg ?? rentalField;
    const derivedLocation = rentalLocationParam ?? resolvedField?.location ?? rentalOrganization?.location ?? '';
    const derivedCoordinates =
      rentalCoordinates ??
      (resolvedField ? [resolvedField.long, resolvedField.lat] as [number, number] : undefined) ??
      (rentalOrganization?.coordinates as [number, number] | undefined);

    const defaults: Partial<Event> = {
      start: normalizedStart,
      end: normalizedEnd,
      location: derivedLocation,
      address: rentalOrganization?.address ?? undefined,
    };

    if (derivedCoordinates) {
      defaults.coordinates = derivedCoordinates;
    }
    const resolvedFields = allRentalFieldIds
      .map((fieldId, index) => {
        const fromOrganization = rentalFieldsById.get(fieldId);
        if (fromOrganization) {
          return fromOrganization;
        }
        if (resolvedField && resolvedField.$id === fieldId) {
          return resolvedField;
        }
        return {
          $id: fieldId,
          name: `Field ${index + 1}`,
          fieldNumber: index + 1,
          location: rentalLocationParam ?? rentalOrganization?.location ?? '',
          lat: rentalCoordinates?.[1] ?? 0,
          long: rentalCoordinates?.[0] ?? 0,
        } as Field;
      })
      .filter((field): field is Field => Boolean(field?.$id));
    if (resolvedFields.length > 0) {
      defaults.fields = resolvedFields;
      defaults.fieldIds = resolvedFields.map((field) => field.$id);
    } else if (resolvedField) {
      defaults.fields = [resolvedField];
      defaults.fieldIds = [resolvedField.$id];
    }
    if (rentalSelections.length > 0) {
      const rentalTimeSlots: TimeSlot[] = [];
      rentalSelections.forEach((selectionItem, index) => {
          const selectionStart = parseLocalDateTime(selectionItem.startDate);
          const selectionEnd = parseLocalDateTime(selectionItem.endDate);
          if (!selectionStart || !selectionEnd || selectionEnd.getTime() <= selectionStart.getTime()) {
            return;
          }
          const dayOfWeek = ((selectionStart.getDay() + 6) % 7) as TimeSlot['dayOfWeek'];
          rentalTimeSlots.push({
            $id: selectionItem.key || `rental-selection-${index + 1}`,
            dayOfWeek,
            daysOfWeek: [dayOfWeek] as TimeSlot['daysOfWeek'],
            startTimeMinutes: selectionStart.getHours() * 60 + selectionStart.getMinutes(),
            endTimeMinutes: selectionEnd.getHours() * 60 + selectionEnd.getMinutes(),
            startDate: formatLocalDateTime(selectionStart) ?? selectionItem.startDate,
            endDate: formatLocalDateTime(selectionEnd) ?? selectionItem.endDate,
            repeating: false,
            scheduledFieldId: selectionItem.scheduledFieldIds[0],
            scheduledFieldIds: selectionItem.scheduledFieldIds,
          });
        });
      defaults.timeSlots = rentalTimeSlots;
    }
    if (rentalRequiredTemplateIds.length > 0) {
      defaults.requiredTemplateIds = rentalRequiredTemplateIds;
    }

    return defaults;
  }, [
    isCreateMode,
    rentalRequiredTemplateIds,
    rentalOrganization,
    rentalSelections,
    rentalFieldIdsFromSelections,
    rentalCoordinates,
    normalizedRentalEnd,
    rentalFieldIdParam,
    rentalFieldNameParam,
    rentalFieldNumberParam,
    rentalLocationParam,
    normalizedRentalStart,
  ]);

  const rentalPurchaseContext = useMemo(() => {
    if (!isCreateMode) {
      return undefined;
    }
    const normalizedStart = normalizedRentalStart;
    const normalizedEnd = normalizedRentalEnd;
    if (!normalizedStart || !normalizedEnd) {
      return undefined;
    }
    const priceCents = rentalPriceParam ? Number(rentalPriceParam) : undefined;
    const normalizedPrice = Number.isFinite(priceCents) ? Number(priceCents) : undefined;
    return {
      start: normalizedStart,
      end: normalizedEnd,
      fieldId: rentalFieldIdParam ?? rentalFieldIdsFromSelections[0] ?? undefined,
      priceCents: normalizedPrice,
      rentalDocumentTemplateId,
      rentalDocumentTemplateIds,
    };
  }, [
    isCreateMode,
    normalizedRentalEnd,
    normalizedRentalStart,
    rentalDocumentTemplateId,
    rentalDocumentTemplateIds,
    rentalFieldIdParam,
    rentalFieldIdsFromSelections,
    rentalPriceParam,
  ]);

  const rentalPurchaseTimeSlot = useMemo<TimeSlot | null>(() => {
    if (!rentalPurchaseContext) {
      return null;
    }
    const startDate = parseLocalDateTime(rentalPurchaseContext.start);
    const endDate = parseLocalDateTime(rentalPurchaseContext.end);
    if (!startDate || !endDate) {
      return null;
    }

    const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
    const endMinutes = endDate.getHours() * 60 + endDate.getMinutes();
    const draftFields = Array.isArray(changesEvent?.fields)
      ? changesEvent?.fields
      : rentalImmutableDefaults?.fields;
    const fallbackFieldId = Array.isArray(draftFields) && draftFields.length > 0
      ? (draftFields[0] as Field).$id
      : undefined;
    const scheduledFieldId = rentalPurchaseContext.fieldId ?? fallbackFieldId;
    if (!scheduledFieldId) {
      return null;
    }

    const dayOfWeek = ((startDate.getDay() + 7) % 7) as TimeSlot['dayOfWeek'];
    const price = Number.isFinite(rentalPurchaseContext.priceCents) ? Number(rentalPurchaseContext.priceCents) : undefined;

    return {
      $id: createClientId(),
      dayOfWeek,
      startTimeMinutes: startMinutes,
      endTimeMinutes: endMinutes,
      startDate: formatLocalDateTime(startDate),
      endDate: formatLocalDateTime(endDate),
      repeating: false,
      scheduledFieldId,
      price,
      rentalDocumentTemplateId: rentalPurchaseContext.rentalDocumentTemplateId ?? null,
      rentalDocumentTemplateIds: rentalPurchaseContext.rentalDocumentTemplateIds ?? [],
    };
  }, [changesEvent?.fields, rentalImmutableDefaults?.fields, rentalPurchaseContext]);

  const usingChangeCopies = Boolean(changesEvent);
  const activeEvent = usingChangeCopies ? changesEvent : event;
  const hasPendingUnsavedChanges = hasUnsavedChanges || formHasUnsavedChanges;
  const isTemplateEvent = (activeEvent?.state ?? '').toUpperCase() === 'TEMPLATE';
  const isUnpublished = (activeEvent?.state ?? 'PUBLISHED') === 'UNPUBLISHED' || activeEvent?.state === 'DRAFT';
  const isEditingEvent = isTemplateEvent || isPreview || isEditParam;
  const activeMatches = usingChangeCopies ? changesMatches : matches;
  const matchConflictsById = useMemo<Record<string, string[]>>(
    () => detectMatchConflictsById(activeMatches),
    [activeMatches],
  );
  const matchConflictPairs = useMemo(
    () => listMatchConflictPairs(matchConflictsById),
    [matchConflictsById],
  );
  const matchConflictSignature = useMemo(
    () => matchConflictPairs.map((pair) => `${pair.firstId}|${pair.secondId}`).join(','),
    [matchConflictPairs],
  );
  const hasMatchConflicts = matchConflictPairs.length > 0;
  const baseMatchConflictMessage = useMemo(
    () => (
      hasMatchConflicts
        ? buildMatchConflictAlertMessage({
          matches: activeMatches,
          pairs: matchConflictPairs,
        })
        : null
    ),
    [activeMatches, hasMatchConflicts, matchConflictPairs],
  );
  const visibleMatchConflictMessage = useMemo(() => {
    if (!hasMatchConflicts) {
      return null;
    }
    if (matchConflictOverrideMessage) {
      return matchConflictOverrideMessage;
    }
    if (dismissedMatchConflictSignature === matchConflictSignature) {
      return null;
    }
    return baseMatchConflictMessage;
  }, [
    baseMatchConflictMessage,
    dismissedMatchConflictSignature,
    hasMatchConflicts,
    matchConflictOverrideMessage,
    matchConflictSignature,
  ]);

  useEffect(() => {
    if (!hasMatchConflicts) {
      setDismissedMatchConflictSignature(null);
      setMatchConflictOverrideMessage(null);
      return;
    }
    setMatchConflictOverrideMessage(null);
    setDismissedMatchConflictSignature((current) => (current === matchConflictSignature ? current : null));
  }, [hasMatchConflicts, matchConflictSignature]);

  const divisionLabelsByKey = useMemo(() => {
    const labels = new Map<string, string>();
    if (Array.isArray(activeEvent?.divisionDetails)) {
      activeEvent.divisionDetails.forEach((division) => {
        const divisionId = getDivisionId(division);
        const divisionKey = toDivisionKey(divisionId);
        if (!divisionId || !divisionKey || labels.has(divisionKey)) {
          return;
        }
        labels.set(divisionKey, getDivisionLabel(division) ?? divisionId);
      });
    }
    if (Array.isArray(activeEvent?.playoffDivisionDetails)) {
      activeEvent.playoffDivisionDetails.forEach((division) => {
        const divisionId = getDivisionId(division);
        const divisionKey = toDivisionKey(divisionId);
        if (!divisionId || !divisionKey || labels.has(divisionKey)) {
          return;
        }
        labels.set(divisionKey, getDivisionLabel(division) ?? divisionId);
      });
    }
    if (!Array.isArray(activeEvent?.divisions)) {
      return labels;
    }

    activeEvent.divisions.forEach((division) => {
      const divisionId = getDivisionId(division);
      const divisionKey = toDivisionKey(divisionId);
      if (!divisionId || !divisionKey || labels.has(divisionKey)) {
        return;
      }

      labels.set(divisionKey, getDivisionLabel(division) ?? divisionId);
    });

    return labels;
  }, [activeEvent?.divisionDetails, activeEvent?.divisions, activeEvent?.playoffDivisionDetails]);

  const scheduleDivisionOptions = useMemo<DivisionOption[]>(() => {
    const labels = new Map<string, string>(divisionLabelsByKey);

    activeMatches.forEach((match) => {
      const divisionId = getMatchDivisionId(match);
      const divisionKey = toDivisionKey(divisionId);
      if (!divisionId || !divisionKey) {
        return;
      }

      if (!labels.has(divisionKey)) {
        labels.set(divisionKey, getMatchDivisionLabel(match) ?? divisionId);
      }
    });

    return Array.from(labels.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [activeMatches, divisionLabelsByKey]);

  const leagueDivisionOptions = useMemo<DivisionOption[]>(() => {
    const optionsByValue = new Map<string, string>();
    const addDivisionOption = (division: unknown) => {
      const divisionId = getDivisionId(division);
      if (!divisionId) {
        return;
      }
      if (getDivisionKind(division) === 'PLAYOFF') {
        return;
      }
      if (!optionsByValue.has(divisionId)) {
        optionsByValue.set(divisionId, getDivisionLabel(division) ?? divisionId);
      }
    };

    if (Array.isArray(activeEvent?.divisionDetails)) {
      activeEvent.divisionDetails.forEach(addDivisionOption);
    } else if (Array.isArray(activeEvent?.divisions)) {
      activeEvent.divisions.forEach(addDivisionOption);
    }

    return Array.from(optionsByValue.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [activeEvent?.divisionDetails, activeEvent?.divisions]);

  const isSplitDivisionEvent = Boolean(
    (activeEvent?.eventType ?? changesEvent?.eventType ?? 'EVENT') === 'LEAGUE'
      && !activeEvent?.singleDivision
      && leagueDivisionOptions.length > 0,
  );

  const participantDivisionColumns = useMemo<Array<{ id: string; label: string; teamIds: string[] }>>(() => {
    const sourceDivisions = Array.isArray(activeEvent?.divisionDetails)
      ? activeEvent.divisionDetails
      : Array.isArray(activeEvent?.divisions)
        ? activeEvent.divisions
        : [];
    const columns: Array<{ id: string; label: string; teamIds: string[] }> = [];
    sourceDivisions.forEach((division) => {
      if (getDivisionKind(division) === 'PLAYOFF') {
        return;
      }
      const divisionId = getDivisionId(division);
      if (!divisionId) {
        return;
      }
      columns.push({
        id: divisionId,
        label: getDivisionLabel(division) ?? divisionId,
        teamIds: getDivisionTeamIds(division),
      });
    });
    return columns;
  }, [activeEvent?.divisionDetails, activeEvent?.divisions]);

  const participantDivisionSelectData = useMemo(
    () => participantDivisionColumns.map((column) => ({ value: column.id, label: column.label })),
    [participantDivisionColumns],
  );

  useEffect(() => {
    if (selectedScheduleDivision === 'all') {
      return;
    }

    if (!scheduleDivisionOptions.some((option) => option.value === selectedScheduleDivision)) {
      setSelectedScheduleDivision('all');
    }
  }, [scheduleDivisionOptions, selectedScheduleDivision]);

  const eventTypeForView = activeEvent?.eventType ?? changesEvent?.eventType ?? 'EVENT';
  const isTournament = eventTypeForView === 'TOURNAMENT';
  const isLeague = eventTypeForView === 'LEAGUE';

  const scheduleMatches = useMemo(() => {
    if (selectedScheduleDivision === 'all') {
      return activeMatches;
    }

    return activeMatches.filter((match) => toDivisionKey(getMatchDivisionId(match)) === selectedScheduleDivision);
  }, [activeMatches, selectedScheduleDivision]);

  const preferredStandingsDivisionId = useMemo(() => {
    const validOptionIds = new Set(leagueDivisionOptions.map((option) => option.value));
    const sourceDivisions = Array.isArray(activeEvent?.divisionDetails)
      ? activeEvent.divisionDetails
      : Array.isArray(activeEvent?.divisions)
        ? activeEvent.divisions
        : [];

    for (const division of sourceDivisions) {
      if (getDivisionKind(division) === 'PLAYOFF') {
        continue;
      }
      const divisionId = getDivisionId(division);
      if (!divisionId || !validOptionIds.has(divisionId)) {
        continue;
      }
      if (!isDivisionStandingsConfirmed(division)) {
        return divisionId;
      }
    }

    return leagueDivisionOptions[0]?.value ?? null;
  }, [activeEvent?.divisionDetails, activeEvent?.divisions, leagueDivisionOptions]);

  useEffect(() => {
    if (!isLeague || leagueDivisionOptions.length === 0) {
      if (selectedStandingsDivision !== null) {
        setSelectedStandingsDivision(null);
      }
      setStandingsDivisionData(null);
      setStandingsDraftOverrides({});
      return;
    }

    if (
      selectedStandingsDivision
      && leagueDivisionOptions.some((option) => option.value === selectedStandingsDivision)
    ) {
      return;
    }

    setSelectedStandingsDivision(preferredStandingsDivisionId ?? leagueDivisionOptions[0].value);
  }, [isLeague, leagueDivisionOptions, preferredStandingsDivisionId, selectedStandingsDivision]);

  const activeEventId = activeEvent?.$id ?? null;
  const activeEventType = activeEvent?.eventType ?? null;

  useEffect(() => {
    if (isCreateMode || !activeEventId || activeEventType !== 'LEAGUE' || !selectedStandingsDivision) {
      setStandingsDivisionData(null);
      setStandingsDraftOverrides({});
      setStandingsLoading(false);
      return;
    }

    let cancelled = false;
    setStandingsLoading(true);
    setStandingsActionError(null);

    tournamentService
      .getLeagueDivisionStandings(activeEventId, selectedStandingsDivision)
      .then((division) => {
        if (cancelled) {
          return;
        }
        setStandingsDivisionData(division);
        setStandingsDraftOverrides(division.standingsOverrides ? { ...division.standingsOverrides } : {});
      })
      .catch((loadError) => {
        if (cancelled) {
          return;
        }
        console.error('Failed to load division standings:', loadError);
        setStandingsDivisionData(null);
        setStandingsDraftOverrides({});
        setStandingsActionError(loadError instanceof Error ? loadError.message : 'Failed to load division standings.');
      })
      .finally(() => {
        if (!cancelled) {
          setStandingsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeEventId, activeEventType, isCreateMode, selectedStandingsDivision]);

  const activeOrganization = useMemo(() => {
    if (activeEvent && typeof activeEvent.organization === 'object') {
      return activeEvent.organization as Organization;
    }
    return organizationForCreate;
  }, [activeEvent, organizationForCreate]);
  const assistantHostIds = useMemo(
    () =>
      Array.isArray(activeEvent?.assistantHostIds)
        ? activeEvent.assistantHostIds.map((id) => String(id)).filter((id) => id.length > 0)
        : [],
    [activeEvent?.assistantHostIds],
  );
  const eventOfficialIds = useMemo(() => {
    const activeEventOfficialIds = Array.isArray(activeEvent?.eventOfficials)
      ? activeEvent.eventOfficials
          .filter((officialEntry) => officialEntry?.isActive !== false)
          .map((officialEntry) => normalizeIdToken(officialEntry?.userId))
          .filter((officialId): officialId is string => Boolean(officialId))
      : [];

    if (activeEventOfficialIds.length > 0) {
      return activeEventOfficialIds;
    }

    return Array.isArray(activeEvent?.officialIds)
      ? activeEvent.officialIds
          .map((officialId) => normalizeIdToken(officialId))
          .filter((officialId): officialId is string => Boolean(officialId))
      : [];
  }, [activeEvent?.eventOfficials, activeEvent?.officialIds]);
  const isPrimaryHost = activeEvent?.hostId === user?.$id;
  const isAssistantHost = Boolean(user?.$id && assistantHostIds.includes(user.$id));
  const isEventOfficial = Boolean(
    user?.$id && eventOfficialIds.includes(user.$id),
  );
  const isOrganizationManager = Boolean(
    user?.$id
      && activeOrganization
      && (
        activeOrganization.ownerId === user.$id
        || (activeOrganization.staffMembers ?? []).some((staffMember) => (
          staffMember.userId === user.$id
            && !staffMember.invite
            && hasStaffMemberType(staffMember, ['HOST', 'STAFF'])
        ))
      ),
  );
  const canManageEvent = Boolean(isPrimaryHost || isAssistantHost || isOrganizationManager);
  const canUseTeamCompliance = Boolean(isEditingEvent && canManageEvent && activeEvent?.teamSignup);
  const canUseUserCompliance = Boolean(isEditingEvent && canManageEvent && activeEvent?.teamSignup === false);
  const canManageStandings = Boolean(canManageEvent && !isPreview && !isCreateMode);
  const entityLabel = isTemplateEvent
    ? 'Template'
    : isTournament
      ? 'Tournament'
      : isLeague
        ? 'League'
        : 'Event';
  const activeLifecycleStatus = getEventLifecycleStatus(activeEvent);
  const pendingSaveChanges = useMemo<PendingSaveChangeItem[]>(() => {
    const items: PendingSaveChangeItem[] = [];
    const normalizedStagedDeletes = Array.from(
      new Set(
        stagedMatchDeletes
          .map((value) => normalizeIdToken(value))
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const stagedDeleteSet = new Set(normalizedStagedDeletes);
    const baselineMatchesById = new Map<string, Match>();
    const draftMatchesById = new Map<string, Match>();

    matches.forEach((match) => {
      const matchId = normalizeIdToken(match.$id);
      if (matchId) {
        baselineMatchesById.set(matchId, match);
      }
    });
    activeMatches.forEach((match) => {
      const matchId = normalizeIdToken(match.$id);
      if (matchId) {
        draftMatchesById.set(matchId, match);
      }
    });

    const formatMatchLabel = (match: Match | undefined, matchId: string): string => {
      if (match && typeof match.matchId === 'number' && Number.isFinite(match.matchId)) {
        return `Match #${Math.trunc(match.matchId)}`;
      }
      if (isClientMatchId(matchId)) {
        return 'New match';
      }
      return `Match ${matchId.slice(0, 8)}`;
    };

    const summarizeChangedMatchFields = (before: Match, after: Match): string[] => {
      const changedFields: string[] = [];
      const idChanged = (first: string | null | undefined, second: string | null | undefined): boolean => (
        normalizeIdToken(first) !== normalizeIdToken(second)
      );
      const valueChanged = (first: unknown, second: unknown): boolean => (
        (first ?? null) !== (second ?? null)
      );
      const arrayChanged = (first: unknown[] | null | undefined, second: unknown[] | null | undefined): boolean => (
        JSON.stringify(first ?? []) !== JSON.stringify(second ?? [])
      );
      const startBefore = typeof before.start === 'string' && before.start.trim().length > 0 ? before.start : null;
      const startAfter = typeof after.start === 'string' && after.start.trim().length > 0 ? after.start : null;
      const endBefore = typeof before.end === 'string' && before.end.trim().length > 0 ? before.end : null;
      const endAfter = typeof after.end === 'string' && after.end.trim().length > 0 ? after.end : null;
      const divisionBefore = normalizeDivisionToken(getDivisionId(before.division));
      const divisionAfter = normalizeDivisionToken(getDivisionId(after.division));

      if (idChanged(before.team1Id, after.team1Id)) changedFields.push('team 1');
      if (idChanged(before.team2Id, after.team2Id)) changedFields.push('team 2');
      if (idChanged(before.officialId, after.officialId)) changedFields.push('official');
      if (idChanged(before.teamOfficialId, after.teamOfficialId)) changedFields.push('team official');
      if (idChanged(before.fieldId, after.fieldId)) changedFields.push('field');
      if (valueChanged(startBefore, startAfter)) changedFields.push('start time');
      if (valueChanged(endBefore, endAfter)) changedFields.push('end time');
      if (valueChanged(divisionBefore, divisionAfter)) changedFields.push('division');
      if (idChanged(before.previousLeftId, after.previousLeftId)) changedFields.push('previous left');
      if (idChanged(before.previousRightId, after.previousRightId)) changedFields.push('previous right');
      if (idChanged(before.winnerNextMatchId, after.winnerNextMatchId)) changedFields.push('winner next');
      if (idChanged(before.loserNextMatchId, after.loserNextMatchId)) changedFields.push('loser next');
      if (valueChanged(before.side, after.side)) changedFields.push('side');
      if (Boolean(before.losersBracket) !== Boolean(after.losersBracket)) changedFields.push('winner/loser bracket');
      if (Boolean(before.locked) !== Boolean(after.locked)) changedFields.push('lock status');
      if (Boolean(before.officialCheckedIn ?? before.officialCheckedIn) !== Boolean(after.officialCheckedIn ?? after.officialCheckedIn)) {
        changedFields.push('official check-in');
      }
      if (
        arrayChanged(before.team1Points, after.team1Points)
        || arrayChanged(before.team2Points, after.team2Points)
        || arrayChanged(before.setResults, after.setResults)
      ) {
        changedFields.push('score values');
      }

      return changedFields;
    };

    if (selectedLifecycleStatus && selectedLifecycleStatus !== activeLifecycleStatus) {
      items.push({
        id: 'event-lifecycle-status',
        category: 'event',
        label: `Event status: ${activeLifecycleStatus} -> ${selectedLifecycleStatus}`,
        detail: 'Lifecycle status will update on save.',
        sortOrder: 0,
      });
    }

    if (formHasUnsavedChanges) {
      items.push({
        id: 'event-form-updates',
        category: 'event',
        label: 'Event details updated',
        detail: 'Unsaved form changes will be applied on save.',
        sortOrder: 1,
      });
    }

    draftMatchesById.forEach((match, matchId) => {
      if (stagedDeleteSet.has(matchId)) {
        return;
      }

      const baselineMatch = baselineMatchesById.get(matchId);
      if (!baselineMatch || isClientMatchId(matchId)) {
        const createMeta = stagedMatchCreates[matchId];
        items.push({
          id: `match-create-${matchId}`,
          category: 'match',
          label: `Add ${formatMatchLabel(match, matchId)}`,
          detail: createMeta
            ? `Added from ${createMeta.creationContext === 'schedule' ? 'schedule' : 'bracket'} view.`
            : 'New staged match.',
          sortOrder: 20,
        });
        return;
      }

      const changedFields = summarizeChangedMatchFields(baselineMatch, match);
      if (changedFields.length > 0) {
        const maxFieldsToShow = 4;
        const visibleFields = changedFields.slice(0, maxFieldsToShow);
        const hiddenCount = changedFields.length - visibleFields.length;
        items.push({
          id: `match-update-${matchId}`,
          category: 'match',
          label: `Update ${formatMatchLabel(match, matchId)}`,
          detail: hiddenCount > 0
            ? `${visibleFields.join(', ')} (+${hiddenCount} more)`
            : visibleFields.join(', '),
          sortOrder: 30,
        });
      }
    });

    baselineMatchesById.forEach((match, matchId) => {
      if (stagedDeleteSet.has(matchId) || !draftMatchesById.has(matchId)) {
        items.push({
          id: `match-delete-${matchId}`,
          category: 'match',
          label: `Delete ${formatMatchLabel(match, matchId)}`,
          detail: 'Match will be removed on save.',
          sortOrder: 40,
        });
      }
    });

    if (hasPendingUnsavedChanges && items.length === 0) {
      items.push({
        id: 'unspecified-unsaved-changes',
        category: 'event',
        label: 'Unsaved changes pending',
        detail: 'Save to apply the latest updates.',
        sortOrder: 99,
      });
    }

    return items.sort((first, second) => {
      if (first.sortOrder !== second.sortOrder) {
        return first.sortOrder - second.sortOrder;
      }
      return first.label.localeCompare(second.label);
    });
  }, [
    activeLifecycleStatus,
    activeMatches,
    formHasUnsavedChanges,
    hasPendingUnsavedChanges,
    matches,
    selectedLifecycleStatus,
    stagedMatchCreates,
    stagedMatchDeletes,
  ]);
  const pendingSaveChangeCount = pendingSaveChanges.length;
  const renderPendingChangesPopover = () => (
    <Popover
      opened={isPendingChangesPopoverOpen}
      onChange={setIsPendingChangesPopoverOpen}
      width={420}
      position="bottom-end"
      withArrow
      shadow="md"
    >
      <Popover.Target>
        <Button
          variant="default"
          leftSection={<ListChecks size={16} />}
          onClick={() => setIsPendingChangesPopoverOpen((current) => !current)}
          disabled={pendingSaveChangeCount === 0}
        >
          Changes ({pendingSaveChangeCount})
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap={6}>
          <Text size="xs" c="dimmed">
            These updates will be applied when you save.
          </Text>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            <Stack gap={8}>
              {pendingSaveChanges.map((change) => (
                <Paper key={change.id} withBorder radius="sm" p="xs">
                  <Text size="sm" fw={600}>{change.label}</Text>
                  {change.detail ? (
                    <Text size="xs" c="dimmed">{change.detail}</Text>
                  ) : null}
                </Paper>
              ))}
            </Stack>
          </div>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
  const canEditMatches = Boolean(canManageEvent && isEditingEvent);
  const showEventOfficialNames = Boolean(canEditMatches || isEventOfficial);
  const shouldShowCreationSheet = Boolean(
    isCreateMode
    || (isEditingEvent && canManageEvent && user),
  );
  const createFormId = 'create-event-form';
  const templateSelectData = useMemo(
    () => templateSummaries.map((template) => ({ value: template.id, label: template.name })),
    [templateSummaries],
  );
  const defaultSport = DEFAULT_SPORT;
  const hasSelectedNotificationAudience = useMemo(
    () => Object.values(notificationAudience).some(Boolean),
    [notificationAudience],
  );

  const resetNotificationComposer = useCallback(() => {
    setNotificationTitle('');
    setNotificationMessage('');
    setNotificationAudience({ ...DEFAULT_NOTIFICATION_AUDIENCE });
    setNotificationError(null);
  }, []);

  const handleOpenNotificationModal = useCallback(() => {
    resetNotificationComposer();
    setIsNotificationModalOpen(true);
  }, [resetNotificationComposer]);

  const handleCloseNotificationModal = useCallback(() => {
    if (sendingNotification) {
      return;
    }
    setIsNotificationModalOpen(false);
  }, [sendingNotification]);

  const handleNotificationAudienceToggle = useCallback((key: NotificationAudienceKey, checked: boolean) => {
    setNotificationAudience((prev) => ({
      ...prev,
      [key]: checked,
    }));
  }, []);

  const handleSendNotification = useCallback(async () => {
    if (!activeEvent?.$id || sendingNotification) {
      return;
    }

    const normalizedTitle = notificationTitle.trim();
    const normalizedMessage = notificationMessage.trim();
    if (!normalizedTitle || !normalizedMessage) {
      setNotificationError('Title and message are required.');
      return;
    }
    if (!hasSelectedNotificationAudience) {
      setNotificationError('Select at least one audience group.');
      return;
    }

    setSendingNotification(true);
    setNotificationError(null);
    try {
      const response = await apiRequest<{
        recipients?: {
          selectedCount?: number;
          pushRecipients?: number;
          emailFallbackRecipients?: number;
          noChannelRecipients?: number;
        };
        delivery?: {
          push?: {
            attempted?: boolean;
            reason?: string;
            recipientCount?: number;
            tokenCount?: number;
            successCount?: number;
            failureCount?: number;
            prunedTokenCount?: number;
          };
          emailSentCount?: number;
          emailFailedCount?: number;
          emailTimedOutCount?: number;
          emailDisabledRecipientCount?: number;
        };
      }>(`/api/events/${encodeURIComponent(activeEvent.$id)}/notifications`, {
        method: 'POST',
        timeoutMs: 60_000,
        body: {
          title: normalizedTitle,
          message: normalizedMessage,
          audience: notificationAudience,
        },
      });

      const selectedCount = response.recipients?.selectedCount ?? 0;
      const pushRecipients = response.recipients?.pushRecipients ?? 0;
      const pushDeliveredCount = response.delivery?.push?.successCount ?? 0;
      const pushFailedCountFromProvider = response.delivery?.push?.failureCount ?? 0;
      const pushWasAttempted = response.delivery?.push?.attempted ?? false;
      const pushFailedCount = (!pushWasAttempted && pushRecipients > 0)
        ? Math.max(pushFailedCountFromProvider, pushRecipients)
        : pushFailedCountFromProvider;
      const emailSentCount = response.delivery?.emailSentCount ?? 0;
      const emailTimedOutCount = response.delivery?.emailTimedOutCount ?? 0;
      const noChannelRecipients = response.recipients?.noChannelRecipients ?? 0;
      const emailDisabledRecipients = response.delivery?.emailDisabledRecipientCount ?? 0;
      const emailFailedCount = response.delivery?.emailFailedCount ?? 0;

      const skippedCount = noChannelRecipients
        + emailDisabledRecipients
        + emailFailedCount
        + emailTimedOutCount
        + pushFailedCount;
      const summaryParts = [
        `${selectedCount} selected`,
        `${pushDeliveredCount} push delivered`,
        `${emailSentCount} email`,
      ];
      if (skippedCount > 0) {
        summaryParts.push(`${skippedCount} skipped`);
      }
      setInfoMessage(`Notification sent (${summaryParts.join(', ')}).`);
      setIsNotificationModalOpen(false);
      resetNotificationComposer();
    } catch (error) {
      setNotificationError(error instanceof Error ? error.message : 'Failed to send notification.');
    } finally {
      setSendingNotification(false);
    }
  }, [
    activeEvent?.$id,
    hasSelectedNotificationAudience,
    notificationAudience,
    notificationMessage,
    notificationTitle,
    resetNotificationComposer,
    sendingNotification,
  ]);

  useEffect(() => {
    if (!isCreateMode && !isEditingEvent) {
      setFormHasUnsavedChanges(false);
    }
  }, [isCreateMode, isEditingEvent]);

  useEffect(() => {
    let cancelled = false;

    if (!user?.$id) {
      setChildUserIds([]);
      return () => {
        cancelled = true;
      };
    }

    familyService
      .listChildren()
      .then((children) => {
        if (cancelled) return;
        const ids = Array.from(
          new Set(
            (children ?? [])
              .filter((child) => (child.linkStatus ?? 'active').toLowerCase() === 'active')
              .map((child) => child.userId?.trim())
              .filter((id): id is string => Boolean(id && id.length > 0)),
          ),
        );
        setChildUserIds(ids);
      })
      .catch(() => {
        if (!cancelled) {
          setChildUserIds([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user?.$id]);

  const closeTemplatePrompt = useCallback(() => {
    templatePromptResolvedRef.current = true;
    setTemplatePromptOpen(false);
  }, []);

  useEffect(() => {
    if (!isCreateMode) {
      return;
    }
    // Every new create flow should re-offer template selection.
    templatePromptResolvedRef.current = false;
    templateIdSeedResolvedRef.current = null;
    setTemplatePromptOpen(false);
    setTemplateSummaries([]);
    setSelectedTemplateId(null);
    setSelectedTemplateStartDate(null);
    setTemplatesError(null);
    setFailedTemplateSeedId(null);
  }, [eventId, isCreateMode, resolvedHostOrgId, templateIdParam]);

  useEffect(() => {
    if (!isCreateMode || !eventId || !user?.$id || !templateIdParam) {
      return;
    }
    if (templateIdSeedResolvedRef.current === templateIdParam) {
      return;
    }

    let cancelled = false;
    (async () => {
      setApplyingTemplate(true);
      setTemplatesError(null);
      setActionError(null);
      setFailedTemplateSeedId(null);
      let applied = false;
      try {
        const template = await eventService.getEventWithRelations(templateIdParam);
        if (!template) {
          throw new Error('Template not found.');
        }

        const base = changesEvent?.start ? parseLocalDateTime(changesEvent.start) : null;
        const seed = base ?? new Date();
        const startDate = new Date(seed);
        startDate.setHours(0, 0, 0, 0);

        const seeded = seedEventFromTemplate(template, {
          newEventId: eventId,
          newStartDate: startDate,
          hostId: user.$id,
          idFactory: createId,
        });

        if (cancelled) {
          return;
        }

        templatePromptResolvedRef.current = true;
        setTemplatePromptOpen(false);
        setSelectedTemplateId(templateIdParam);
        setSelectedTemplateStartDate(startDate);
        setChangesEvent(seeded);
        setHasUnsavedChanges(false);
        setFormHasUnsavedChanges(false);
        setTemplateSeedKey((prev) => prev + 1);
        applied = true;
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : 'Failed to apply template.';
        templatePromptResolvedRef.current = false;
        setTemplatePromptOpen(false);
        setFailedTemplateSeedId(templateIdParam);
        setTemplatesError(message);
        setActionError(`Unable to apply template: ${message}`);
      } finally {
        if (!cancelled) {
          if (applied) {
            templateIdSeedResolvedRef.current = templateIdParam;
          }
          setApplyingTemplate(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [changesEvent?.start, eventId, isCreateMode, templateIdParam, user?.$id]);

  const handleApplyTemplate = useCallback(async () => {
    if (!isCreateMode || !user?.$id) {
      closeTemplatePrompt();
      return;
    }

    if (!selectedTemplateId) {
      setTemplatesError('Select a template to continue.');
      return;
    }
    if (!selectedTemplateStartDate) {
      setTemplatesError('Select a start date to continue.');
      return;
    }
    if (!eventId) {
      setTemplatesError('Missing event id for creation.');
      return;
    }

    setApplyingTemplate(true);
    setTemplatesError(null);
    setActionError(null);

    try {
      const template = await eventService.getEventWithRelations(selectedTemplateId);
      if (!template) {
        throw new Error('Template not found.');
      }

      const seeded = seedEventFromTemplate(template, {
        newEventId: eventId,
        newStartDate: selectedTemplateStartDate,
        hostId: user.$id,
        idFactory: createId,
      });

      setChangesEvent(seeded);
      setHasUnsavedChanges(false);
      setFormHasUnsavedChanges(false);
      setTemplateSeedKey((prev) => prev + 1);
      closeTemplatePrompt();
    } catch (error) {
      console.error('Failed to apply template:', error);
      setActionError(error instanceof Error ? error.message : 'Failed to apply template.');
    } finally {
      setApplyingTemplate(false);
    }
  }, [closeTemplatePrompt, eventId, isCreateMode, selectedTemplateId, selectedTemplateStartDate, user?.$id]);

  const buildTemplateSourceFromDraft = useCallback((): Event | null => {
    if (!activeEvent) {
      return null;
    }

    const formDraft = eventFormRef.current?.getDraft();
    const merged = {
      ...(cloneValue(activeEvent) as Event),
      ...((formDraft ?? {}) as Partial<Event>),
    } as Event;

    if (!Array.isArray(merged.matches) || merged.matches.length === 0) {
      merged.matches = Array.isArray(activeMatches)
        ? (cloneValue(activeMatches) as Match[])
        : [];
    }
    if (!Array.isArray(merged.timeSlots)) {
      merged.timeSlots = [];
    }
    if (typeof merged.$id !== 'string' || merged.$id.trim().length === 0) {
      merged.$id = activeEvent.$id;
    }

    return merged;
  }, [activeEvent, activeMatches]);

  const handleCreateTemplateFromEvent = useCallback(async () => {
    if (!activeEvent || !user?.$id) {
      return;
    }
    if (!canManageEvent) {
      setActionError('Only an event host can create templates from this event.');
      return;
    }
    if (activeEvent.state === 'TEMPLATE') {
      setActionError('This event is already a template.');
      return;
    }
    if (creatingTemplate) {
      return;
    }

    setCreatingTemplate(true);
    setActionError(null);
    setInfoMessage(null);
    setWarningMessage(null);

    try {
      let sourceEvent: Event | null = null;
      if (!isCreateMode) {
        sourceEvent = (await eventService.getEventWithRelations(activeEvent.$id)) ?? null;
      }
      if (!sourceEvent) {
        sourceEvent = buildTemplateSourceFromDraft();
      }
      if (!sourceEvent) {
        throw new Error('Unable to load event details for templating.');
      }

      const templateId = createId();
      const templateEvent = cloneEventAsTemplate(sourceEvent, { templateId, idFactory: createId });
      const payload = toEventPayload(templateEvent);
      await apiRequest('/api/events', {
        method: 'POST',
        body: {
          id: templateId,
          event: { ...payload, id: templateId },
        },
      });

      setInfoMessage(`Template created: ${templateEvent.name}`);
    } catch (error) {
      console.error('Failed to create event template:', error);
      setActionError(error instanceof Error ? error.message : 'Failed to create template.');
    } finally {
      setCreatingTemplate(false);
    }
  }, [activeEvent, buildTemplateSourceFromDraft, canManageEvent, creatingTemplate, isCreateMode, user?.$id]);

  const showDateOnMatches = useMemo(() => {
    if (!activeEvent?.start || !activeEvent?.end) return false;
    const start = new Date(activeEvent.start);
    const end = new Date(activeEvent.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
    return end.getTime() - start.getTime() > 24 * 60 * 60 * 1000;
  }, [activeEvent?.start, activeEvent?.end]);

  const teamsById = useMemo(() => {
    const map = new Map<string, Team>();
    if (Array.isArray(activeEvent?.teams)) {
      (activeEvent.teams as Team[]).forEach((team) => {
        if (team?.$id) {
          map.set(team.$id, team);
        }
      });
    }
    return map;
  }, [activeEvent?.teams]);

  const participantTeamIds = useMemo(() => {
    const ids = new Set<string>();

    if (Array.isArray(activeEvent?.teamIds)) {
      activeEvent.teamIds
        .map((teamId) => normalizeIdToken(teamId))
        .filter((teamId): teamId is string => Boolean(teamId))
        .forEach((teamId) => ids.add(teamId));
    }

    if (Array.isArray(activeEvent?.teams)) {
      activeEvent.teams.forEach((teamEntry) => {
        const teamId = normalizeIdToken(teamEntry?.$id);
        if (teamId) {
          ids.add(teamId);
        }
      });
    }

    return Array.from(ids);
  }, [activeEvent?.teamIds, activeEvent?.teams]);

  const participantUserIds = useMemo(() => {
    const ids = new Set<string>();

    if (Array.isArray(activeEvent?.userIds)) {
      activeEvent.userIds
        .map((userId) => normalizeIdToken(userId))
        .filter((userId): userId is string => Boolean(userId))
        .forEach((userId) => ids.add(userId));
    }

    if (Array.isArray(activeEvent?.players)) {
      activeEvent.players.forEach((player) => {
        const userId = normalizeIdToken(player?.$id);
        if (userId) {
          ids.add(userId);
        }
      });
    }

    return Array.from(ids);
  }, [activeEvent?.players, activeEvent?.userIds]);

  const participantTeamIdSet = useMemo(() => new Set(participantTeamIds), [participantTeamIds]);
  const participantUserIdSet = useMemo(() => new Set(participantUserIds), [participantUserIds]);
  const participantOfficialIds = useMemo(() => {
    const ids = new Set<string>();

    if (Array.isArray(activeEvent?.officialIds)) {
      activeEvent.officialIds
        .map((officialId) => normalizeIdToken(officialId))
        .filter((officialId): officialId is string => Boolean(officialId))
        .forEach((officialId) => ids.add(officialId));
    }

    if (Array.isArray(activeEvent?.eventOfficials)) {
      activeEvent.eventOfficials
        .map((officialEntry) => normalizeIdToken(officialEntry?.userId))
        .filter((officialId): officialId is string => Boolean(officialId))
        .forEach((officialId) => ids.add(officialId));
    }

    if (Array.isArray(activeEvent?.officials)) {
      activeEvent.officials.forEach((officialEntry) => {
        const officialId = normalizeIdToken(officialEntry?.$id);
        if (officialId) {
          ids.add(officialId);
        }
      });
    }

    activeMatches.forEach((match) => {
      collectMatchAssignmentUserIds(match).forEach((officialId) => ids.add(officialId));
    });

    return Array.from(ids);
  }, [activeEvent?.eventOfficials, activeEvent?.officialIds, activeEvent?.officials, activeMatches]);

  const participantTeamsById = useMemo(() => {
    const teams = new Map<string, Team>();
    participantTeams.forEach((team) => {
      if (team?.$id) {
        teams.set(team.$id, team);
      }
    });
    if (Array.isArray(activeEvent?.teams)) {
      activeEvent.teams.forEach((team) => {
        if (team?.$id && !teams.has(team.$id)) {
          teams.set(team.$id, team);
        }
      });
    }
    return teams;
  }, [activeEvent?.teams, participantTeams]);

  const isPlaceholderParticipantTeam = useCallback(
    (team: Team | null | undefined): boolean => {
      if (!team) return true;
      if (!isLeague && !isTournament) return false;
      return typeof team.parentTeamId !== 'string' || team.parentTeamId.trim().length === 0;
    },
    [isLeague, isTournament],
  );

  const filledParticipantTeams = useMemo(
    () => participantTeams.filter((team) => !isPlaceholderParticipantTeam(team)),
    [isPlaceholderParticipantTeam, participantTeams],
  );

  const assignedParticipantTeamIds = useMemo(() => {
    const assigned = new Set<string>();
    participantDivisionColumns.forEach((column) => {
      column.teamIds.forEach((teamId) => {
        if (participantTeamIdSet.has(teamId)) {
          assigned.add(teamId);
        }
      });
    });
    return assigned;
  }, [participantDivisionColumns, participantTeamIdSet]);

  const unassignedParticipantTeamIds = useMemo(
    () => participantTeamIds.filter((teamId) => !assignedParticipantTeamIds.has(teamId)),
    [assignedParticipantTeamIds, participantTeamIds],
  );

  const unassignedParticipantTeams = useMemo(
    () => unassignedParticipantTeamIds
      .map((teamId) => participantTeamsById.get(teamId))
      .filter((team): team is Team => Boolean(team)),
    [participantTeamsById, unassignedParticipantTeamIds],
  );

  const unassignedFilledParticipantTeams = useMemo(
    () => unassignedParticipantTeams.filter((team) => !isPlaceholderParticipantTeam(team)),
    [isPlaceholderParticipantTeam, unassignedParticipantTeams],
  );

  const hasSplitDivisionUnassignedTeams = isSplitDivisionEvent && unassignedFilledParticipantTeams.length > 0;

  const organizationIdForParticipants = useMemo(() => {
    const organizationId = normalizeIdToken(activeEvent?.organizationId);
    if (organizationId) {
      return organizationId;
    }

    if (typeof activeEvent?.organization === 'string') {
      return normalizeIdToken(activeEvent.organization);
    }

    if (activeEvent?.organization && typeof activeEvent.organization === 'object') {
      const objectId = normalizeIdToken((activeEvent.organization as Partial<Organization>).$id);
      if (objectId) {
        return objectId;
      }
    }

    return null;
  }, [activeEvent?.organization, activeEvent?.organizationId]);

  const normalizedTeamSearchQuery = teamSearchQuery.trim().toLowerCase();

  const availableOrganizationTeams = useMemo(
    () => organizationTeamsForPicker.filter((team) => Boolean(team?.$id) && !participantTeamIdSet.has(team.$id)),
    [organizationTeamsForPicker, participantTeamIdSet],
  );

  const availableOrganizationTeamIdSet = useMemo(
    () => new Set(availableOrganizationTeams.map((team) => team.$id)),
    [availableOrganizationTeams],
  );

  const searchResultTeams = useMemo(() => {
    const source = searchTeamPool.filter((team) => {
      if (!team?.$id || participantTeamIdSet.has(team.$id)) {
        return false;
      }

      if (organizationIdForParticipants && availableOrganizationTeamIdSet.has(team.$id)) {
        return false;
      }

      return true;
    });

    const filtered = normalizedTeamSearchQuery
      ? source.filter((team) => {
        const teamName = (team.name ?? '').toLowerCase();
        const sportName = (team.sport ?? '').toLowerCase();
        const divisionName = (
          typeof team.division === 'string'
            ? team.division
            : team.division?.name ?? team.division?.id ?? ''
        ).toLowerCase();
        return (
          teamName.includes(normalizedTeamSearchQuery) ||
          sportName.includes(normalizedTeamSearchQuery) ||
          divisionName.includes(normalizedTeamSearchQuery)
        );
      })
      : source;

    return filtered.slice(0, 24);
  }, [
    availableOrganizationTeamIdSet,
    normalizedTeamSearchQuery,
    organizationIdForParticipants,
    participantTeamIdSet,
    searchTeamPool,
  ]);

  useEffect(() => {
    let cancelled = false;

    const loadParticipantTeams = async () => {
      if (!activeEvent?.teamSignup) {
        setParticipantTeams([]);
        setParticipantsLoading(false);
        return;
      }

      if (participantTeamIds.length === 0) {
        setParticipantTeams([]);
        setParticipantUsers([]);
        setParticipantsError(null);
        setParticipantsLoading(false);
        return;
      }

      setParticipantsLoading(true);
      setParticipantsError(null);
      try {
        const hydratedTeams = await teamService.getTeamsByIds(
          participantTeamIds,
          true,
          { eventId: normalizeIdToken(activeEvent?.$id ?? eventId) ?? undefined },
        );
        if (cancelled) {
          return;
        }
        const hydratedById = new Map(hydratedTeams.map((team) => [team.$id, team]));
        const orderedTeams = participantTeamIds
          .map((teamId) => hydratedById.get(teamId))
          .filter((team): team is Team => Boolean(team));
        setParticipantTeams(orderedTeams);
        setParticipantUsers([]);
      } catch (participantError) {
        if (cancelled) {
          return;
        }
        console.error('Failed to load participant teams:', participantError);
        setParticipantsError(participantError instanceof Error ? participantError.message : 'Failed to load teams.');
      } finally {
        if (!cancelled) {
          setParticipantsLoading(false);
        }
      }
    };

    void loadParticipantTeams();

    return () => {
      cancelled = true;
    };
  }, [activeEvent?.$id, activeEvent?.teamSignup, eventId, participantTeamIds]);

  useEffect(() => {
    let cancelled = false;

    const loadParticipantUsers = async () => {
      if (activeEvent?.teamSignup !== false) {
        setParticipantUsers([]);
        return;
      }

      if (participantUserIds.length === 0) {
        setParticipantUsers([]);
        setParticipantsError(null);
        setParticipantsLoading(false);
        return;
      }

      setParticipantsLoading(true);
      setParticipantsError(null);
      try {
        const hydratedUsers = await userService.getUsersByIds(
          participantUserIds,
          { eventId: normalizeIdToken(activeEvent?.$id ?? eventId) ?? undefined },
        );
        if (cancelled) {
          return;
        }
        const hydratedById = new Map(hydratedUsers.map((participant) => [participant.$id, participant]));
        const orderedUsers = participantUserIds
          .map((userId) => hydratedById.get(userId))
          .filter((participant): participant is UserData => Boolean(participant));
        setParticipantUsers(orderedUsers);
        setParticipantTeams([]);
      } catch (participantError) {
        if (cancelled) {
          return;
        }
        console.error('Failed to load participant users:', participantError);
        setParticipantsError(participantError instanceof Error ? participantError.message : 'Failed to load participants.');
      } finally {
        if (!cancelled) {
          setParticipantsLoading(false);
        }
      }
    };

    void loadParticipantUsers();

    return () => {
      cancelled = true;
    };
  }, [activeEvent?.$id, activeEvent?.teamSignup, eventId, participantUserIds]);

  useEffect(() => {
    if (!canUseTeamCompliance) {
      setTeamComplianceById({});
      setTeamComplianceError(null);
      setTeamComplianceLoading(false);
      setSelectedComplianceTeamId(null);
      setExpandedComplianceUserIds([]);
      return;
    }

    const targetEventId = normalizeIdToken(activeEvent?.$id ?? eventId);
    if (!targetEventId || participantTeamIds.length === 0) {
      setTeamComplianceById({});
      setTeamComplianceError(null);
      setTeamComplianceLoading(false);
      return;
    }

    let cancelled = false;
    setTeamComplianceLoading(true);
    setTeamComplianceError(null);

    void apiRequest<EventTeamComplianceResponse>(`/api/events/${targetEventId}/teams/compliance`)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        const byId: Record<string, TeamComplianceSummary> = {};
        (payload?.teams ?? []).forEach((teamSummary) => {
          if (teamSummary?.teamId) {
            byId[teamSummary.teamId] = teamSummary;
          }
        });
        setTeamComplianceById(byId);
      })
      .catch((complianceError) => {
        if (cancelled) {
          return;
        }
        console.error('Failed to load team compliance summaries:', complianceError);
        setTeamComplianceById({});
        setTeamComplianceError(
          complianceError instanceof Error
            ? complianceError.message
            : 'Failed to load team payment and document status.',
        );
      })
      .finally(() => {
        if (!cancelled) {
          setTeamComplianceLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeEvent?.$id, canUseTeamCompliance, eventId, participantTeamIds, teamComplianceRefreshKey]);

  useEffect(() => {
    if (!canUseUserCompliance) {
      setUserComplianceById({});
      setUserComplianceError(null);
      setUserComplianceLoading(false);
      return;
    }

    const targetEventId = normalizeIdToken(activeEvent?.$id ?? eventId);
    if (!targetEventId || participantUserIds.length === 0) {
      setUserComplianceById({});
      setUserComplianceError(null);
      setUserComplianceLoading(false);
      return;
    }

    let cancelled = false;
    setUserComplianceLoading(true);
    setUserComplianceError(null);

    void apiRequest<EventUserComplianceResponse>(`/api/events/${targetEventId}/users/compliance`)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        const byId: Record<string, TeamComplianceUserSummary> = {};
        (payload?.users ?? []).forEach((userSummary) => {
          if (userSummary?.userId) {
            byId[userSummary.userId] = userSummary;
          }
        });
        setUserComplianceById(byId);
      })
      .catch((complianceError) => {
        if (cancelled) {
          return;
        }
        console.error('Failed to load participant user compliance summaries:', complianceError);
        setUserComplianceById({});
        setUserComplianceError(
          complianceError instanceof Error
            ? complianceError.message
            : 'Failed to load participant payment and document status.',
        );
      })
      .finally(() => {
        if (!cancelled) {
          setUserComplianceLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeEvent?.$id, canUseUserCompliance, eventId, participantUserIds, teamComplianceRefreshKey]);

  useEffect(() => {
    if (!selectedComplianceTeamId) {
      return;
    }
    const stillVisible = participantTeamIdSet.has(selectedComplianceTeamId);
    if (!stillVisible) {
      setSelectedComplianceTeamId(null);
      setExpandedComplianceUserIds([]);
    }
  }, [participantTeamIdSet, selectedComplianceTeamId]);

  useEffect(() => {
    let cancelled = false;

    const loadParticipantOfficials = async () => {
      if (participantOfficialIds.length === 0) {
        setParticipantOfficials([]);
        return;
      }

      try {
        const hydratedOfficials = await userService.getUsersByIds(
          participantOfficialIds,
          { eventId: normalizeIdToken(activeEvent?.$id ?? eventId) ?? undefined },
        );
        if (cancelled) {
          return;
        }
        const hydratedById = new Map(hydratedOfficials.map((official) => [official.$id, official]));
        const orderedOfficials = participantOfficialIds
          .map((officialId) => hydratedById.get(officialId))
          .filter((official): official is UserData => Boolean(official));
        setParticipantOfficials(orderedOfficials);
      } catch (officialsError) {
        if (cancelled) {
          return;
        }
        console.error('Failed to load officials for event:', officialsError);
      }
    };

    void loadParticipantOfficials();

    return () => {
      cancelled = true;
    };
  }, [activeEvent?.$id, eventId, participantOfficialIds]);

  useEffect(() => {
    if (!isAddTeamModalOpen) {
      return;
    }
    if (!isSplitDivisionEvent) {
      if (selectedAddTeamDivisionId !== null) {
        setSelectedAddTeamDivisionId(null);
      }
      return;
    }
    if (
      selectedAddTeamDivisionId
      && participantDivisionSelectData.some((option) => option.value === selectedAddTeamDivisionId)
    ) {
      return;
    }
    setSelectedAddTeamDivisionId(participantDivisionSelectData[0]?.value ?? null);
  }, [isAddTeamModalOpen, isSplitDivisionEvent, participantDivisionSelectData, selectedAddTeamDivisionId]);

  useEffect(() => {
    if (!isAddTeamModalOpen) {
      return;
    }

    let cancelled = false;

    const loadOrganizationTeams = async () => {
      if (!organizationIdForParticipants) {
        setOrganizationTeamsForPicker([]);
        setOrganizationTeamsLoading(false);
        return;
      }

      setOrganizationTeamsLoading(true);
      try {
        const eventOrganization = activeEvent?.organization;
        if (eventOrganization && typeof eventOrganization === 'object') {
          const org = eventOrganization as Organization;
          if (org.$id === organizationIdForParticipants && Array.isArray(org.teams)) {
            if (!cancelled) {
              setOrganizationTeamsForPicker(org.teams);
            }
            return;
          }
        }

        const organization = await organizationService.getOrganizationById(organizationIdForParticipants, true);
        if (cancelled) {
          return;
        }
        setOrganizationTeamsForPicker(Array.isArray(organization?.teams) ? organization.teams : []);
      } catch (organizationError) {
        if (cancelled) {
          return;
        }
        console.error('Failed to load organization teams:', organizationError);
        setParticipantsError(organizationError instanceof Error ? organizationError.message : 'Failed to load organization teams.');
      } finally {
        if (!cancelled) {
          setOrganizationTeamsLoading(false);
        }
      }
    };

    const loadSearchPool = async () => {
      setSearchTeamsLoading(true);
      try {
        const response = await apiRequest<{ teams?: Array<Record<string, unknown>> }>('/api/teams?limit=200');
        const rawRows = Array.isArray(response?.teams) ? response.teams : [];
        const allTeamIds = Array.from(
          new Set(
            rawRows
              .map((row) => normalizeIdToken((row.$id ?? row.id) as unknown))
              .filter((teamId): teamId is string => Boolean(teamId)),
          ),
        );
        const hydrated = allTeamIds.length > 0
          ? await teamService.getTeamsByIds(
            allTeamIds,
            true,
            { eventId: normalizeIdToken(activeEvent?.$id ?? eventId) ?? undefined },
          )
          : [];
        if (!cancelled) {
          setSearchTeamPool(hydrated);
        }
      } catch (searchError) {
        if (cancelled) {
          return;
        }
        console.error('Failed to load team search results:', searchError);
        setParticipantsError(searchError instanceof Error ? searchError.message : 'Failed to load teams for search.');
      } finally {
        if (!cancelled) {
          setSearchTeamsLoading(false);
        }
      }
    };

    void Promise.all([loadOrganizationTeams(), loadSearchPool()]);

    return () => {
      cancelled = true;
    };
  }, [activeEvent?.$id, activeEvent?.organization, eventId, isAddTeamModalOpen, organizationIdForParticipants]);

  const refreshParticipantTeamsFromServer = useCallback(
    async (targetEventId: string) => {
      const refreshedEvent = await eventService.getEventById(targetEventId);
      if (!refreshedEvent) {
        throw new Error('Failed to refresh event participants.');
      }

      const refreshedTeamIds = Array.from(
        new Set(
          (Array.isArray(refreshedEvent.teamIds) ? refreshedEvent.teamIds : [])
            .map((teamId) => normalizeIdToken(teamId))
            .filter((teamId): teamId is string => Boolean(teamId)),
        ),
      );
      const refreshedTeams = refreshedTeamIds.length > 0
        ? await teamService.getTeamsByIds(
          refreshedTeamIds,
          true,
          { eventId: targetEventId },
        )
        : [];
      const refreshedTeamsById = new Map(refreshedTeams.map((team) => [team.$id, team]));
      const orderedTeams = refreshedTeamIds
        .map((teamId) => refreshedTeamsById.get(teamId))
        .filter((team): team is Team => Boolean(team));
      const refreshedUserIds = Array.from(
        new Set(
          (Array.isArray(refreshedEvent.userIds) ? refreshedEvent.userIds : [])
            .map((userId) => normalizeIdToken(userId))
            .filter((userId): userId is string => Boolean(userId)),
        ),
      );
      const refreshedUsers = refreshedUserIds.length > 0
        ? await userService.getUsersByIds(
          refreshedUserIds,
          { eventId: targetEventId },
        )
        : [];
      const refreshedUsersById = new Map(refreshedUsers.map((participant) => [participant.$id, participant]));
      const orderedUsers = refreshedUserIds
        .map((userId) => refreshedUsersById.get(userId))
        .filter((participant): participant is UserData => Boolean(participant));

      setParticipantTeams(orderedTeams);
      setParticipantUsers(orderedUsers);
      setEvent((prev) => (prev
        ? {
            ...prev,
            teamIds: refreshedTeamIds,
            teams: orderedTeams,
            userIds: refreshedUserIds,
            players: orderedUsers,
            divisions: refreshedEvent.divisions ?? prev.divisions,
            divisionDetails: refreshedEvent.divisionDetails ?? prev.divisionDetails,
            playoffDivisionDetails: refreshedEvent.playoffDivisionDetails ?? prev.playoffDivisionDetails,
          }
        : prev));
      setChangesEvent((prev) => (prev
        ? {
            ...prev,
            teamIds: refreshedTeamIds,
            teams: orderedTeams,
            userIds: refreshedUserIds,
            players: orderedUsers,
            divisions: refreshedEvent.divisions ?? prev.divisions,
            divisionDetails: refreshedEvent.divisionDetails ?? prev.divisionDetails,
            playoffDivisionDetails: refreshedEvent.playoffDivisionDetails ?? prev.playoffDivisionDetails,
          }
        : prev));
    },
    [],
  );

  const mutateTeamParticipantMembership = useCallback(
    async (params: {
      team: Team;
      mode: 'add' | 'remove' | 'move';
      divisionId?: string | null;
    }) => {
      const targetEventId = activeEvent?.$id ?? eventId;
      if (!targetEventId) {
        return;
      }
      if (!params.team?.$id) {
        return;
      }

      setParticipantsError(null);
      setActionError(null);
      try {
        if (params.mode === 'remove') {
          await eventService.removeTeamParticipant(targetEventId, params.team.$id);
          await refreshParticipantTeamsFromServer(targetEventId);
          setInfoMessage(`${params.team.name || 'Team'} removed from participants. A refund has been queued.`);
          return;
        }

        await eventService.addTeamParticipant(targetEventId, {
          teamId: params.team.$id,
          divisionId: params.divisionId ?? undefined,
        });
        await refreshParticipantTeamsFromServer(targetEventId);
        if (params.mode === 'move') {
          setInfoMessage(`${params.team.name || 'Team'} moved to a new division.`);
        } else {
          setInfoMessage(`${params.team.name || 'Team'} added to participants.`);
        }
      } catch (updateError) {
        console.error('Failed to update event participants:', updateError);
        setParticipantsError(updateError instanceof Error ? updateError.message : 'Failed to update participants.');
      }
    },
    [activeEvent?.$id, eventId, refreshParticipantTeamsFromServer],
  );

  const mutateUserParticipantMembership = useCallback(
    async (params: {
      user: UserData;
      mode: 'add' | 'remove';
    }) => {
      const targetEventId = activeEvent?.$id ?? eventId;
      if (!targetEventId) {
        return;
      }
      if (!params.user?.$id) {
        return;
      }

      setParticipantsError(null);
      setActionError(null);
      try {
        await apiRequest(`/api/events/${targetEventId}/participants`, {
          method: params.mode === 'add' ? 'POST' : 'DELETE',
          body: {
            userId: params.user.$id,
          },
        });
        await refreshParticipantTeamsFromServer(targetEventId);
        if (params.mode === 'remove') {
          setInfoMessage(`${params.user.fullName || params.user.userName || 'Participant'} removed from participants.`);
        } else {
          setInfoMessage(`${params.user.fullName || params.user.userName || 'Participant'} added to participants.`);
        }
      } catch (updateError) {
        console.error('Failed to update user participants:', updateError);
        setParticipantsError(updateError instanceof Error ? updateError.message : 'Failed to update participants.');
      }
    },
    [activeEvent?.$id, eventId, refreshParticipantTeamsFromServer],
  );

  const handleAddTeamToParticipants = useCallback(
    async (team: Team) => {
      if (participantsUpdatingTeamId || !team?.$id || participantTeamIdSet.has(team.$id)) {
        return;
      }

      if (isSplitDivisionEvent && !selectedAddTeamDivisionId) {
        setParticipantsError('Select a division before adding a team.');
        return;
      }

      setParticipantsUpdatingTeamId(team.$id);
      await mutateTeamParticipantMembership({
        team,
        mode: 'add',
        divisionId: isSplitDivisionEvent ? selectedAddTeamDivisionId : undefined,
      });
      setParticipantsUpdatingTeamId(null);
    },
    [
      isSplitDivisionEvent,
      mutateTeamParticipantMembership,
      participantTeamIdSet,
      participantsUpdatingTeamId,
      selectedAddTeamDivisionId,
    ],
  );

  const handleMoveTeamDivision = useCallback(
    async (team: Team, nextDivisionId: string | null) => {
      if (!nextDivisionId || !team?.$id || participantsUpdatingTeamId || !canManageEvent) {
        return;
      }
      const currentDivisionId = participantDivisionColumns.find((column) => column.teamIds.includes(team.$id))?.id ?? null;
      if (currentDivisionId === nextDivisionId) {
        return;
      }

      setParticipantsUpdatingTeamId(team.$id);
      await mutateTeamParticipantMembership({
        team,
        mode: 'move',
        divisionId: nextDivisionId,
      });
      setParticipantsUpdatingTeamId(null);
    },
    [canManageEvent, mutateTeamParticipantMembership, participantDivisionColumns, participantsUpdatingTeamId],
  );

  const handleRemoveTeamFromParticipants = useCallback(
    async (team: Team) => {
      if (participantsUpdatingTeamId || !team?.$id || !participantTeamIdSet.has(team.$id)) {
        return;
      }

      const shouldRemove = typeof window === 'undefined'
        ? true
        : window.confirm(`Remove ${team.name || 'this team'} from participants? They will be unregistered and refunded.`);
      if (!shouldRemove) {
        return;
      }

      setParticipantsUpdatingTeamId(team.$id);
      await mutateTeamParticipantMembership({
        team,
        mode: 'remove',
      });
      setParticipantsUpdatingTeamId(null);
    },
    [mutateTeamParticipantMembership, participantTeamIdSet, participantsUpdatingTeamId],
  );

  const handleRemoveUserFromParticipants = useCallback(
    async (participant: UserData) => {
      if (participantsUpdatingTeamId || !participant?.$id || !participantUserIdSet.has(participant.$id)) {
        return;
      }

      const displayName = participant.fullName || participant.userName || 'this participant';
      const shouldRemove = typeof window === 'undefined'
        ? true
        : window.confirm(`Remove ${displayName} from participants? They will be unregistered and refunded.`);
      if (!shouldRemove) {
        return;
      }

      setParticipantsUpdatingTeamId(participant.$id);
      await mutateUserParticipantMembership({
        user: participant,
        mode: 'remove',
      });
      setParticipantsUpdatingTeamId(null);
    },
    [mutateUserParticipantMembership, participantUserIdSet, participantsUpdatingTeamId],
  );

  const refreshTeamCompliance = useCallback(() => {
    setTeamComplianceRefreshKey((current) => current + 1);
  }, []);

  const loadTeamBillingSnapshot = useCallback(
    async (teamId: string): Promise<TeamBillingSnapshot> => {
      const targetEventId = activeEvent?.$id ?? eventId;
      if (!targetEventId) {
        throw new Error('Event context is unavailable.');
      }
      return apiRequest<TeamBillingSnapshot>(`/api/events/${targetEventId}/teams/${teamId}/billing`);
    },
    [activeEvent?.$id, eventId],
  );

  const closeRefundModal = useCallback(() => {
    setSelectedRefundTeam(null);
    setRefundSnapshot(null);
    setRefundError(null);
    setRefundLoading(false);
    setRefundAmountDraftByPaymentId({});
    setRefundingPaymentId(null);
  }, []);

  const openRefundModal = useCallback(
    async (team: Team) => {
      if (!team?.$id) {
        return;
      }
      setSelectedRefundTeam(team);
      setRefundLoading(true);
      setRefundError(null);
      setRefundSnapshot(null);
      try {
        const snapshot = await loadTeamBillingSnapshot(team.$id);
        setRefundSnapshot(snapshot);
        const defaults: Record<string, number> = {};
        snapshot.bills.forEach((bill) => {
          bill.payments.forEach((payment) => {
            defaults[payment.$id] = payment.refundableAmountCents / 100;
          });
        });
        setRefundAmountDraftByPaymentId(defaults);
      } catch (error) {
        console.error('Failed to load team billing snapshot:', error);
        setRefundError(error instanceof Error ? error.message : 'Failed to load billing details.');
      } finally {
        setRefundLoading(false);
      }
    },
    [loadTeamBillingSnapshot],
  );

  const submitRefund = useCallback(
    async (paymentId: string) => {
      const team = selectedRefundTeam;
      if (!team?.$id) {
        return;
      }
      const targetEventId = activeEvent?.$id ?? eventId;
      if (!targetEventId) {
        return;
      }
      const payment = refundSnapshot?.bills
        .flatMap((bill) => bill.payments)
        .find((entry) => entry.$id === paymentId);
      if (!payment) {
        return;
      }
      const amountDollars = refundAmountDraftByPaymentId[paymentId] ?? (payment.refundableAmountCents / 100);
      const amountCents = Math.round((Number(amountDollars) || 0) * 100);
      if (!Number.isFinite(amountCents) || amountCents <= 0) {
        setRefundError('Enter a refund amount greater than $0.00.');
        return;
      }

      setRefundingPaymentId(paymentId);
      setRefundError(null);
      try {
        await apiRequest(`/api/events/${targetEventId}/teams/${team.$id}/billing/refunds`, {
          method: 'POST',
          body: {
            billPaymentId: paymentId,
            amountCents,
          },
        });
        const snapshot = await loadTeamBillingSnapshot(team.$id);
        setRefundSnapshot(snapshot);
        const nextDefaults: Record<string, number> = {};
        snapshot.bills.forEach((bill) => {
          bill.payments.forEach((entry) => {
            nextDefaults[entry.$id] = entry.refundableAmountCents / 100;
          });
        });
        setRefundAmountDraftByPaymentId(nextDefaults);
        setInfoMessage('Refund processed successfully.');
        refreshTeamCompliance();
      } catch (error) {
        console.error('Failed to process refund:', error);
        setRefundError(error instanceof Error ? error.message : 'Failed to process refund.');
      } finally {
        setRefundingPaymentId(null);
      }
    },
    [
      activeEvent?.$id,
      eventId,
      loadTeamBillingSnapshot,
      refreshTeamCompliance,
      refundAmountDraftByPaymentId,
      refundSnapshot?.bills,
      selectedRefundTeam,
    ],
  );

  const closeCreateBillModal = useCallback(() => {
    setCreateBillTeam(null);
    setCreateBillError(null);
    setCreatingBill(false);
    setCreateBillOwnerType('TEAM');
    setCreateBillOwnerId(null);
    setCreateBillAmountDollars(0);
    setCreateBillTaxDollars(0);
    setCreateBillAllowSplit(false);
    setCreateBillLabel('Event registration');
  }, []);

  const openCreateBillModal = useCallback((team: Team) => {
    if (!team?.$id) {
      return;
    }
    const userOnlyBilling = activeEvent?.teamSignup === false;
    const defaultOwnerType: 'TEAM' | 'USER' = userOnlyBilling ? 'USER' : 'TEAM';
    const defaultOwnerId = defaultOwnerType === 'TEAM'
      ? team.$id
      : (Array.isArray(team.playerIds) && team.playerIds.length > 0 ? team.playerIds[0] : team.$id);

    setCreateBillTeam(team);
    setCreateBillError(null);
    setCreatingBill(false);
    setCreateBillOwnerType(defaultOwnerType);
    setCreateBillOwnerId(defaultOwnerId);
    setCreateBillAmountDollars(0);
    setCreateBillTaxDollars(0);
    setCreateBillAllowSplit(false);
    setCreateBillLabel('Event registration');
  }, [activeEvent?.teamSignup]);

  const createBillUserOptions = useMemo(() => {
    if (!createBillTeam) {
      return [] as Array<{ value: string; label: string }>;
    }
    const fromPlayers = Array.isArray(createBillTeam.players)
      ? createBillTeam.players
          .map((player) => {
            const playerId = normalizeIdToken(player?.$id);
            if (!playerId) {
              return null;
            }
            const fullName = typeof player.fullName === 'string' && player.fullName.trim().length > 0
              ? player.fullName.trim()
              : `${player.firstName ?? ''} ${player.lastName ?? ''}`.trim();
            return {
              value: playerId,
              label: fullName || player.userName || playerId,
            };
          })
          .filter((option): option is { value: string; label: string } => Boolean(option))
      : [];
    if (fromPlayers.length > 0) {
      return fromPlayers;
    }
    const fallbackPlayerIds = Array.isArray(createBillTeam.playerIds)
      ? createBillTeam.playerIds
        .map((playerId) => normalizeIdToken(playerId))
        .filter((playerId): playerId is string => Boolean(playerId))
      : [];
    return fallbackPlayerIds.map((playerId) => ({
      value: playerId,
      label: playerId,
    }));
  }, [createBillTeam]);

  const createBillIsUserOnly = Boolean(createBillTeam && activeEvent?.teamSignup === false);

  useEffect(() => {
    if (createBillIsUserOnly) {
      if (createBillOwnerType !== 'USER') {
        setCreateBillOwnerType('USER');
      }
      const firstUserId = createBillUserOptions[0]?.value ?? createBillTeam?.$id ?? null;
      if (firstUserId && createBillOwnerId !== firstUserId) {
        setCreateBillOwnerId(firstUserId);
      }
      return;
    }

    if (!createBillTeam) {
      return;
    }
    if (createBillOwnerType === 'TEAM') {
      if (createBillOwnerId !== createBillTeam.$id) {
        setCreateBillOwnerId(createBillTeam.$id);
      }
      return;
    }
    const firstUserId = createBillUserOptions[0]?.value ?? null;
    if (firstUserId && createBillOwnerId !== firstUserId) {
      setCreateBillOwnerId(firstUserId);
    }
  }, [createBillIsUserOnly, createBillOwnerId, createBillOwnerType, createBillTeam, createBillUserOptions]);

  const createBillEventAmountCents = Math.max(0, Math.round((Number(createBillAmountDollars) || 0) * 100));
  const createBillFeeBreakdown = useMemo(
    () => calculateMvpAndStripeFees({
      eventAmountCents: createBillEventAmountCents,
      eventType: activeEvent?.eventType,
    }),
    [activeEvent?.eventType, createBillEventAmountCents],
  );
  const createBillMvpFeeAmountCents = createBillFeeBreakdown.mvpFeeCents;
  const createBillStripeFeeAmountCents = createBillFeeBreakdown.stripeFeeCents;
  const createBillTaxAmountCents = Math.max(0, Math.round((Number(createBillTaxDollars) || 0) * 100));
  const createBillTotalCents = (
    createBillEventAmountCents
    + createBillMvpFeeAmountCents
    + createBillStripeFeeAmountCents
    + createBillTaxAmountCents
  );
  const createBillPreviewLineItems = useMemo(() => {
    const lineItems: Array<{ id: string; label: string; amountCents: number }> = [
      {
        id: 'line_1',
        label: createBillLabel.trim().length > 0 ? createBillLabel.trim() : 'Event registration',
        amountCents: createBillEventAmountCents,
      },
    ];
    if (createBillMvpFeeAmountCents > 0) {
      lineItems.push({
        id: `line_${lineItems.length + 1}`,
        label: 'BracketIQ fee',
        amountCents: createBillMvpFeeAmountCents,
      });
    }
    if (createBillStripeFeeAmountCents > 0) {
      lineItems.push({
        id: `line_${lineItems.length + 1}`,
        label: 'Stripe fee',
        amountCents: createBillStripeFeeAmountCents,
      });
    }
    if (createBillTaxAmountCents > 0) {
      lineItems.push({
        id: `line_${lineItems.length + 1}`,
        label: 'Tax',
        amountCents: createBillTaxAmountCents,
      });
    }
    return lineItems;
  }, [
    createBillEventAmountCents,
    createBillLabel,
    createBillMvpFeeAmountCents,
    createBillStripeFeeAmountCents,
    createBillTaxAmountCents,
  ]);

  const submitCreateBill = useCallback(async () => {
    const team = createBillTeam;
    if (!team?.$id) {
      return;
    }
    const targetEventId = activeEvent?.$id ?? eventId;
    if (!targetEventId) {
      return;
    }
    if (createBillEventAmountCents <= 0) {
      setCreateBillError('Enter an amount greater than $0.00.');
      return;
    }
    if (createBillOwnerType === 'USER' && !createBillOwnerId) {
      setCreateBillError('Select a user to bill.');
      return;
    }

    setCreatingBill(true);
    setCreateBillError(null);
    try {
      await apiRequest(`/api/events/${targetEventId}/teams/${team.$id}/billing/bills`, {
        method: 'POST',
        body: {
          ownerType: createBillOwnerType,
          ownerId: createBillOwnerType === 'TEAM' ? team.$id : createBillOwnerId,
          eventAmountCents: createBillEventAmountCents,
          taxAmountCents: createBillTaxAmountCents,
          allowSplit: createBillOwnerType === 'TEAM' ? createBillAllowSplit : false,
          label: createBillLabel,
        },
      });
      setInfoMessage('Bill created successfully.');
      closeCreateBillModal();
      refreshTeamCompliance();
    } catch (error) {
      console.error('Failed to create bill:', error);
      setCreateBillError(error instanceof Error ? error.message : 'Failed to create bill.');
    } finally {
      setCreatingBill(false);
    }
  }, [
    activeEvent?.$id,
    closeCreateBillModal,
    createBillAllowSplit,
    createBillEventAmountCents,
    createBillLabel,
    createBillOwnerId,
    createBillOwnerType,
    createBillTaxAmountCents,
    createBillTeam,
    eventId,
    refreshTeamCompliance,
  ]);

  const renderEditBillingActions = useCallback((team: Team) => {
    if (!isEditingEvent || !canManageEvent) {
      return null;
    }
    return (
      <Group gap={6} wrap="nowrap">
        <Button
          size="xs"
          variant="light"
          color="blue"
          onClick={(event) => {
            event.stopPropagation();
            void openRefundModal(team);
          }}
        >
          Refund
        </Button>
        <Button
          size="xs"
          variant="light"
          color="grape"
          onClick={(event) => {
            event.stopPropagation();
            openCreateBillModal(team);
          }}
        >
          Send Bill
        </Button>
      </Group>
    );
  }, [canManageEvent, isEditingEvent, openCreateBillModal, openRefundModal]);

  const toggleComplianceUserExpanded = useCallback((userId: string) => {
    setExpandedComplianceUserIds((current) => (
      current.includes(userId)
        ? current.filter((value) => value !== userId)
        : [...current, userId]
    ));
  }, []);

  const resolveTeam = useCallback(
    (value: Match['team1'] | string | null | undefined): Team | null => {
      if (!value) return null;
      if (typeof value === 'string') {
        return participantTeamsById.get(value) ?? teamsById.get(value) ?? null;
      }
      if (typeof value === 'object') {
        const team = value as Team & { id?: string };
        const teamId = normalizeIdToken(team.$id ?? team.id);
        if (teamId) {
          return participantTeamsById.get(teamId) ?? teamsById.get(teamId) ?? team;
        }
        return team;
      }
      return null;
    },
    [participantTeamsById, teamsById],
  );

  const userOnTeam = useCallback(
    (team: Team | null | undefined) => {
      if (!team || !user?.$id) return false;
      const memberIds = new Set<string>();
      if (Array.isArray(team.playerIds)) {
        team.playerIds.forEach((id) => {
          if (typeof id === 'string') {
            memberIds.add(id);
          }
        });
      }
      if (Array.isArray(team.players)) {
        team.players.forEach((player) => {
          if (player?.$id) {
            memberIds.add(player.$id);
          }
        });
      }
      if (team.captainId) {
        memberIds.add(team.captainId);
      }
      if (team.captain && typeof team.captain === 'object' && '$id' in team.captain && (team.captain as any).$id) {
        memberIds.add((team.captain as any).$id as string);
      }
      return memberIds.has(user.$id);
    },
    [user?.$id],
  );

  const userEventTeamIdFromProfile = useMemo(() => {
    if (!Array.isArray(user?.teamIds) || user.teamIds.length === 0) {
      return null;
    }
    for (const teamIdRaw of user.teamIds) {
      const teamId = normalizeIdToken(teamIdRaw);
      if (teamId && participantTeamIdSet.has(teamId)) {
        return teamId;
      }
    }
    return null;
  }, [participantTeamIdSet, user?.teamIds]);

  const findUserEventTeam = useCallback(() => {
    if (!user?.$id) return null;
    for (const team of participantTeamsById.values()) {
      if (team && userOnTeam(team)) {
        return team;
      }
    }
    return null;
  }, [participantTeamsById, user?.$id, userOnTeam]);

  const hasUnsavedChangesRef = useRef(hasPendingUnsavedChanges);
  const pendingRegularEventRef = useRef<Partial<Event> | null>(null);
  useEffect(() => {
    hasUnsavedChangesRef.current = hasPendingUnsavedChanges;
  }, [hasPendingUnsavedChanges]);

  useEffect(() => {
    if (pendingSaveChangeCount === 0) {
      setIsPendingChangesPopoverOpen(false);
    }
  }, [pendingSaveChangeCount]);

  useEffect(() => {
    if (!isCreateMode || !user) return;
    if (templateIdParam && failedTemplateSeedId !== templateIdParam) {
      return;
    }
    setChangesEvent((prev) => {
      if (prev) return prev;
      const defaultStartDate = new Date(Date.now() + 60 * 60 * 1000);
      if (
        defaultStartDate.getMinutes() !== 0
        || defaultStartDate.getSeconds() !== 0
        || defaultStartDate.getMilliseconds() !== 0
      ) {
        defaultStartDate.setHours(defaultStartDate.getHours() + 1, 0, 0, 0);
      } else {
        defaultStartDate.setMinutes(0, 0, 0);
      }
      const defaultEndDate = new Date(defaultStartDate.getTime() + 60 * 60 * 1000);
      const start = rentalImmutableDefaults?.start ?? formatLocalDateTime(defaultStartDate);
      const end = rentalImmutableDefaults?.end ?? formatLocalDateTime(defaultEndDate);
      const locationDefaults = createLocationDefaults;
      const rentalLocation = (rentalImmutableDefaults?.location ?? '').trim();
      const rentalAddress = (rentalImmutableDefaults?.address ?? '').trim();
      const rentalCoordinates = rentalImmutableDefaults?.coordinates;
      return {
        $id: eventId || 'temp-id',
        name: '',
        description: '',
        location: rentalLocation || locationDefaults?.location || '',
        address: rentalAddress || locationDefaults?.address || '',
        coordinates: rentalCoordinates ?? locationDefaults?.coordinates ?? [0, 0],
        start,
        end,
        eventType: 'EVENT',
        sportId: '',
        sport: defaultSport,
        price: 0,
        maxParticipants: 10,
        teamSizeLimit: 2,
        teamSignup: false,
        singleDivision: true,
        divisions: [],
        cancellationRefundHours: 24,
        registrationCutoffHours: 2,
        hostId: user.$id,
        state: 'DRAFT' as EventState,
        requiredTemplateIds: [],
        $createdAt: '',
        $updatedAt: '',
        attendees: 0,
        imageId: '',
        seedColor: 0,
        waitListIds: [],
        freeAgentIds: [],
        players: [],
        teams: [],
        officials: [],
        officialIds: [],
        officialSchedulingMode: 'STAFFING',
        officialPositions: [],
        eventOfficials: [],
        assistantHostIds: [],
      } as Event;
    });
  }, [
    createLocationDefaults,
    defaultSport,
    eventId,
    failedTemplateSeedId,
    isCreateMode,
    rentalImmutableDefaults,
    templateIdParam,
    user,
  ]);

  // Create mode: if the host has event templates, prompt to start from one.
  useEffect(() => {
    if (
      !isCreateMode ||
      !eventId ||
      !user?.$id ||
      isGuest ||
      isRentalFlow ||
      (Boolean(templateIdParam) && failedTemplateSeedId !== templateIdParam) ||
      skipTemplatePromptParam
    ) {
      setTemplateSummaries([]);
      setTemplatePromptOpen(false);
      setTemplatesError(null);
      return;
    }
    if (templatePromptResolvedRef.current) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setTemplatesLoading(true);
        setTemplatesError(null);
        const qs = new URLSearchParams();
        qs.set('state', 'TEMPLATE');
        if (resolvedHostOrgId) {
          qs.set('organizationId', resolvedHostOrgId);
        } else {
          qs.set('hostId', user.$id);
        }
        qs.set('limit', '50');
        const response = await apiRequest<{ events?: any[] }>(`/api/events?${qs.toString()}`);
        const rows = Array.isArray(response?.events) ? response.events : [];
        const summaries = rows
          .map((row) => ({
            id: String(row?.$id ?? row?.id ?? ''),
            name: String(row?.name ?? 'Untitled Template'),
          }))
          .filter((entry) => entry.id.length > 0);

        if (cancelled) return;
        setTemplateSummaries(summaries);

        if (summaries.length > 0 && !templatePromptResolvedRef.current) {
          setTemplatePromptOpen(true);
          setSelectedTemplateId((prev) => prev ?? null);
          setSelectedTemplateStartDate((prev) => {
            if (prev) return prev;
            const base = changesEvent?.start ? parseLocalDateTime(changesEvent.start) : null;
            const seed = base ?? new Date();
            const day = new Date(seed);
            day.setHours(0, 0, 0, 0);
            return day;
          });
        } else {
          setTemplatePromptOpen(false);
        }
      } catch (error) {
        if (cancelled) return;
        setTemplateSummaries([]);
        setTemplatePromptOpen(false);
        setTemplatesError(error instanceof Error ? error.message : 'Failed to load templates.');
      } finally {
        if (!cancelled) {
          setTemplatesLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    changesEvent?.start,
    eventId,
    isCreateMode,
    isGuest,
    isRentalFlow,
    resolvedHostOrgId,
    failedTemplateSeedId,
    skipTemplatePromptParam,
    templateIdParam,
    user?.$id,
  ]);

  useEffect(() => {
    if (!isCreateMode) {
      setFormSeedEvent(null);
      return;
    }
    if (!changesEvent) {
      return;
    }
    if (!hasPendingUnsavedChanges) {
      setFormSeedEvent(changesEvent);
    }
  }, [changesEvent, hasPendingUnsavedChanges, isCreateMode]);

  useEffect(() => {
    if (!isCreateMode) {
      setOrganizationForCreate(null);
      setRentalOrganization(null);
      return;
    }

    let cancelled = false;

    const loadOrganizationsForCreate = async () => {
      const hostOrgId = resolvedHostOrgId;
      const rentalOrgId = resolvedRentalOrgId;

      if (!hostOrgId && !rentalOrgId) {
        setOrganizationForCreate(null);
        setRentalOrganization(null);
        return;
      }

      try {
        const hostPromise = hostOrgId
          ? (
            organizationService.getOrganizationByIdForEventForm
              ? organizationService.getOrganizationByIdForEventForm(hostOrgId)
              : organizationService.getOrganizationById(hostOrgId, true)
          )
          : Promise.resolve(null);
        const rentalPromise =
          rentalOrgId && rentalOrgId !== hostOrgId
            ? (
              organizationService.getOrganizationByIdForEventForm
                ? organizationService.getOrganizationByIdForEventForm(rentalOrgId)
                : organizationService.getOrganizationById(rentalOrgId, true)
            )
            : Promise.resolve(null);
        const [hostOrg, rentalOrg] = await Promise.all([hostPromise, rentalPromise]);

        if (cancelled) return;

        const resolvedHostOrg = hostOrg ? (hostOrg as Organization) : null;
        const resolvedRentalOrg = rentalOrgId === hostOrgId
          ? resolvedHostOrg
          : rentalOrg
            ? (rentalOrg as Organization)
            : null;

        setOrganizationForCreate(resolvedHostOrg);
        setRentalOrganization(resolvedRentalOrg);

        if (resolvedHostOrg) {
          setChangesEvent((prev) => {
            const base = prev ?? ({ $id: eventId, state: 'DRAFT' } as Event);
            const orgLocation = (resolvedHostOrg.location ?? '').trim();
            const orgAddress = (resolvedHostOrg.address ?? '').trim();
            const orgCoordinates =
              Array.isArray(resolvedHostOrg.coordinates) &&
                typeof resolvedHostOrg.coordinates[0] === 'number' &&
                typeof resolvedHostOrg.coordinates[1] === 'number'
                ? (resolvedHostOrg.coordinates as [number, number])
                : undefined;
            const baseLocation = (base.location ?? '').trim();
            const baseAddress = (base.address ?? '').trim();
            const hasBaseCoordinates =
              Array.isArray(base.coordinates) &&
                typeof base.coordinates[0] === 'number' &&
                typeof base.coordinates[1] === 'number' &&
                (base.coordinates[0] !== 0 || base.coordinates[1] !== 0);
            return {
              ...base,
              organization: resolvedHostOrg,
              organizationId: resolvedHostOrg.$id,
              hostId: base.hostId ?? resolvedHostOrg.ownerId ?? base.hostId,
              fields: Array.isArray(base.fields) && base.fields.length > 0
                ? base.fields
                : Array.isArray(resolvedHostOrg.fields)
                  ? resolvedHostOrg.fields
                  : base.fields,
              officialIds: Array.isArray(resolvedHostOrg.officialIds) ? resolvedHostOrg.officialIds : base.officialIds,
              officials: Array.isArray(resolvedHostOrg.officials) ? resolvedHostOrg.officials : base.officials,
              location: baseLocation || orgLocation || '',
              address: baseAddress || orgAddress || '',
              coordinates: hasBaseCoordinates ? base.coordinates : orgCoordinates ?? base.coordinates ?? [0, 0],
            } as Event;
          });
        }
      } catch (error) {
        console.warn('Failed to load organizations for create:', error);
      }
    };

    loadOrganizationsForCreate();

    return () => {
      cancelled = true;
    };
  }, [eventId, isCreateMode, resolvedHostOrgId, resolvedRentalOrgId]);

  const hydrateEvent = useCallback((loadedEvent: Event) => {
    const eventClone = cloneValue(loadedEvent) as Event;
    setEvent(eventClone);
    setStagedMatchCreates({});
    setStagedMatchDeletes([]);
    setPendingCreateMatchId(null);
    setMatchEditorContext('bracket');

    const normalizedMatches = Array.isArray(eventClone.matches)
      ? (cloneValue(eventClone.matches) as Match[])
      : [];

    setMatches(normalizedMatches);

    setChangesEvent((prev) => {
      if (hasUnsavedChangesRef.current && prev) {
        return prev;
      }
      return cloneValue(eventClone) as Event;
    });

    setChangesMatches((prev) => {
      if (hasUnsavedChangesRef.current && prev.length) {
        return prev;
      }
      return cloneValue(normalizedMatches) as Match[];
    });
  }, []);

  const createButtonLabel = 'Create Event';
  const cancelButtonLabel = (() => {
    if (isCreateMode) return 'Cancel';
    if (isPreview) return `Cancel ${entityLabel} Preview`;
    if (isEditingEvent) return 'Cancel Manage';
    return `Cancel ${entityLabel}`;
  })();

  const handleEnterEditMode = useCallback(() => {
    if (!pathname) return;
    setSelectedLifecycleStatus(null);
    setFormHasUnsavedChanges(false);
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('mode', 'edit');
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
  }, [pathname, router, searchParams]);

  const handleLifecycleStatusChange = useCallback((value: string | null) => {
    if (!value) return;

    const nextStatus = value as EventLifecycleStatus;
    setSelectedLifecycleStatus(nextStatus);
    setChangesEvent((prev) => {
      const base = prev ?? activeEvent;
      if (!base) return prev;

      const nextState: EventState = nextStatus === 'DRAFT' ? 'UNPUBLISHED' : 'PUBLISHED';

      return {
        ...base,
        state: nextState,
      } as Event;
    });
    setHasUnsavedChanges(true);
    setSubmitError(null);
    setInfoMessage(null);
    setWarningMessage(null);
  }, [activeEvent]);

  const rentalPaymentEventSummary: PaymentEventSummary = useMemo(() => {
    const source = changesEvent ?? activeEvent ?? event;
    return {
      name: source?.name || 'Rental Event',
      location: source?.location || '',
      eventType: source?.eventType ?? 'EVENT',
      price: rentalPurchaseContext?.priceCents ?? 0,
      imageId: source?.imageId,
    };
  }, [activeEvent, changesEvent, event, rentalPurchaseContext?.priceCents]);
  const currentRentalSignLink = rentalSignLinks[rentalSignIndex] ?? null;

  const hydrateEventFormDependencies = useCallback(async (inputEvent: Event): Promise<Event> => {
    const hydratedEvent = cloneValue(inputEvent) as Event;
    const targetEventId = normalizeIdToken(hydratedEvent.$id) ?? normalizeIdToken(eventId);

    if (
      targetEventId
      && (!Array.isArray(hydratedEvent.matches) || hydratedEvent.matches.length === 0)
    ) {
      try {
        const matchesResponse = await apiRequest<any>(`/api/events/${targetEventId}/matches`);
        if (Array.isArray(matchesResponse?.matches)) {
          hydratedEvent.matches = matchesResponse.matches.map((match: Match) => normalizeApiMatch(match));
        }
      } catch (matchesError) {
        console.error('Failed to hydrate matches for event form:', matchesError);
      }
    }

    if (
      hydratedEvent.eventType === 'LEAGUE'
      && typeof hydratedEvent.leagueScoringConfigId === 'string'
      && hydratedEvent.leagueScoringConfigId.trim().length > 0
      && (!hydratedEvent.leagueScoringConfig || typeof hydratedEvent.leagueScoringConfig !== 'object')
    ) {
      try {
        const leagueConfigResponse = await apiRequest<any>(`/api/league-scoring-configs/${hydratedEvent.leagueScoringConfigId}`);
        const leagueConfig = leagueConfigResponse?.leagueScoringConfig ?? leagueConfigResponse;
        if (leagueConfig && typeof leagueConfig === 'object') {
          hydratedEvent.leagueScoringConfig = {
            ...leagueConfig,
            $id: typeof leagueConfig.$id === 'string'
              ? leagueConfig.$id
              : typeof leagueConfig.id === 'string'
                ? leagueConfig.id
                : undefined,
          };
        }
      } catch (leagueConfigError) {
        console.error('Failed to hydrate league scoring config for event form:', leagueConfigError);
      }
    }

    const timeSlotIds = Array.isArray(hydratedEvent.timeSlotIds)
      ? Array.from(
        new Set(
          hydratedEvent.timeSlotIds
            .map((slotId) => String(slotId).trim())
            .filter((slotId) => slotId.length > 0),
        ),
      )
      : [];
    if (
      (!Array.isArray(hydratedEvent.timeSlots) || hydratedEvent.timeSlots.length === 0)
      && timeSlotIds.length > 0
    ) {
      try {
        const timeSlotsResponse = await apiRequest<{ timeSlots?: Array<Record<string, unknown>> }>(
          `/api/time-slots?ids=${timeSlotIds.join(',')}`,
        );
        if (Array.isArray(timeSlotsResponse?.timeSlots)) {
          hydratedEvent.timeSlots = timeSlotsResponse.timeSlots.map((row) => {
            const slot = row as Record<string, unknown>;
            const slotId = normalizeIdToken(slot.$id ?? slot.id) ?? createClientId();
            const rawFieldIds = Array.isArray(slot.scheduledFieldIds)
              ? slot.scheduledFieldIds
              : typeof slot.scheduledFieldId === 'string'
                ? [slot.scheduledFieldId]
                : [];
            const scheduledFieldIds = Array.from(
              new Set(
                rawFieldIds
                  .map((fieldId) => String(fieldId).trim())
                  .filter((fieldId) => fieldId.length > 0),
              ),
            );
            const rawDays = Array.isArray(slot.daysOfWeek)
              ? slot.daysOfWeek
              : typeof slot.dayOfWeek === 'number'
                ? [slot.dayOfWeek]
                : [];
            const daysOfWeek = Array.from(
              new Set(
                rawDays
                  .map((day) => Number(day))
                  .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
              ),
            ) as Array<0 | 1 | 2 | 3 | 4 | 5 | 6>;

            return {
              ...(slot as unknown as TimeSlot),
              $id: slotId,
              dayOfWeek: daysOfWeek[0] ?? (typeof slot.dayOfWeek === 'number' ? slot.dayOfWeek as TimeSlot['dayOfWeek'] : undefined),
              daysOfWeek,
              scheduledFieldId:
                scheduledFieldIds[0]
                ?? (typeof slot.scheduledFieldId === 'string' ? slot.scheduledFieldId : undefined),
              scheduledFieldIds,
              divisions: Array.isArray(slot.divisions)
                ? Array.from(
                  new Set(
                    slot.divisions
                      .map((division) => String(division).trim().toLowerCase())
                      .filter((division) => division.length > 0),
                  ),
                )
                : [],
              repeating: slot.repeating === undefined ? true : Boolean(slot.repeating),
            } as TimeSlot;
          });
        }
      } catch (timeSlotsError) {
        console.error('Failed to hydrate time slots for event form:', timeSlotsError);
      }
    }

    const fieldIdsFromEvent = Array.isArray(hydratedEvent.fieldIds)
      ? hydratedEvent.fieldIds.map((fieldId) => String(fieldId).trim()).filter((fieldId) => fieldId.length > 0)
      : [];
    const fieldIdsFromSlots = Array.isArray(hydratedEvent.timeSlots)
      ? hydratedEvent.timeSlots.flatMap((slot) => {
        const fromList = Array.isArray(slot.scheduledFieldIds)
          ? slot.scheduledFieldIds
          : [];
        if (fromList.length > 0) {
          return fromList.map((fieldId) => String(fieldId).trim()).filter((fieldId) => fieldId.length > 0);
        }
        return typeof slot.scheduledFieldId === 'string' && slot.scheduledFieldId.trim().length > 0
          ? [slot.scheduledFieldId.trim()]
          : [];
      })
      : [];
    const fieldIdsToHydrate = Array.from(new Set([...fieldIdsFromEvent, ...fieldIdsFromSlots]));
    if (
      (!Array.isArray(hydratedEvent.fields) || hydratedEvent.fields.length === 0)
      && fieldIdsToHydrate.length > 0
    ) {
      try {
        const fieldsResponse = await apiRequest<{ fields?: Array<Record<string, unknown>> }>(
          `/api/fields?ids=${fieldIdsToHydrate.join(',')}`,
        );
        if (Array.isArray(fieldsResponse?.fields)) {
          hydratedEvent.fields = fieldsResponse.fields as unknown as Field[];
        }
      } catch (fieldsError) {
        console.error('Failed to hydrate fields for event form:', fieldsError);
      }
    }

    if (Array.isArray(hydratedEvent.matches) && Array.isArray(hydratedEvent.fields) && hydratedEvent.fields.length > 0) {
      const fieldsById = new Map<string, Field>(
        hydratedEvent.fields
          .filter((field): field is Field => Boolean(field?.$id))
          .map((field) => [field.$id, field]),
      );
      hydratedEvent.matches = hydratedEvent.matches.map((match) => {
        const normalizedMatch = normalizeApiMatch(match);
        if (normalizedMatch.field && typeof normalizedMatch.field === 'object') {
          return normalizedMatch;
        }
        const fieldId = normalizeIdToken(normalizedMatch.fieldId);
        if (!fieldId) {
          return normalizedMatch;
        }
        const field = fieldsById.get(fieldId);
        if (!field) {
          return normalizedMatch;
        }
        return {
          ...normalizedMatch,
          field,
        };
      });
    }

    let sports: Sport[] = [];
    try {
      sports = await sportsService.getAll();
    } catch (sportsError) {
      console.error('Failed to pre-load sports for event form:', sportsError);
    }

    const sportsById = new Map<string, Sport>(
      sports
        .filter((sport): sport is Sport => Boolean(sport?.$id))
        .map((sport) => [sport.$id, sport]),
    );

    const resolvedSportId = normalizeIdToken(
      hydratedEvent.sportId
      || (typeof hydratedEvent.sport === 'string' ? hydratedEvent.sport : (hydratedEvent.sport as Sport | undefined)?.$id),
    );
    const resolvedSport = resolvedSportId ? sportsById.get(resolvedSportId) ?? null : null;
    if (resolvedSport) {
      hydratedEvent.sport = resolvedSport;
      hydratedEvent.sportId = resolvedSport.$id;
    }

    const hydrateAssignedUsers = async (
      ids: unknown,
      existingUsers: unknown,
    ): Promise<{ ids: string[]; users: UserData[] }> => {
      const normalizedIds = Array.from(
        new Set(
          (Array.isArray(ids) ? ids : [])
            .map((value) => normalizeIdToken(value))
            .filter((value): value is string => Boolean(value)),
        ),
      );
      const usersById = new Map<string, UserData>();
      if (Array.isArray(existingUsers)) {
        existingUsers.forEach((candidate) => {
          if (candidate && typeof candidate === 'object' && '$id' in candidate) {
            const candidateId = normalizeIdToken((candidate as UserData).$id);
            if (candidateId) {
              usersById.set(candidateId, candidate as UserData);
            }
          }
        });
      }

      const missingIds = normalizedIds.filter((id) => !usersById.has(id));
      if (missingIds.length > 0) {
        try {
          const fetchedUsers = await userService.getUsersByIds(missingIds);
          fetchedUsers.forEach((candidate) => {
            const candidateId = normalizeIdToken(candidate?.$id);
            if (candidateId) {
              usersById.set(candidateId, candidate);
            }
          });
        } catch (usersError) {
          console.error('Failed to hydrate assigned users for event form:', usersError);
        }
      }

      return {
        ids: normalizedIds,
        users: normalizedIds
          .map((id) => usersById.get(id))
          .filter((candidate): candidate is UserData => Boolean(candidate)),
      };
    };

    const normalizedOfficials = await hydrateAssignedUsers(hydratedEvent.officialIds, hydratedEvent.officials);
    hydratedEvent.officialIds = normalizedOfficials.ids;
    hydratedEvent.officials = normalizedOfficials.users;

    const normalizedAssistantHosts = await hydrateAssignedUsers(hydratedEvent.assistantHostIds, hydratedEvent.assistantHosts);
    hydratedEvent.assistantHostIds = normalizedAssistantHosts.ids;
    hydratedEvent.assistantHosts = normalizedAssistantHosts.users;

    if (hydratedEvent.eventType === 'LEAGUE') {
      const allowedSetCounts = [1, 3, 5];
      const source = hydratedEvent.leagueConfig ?? hydratedEvent;
      const matchDurationMinutes = Number.isFinite(Number(source.matchDurationMinutes))
        ? Math.max(1, Math.trunc(Number(source.matchDurationMinutes)))
        : 60;
      const restTimeMinutes = Number.isFinite(Number(source.restTimeMinutes))
        ? Math.max(0, Math.trunc(Number(source.restTimeMinutes)))
        : 0;
      const usesSets = Boolean(resolvedSport?.usePointsPerSetWin);

      let setsPerMatch: number | undefined;
      let setDurationMinutes: number | undefined;
      let pointsToVictory: number[] | undefined;

      if (usesSets) {
        const rawSetsPerMatch = Number(source.setsPerMatch);
        setsPerMatch = allowedSetCounts.includes(rawSetsPerMatch) ? rawSetsPerMatch : 1;
        setDurationMinutes = Number.isFinite(Number(source.setDurationMinutes))
          ? Math.max(1, Math.trunc(Number(source.setDurationMinutes)))
          : 20;
        const seedPoints = Array.isArray(source.pointsToVictory)
          ? source.pointsToVictory
          : [];
        const normalizedPoints = seedPoints
          .slice(0, setsPerMatch)
          .map((value) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : 21;
          });
        while (normalizedPoints.length < setsPerMatch) {
          normalizedPoints.push(21);
        }
        pointsToVictory = normalizedPoints;
      }

      const normalizedLeagueConfig: LeagueConfig = {
        gamesPerOpponent: Number.isFinite(Number(source.gamesPerOpponent))
          ? Math.max(1, Math.trunc(Number(source.gamesPerOpponent)))
          : 1,
        includePlayoffs: Boolean(source.includePlayoffs),
        playoffTeamCount: Number.isFinite(Number(source.playoffTeamCount))
          ? Math.max(2, Math.trunc(Number(source.playoffTeamCount)))
          : undefined,
        usesSets,
        matchDurationMinutes,
        restTimeMinutes,
        setDurationMinutes,
        setsPerMatch,
        pointsToVictory,
      };

      hydratedEvent.leagueConfig = normalizedLeagueConfig;
      hydratedEvent.usesSets = normalizedLeagueConfig.usesSets;
      hydratedEvent.matchDurationMinutes = normalizedLeagueConfig.matchDurationMinutes;
      hydratedEvent.restTimeMinutes = normalizedLeagueConfig.restTimeMinutes;
      hydratedEvent.setDurationMinutes = normalizedLeagueConfig.setDurationMinutes;
      hydratedEvent.setsPerMatch = normalizedLeagueConfig.setsPerMatch;
      hydratedEvent.pointsToVictory = normalizedLeagueConfig.pointsToVictory;
    }

    const organizationId = normalizeIdToken(
      hydratedEvent.organizationId
      || (typeof hydratedEvent.organization === 'string'
        ? hydratedEvent.organization
        : (hydratedEvent.organization as Organization | undefined)?.$id),
    );
    if (organizationId) {
      try {
        const resolvedOrganization = await (
          organizationService.getOrganizationByIdForEventForm
            ? organizationService.getOrganizationByIdForEventForm(organizationId)
            : organizationService.getOrganizationById(organizationId, true)
        );
        if (resolvedOrganization) {
          hydratedEvent.organization = resolvedOrganization;
        }
      } catch (organizationError) {
        console.error('Failed to hydrate event organization for event form:', organizationError);
      }
    }

    return hydratedEvent;
  }, [eventId]);

  // Kick off schedule loading once auth state is resolved or redirect unauthenticated users.
  // Hydrate event + match data from the API and sync local component state.
  const loadSchedule = useCallback(async ({
    showPageLoader = true,
    clearMessages = true,
  }: {
    showPageLoader?: boolean;
    clearMessages?: boolean;
  } = {}) => {
    if (!eventId) return;
    if (isCreateMode) {
      setLoading(false);
      setError(null);
      return;
    }

    if (showPageLoader) {
      setLoading(true);
    }
    setError(null);
    if (clearMessages) {
      setInfoMessage(null);
      setWarningMessage(null);
    }

    try {
      let fetchedEvent = await eventService.getEventWithRelations(eventId);
      if (!fetchedEvent) {
        const response = await apiRequest<any>(`/api/events/${eventId}`);
        const responseEvent = response?.event ?? response;
        fetchedEvent = normalizeApiEvent(responseEvent ?? null) ?? undefined;
      }
      if (!fetchedEvent) {
        setError('League not found.');
        return;
      }
      const normalizedEvent = await hydrateEventFormDependencies(fetchedEvent);
      hydrateEvent(normalizedEvent);
      if (!hasUnsavedChangesRef.current) {
        setHasUnsavedChanges(false);
        setFormHasUnsavedChanges(false);
      }
    } catch (err) {
      console.error('Failed to load league schedule:', err);
      setError('Failed to load league schedule. Please try again.');
    } finally {
      if (showPageLoader) {
        setLoading(false);
      }
    }
  }, [eventId, hydrateEvent, hydrateEventFormDependencies, isCreateMode]);

  useEffect(() => {
    if (!eventId || authLoading) {
      return;
    }

    if (!isAuthenticated && !isGuest) {
      router.push('/login');
      return;
    }

    loadSchedule();
  }, [authLoading, eventId, isAuthenticated, isGuest, isPreview, loadSchedule, router]);

  const playoffMatches = useMemo(
    () =>
      activeMatches.filter((match) =>
        Boolean(
          match.previousLeftId ||
          match.previousRightId ||
          match.winnerNextMatchId ||
          match.loserNextMatchId,
        ),
      ),
    [activeMatches],
  );

  const playoffMatchesMap = useMemo<Record<string, Match> | null>(() => {
    if (!playoffMatches.length) {
      return null;
    }

    const map = playoffMatches.reduce<Record<string, Match>>((acc, match) => {
      acc[match.$id] = { ...match };
      return acc;
    }, {});

    Object.values(map).forEach((match) => {
      if (match.winnerNextMatchId && map[match.winnerNextMatchId]) {
        match.winnerNextMatch = map[match.winnerNextMatchId];
      }
      if (match.loserNextMatchId && map[match.loserNextMatchId]) {
        match.loserNextMatch = map[match.loserNextMatchId];
      }
      if (match.previousLeftId && map[match.previousLeftId]) {
        match.previousLeftMatch = map[match.previousLeftId];
      }
      if (match.previousRightId && map[match.previousRightId]) {
        match.previousRightMatch = map[match.previousRightId];
      }
    });

    return map;
  }, [playoffMatches]);

  const playoffRootMatches = useMemo<Match[]>(() => {
    if (!playoffMatchesMap) {
      return [];
    }

    return Object.values(playoffMatchesMap).filter(
      (match) => !match.winnerNextMatchId || !playoffMatchesMap[match.winnerNextMatchId],
    );
  }, [playoffMatchesMap]);

  const bracketDivisionOptions = useMemo<DivisionOption[]>(() => {
    const labels = new Map<string, string>();

    playoffRootMatches.forEach((match) => {
      const divisionId = getMatchDivisionId(match);
      const divisionKey = toDivisionKey(divisionId);
      if (!divisionId || !divisionKey || labels.has(divisionKey)) {
        return;
      }

      labels.set(divisionKey, divisionLabelsByKey.get(divisionKey) ?? getMatchDivisionLabel(match) ?? divisionId);
    });

    return Array.from(labels.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [divisionLabelsByKey, playoffRootMatches]);

  useEffect(() => {
    if (bracketDivisionOptions.length === 0) {
      if (selectedBracketDivision !== null) {
        setSelectedBracketDivision(null);
      }
      return;
    }

    if (
      selectedBracketDivision &&
      bracketDivisionOptions.some((option) => option.value === selectedBracketDivision)
    ) {
      return;
    }

    setSelectedBracketDivision(bracketDivisionOptions[0].value);
  }, [bracketDivisionOptions, selectedBracketDivision]);

  const selectedBracketRootMatch = useMemo(() => {
    if (playoffRootMatches.length === 0) {
      return null;
    }

    const rootsForDivision = selectedBracketDivision
      ? playoffRootMatches.filter(
          (match) => toDivisionKey(getMatchDivisionId(match)) === selectedBracketDivision,
        )
      : playoffRootMatches;

    return pickPreferredRootMatch(rootsForDivision);
  }, [playoffRootMatches, selectedBracketDivision]);

  const bracketMatchesMap = useMemo<Record<string, Match> | null>(() => {
    if (!playoffMatchesMap || !selectedBracketRootMatch) {
      return null;
    }

    const connectedMatchIds = collectConnectedMatchIds(playoffMatchesMap, selectedBracketRootMatch.$id);
    if (connectedMatchIds.size === 0) {
      return null;
    }

    return Array.from(connectedMatchIds).reduce<Record<string, Match>>((acc, matchId) => {
      const match = playoffMatchesMap[matchId];
      if (match) {
        acc[matchId] = match;
      }
      return acc;
    }, {});
  }, [playoffMatchesMap, selectedBracketRootMatch]);

  const playoffMatchIds = useMemo(() => new Set(playoffMatches.map((match) => match.$id)), [playoffMatches]);

  const leagueScoring = useMemo(
    () =>
      createLeagueScoringConfig(
        activeEvent && typeof activeEvent.leagueScoringConfig === 'object'
          ? activeEvent.leagueScoringConfig
          : null,
      ),
    [activeEvent],
  );

  const baseStandings = useMemo<StandingsRow[]>(() => {
    if (
      standingsDivisionData
      && selectedStandingsDivision
      && toDivisionKey(standingsDivisionData.divisionId) === toDivisionKey(selectedStandingsDivision)
    ) {
      return standingsDivisionData.standings.map((row) => ({
        teamId: row.teamId,
        teamName: row.teamName,
        draws: row.draws,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        goalDifference: row.goalDifference,
        matchesPlayed: row.matchesPlayed,
        points: row.finalPoints,
        basePoints: row.basePoints,
        finalPoints: row.finalPoints,
        pointsDelta: row.pointsDelta,
      }));
    }

    if (!activeEvent) {
      return [];
    }

    const selectedDivisionKey = toDivisionKey(selectedStandingsDivision);
    const teamsArray = Array.isArray(activeEvent.teams) ? (activeEvent.teams as Team[]) : [];
    const teamsById = new Map<string, Team>();
    teamsArray.forEach((team) => {
      if (team?.$id) {
        const teamDivisionKey = toDivisionKey(getDivisionId(team.division));
        if (selectedDivisionKey && teamDivisionKey !== selectedDivisionKey) {
          return;
        }
        teamsById.set(team.$id, team);
      }
    });

    const rows = new Map<string, StandingsRow>();
    const ensureRow = (teamId: string, team?: Team | null): StandingsRow | null => {
      if (!teamId) {
        return null;
      }
      if (team && !teamsById.has(teamId)) {
        teamsById.set(teamId, team);
      }
      if (!rows.has(teamId)) {
        const resolved = team ?? teamsById.get(teamId) ?? null;
        rows.set(teamId, {
          teamId,
          teamName: resolved?.name || `Team ${teamId.slice(0, 6)}`,
          draws: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
          matchesPlayed: 0,
          points: 0,
        });
      }
      return rows.get(teamId) ?? null;
    };

    teamsArray.forEach((team) => {
      if (team?.$id) {
        ensureRow(team.$id, team);
      }
    });

    const sumPoints = (values: number[] | null | undefined): number =>
      Array.isArray(values)
        ? values.reduce((total, value) => (Number.isFinite(value) ? total + Number(value) : total), 0)
        : 0;

    activeMatches.forEach((match) => {
      if (playoffMatchIds.has(match.$id)) {
        return;
      }
      if (selectedDivisionKey && toDivisionKey(getMatchDivisionId(match)) !== selectedDivisionKey) {
        return;
      }

      const team1Id =
        (match.team1 && typeof match.team1 === 'object' && '$id' in match.team1
          ? match.team1.$id
          : undefined) ?? (typeof match.team1Id === 'string' ? match.team1Id : null);
      const team2Id =
        (match.team2 && typeof match.team2 === 'object' && '$id' in match.team2
          ? match.team2.$id
          : undefined) ?? (typeof match.team2Id === 'string' ? match.team2Id : null);

      if (!team1Id || !team2Id) {
        return;
      }

      const team1 = (match.team1 as Team | undefined) ?? teamsById.get(team1Id) ?? null;
      const team2 = (match.team2 as Team | undefined) ?? teamsById.get(team2Id) ?? null;

      const row1 = ensureRow(team1Id, team1);
      const row2 = ensureRow(team2Id, team2);
      if (!row1 || !row2) {
        return;
      }

      const setResults = Array.isArray(match.setResults) ? match.setResults : [];
      const team1Wins = setResults.filter((result) => result === 1).length;
      const team2Wins = setResults.filter((result) => result === 2).length;
      const allSetsResolved = setResults.length > 0 && setResults.every((result) => result === 1 || result === 2);

      const team1Total = sumPoints(match.team1Points);
      const team2Total = sumPoints(match.team2Points);

      let outcome: 'team1' | 'team2' | 'draw' | null = null;
      if (team1Wins > team2Wins) {
        outcome = 'team1';
      } else if (team2Wins > team1Wins) {
        outcome = 'team2';
      } else if (allSetsResolved) {
        outcome = 'draw';
      } else if (team1Total > 0 || team2Total > 0) {
        if (team1Total > team2Total) {
          outcome = 'team1';
        } else if (team2Total > team1Total) {
          outcome = 'team2';
        } else {
          outcome = 'draw';
        }
      }

      if (!outcome) {
        return;
      }

      row1.goalsFor += team1Total;
      row1.goalsAgainst += team2Total;
      row2.goalsFor += team2Total;
      row2.goalsAgainst += team1Total;
      row1.matchesPlayed += 1;
      row2.matchesPlayed += 1;

      if (outcome === 'team1') {
        row1.points += leagueScoring.pointsForWin;
        row2.points += leagueScoring.pointsForLoss;
      } else if (outcome === 'team2') {
        row2.points += leagueScoring.pointsForWin;
        row1.points += leagueScoring.pointsForLoss;
      } else {
        row1.draws += 1;
        row2.draws += 1;
        row1.points += leagueScoring.pointsForDraw;
        row2.points += leagueScoring.pointsForDraw;
      }
    });

    rows.forEach((row) => {
      row.goalDifference = row.goalsFor - row.goalsAgainst;
      row.basePoints = row.points;
      row.finalPoints = row.points;
      row.pointsDelta = 0;
    });

    return Array.from(rows.values()).map((row) => ({ ...row }));
  }, [
    activeEvent,
    activeMatches,
    leagueScoring,
    playoffMatchIds,
    selectedStandingsDivision,
    standingsDivisionData,
  ]);

  const getDraftStandingsPoints = useCallback(
    (row: StandingsRow): { basePoints: number; finalPoints: number; pointsDelta: number } => {
      const basePoints = typeof row.basePoints === 'number' ? row.basePoints : row.points;
      const hasDraftOverride = Object.prototype.hasOwnProperty.call(standingsDraftOverrides, row.teamId);
      const draftOverride = hasDraftOverride ? standingsDraftOverrides[row.teamId] : undefined;
      const finalPoints = typeof draftOverride === 'number' && Number.isFinite(draftOverride)
        ? draftOverride
        : (typeof row.finalPoints === 'number' ? row.finalPoints : row.points);
      return {
        basePoints,
        finalPoints,
        pointsDelta: finalPoints - basePoints,
      };
    },
    [standingsDraftOverrides],
  );

  const standings = useMemo<RankedStandingsRow[]>(() => {
    if (baseStandings.length === 0) {
      return [];
    }

    const sorted = baseStandings.map((row) => {
      const points = getDraftStandingsPoints(row);
      return {
        ...row,
        points: points.finalPoints,
        basePoints: points.basePoints,
        finalPoints: points.finalPoints,
        pointsDelta: points.pointsDelta,
      };
    });
    const modifier = standingsSort.direction === 'asc' ? 1 : -1;

    sorted.sort((a, b) => {
      let comparison: number;
      switch (standingsSort.field) {
        case 'team':
          comparison = a.teamName.localeCompare(b.teamName);
          break;
        case 'draws':
          comparison = a.draws - b.draws;
          break;
        case 'points':
        default:
          comparison = a.points - b.points;
          break;
      }

      if (comparison !== 0) {
        return comparison * modifier;
      }

      const tieBreakers = [
        (x: StandingsRow, y: StandingsRow) => y.points - x.points,
        (x: StandingsRow, y: StandingsRow) => y.goalDifference - x.goalDifference,
        (x: StandingsRow, y: StandingsRow) => y.goalsFor - x.goalsFor,
        (x: StandingsRow, y: StandingsRow) => x.teamName.localeCompare(y.teamName),
      ];

      for (const tie of tieBreakers) {
        const result = tie(a, b);
        if (result !== 0) {
          return result;
        }
      }

      return 0;
    });

    return sorted.map((row, index) => ({
      ...row,
      rank: index + 1,
    }));
  }, [baseStandings, getDraftStandingsPoints, standingsSort]);

  const hasRecordedMatches = standings.some((row) => row.matchesPlayed > 0);
  const resolvedMatchTeams = useMemo(() => {
    const teamsById = new Map<string, Team>();
    const addTeam = (candidate: unknown) => {
      if (!candidate || typeof candidate !== 'object') {
        return;
      }
      const teamCandidate = candidate as Team & { id?: string };
      const teamId = normalizeIdToken(teamCandidate.$id ?? teamCandidate.id);
      if (!teamId || teamsById.has(teamId)) {
        return;
      }
      teamsById.set(teamId, {
        ...teamCandidate,
        $id: teamId,
      } as Team);
    };

    participantTeams.forEach(addTeam);
    if (Array.isArray(activeEvent?.teams)) {
      activeEvent.teams.forEach(addTeam);
    }
    activeMatches.forEach((match) => {
      addTeam(match.team1);
      addTeam(match.team2);
      addTeam(match.teamOfficial);
    });

    return Array.from(teamsById.values());
  }, [participantTeams, activeEvent?.teams, activeMatches]);

  const bracketOfficials = useMemo<UserData[]>(() => {
    const officialsById = new Map<string, UserData>();
    const addOfficial = (candidate: unknown) => {
      if (!candidate || typeof candidate !== 'object') {
        return;
      }
      const officialCandidate = candidate as UserData & { id?: string };
      const officialId = normalizeIdToken(officialCandidate.$id ?? officialCandidate.id);
      if (!officialId || officialsById.has(officialId)) {
        return;
      }
      officialsById.set(officialId, {
        ...officialCandidate,
        $id: officialId,
      } as UserData);
    };

    if (Array.isArray(activeEvent?.officials)) {
      activeEvent.officials.forEach(addOfficial);
    }
    participantOfficials.forEach(addOfficial);
    activeMatches.forEach((match) => addOfficial(match.official));

    return Array.from(officialsById.values());
  }, [activeEvent?.officials, participantOfficials, activeMatches]);

  const bracketData = useMemo<TournamentBracket | null>(() => {
    if (!activeEvent || !bracketMatchesMap) {
      return null;
    }

    return {
      tournament: {
        ...activeEvent,
        officials: bracketOfficials,
      },
      matches: bracketMatchesMap,
      teams: resolvedMatchTeams,
      isHost: canManageEvent,
      canManage: !isPreview && canManageEvent,
    };
  }, [activeEvent, bracketMatchesMap, resolvedMatchTeams, canManageEvent, isPreview, bracketOfficials]);

  const scheduleDivisionSelectData = useMemo<DivisionOption[]>(
    () => [{ value: 'all', label: 'All divisions' }, ...scheduleDivisionOptions],
    [scheduleDivisionOptions],
  );
  const shouldShowScheduleDivisionFilter = scheduleDivisionOptions.length > 1;
  const shouldShowBracketDivisionFilter = bracketDivisionOptions.length > 1;

  const showScheduleTab = isLeague || isTournament;
  const showStandingsTab = isLeague;
  const showParticipantsTab = !isTemplateEvent
    && Boolean(activeEvent?.teamSignup || isLeague || isTournament || participantTeamIds.length > 0 || participantUserIds.length > 0);
  const selectedComplianceSummary = selectedComplianceTeamId
    ? teamComplianceById[selectedComplianceTeamId] ?? null
    : null;
  const selectedComplianceTeam = useMemo(() => {
    if (!selectedComplianceTeamId) {
      return null;
    }
    return participantTeamsById.get(selectedComplianceTeamId)
      ?? (Array.isArray(activeEvent?.teams)
        ? activeEvent.teams.find((team) => team?.$id === selectedComplianceTeamId) ?? null
        : null);
  }, [activeEvent?.teams, participantTeamsById, selectedComplianceTeamId]);

  const renderParticipantTeamCard = ({
    cardKey,
    team,
    actions,
    className = '',
    showComplianceDetails = canUseTeamCompliance,
    enableDetailsView = true,
  }: {
    cardKey: string;
    team: Team;
    actions?: React.ReactNode;
    className?: string;
    showComplianceDetails?: boolean;
    enableDetailsView?: boolean;
  }) => {
    if (isEditingEvent) {
      return (
        <DivisionTeamComplianceCard
          key={cardKey}
          team={team}
          summary={showComplianceDetails ? teamComplianceById[team.$id] : undefined}
          loading={showComplianceDetails ? teamComplianceLoading : false}
          showComplianceDetails={showComplianceDetails}
          className={className}
          onClick={showComplianceDetails ? () => {
            setSelectedComplianceTeamId(team.$id);
            setExpandedComplianceUserIds([]);
          } : undefined}
          actions={actions}
        />
      );
    }

    const teamCardActions = actions
      ? (
        <div
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          {actions}
        </div>
      )
      : undefined;

    return (
      <TeamCard
        key={cardKey}
        team={team}
        className={className}
        actions={teamCardActions}
        onClick={enableDetailsView
          ? () => {
            setSelectedParticipantTeam(team);
          }
          : undefined}
      />
    );
  };

  const toParticipantDisplayName = useCallback((participant: UserData): string => (
    participant.fullName
    || `${participant.firstName ?? ''} ${participant.lastName ?? ''}`.trim()
    || participant.userName
    || participant.$id
  ), []);

  const toUserParticipantPseudoTeam = useCallback((participant: UserData): Team => ({
    $id: participant.$id,
    name: toParticipantDisplayName(participant),
    division: 'Participant',
    sport: typeof activeEvent?.sport === 'object' ? activeEvent.sport.name : '',
    playerIds: [participant.$id],
    captainId: participant.$id,
    pending: [],
    teamSize: 1,
    currentSize: 1,
    isFull: true,
    avatarUrl: '',
  }), [activeEvent?.sport, toParticipantDisplayName]);

  const renderParticipantUserCard = ({
    cardKey,
    participant,
    actions,
    className = '',
  }: {
    cardKey: string;
    participant: UserData;
    actions?: React.ReactNode;
    className?: string;
  }) => {
    const pseudoTeam = toUserParticipantPseudoTeam(participant);
    const userSummary = userComplianceById[participant.$id];
    const summaryForCard: TeamComplianceSummary | undefined = userSummary
      ? {
          teamId: participant.$id,
          teamName: toParticipantDisplayName(participant),
          payment: userSummary.payment,
          documents: userSummary.documents,
          users: [userSummary],
        }
      : undefined;

    if (isEditingEvent) {
      return (
        <DivisionTeamComplianceCard
          key={cardKey}
          team={pseudoTeam}
          summary={canUseUserCompliance ? summaryForCard : undefined}
          loading={canUseUserCompliance ? userComplianceLoading : false}
          showComplianceDetails={canUseUserCompliance}
          cardKind="participant"
          className={className}
          actions={actions}
        />
      );
    }

    return (
      <UserCard
        key={cardKey}
        user={participant}
        className={className}
        actions={actions}
      />
    );
  };

  const formatCompliancePaymentLabel = useCallback((payment: TeamComplianceSummary['payment']) => {
    if (!payment.hasBill) {
      return 'No bill';
    }
    if (payment.isPaidInFull) {
      return `Paid in full (${formatBillAmount(payment.totalAmountCents)})`;
    }
    const prefix = payment.inheritedFromTeamBill ? 'Team bill' : 'User bill';
    return `${prefix}: ${formatBillAmount(payment.paidAmountCents)} of ${formatBillAmount(payment.totalAmountCents)} paid`;
  }, []);

  const defaultTab = isLeague ? 'schedule' : 'details';
  const shouldShowBracketTab = !!bracketData || isPreview;

  // Ensure the bracket tab is only active when playoff data exists or preview mode demands it.
  useEffect(() => {
    if (!shouldShowBracketTab && activeTab === 'bracket') {
      setActiveTab(defaultTab);
    }
  }, [shouldShowBracketTab, activeTab, defaultTab]);

  useEffect(() => {
    const request = searchParams?.get('tab');
    const allowed = new Set<string>(['details']);
    if (showParticipantsTab) {
      allowed.add('participants');
    }
    if (showScheduleTab) {
      allowed.add('schedule');
      allowed.add('standings');
    }
    if (shouldShowBracketTab) {
      allowed.add('bracket');
    }

    const desired = request && allowed.has(request) ? request : defaultTab;
    setActiveTab(desired);
  }, [searchParams, shouldShowBracketTab, showParticipantsTab, showScheduleTab, defaultTab]);

  const handleTabChange = (value: string | null) => {
    if (!value) return;
    const allowed = new Set<string>(['details']);
    if (showParticipantsTab) {
      allowed.add('participants');
    }
    if (showScheduleTab) {
      allowed.add('schedule');
      allowed.add('standings');
    }
    if (shouldShowBracketTab) {
      allowed.add('bracket');
    }

    if (!allowed.has(value)) {
      setActiveTab(defaultTab);
      return;
    }

    setActiveTab(value);

    if (!pathname) return;

    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (value === defaultTab) {
      params.delete('tab');
    } else {
      params.set('tab', value);
    }

    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
  };

  const handleDetailsClose = useCallback(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  const handleEventFormDirtyStateChange = useCallback((hasChanges: boolean) => {
    setFormHasUnsavedChanges(hasChanges);
  }, []);

  const getDraftFromForm = useCallback(
    async ({ allowCurrentEventFallback = false }: { allowCurrentEventFallback?: boolean } = {}): Promise<Partial<Event> | null> => {
      if (allowCurrentEventFallback && activeTab !== 'details' && activeEvent) {
        return cloneValue(activeEvent) as Event;
      }

      const formApi = eventFormRef.current;
      if (!formApi) {
        if (allowCurrentEventFallback && activeEvent) {
          return cloneValue(activeEvent) as Event;
        }
        setSubmitError('Form is not ready to submit.');
        return null;
      }

      const isValid = await formApi.validate();
      if (!isValid) {
        setSubmitError('Please fix the highlighted fields before submitting.');
        return null;
      }
      try {
        await formApi.validatePendingStaffAssignments();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Please fix the staff assignments before submitting.';
        setSubmitError(message);
        return null;
      }

      return formApi.getDraft();
    },
    [activeEvent, activeTab, setSubmitError],
  );

  const syncPendingEventFormInvites = useCallback(
    async (savedEvent: Event): Promise<Event> => {
      const formApi = eventFormRef.current;
      const savedEventId = savedEvent.$id;
      if (!formApi || !savedEventId) {
        return savedEvent;
      }

      const beforeDraft = formApi.getDraft();
      try {
        await formApi.submitPendingStaffInvites(savedEventId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to reconcile staff invitations.';
        setSubmitError(message);
        throw error;
      }

      const afterDraft = formApi.getDraft();
      const beforeOfficialIds = JSON.stringify(Array.isArray(beforeDraft.officialIds) ? beforeDraft.officialIds : []);
      const afterOfficialIds = JSON.stringify(Array.isArray(afterDraft.officialIds) ? afterDraft.officialIds : []);
      const beforeAssistantHostIds = JSON.stringify(Array.isArray(beforeDraft.assistantHostIds) ? beforeDraft.assistantHostIds : []);
      const afterAssistantHostIds = JSON.stringify(Array.isArray(afterDraft.assistantHostIds) ? afterDraft.assistantHostIds : []);
      let latestEvent = savedEvent;
      if (beforeOfficialIds !== afterOfficialIds || beforeAssistantHostIds !== afterAssistantHostIds) {
        const invitedEventDraft = { ...savedEvent, ...(afterDraft as Event), $id: savedEventId } as Event;
        latestEvent = await eventService.updateEvent(savedEventId, invitedEventDraft);
      }

      const refreshedEvent = await eventService.getEventWithRelations(savedEventId);
      if (!refreshedEvent) {
        return latestEvent;
      }
      return refreshedEvent;
    },
    [setSubmitError],
  );

  const handlePreviewEventUpdate = useCallback((preview: Event) => {
    const normalizedPreview = normalizeApiEvent(preview) ?? preview;
    const previewClone = cloneValue(normalizedPreview) as Event;
    const nextMatches = Array.isArray(previewClone.matches)
      ? (cloneValue(previewClone.matches) as Match[])
      : [];
    hasUnsavedChangesRef.current = false;
    setEvent(previewClone);
    setMatches(nextMatches);
    setChangesEvent(previewClone);
    setChangesMatches(nextMatches);
    setHasUnsavedChanges(false);
    setFormHasUnsavedChanges(false);
  }, []);

  const buildSchedulePayload = useCallback(
    (draft: Partial<Event>): Record<string, unknown> => {
      const resolvedId = typeof draft.$id === 'string' && draft.$id.length > 0
        ? draft.$id
        : eventId ?? createClientId();
      const normalizedDraft = { ...draft, $id: resolvedId } as Event;
      return toEventPayload(normalizedDraft) as Record<string, unknown>;
    },
    [eventId],
  );

  const buildBracketNodes = useCallback((draftMatches: Match[]): BracketNode[] => (
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
  ), []);

  const validateDraftMatchGraph = useCallback((draftMatches: Match[]): { ok: true } | { ok: false; message: string } => {
    const graphValidation = validateAndNormalizeBracketGraph(buildBracketNodes(draftMatches));
    if (!graphValidation.ok) {
      return {
        ok: false,
        message: graphValidation.errors[0]?.message ?? 'Invalid bracket graph.',
      };
    }

    const isTournamentEvent = String(activeEvent?.eventType ?? '').toUpperCase() === 'TOURNAMENT';
    if (!isTournamentEvent) {
      return { ok: true };
    }

    for (const match of draftMatches) {
      const matchId = normalizeIdToken(match.$id);
      if (!matchId || !isClientMatchId(matchId)) {
        continue;
      }
      const createMeta = stagedMatchCreates[matchId];
      if (!createMeta) {
        continue;
      }
      if (createMeta.creationContext === 'schedule') {
        const fieldId = normalizeIdToken(match.fieldId);
        const start = parseLocalDateTime(match.start ?? null);
        const end = parseLocalDateTime(match.end ?? null);
        if (!fieldId || !start || !end) {
          return {
            ok: false,
            message: `Schedule match ${match.matchId ?? matchId} requires field, start, and end.`,
          };
        }
        if (end.getTime() <= start.getTime()) {
          return {
            ok: false,
            message: `Schedule match ${match.matchId ?? matchId} requires end after start.`,
          };
        }
      }

      const normalizedNode = graphValidation.normalizedById[matchId];
      const hasAnyLink = Boolean(
        asBulkMatchRef(match.winnerNextMatchId) ||
        asBulkMatchRef(match.loserNextMatchId) ||
        normalizedNode?.previousLeftId ||
        normalizedNode?.previousRightId,
      );
      if (!hasAnyLink) {
        return {
          ok: false,
          message: `Tournament match ${match.matchId ?? matchId} must include at least one link.`,
        };
      }
    }

    return { ok: true };
  }, [activeEvent?.eventType, buildBracketNodes, stagedMatchCreates]);

  const normalizeDraftBracketGraph = useCallback((draftMatches: Match[]): Match[] => {
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
  }, [buildBracketNodes]);

  const toBulkMatchUpdatePayload = useCallback((match: Match): Record<string, unknown> => {
    const normalizeRelationId = (value: unknown): string | null => {
      if (typeof value === 'string') {
        const normalized = value.trim();
        return normalized.length > 0 ? normalized : null;
      }
      if (value && typeof value === 'object' && '$id' in (value as Record<string, unknown>)) {
        const relationId = (value as Record<string, unknown>).$id;
        if (typeof relationId === 'string' && relationId.trim().length > 0) {
          return relationId.trim();
        }
      }
      return null;
    };

    const resolvePersistableTeamId = (explicitId: string | null | undefined, relation: unknown): string | null => {
      const candidate = normalizeRelationId(explicitId) ?? normalizeRelationId(relation);
      if (!candidate || isLocalPlaceholderId(candidate)) {
        return null;
      }
      return candidate;
    };

    return {
      id: match.$id,
      matchId: match.matchId ?? null,
      locked: Boolean(match.locked),
      team1Points: Array.isArray(match.team1Points) ? match.team1Points : [],
      team2Points: Array.isArray(match.team2Points) ? match.team2Points : [],
      setResults: Array.isArray(match.setResults) ? match.setResults : [],
      team1Id: resolvePersistableTeamId(match.team1Id, match.team1),
      team2Id: resolvePersistableTeamId(match.team2Id, match.team2),
      officialId: normalizeRelationId(match.officialId) ?? normalizeRelationId(match.official),
      officialIds: Array.isArray(match.officialIds) ? match.officialIds : [],
      teamOfficialId: resolvePersistableTeamId(match.teamOfficialId, match.teamOfficial),
      fieldId: normalizeRelationId(match.fieldId) ?? normalizeRelationId(match.field),
      previousLeftId: asBulkMatchRef(match.previousLeftId),
      previousRightId: asBulkMatchRef(match.previousRightId),
      winnerNextMatchId: asBulkMatchRef(match.winnerNextMatchId),
      loserNextMatchId: asBulkMatchRef(match.loserNextMatchId),
      side: match.side ?? null,
      officialCheckedIn: Boolean(match.officialCheckedIn),
      start: match.start ?? null,
      end: match.end ?? null,
      division: normalizeIdToken(getDivisionId(match.division) ?? null),
      losersBracket: Boolean(match.losersBracket),
    };
  }, []);

  const schedulePreview = useCallback(
    async (draft: Partial<Event>) => {
      if (!draft) {
        return;
      }

      setPublishing(true);
      setError(null);
      setInfoMessage(null);
      setWarningMessage(null);

      try {
        const payload = buildSchedulePayload(draft);
        const scheduleEventId = !isCreateMode ? eventId : undefined;
        const result = await eventService.scheduleEvent(payload, { eventId: scheduleEventId });
        if (!result?.event) {
          throw new Error('Failed to generate schedule preview.');
        }

        handlePreviewEventUpdate(result.event);

        if (pathname) {
          const params = new URLSearchParams(searchParams?.toString() ?? '');
          params.delete('create');
          params.delete('mode');
          params.set('preview', '1');
          const query = params.toString();
          router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
        }
      } catch (err) {
        console.error('Failed to generate schedule preview:', err);
        setError('Failed to generate schedule preview.');
      } finally {
        setPublishing(false);
      }
    },
    [buildSchedulePayload, eventId, handlePreviewEventUpdate, isCreateMode, pathname, router, searchParams],
  );

  const scheduleRegularEvent = useCallback(
    async (draft: Partial<Event>) => {
      if (!draft) {
        return null;
      }

      setPublishing(true);
      setError(null);
      setInfoMessage(null);
      setWarningMessage(null);

      try {
        const payload = buildSchedulePayload(draft);
        const result = await eventService.scheduleEvent(payload);
        if (!result?.event) {
          throw new Error('Failed to create event.');
        }

        handlePreviewEventUpdate(result.event);

        const nextId = result.event.$id ?? eventId;
        if (nextId && pathname) {
          const params = new URLSearchParams(searchParams?.toString() ?? '');
          params.delete('create');
          params.delete('mode');
          params.delete('preview');
          const query = params.toString();
          router.replace(
            `/events/${nextId}/schedule${query ? `?${query}` : ''}`,
            { scroll: false },
          );
        }
        return result.event;
      } catch (err) {
        console.error('Failed to create event:', err);
        setError('Failed to create event.');
        return null;
      } finally {
        setPublishing(false);
      }
    },
    [buildSchedulePayload, eventId, handlePreviewEventUpdate, pathname, router, searchParams],
  );

  const resetRentalSignFlowState = useCallback(() => {
    setRentalSignLinks([]);
    setRentalSignIndex(0);
    setRentalTextAccepted(false);
    setRentalSignError(null);
    setRecordingRentalSignature(false);
    setPendingRentalSignedDocumentId(null);
    setPendingRentalSignatureOperationId(null);
  }, []);

  const startRentalPaymentIntent = useCallback(async (context: PendingRentalCheckoutContext) => {
    if (!context.requiresPayment) {
      const scheduledEvent = await scheduleRegularEvent(context.draftToSave);
      if (scheduledEvent?.$id) {
        const syncedEvent = await syncPendingEventFormInvites(scheduledEvent);
        eventFormRef.current?.commitDirtyBaseline();
        if (syncedEvent !== scheduledEvent) {
          handlePreviewEventUpdate(syncedEvent);
        }
      }
      return;
    }
    if (!user) {
      setSubmitError('You must be signed in to continue checkout.');
      return;
    }

    pendingRegularEventRef.current = context.draftToSave;
    setPublishing(true);
    try {
      const paymentIntent = await paymentService.createPaymentIntent(
        user,
        context.eventDraft,
        undefined,
        context.rentalSlot,
        rentalOrganization ?? undefined,
      );
      setRentalPaymentData(paymentIntent);
      setShowRentalPayment(true);
    } catch (error) {
      pendingRegularEventRef.current = null;
      setSubmitError(error instanceof Error ? error.message : 'Failed to start rental payment.');
    } finally {
      setPublishing(false);
    }
  }, [handlePreviewEventUpdate, rentalOrganization, scheduleRegularEvent, syncPendingEventFormInvites, user]);

  const startRentalCheckoutFlow = useCallback(async (context: PendingRentalCheckoutContext) => {
    if (!rentalDocumentTemplateIds.length) {
      await startRentalPaymentIntent(context);
      return;
    }
    if (!user) {
      setSubmitError('You must be signed in to sign rental documents.');
      return;
    }

    try {
      const signLinks = await boldsignService.createRentalSignLinks({
        user,
        userEmail: authUser?.email ?? undefined,
        templateIds: rentalDocumentTemplateIds,
        eventId: context.eventDraft.$id ?? eventId,
        organizationId: rentalOrganization?.$id ?? context.eventDraft.organizationId ?? undefined,
        timeoutMs: 45_000,
      });

      if (!signLinks.length) {
        await startRentalPaymentIntent(context);
        return;
      }

      pendingRentalCheckoutRef.current = context;
      setRentalSignLinks(signLinks);
      setRentalSignIndex(0);
      setRentalTextAccepted(false);
      setRentalSignError(null);
      setPendingRentalSignedDocumentId(null);
      setPendingRentalSignatureOperationId(null);
      setShowRentalSignModal(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to start rental document signing.');
    }
  }, [
    authUser?.email,
    eventId,
    rentalDocumentTemplateIds,
    rentalOrganization?.$id,
    startRentalPaymentIntent,
    user,
  ]);

  const advanceRentalSignFlow = useCallback(async () => {
    const nextIndex = rentalSignIndex + 1;
    if (nextIndex < rentalSignLinks.length) {
      setRentalSignIndex(nextIndex);
      setRentalTextAccepted(false);
      setPendingRentalSignedDocumentId(null);
      setPendingRentalSignatureOperationId(null);
      setShowRentalSignModal(true);
      return;
    }

    const checkoutContext = pendingRentalCheckoutRef.current;
    pendingRentalCheckoutRef.current = null;
    setShowRentalSignModal(false);
    resetRentalSignFlowState();
    if (checkoutContext) {
      await startRentalPaymentIntent(checkoutContext);
    }
  }, [rentalSignIndex, rentalSignLinks.length, resetRentalSignFlowState, startRentalPaymentIntent]);

  const recordRentalSignature = useCallback(async (params: {
    templateId: string;
    documentId: string;
    type: SignStep['type'];
  }): Promise<{ operationId?: string; syncStatus?: string }> => {
    if (!user) {
      throw new Error('You must be signed in to sign rental documents.');
    }

    const pendingContext = pendingRentalCheckoutRef.current;
    const result = await apiRequest<{
      ok?: boolean;
      error?: string;
      operationId?: string;
      syncStatus?: string;
    }>('/api/documents/record-signature', {
      method: 'POST',
      body: {
        templateId: params.templateId,
        documentId: params.documentId,
        eventId: pendingContext?.eventDraft?.$id ?? eventId,
        type: params.type,
        userId: user.$id,
        signerContext: 'participant',
        user,
      },
    });

    if (result?.error) {
      throw new Error(result.error);
    }

    return {
      operationId: typeof result?.operationId === 'string' ? result.operationId : undefined,
      syncStatus: typeof result?.syncStatus === 'string' ? result.syncStatus : undefined,
    };
  }, [eventId, user]);

  const handleRentalSignedDocument = useCallback(async (messageDocumentId?: string) => {
    const currentLink = rentalSignLinks[rentalSignIndex];
    if (!currentLink || currentLink.type === 'TEXT') {
      return;
    }
    if (messageDocumentId && messageDocumentId !== currentLink.documentId) {
      return;
    }
    if (pendingRentalSignedDocumentId || pendingRentalSignatureOperationId || recordingRentalSignature) {
      return;
    }
    if (!currentLink.documentId) {
      setRentalSignError('Missing document identifier for signature.');
      return;
    }

    setRecordingRentalSignature(true);
    setRentalSignError(null);
    try {
      const signatureResult = await recordRentalSignature({
        templateId: currentLink.templateId,
        documentId: currentLink.documentId,
        type: currentLink.type,
      });
      setShowRentalSignModal(false);
      setPendingRentalSignedDocumentId(currentLink.documentId);
      setPendingRentalSignatureOperationId(signatureResult.operationId || currentLink.operationId || null);
    } catch (error) {
      setRentalSignError(error instanceof Error ? error.message : 'Failed to record rental signature.');
      setPendingRentalSignedDocumentId(null);
      setPendingRentalSignatureOperationId(null);
    } finally {
      setRecordingRentalSignature(false);
    }
  }, [
    pendingRentalSignatureOperationId,
    pendingRentalSignedDocumentId,
    recordRentalSignature,
    recordingRentalSignature,
    rentalSignIndex,
    rentalSignLinks,
  ]);

  const handleRentalTextAcceptance = useCallback(async () => {
    const currentLink = rentalSignLinks[rentalSignIndex];
    if (!currentLink || currentLink.type !== 'TEXT') {
      return;
    }
    if (!rentalTextAccepted || pendingRentalSignedDocumentId || pendingRentalSignatureOperationId || recordingRentalSignature) {
      return;
    }

    const documentId = currentLink.documentId || createId();
    setRecordingRentalSignature(true);
    setRentalSignError(null);
    try {
      const signatureResult = await recordRentalSignature({
        templateId: currentLink.templateId,
        documentId,
        type: currentLink.type,
      });
      setShowRentalSignModal(false);
      setPendingRentalSignedDocumentId(documentId);
      setPendingRentalSignatureOperationId(signatureResult.operationId || currentLink.operationId || null);
    } catch (error) {
      setRentalSignError(error instanceof Error ? error.message : 'Failed to record rental signature.');
      setPendingRentalSignedDocumentId(null);
      setPendingRentalSignatureOperationId(null);
    } finally {
      setRecordingRentalSignature(false);
    }
  }, [
    pendingRentalSignatureOperationId,
    pendingRentalSignedDocumentId,
    recordRentalSignature,
    recordingRentalSignature,
    rentalSignIndex,
    rentalSignLinks,
    rentalTextAccepted,
  ]);

  useEffect(() => {
    setRentalTextAccepted(false);
  }, [rentalSignIndex, rentalSignLinks]);

  useEffect(() => {
    if (!showRentalSignModal) {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (typeof event.origin === 'string' && !event.origin.includes('boldsign')) {
        return;
      }
      const payload = event.data;
      let eventName = '';
      if (typeof payload === 'string') {
        eventName = payload;
      } else if (payload && typeof payload === 'object') {
        eventName = payload.event || payload.eventName || payload.type || payload.name || '';
      }
      const eventLabel = eventName.toString();
      if (!eventLabel || (!eventLabel.includes('onDocumentSigned') && !eventLabel.includes('documentSigned'))) {
        return;
      }

      const documentId =
        (payload && typeof payload === 'object' && (payload.documentId || payload.documentID)) || undefined;
      void handleRentalSignedDocument(
        typeof documentId === 'string' ? documentId : undefined,
      );
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [handleRentalSignedDocument, showRentalSignModal]);

  useEffect(() => {
    if (!pendingRentalSignatureOperationId || !user) {
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();
    const intervalMs = 1500;
    const timeoutMs = 90_000;

    const poll = async () => {
      try {
        const operation = await boldsignService.getOperationStatus(pendingRentalSignatureOperationId);
        if (cancelled) {
          return;
        }

        const status = String(operation.status ?? '').toUpperCase();
        if (status === 'CONFIRMED') {
          setPendingRentalSignedDocumentId(null);
          setPendingRentalSignatureOperationId(null);
          await advanceRentalSignFlow();
          return;
        }

        if (status === 'FAILED' || status === 'FAILED_RETRYABLE' || status === 'TIMED_OUT') {
          throw new Error(operation.error || 'Failed to synchronize rental signature status.');
        }

        if (Date.now() - startedAt > timeoutMs) {
          throw new Error('Rental document sync is delayed. Please try again.');
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        setRentalSignError(error instanceof Error ? error.message : 'Failed to confirm rental signature.');
        setPendingRentalSignedDocumentId(null);
        setPendingRentalSignatureOperationId(null);
        setShowRentalSignModal(true);
      }
    };

    const interval = window.setInterval(() => {
      void poll();
    }, intervalMs);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [advanceRentalSignFlow, pendingRentalSignatureOperationId, user]);

  useEffect(() => {
    if (!pendingRentalSignedDocumentId || !user || pendingRentalSignatureOperationId) {
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const signed = await signedDocumentService.isDocumentSigned(
          pendingRentalSignedDocumentId,
          user.$id,
        );
        if (!signed || cancelled) {
          return;
        }

        setPendingRentalSignedDocumentId(null);
        await advanceRentalSignFlow();
      } catch (error) {
        if (cancelled) {
          return;
        }
        setRentalSignError(error instanceof Error ? error.message : 'Failed to confirm rental signature.');
        setPendingRentalSignedDocumentId(null);
        setShowRentalSignModal(true);
      }
    };

    const interval = window.setInterval(() => {
      void poll();
    }, 1000);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [advanceRentalSignFlow, pendingRentalSignatureOperationId, pendingRentalSignedDocumentId, user]);

  const closeRentalSignModal = useCallback(() => {
    setShowRentalSignModal(false);
    resetRentalSignFlowState();
    pendingRentalCheckoutRef.current = null;
  }, [resetRentalSignFlowState]);

  const closeRentalPaymentModal = useCallback(() => {
    setShowRentalPayment(false);
    setRentalPaymentData(null);
    pendingRegularEventRef.current = null;
  }, []);

  const handleRentalPaymentSuccess = useCallback(async () => {
    const pendingDraft = pendingRegularEventRef.current;
    if (pendingDraft) {
      const scheduledEvent = await scheduleRegularEvent(pendingDraft);
      if (scheduledEvent?.$id) {
        const syncedEvent = await syncPendingEventFormInvites(scheduledEvent);
        eventFormRef.current?.commitDirtyBaseline();
        if (syncedEvent !== scheduledEvent) {
          handlePreviewEventUpdate(syncedEvent);
        }
      }
    }
    closeRentalPaymentModal();
  }, [closeRentalPaymentModal, handlePreviewEventUpdate, scheduleRegularEvent, syncPendingEventFormInvites]);

  const saveExistingEvent = useCallback(
    async ({
      postSaveAction = 'none',
    }: {
      postSaveAction?: 'none' | 'reschedule' | 'buildBrackets';
    } = {}) => {
      if (!activeEvent) return;
      if (!event) {
        setError(`Unable to save ${entityLabel.toLowerCase()} changes without the original event context.`);
        return;
      }

      const isRescheduleAction = postSaveAction === 'reschedule';
      const isBuildBracketAction = postSaveAction === 'buildBrackets';
      const hasSchedulingAction = isRescheduleAction || isBuildBracketAction;

      const draft = await getDraftFromForm({
        allowCurrentEventFallback: hasSchedulingAction,
      });
      if (!draft) {
        return;
      }

      const mergedDraft = { ...activeEvent, ...(draft as Event) } as Event;
      const draftConflictsById = detectMatchConflictsById(activeMatches);
      const draftConflictPairs = listMatchConflictPairs(draftConflictsById);
      if (draftConflictPairs.length > 0 && !isRescheduleAction) {
        setInfoMessage(null);
        setWarningMessage(null);
        setActionError(null);
        setDismissedMatchConflictSignature(null);
        setMatchConflictOverrideMessage(
          buildMatchConflictAlertMessage({
            matches: activeMatches,
            pairs: draftConflictPairs,
          }),
        );
        return;
      }

      setError(null);
      setInfoMessage(null);
      setWarningMessage(null);
      setActionError(null);
      if (hasSchedulingAction) {
        setReschedulingMatches(true);
      } else {
        setPublishing(true);
      }

      try {
        const nextEvent = cloneValue(mergedDraft) as Event;
        const nextMatches = cloneValue(activeMatches) as Match[];
        nextEvent.matches = nextMatches;

        if (Array.isArray(nextEvent.fields)) {
          nextEvent.fields = nextEvent.fields.map((field) => {
            const sanitized = { ...field };
            delete sanitized.rentalSlotIds;
            return sanitized;
          });
        }

        if ('attendees' in nextEvent) {
          delete (nextEvent as Partial<Event>).attendees;
        }

        const isTemplateDraft = typeof nextEvent.state === 'string'
          && nextEvent.state.toUpperCase() === 'TEMPLATE';
        if (isTemplateDraft) {
          nextEvent.state = 'TEMPLATE';
        } else {
          const lifecycleStatus = selectedLifecycleStatus ?? getEventLifecycleStatus(nextEvent);
          nextEvent.state = lifecycleStatus === 'DRAFT' ? 'UNPUBLISHED' : 'PUBLISHED';
        }

        let updatedEvent = nextEvent;
        if (nextEvent.$id) {
          updatedEvent = await eventService.updateEvent(nextEvent.$id, nextEvent);
        }

        const shouldPersistDraftMatches = !isBuildBracketAction;
        if (updatedEvent.$id && shouldPersistDraftMatches && nextMatches.length > 0) {
          const validation = validateDraftMatchGraph(nextMatches);
          if (!validation.ok) {
            throw new Error(validation.message);
          }

          const updatePayload = nextMatches
            .filter((match) => !isClientMatchId(match.$id))
            .map((match) => toBulkMatchUpdatePayload(match));
          const createPayload = nextMatches
            .filter((match) => isClientMatchId(match.$id))
            .map((match) => {
              const matchId = match.$id;
              const createMeta = stagedMatchCreates[matchId];
              const base = toBulkMatchUpdatePayload(match);
              const { id: _ignored, ...rest } = base;
              return {
                clientId: createMeta?.clientId ?? getClientIdFromMatchId(matchId),
                creationContext: createMeta?.creationContext ?? 'bracket',
                autoPlaceholderTeam: createMeta?.autoPlaceholderTeam ?? (String(updatedEvent.eventType ?? '').toUpperCase() === 'TOURNAMENT'),
                ...rest,
              };
            });
          const deletePayload = Array.from(
            new Set(
              stagedMatchDeletes
                .map((value) => normalizeIdToken(value))
                .filter((value): value is string => Boolean(value))
                .filter((value) => !isClientMatchId(value)),
            ),
          );

          if (updatePayload.length > 0 || createPayload.length > 0 || deletePayload.length > 0) {
            const matchResponse = await apiRequest<{ matches?: Match[]; created?: Record<string, string>; deleted?: string[] }>(
              `/api/events/${updatedEvent.$id}/matches`,
              {
                method: 'PATCH',
                body: {
                  ...(updatePayload.length > 0 ? { matches: updatePayload } : {}),
                  ...(createPayload.length > 0 ? { creates: createPayload } : {}),
                  ...(deletePayload.length > 0 ? { deletes: deletePayload } : {}),
                },
              },
            );
            const resolvePersistedMatchRef = (value: string | null | undefined): string | undefined => {
              const normalized = normalizeIdToken(value);
              if (!normalized) {
                return undefined;
              }
              if (!isClientMatchId(normalized)) {
                return normalized;
              }
              const clientId = getClientIdFromMatchId(normalized);
              const persisted = matchResponse?.created?.[clientId];
              return normalizeIdToken(persisted) ?? normalized;
            };
            const updatedMatches = Array.isArray(matchResponse?.matches)
              ? matchResponse.matches.map((match) => normalizeApiMatch(match))
              : [];
            const normalizedDraftMatches = nextMatches.map((match) => (
              normalizeApiMatch({
                ...match,
                $id: resolvePersistedMatchRef(match.$id) ?? match.$id,
                previousLeftId: resolvePersistedMatchRef(match.previousLeftId),
                previousRightId: resolvePersistedMatchRef(match.previousRightId),
                winnerNextMatchId: resolvePersistedMatchRef(match.winnerNextMatchId),
                loserNextMatchId: resolvePersistedMatchRef(match.loserNextMatchId),
              })
            ));
            const mergedMatchesById = new Map<string, Match>();
            normalizedDraftMatches.forEach((match) => {
              if (normalizeIdToken(match.$id)) {
                mergedMatchesById.set(match.$id, match);
              }
            });
            updatedMatches.forEach((match) => {
              if (normalizeIdToken(match.$id)) {
                mergedMatchesById.set(match.$id, match);
              }
            });
            const deletedIds = Array.isArray(matchResponse?.deleted)
              ? matchResponse.deleted
                .map((value) => normalizeIdToken(value))
                .filter((value): value is string => Boolean(value))
              : deletePayload;
            deletedIds.forEach((matchId) => {
              mergedMatchesById.delete(matchId);
            });
            updatedEvent.matches = Array.from(mergedMatchesById.values());
            setStagedMatchCreates({});
            setStagedMatchDeletes([]);
            setPendingCreateMatchId(null);
          }
        }

        let scheduleWarningText: string | null = null;
        if (hasSchedulingAction && updatedEvent.$id) {
          const scheduleEventId = updatedEvent.$id;
          if (isBuildBracketAction) {
            await leagueService.deleteMatchesByEvent(scheduleEventId);
          }

          const schedulePayload = toEventPayload(updatedEvent) as unknown as Record<string, unknown>;
          const scheduleOptions: { eventId: string; participantCount?: number } = { eventId: scheduleEventId };
          if (isBuildBracketAction) {
            const participantCount = typeof updatedEvent.maxParticipants === 'number'
              ? Math.max(2, Math.trunc(updatedEvent.maxParticipants))
              : undefined;
            if (participantCount) {
              scheduleOptions.participantCount = participantCount;
            }
          }
          const scheduled = await eventService.scheduleEvent(schedulePayload, scheduleOptions);
          if (!scheduled?.event) {
            throw new Error(
              isBuildBracketAction ? 'Failed to rebuild bracket(s).' : 'Failed to reschedule matches.',
            );
          }
          if (Array.isArray(scheduled.warnings) && scheduled.warnings.length) {
            scheduleWarningText = scheduled.warnings
              .map((warning) => warning.message)
              .filter((message) => typeof message === 'string' && message.trim().length > 0)
              .join(' ');
          }
          updatedEvent = scheduled.event;

          if (isBuildBracketAction && Array.isArray(updatedEvent.matches) && updatedEvent.matches.length > 0) {
            const bracketMatchesToClear = updatedEvent.matches
              .filter((match) => shouldResetBracketMatchForRebuild(updatedEvent, match))
              .map((match) => toClearedBracketMatchUpdate(match));
            if (bracketMatchesToClear.length > 0) {
              const clearedMatches = await tournamentService.updateMatchesBulk(scheduleEventId, bracketMatchesToClear);
              if (clearedMatches.length > 0) {
                const clearedById = new Map(clearedMatches.map((match) => [match.$id, match]));
                updatedEvent.matches = updatedEvent.matches.map((match) => clearedById.get(match.$id) ?? match);
              }
            }
          }
        }

        if (!Array.isArray(updatedEvent.matches) || updatedEvent.matches.length === 0) {
          updatedEvent.matches = nextMatches;
        }

        updatedEvent = await syncPendingEventFormInvites(updatedEvent);

        hasUnsavedChangesRef.current = false;
        eventFormRef.current?.commitDirtyBaseline();
        setHasUnsavedChanges(false);
        setFormHasUnsavedChanges(false);
        setSelectedLifecycleStatus(null);

        if (pathname) {
          const params = new URLSearchParams(searchParams?.toString() ?? '');
          params.delete('preview');
          params.set('mode', 'edit');
          const query = params.toString();
          router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
        }

        await loadSchedule({ showPageLoader: false, clearMessages: false });
        if (isRescheduleAction) {
          setInfoMessage(`${entityLabel} settings saved and matches rescheduled.`);
          if (scheduleWarningText) {
            setWarningMessage(scheduleWarningText);
          }
        } else if (isBuildBracketAction) {
          setInfoMessage('Bracket(s) rebuilt and playoff/tournament results reset.');
          if (scheduleWarningText) {
            setWarningMessage(scheduleWarningText);
          }
        } else {
          setInfoMessage(`${entityLabel} changes saved.`);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : null;
        console.error(`Failed to save ${entityLabel.toLowerCase()} changes:`, err);
        const baseMessage = isBuildBracketAction
          ? 'Failed to rebuild bracket(s).'
          : (
            isRescheduleAction
              ? `Failed to save ${entityLabel.toLowerCase()} and reschedule matches.`
              : `Failed to save ${entityLabel.toLowerCase()} changes.`
          );
        setError(errorMessage ? `${baseMessage} ${errorMessage}` : baseMessage);
      } finally {
        setPublishing(false);
        setReschedulingMatches(false);
      }
    },
    [
      activeEvent,
      activeMatches,
      entityLabel,
      event,
      getDraftFromForm,
      loadSchedule,
      pathname,
      router,
      selectedLifecycleStatus,
      searchParams,
      stagedMatchCreates,
      toBulkMatchUpdatePayload,
      stagedMatchDeletes,
      syncPendingEventFormInvites,
      validateDraftMatchGraph,
    ],
  );

  const handleSaveEvent = useCallback(async () => {
    if (publishing || reschedulingMatches) return;
    setSubmitError(null);
    await saveExistingEvent();
  }, [publishing, reschedulingMatches, saveExistingEvent]);

  const handleRescheduleMatches = useCallback(async () => {
    if (publishing || reschedulingMatches) return;
    setSubmitError(null);
    setPendingScheduleAction('reschedule');
    try {
      await saveExistingEvent({ postSaveAction: 'reschedule' });
    } finally {
      setPendingScheduleAction((current) => (current === 'reschedule' ? null : current));
    }
  }, [publishing, reschedulingMatches, saveExistingEvent]);

  const handleBuildBrackets = useCallback(async () => {
    if (publishing || reschedulingMatches) return;
    if (!activeEvent) return;
    const entityNoun = activeEvent.eventType === 'TOURNAMENT' ? 'tournament' : 'playoff';
    const confirmed = window.confirm(
      `Build bracket(s)? This will reset the bracket and any match results in the ${entityNoun}.`,
    );
    if (!confirmed) {
      return;
    }
    setSubmitError(null);
    setPendingScheduleAction('rebuild');
    try {
      await saveExistingEvent({ postSaveAction: 'buildBrackets' });
    } finally {
      setPendingScheduleAction((current) => (current === 'rebuild' ? null : current));
    }
  }, [activeEvent, publishing, reschedulingMatches, saveExistingEvent]);

  const handlePublish = async () => {
    if (publishing || reschedulingMatches) return;
    setSubmitError(null);

    // Create mode: invoke createEvent with current draft and redirect to the new event.
    if (isCreateMode) {
      const draft = await getDraftFromForm();
      if (!draft) {
        return;
      }

      const normalizedDraft = draft.$id ? draft : { ...draft, $id: draft.$id ?? eventId };
      setChangesEvent((prev) => {
        const base = prev ?? ({} as Event);
        return { ...base, ...(normalizedDraft as Event) };
      });

      if (normalizedDraft.eventType !== 'EVENT') {
        await schedulePreview(normalizedDraft);
        return;
      }

      const draftToSave: Partial<Event> = {
        ...normalizedDraft,
        state: 'UNPUBLISHED',
      };

      if (rentalPurchaseTimeSlot) {
        const rentalPriceCents = typeof rentalPurchaseTimeSlot.price === 'number'
          ? rentalPurchaseTimeSlot.price
          : undefined;
        const requiresPayment = typeof rentalPriceCents === 'number' && rentalPriceCents > 0;
        const requiresSignature = rentalDocumentTemplateIds.length > 0;

        if (requiresSignature || requiresPayment) {
          await startRentalCheckoutFlow({
            eventDraft: normalizedDraft as Event,
            draftToSave,
            rentalSlot: rentalPurchaseTimeSlot,
            requiresPayment,
          });
          return;
        }
      }

      const scheduledEvent = await scheduleRegularEvent(draftToSave);
      if (scheduledEvent?.$id) {
        const syncedEvent = await syncPendingEventFormInvites(scheduledEvent);
        eventFormRef.current?.commitDirtyBaseline();
        if (syncedEvent !== scheduledEvent) {
          handlePreviewEventUpdate(syncedEvent);
        }
      }
      return;
    }

    if (!activeEvent) return;

    if (!isPreview && !isEditingEvent && !isUnpublished) {
      handleEnterEditMode();
      return;
    }

    if (isEditingEvent) {
      await saveExistingEvent();
    }
  };

  const handleDeleteTemplate = useCallback(async () => {
    if (cancelling) return;
    const templateEvent = activeEvent ?? event;
    if (!templateEvent?.$id) return;

    if (!window.confirm('Delete this template? This will remove its saved schedule and cannot be undone.')) {
      return;
    }

    setCancelling(true);
    setError(null);
    setInfoMessage(null);
    setWarningMessage(null);
    setActionError(null);

    try {
      await leagueService.deleteMatchesByEvent(templateEvent.$id);
      await leagueService.deleteWeeklySchedulesForEvent(templateEvent.$id);
      await eventService.deleteEvent(templateEvent);
      router.push('/events');
    } catch (err) {
      console.error('Failed to delete template:', err);
      setError('Failed to delete template.');
    } finally {
      setCancelling(false);
    }
  }, [activeEvent, cancelling, event, router]);

  const handleDiscardChanges = useCallback(() => {
    if (!hasPendingUnsavedChanges) {
      return;
    }

    if (typeof window !== 'undefined' && !window.confirm('Discard all unsaved changes?')) {
      return;
    }

    const baselineEvent = event ?? formSeedEvent ?? activeEvent ?? changesEvent;
    const baselineEventClone = baselineEvent ? (cloneValue(baselineEvent) as Event) : null;
    const baselineMatches = cloneValue(matches) as Match[];

    setChangesEvent(baselineEventClone);
    setChangesMatches(baselineMatches);
    setStagedMatchCreates({});
    setStagedMatchDeletes([]);
    setPendingCreateMatchId(null);
    setMatchEditorContext('bracket');
    setIsMatchEditorOpen(false);
    setMatchBeingEdited(null);
    setSelectedLifecycleStatus(null);
    setHasUnsavedChanges(false);
    setFormHasUnsavedChanges(false);
    setSubmitError(null);
    setActionError(null);
    setMatchConflictOverrideMessage(null);
    setDismissedMatchConflictSignature(null);
    setWarningMessage(null);
    setIsPendingChangesPopoverOpen(false);
    hasUnsavedChangesRef.current = false;
    setEventFormResetVersion((current) => current + 1);
    setInfoMessage('Unsaved changes discarded.');
  }, [
    activeEvent,
    changesEvent,
    event,
    formSeedEvent,
    hasPendingUnsavedChanges,
    matches,
  ]);

  const handleCancel = async () => {
    if (isCreateMode) {
      if (cancelling) return;
      setCancelling(true);
      try {
        if (typeof window !== 'undefined' && window.history.length > 1) {
          router.back();
        } else {
          router.push('/events');
        }
      } finally {
        setCancelling(false);
      }
      return;
    }

    if (!event || cancelling) return;

    if (isPreview) {
      if (typeof window !== 'undefined' && window.history.length > 1) {
        router.back();
      } else {
        router.push('/events');
      }
      return;
    }

    if (isEditingEvent) {
      if (!pathname) return;
      setInfoMessage(`${entityLabel} edit cancelled.`);
      setSelectedLifecycleStatus(null);
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.delete('mode');
      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
      return;
    }

    if (!window.confirm(`Cancel this ${entityLabel.toLowerCase()}? This will delete the schedule and the event.`)) return;
    setCancelling(true);
    setError(null);
    try {
      await leagueService.deleteMatchesByEvent(event.$id);
      await leagueService.deleteWeeklySchedulesForEvent(event.$id);
      await eventService.deleteEvent(event);
      router.push('/events');
    } catch (err) {
      console.error(`Failed to cancel ${entityLabel.toLowerCase()}:`, err);
      setError(`Failed to cancel ${entityLabel.toLowerCase()}.`);
      setCancelling(false);
    }
  };

  useEffect(() => {
    if (!canEditMatches && isMatchEditorOpen) {
      setIsMatchEditorOpen(false);
      setMatchBeingEdited(null);
    }
  }, [canEditMatches, isMatchEditorOpen]);

  const matchEditorTeams = resolvedMatchTeams;

  const matchEditorOfficials = useMemo(() => {
    const officialsById = new Map<string, UserData>();
    const addOfficial = (candidate: unknown) => {
      if (!candidate || typeof candidate !== 'object') {
        return;
      }
      const officialCandidate = candidate as UserData & { id?: string };
      const officialId = normalizeIdToken(officialCandidate.$id ?? officialCandidate.id);
      if (!officialId || officialsById.has(officialId)) {
        return;
      }
      officialsById.set(officialId, {
        ...officialCandidate,
        $id: officialId,
      } as UserData);
    };

    participantOfficials.forEach(addOfficial);
    if (Array.isArray(activeEvent?.officials)) {
      activeEvent.officials.forEach(addOfficial);
    }
    activeMatches.forEach((match) => addOfficial(match.official));

    return Array.from(officialsById.values());
  }, [participantOfficials, activeEvent?.officials, activeMatches]);

  const stageMatchCreate = useCallback((params: {
    creationContext: MatchCreateContext;
    seed?: Partial<Match>;
    openEditor?: boolean;
  }) => {
    if (!canEditMatches || !activeEvent?.$id) {
      return null;
    }

    const clientId = createClientId();
    const matchId = `${CLIENT_MATCH_PREFIX}${clientId}`;
    const now = new Date();
    const defaultStart = formatLocalDateTime(now);
    const defaultEnd = formatLocalDateTime(new Date(now.getTime() + 60 * 60 * 1000));
    const nextMatchId = nextMatchSequenceNumber(activeMatches);
    const isTournamentEvent = String(activeEvent.eventType ?? '').toUpperCase() === 'TOURNAMENT';
    const existingPlaceholderCount = activeMatches.reduce((count, match) => {
      const team1Name = (match.team1 as { name?: string } | null)?.name ?? '';
      const team2Name = (match.team2 as { name?: string } | null)?.name ?? '';
      const nameBucket = [team1Name, team2Name].join(' ').toLowerCase();
      return nameBucket.includes('place holder') ? count + 1 : count;
    }, 0);
    const placeholderTeam = isTournamentEvent
      ? ({
          $id: `${LOCAL_PLACEHOLDER_PREFIX}${clientId}`,
          name: `Place Holder ${existingPlaceholderCount + 1}`,
          division: normalizeIdToken(params.seed?.division as string | undefined) ?? undefined,
        } as unknown as Team)
      : undefined;

    const draft: Match = {
      $id: matchId,
      matchId: typeof params.seed?.matchId === 'number' ? params.seed.matchId : nextMatchId,
      eventId: activeEvent.$id,
      team1Id: null,
      team2Id: null,
      officialId: null,
      officialIds: [],
      teamOfficialId: null,
      fieldId: params.creationContext === 'schedule'
        ? normalizeIdToken(params.seed?.fieldId as string | undefined)
        : null,
      locked: false,
      team1Points: [],
      team2Points: [],
      setResults: [],
      losersBracket: Boolean(params.seed?.losersBracket),
      winnerNextMatchId: asBulkMatchRef(params.seed?.winnerNextMatchId as string | undefined),
      loserNextMatchId: asBulkMatchRef(params.seed?.loserNextMatchId as string | undefined),
      previousLeftId: asBulkMatchRef(params.seed?.previousLeftId as string | undefined),
      previousRightId: asBulkMatchRef(params.seed?.previousRightId as string | undefined),
      side: params.seed?.side ?? null,
      officialCheckedIn: false,
      start: params.creationContext === 'schedule' ? defaultStart : null,
      end: params.creationContext === 'schedule' ? defaultEnd : null,
      division: (params.seed?.division as string | undefined) ?? null,
      team1: placeholderTeam,
    };

    setChangesMatches((prev) => {
      const base = (prev.length ? prev : (cloneValue(matches) as Match[])).map((item) => cloneValue(item) as Match);
      base.push(cloneValue(draft) as Match);
      return base;
    });
    setStagedMatchCreates((prev) => ({
      ...prev,
      [matchId]: {
        clientId,
        creationContext: params.creationContext,
        autoPlaceholderTeam: isTournamentEvent,
      },
    }));
    setHasUnsavedChanges(true);

    if (params.openEditor) {
      setMatchEditorContext(params.creationContext);
      setPendingCreateMatchId(matchId);
      setMatchBeingEdited(cloneValue(draft) as Match);
      setIsMatchEditorOpen(true);
    }

    return draft;
  }, [activeEvent?.$id, activeEvent?.eventType, activeMatches, canEditMatches, matches]);

  const removeDraftMatch = useCallback((matchId: string, options?: {
    stageDelete?: boolean;
    markUnsaved?: boolean;
  }) => {
    const normalizedId = normalizeIdToken(matchId);
    if (!normalizedId) {
      return;
    }
    setChangesMatches((prev) => {
      const base = (prev.length ? prev : (cloneValue(matches) as Match[])).map((item) => cloneValue(item) as Match);
      return base
        .filter((candidate) => candidate.$id !== normalizedId)
        .map((candidate) => clearMatchReferencesToTarget(candidate, normalizedId));
    });
    setStagedMatchCreates((prev) => {
      const next = { ...prev };
      delete next[normalizedId];
      return next;
    });
    setStagedMatchDeletes((prev) => {
      const withoutTarget = prev.filter((candidate) => candidate !== normalizedId);
      if (options?.stageDelete && !isClientMatchId(normalizedId)) {
        return [...withoutTarget, normalizedId];
      }
      return withoutTarget;
    });
    if (options?.markUnsaved !== false) {
      setHasUnsavedChanges(true);
    }
  }, [matches]);

  const removeStagedClientMatch = useCallback((matchId: string) => {
    removeDraftMatch(matchId, { stageDelete: false, markUnsaved: false });
  }, [removeDraftMatch]);

  const handleMatchDelete = useCallback((target: Match) => {
    const targetId = normalizeIdToken(target.$id);
    if (!targetId) {
      return;
    }
    removeDraftMatch(targetId, {
      stageDelete: !isClientMatchId(targetId),
      markUnsaved: true,
    });
    if (pendingCreateMatchId === targetId) {
      setPendingCreateMatchId(null);
    }
    setMatchEditorContext('bracket');
    setIsMatchEditorOpen(false);
    setMatchBeingEdited(null);
  }, [pendingCreateMatchId, removeDraftMatch]);

  const handleAddScheduleMatch = useCallback(() => {
    stageMatchCreate({ creationContext: 'schedule', openEditor: true });
  }, [stageMatchCreate]);

  const handleAddBracketMatch = useCallback(() => {
    stageMatchCreate({ creationContext: 'bracket', openEditor: true });
  }, [stageMatchCreate]);

  const handleMatchEditRequest = useCallback((match: Match, context: MatchCreateContext = 'bracket') => {
    if (!canEditMatches) return;
    const sourceMatch = activeMatches.find((candidate) => candidate.$id === match.$id);
    if (!sourceMatch) return;
    setMatchEditorContext(context);
    setPendingCreateMatchId(null);
    setMatchBeingEdited(cloneValue(sourceMatch) as Match);
    setIsMatchEditorOpen(true);
  }, [activeMatches, canEditMatches]);

  const handleMatchEditClose = useCallback(() => {
    if (pendingCreateMatchId) {
      removeStagedClientMatch(pendingCreateMatchId);
      setPendingCreateMatchId(null);
    }
    setMatchEditorContext('bracket');
    setIsMatchEditorOpen(false);
    setMatchBeingEdited(null);
  }, [pendingCreateMatchId, removeStagedClientMatch]);

  const handleMatchEditSave = useCallback((updated: Match) => {
    const base = (changesMatches.length ? changesMatches : (cloneValue(matches) as Match[]))
      .map((item) => cloneValue(item) as Match);
    let replaced = false;
    const nextMatches = base.map((item) => {
      if (item.$id === updated.$id) {
        replaced = true;
        return cloneValue(updated) as Match;
      }
      return item;
    });
    if (!replaced) {
      nextMatches.push(cloneValue(updated) as Match);
    }

    const normalizedMatches = normalizeDraftBracketGraph(nextMatches);

    setChangesMatches(normalizedMatches);
    setDismissedMatchConflictSignature(null);
    setMatchConflictOverrideMessage(null);
    if (isClientMatchId(updated.$id)) {
      setStagedMatchCreates((prev) => {
        if (prev[updated.$id]) {
          return prev;
        }
        return {
          ...prev,
          [updated.$id]: {
            clientId: getClientIdFromMatchId(updated.$id),
            creationContext: matchEditorContext,
            autoPlaceholderTeam: String(activeEvent?.eventType ?? '').toUpperCase() === 'TOURNAMENT',
          },
        };
      });
    }
    setHasUnsavedChanges(true);
    setPendingCreateMatchId(null);
    setMatchEditorContext('bracket');
    setIsMatchEditorOpen(false);
    setMatchBeingEdited(null);
  }, [activeEvent?.eventType, changesMatches, matchEditorContext, matches, normalizeDraftBracketGraph]);

  const handleToggleLockAllMatches = useCallback((locked: boolean, matchIds: string[]) => {
    if (!canEditMatches || matchIds.length === 0) return;
    const matchIdSet = new Set(matchIds);
    const lockLabel = locked ? 'Locked' : 'Unlocked';

    setChangesMatches((prev) => {
      const base = (prev.length ? prev : (cloneValue(matches) as Match[])).map((item) => cloneValue(item) as Match);
      return base.map((match) => (
        matchIdSet.has(match.$id)
          ? ({ ...match, locked } as Match)
          : match
      ));
    });
    setHasUnsavedChanges(true);

    setInfoMessage(`${lockLabel} ${matchIdSet.size} match${matchIdSet.size === 1 ? '' : 'es'}.`);
  }, [canEditMatches, matches]);

  const applyMatchUpdate = useCallback((updated: Match) => {
    const cloned = cloneValue(updated) as Match;
    const replaceInList = (list?: Match[]) => {
      if (!Array.isArray(list)) return list;
      let found = false;
      const next = list.map((item) => {
        if (item.$id === cloned.$id) {
          found = true;
          return cloneValue(cloned) as Match;
        }
        return item;
      });
      if (!found) {
        next.push(cloneValue(cloned) as Match);
      }
      return next;
    };

    setMatches((prev) => replaceInList(prev) as Match[]);
    setChangesMatches((prev) => replaceInList(prev) as Match[]);
    setEvent((prev) => {
      if (!prev) return prev;
      return { ...prev, matches: replaceInList(prev.matches as Match[] | undefined) as Match[] };
    });
    setChangesEvent((prev) => {
      if (!prev) return prev;
      return { ...prev, matches: replaceInList(prev.matches as Match[] | undefined) as Match[] };
    });
  }, []);

  const isOfficialCheckedIn = useCallback(
    (match: Match) => Boolean(match.officialCheckedIn || match.officialCheckedIn),
    [],
  );

  const canUserManageScore = useCallback(
    (match: Match) => {
      if (!user?.$id || !isOfficialCheckedIn(match)) return false;
      if (collectMatchAssignmentUserIds(match).includes(user.$id)) {
        return true;
      }
      const teamOfficial = resolveTeam(match.teamOfficial ?? match.teamOfficialId);
      return userOnTeam(teamOfficial);
    },
    [isOfficialCheckedIn, resolveTeam, user?.$id, userOnTeam],
  );

  const handleScoreChange = useCallback(
    async ({ matchId, team1Points, team2Points, setResults }: { matchId: string; team1Points: number[]; team2Points: number[]; setResults: number[] }) => {
      const targetEventId = activeEvent?.$id ?? eventId;
      if (!targetEventId) return;
      try {
        await tournamentService.updateMatchScores(targetEventId, matchId, { team1Points, team2Points, setResults });
      } catch (err) {
        console.warn('Non-blocking score sync failed:', err);
      }
    },
    [activeEvent?.$id, eventId],
  );

  const handleSetComplete = useCallback(
    async ({ matchId, team1Points, team2Points, setResults }: { matchId: string; team1Points: number[]; team2Points: number[]; setResults: number[] }) => {
      const targetEventId = activeEvent?.$id ?? eventId;
      if (!targetEventId) return;
      const updated = await tournamentService.updateMatch(targetEventId, matchId, { team1Points, team2Points, setResults });
      applyMatchUpdate(updated as Match);
    },
    [applyMatchUpdate, activeEvent?.$id, eventId],
  );

  const handleMatchComplete = useCallback(
    async ({
      matchId,
      team1Points,
      team2Points,
      setResults,
      eventId,
    }: {
      matchId: string;
      team1Points: number[];
      team2Points: number[];
      setResults: number[];
      eventId?: string;
    }) => {
      const targetEventId = eventId ?? activeEvent?.$id;
      if (!targetEventId || activeEvent?.eventType === 'EVENT') {
        return;
      }
      await tournamentService.completeMatch(targetEventId, matchId, { team1Points, team2Points, setResults });
    },
    [activeEvent?.$id, activeEvent?.eventType],
  );

  const handleScoreSubmit = useCallback(
    async (matchId: string, team1Points: number[], team2Points: number[], setResults: number[]) => {
      const targetEventId = activeEvent?.$id ?? eventId;
      if (!targetEventId) return;
      try {
        const updated = await tournamentService.updateMatch(targetEventId, matchId, { team1Points, team2Points, setResults });
        applyMatchUpdate(updated as Match);
        setScoreUpdateMatch(null);
        setIsScoreModalOpen(false);
      } catch (err) {
        console.error('Failed to update score:', err);
        setError('Failed to update score. Please try again.');
      }
    },
    [applyMatchUpdate, activeEvent?.$id, eventId],
  );

  const updateMatchOfficialState = useCallback(
    async (match: Match, updates: Partial<Match>, failureMessage: string) => {
      const targetEventId = activeEvent?.$id ?? eventId;
      if (!targetEventId) {
        return match;
      }

      try {
        const updated = await tournamentService.updateMatch(targetEventId, match.$id, updates);
        applyMatchUpdate(updated as Match);
        return updated as Match;
      } catch (err) {
        console.error(failureMessage, err);
        setError(failureMessage);
        return match;
      }
    },
    [activeEvent?.$id, applyMatchUpdate, eventId],
  );

  const handleMatchClick = useCallback(
    async (match: Match) => {
      if (canEditMatches) {
        handleMatchEditRequest(match);
        return;
      }

      let modalMatch = activeMatches.find((candidate) => candidate.$id === match.$id) ?? match;

      if (user?.$id) {
        const assignedTeamOfficial = resolveTeam(modalMatch.teamOfficial ?? modalMatch.teamOfficialId);
        const assignedTeamOfficialId = normalizeIdToken(modalMatch.teamOfficialId ?? modalMatch.teamOfficial?.$id);
        const currentUserEventTeam = findUserEventTeam();
        const currentUserEventTeamId = normalizeIdToken(currentUserEventTeam?.$id) ?? userEventTeamIdFromProfile;
        const isAssignedUserOfficial = collectMatchAssignmentUserIds(modalMatch).includes(user.$id);
        const isAssignedTeamOfficial =
          userOnTeam(assignedTeamOfficial) ||
          Boolean(currentUserEventTeamId && assignedTeamOfficialId && currentUserEventTeamId === assignedTeamOfficialId);
        const userIsCurrentOfficial = isAssignedUserOfficial || isAssignedTeamOfficial;
        const checkedIn = isOfficialCheckedIn(modalMatch);

        if (!checkedIn && userIsCurrentOfficial) {
          const confirmCheckIn = window.confirm('Would you like to check in and start this match?');
          if (confirmCheckIn) {
            modalMatch = await updateMatchOfficialState(
              modalMatch,
              { officialCheckedIn: true },
              'Failed to check in as official. Please try again.',
            );
          }
        } else {
          const canSwapIntoRef =
            !checkedIn &&
            Boolean(activeEvent?.doTeamsOfficiate) &&
            Boolean(activeEvent?.teamOfficialsMaySwap) &&
            Boolean(currentUserEventTeamId) &&
            assignedTeamOfficialId !== currentUserEventTeamId;

          if (canSwapIntoRef && currentUserEventTeamId) {
            const confirmSwap = window.confirm(
              'The official has not checked in yet. Do you want your team to official this match?',
            );
            if (confirmSwap) {
              modalMatch = await updateMatchOfficialState(
                modalMatch,
                {
                  teamOfficialId: currentUserEventTeamId,
                  officialCheckedIn: false,
                },
                'Failed to swap official for this match. Please try again.',
              );
              const confirmCheckIn = window.confirm('Would you like to check in and start this match?');
              if (confirmCheckIn) {
                modalMatch = await updateMatchOfficialState(
                  modalMatch,
                  { officialCheckedIn: true },
                  'Failed to check in as official. Please try again.',
                );
              }
            }
          }
        }
      }

      setScoreUpdateMatch(modalMatch);
      setIsScoreModalOpen(true);
    },
    [
      activeEvent?.doTeamsOfficiate,
      activeEvent?.teamOfficialsMaySwap,
      activeMatches,
      canEditMatches,
      findUserEventTeam,
      handleMatchEditRequest,
      isOfficialCheckedIn,
      resolveTeam,
      updateMatchOfficialState,
      user,
      userEventTeamIdFromProfile,
      userOnTeam,
    ],
  );

  const activeLocationDefaults = useMemo(
    () => buildLocationDefaults(activeOrganization),
    [activeOrganization, buildLocationDefaults],
  );

  const handleStandingsOverrideChange = useCallback((teamId: string, value: string | number) => {
    setStandingsDraftOverrides((prev) => {
      const next = { ...prev };
      const numeric = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(numeric)) {
        delete next[teamId];
      } else {
        next[teamId] = numeric;
      }
      return next;
    });
    setStandingsActionError(null);
  }, []);

  const standingsActionDivisionId = useMemo(() => {
    const loadedDivisionId = normalizeIdToken(standingsDivisionData?.divisionId ?? null);
    if (loadedDivisionId) {
      return loadedDivisionId;
    }
    return normalizeIdToken(selectedStandingsDivision);
  }, [selectedStandingsDivision, standingsDivisionData?.divisionId]);

  const handleSaveStandingsAdjustments = useCallback(async () => {
    if (!activeEvent?.$id || !standingsActionDivisionId || !standingsDivisionData) {
      return;
    }

    const existingOverrides = standingsDivisionData.standingsOverrides ?? {};
    const updates = standingsDivisionData.standings.reduce<Array<{ teamId: string; points: number | null }>>((acc, row) => {
      const existing = existingOverrides[row.teamId];
      const desired = standingsDraftOverrides[row.teamId];
      const basePoints = Number.isFinite(row.basePoints) ? Number(row.basePoints) : 0;
      const hasExisting = typeof existing === 'number' && Number.isFinite(existing);
      const hasDesired = typeof desired === 'number' && Number.isFinite(desired);

      if (hasDesired) {
        if (desired === basePoints) {
          if (hasExisting) {
            acc.push({ teamId: row.teamId, points: null });
          }
          return acc;
        }
        if (!hasExisting || desired !== existing) {
          acc.push({ teamId: row.teamId, points: desired });
        }
        return acc;
      }

      if (hasExisting) {
        acc.push({ teamId: row.teamId, points: null });
      }
      return acc;
    }, []);

    if (!updates.length) {
      setInfoMessage('No standings adjustments to save.');
      return;
    }

    setSavingStandings(true);
    setStandingsActionError(null);
    setInfoMessage(null);
    setWarningMessage(null);

    try {
      const updatedDivision = await tournamentService.updateLeagueStandingsOverrides(
        activeEvent.$id,
        standingsActionDivisionId,
        updates,
      );
      setStandingsDivisionData(updatedDivision);
      setStandingsDraftOverrides(updatedDivision.standingsOverrides ? { ...updatedDivision.standingsOverrides } : {});
      setInfoMessage('Standings adjustments saved.');
    } catch (saveError) {
      console.error('Failed to save standings adjustments:', saveError);
      setStandingsActionError(saveError instanceof Error ? saveError.message : 'Failed to save standings adjustments.');
    } finally {
      setSavingStandings(false);
    }
  }, [activeEvent?.$id, standingsActionDivisionId, standingsDivisionData, standingsDraftOverrides]);

  const handleConfirmStandings = useCallback(async () => {
    if (!activeEvent?.$id || !standingsActionDivisionId) {
      return;
    }

    setConfirmingStandings(true);
    setStandingsActionError(null);
    setInfoMessage(null);
    setWarningMessage(null);

    try {
      const result = await tournamentService.confirmLeagueStandings(
        activeEvent.$id,
        standingsActionDivisionId,
        applyStandingsReassignment,
      );
      const seededTeamCount = Array.isArray(result.seededTeamIds)
        ? new Set(
          result.seededTeamIds
            .map((teamId) => normalizeIdToken(teamId))
            .filter((teamId): teamId is string => Boolean(teamId)),
        ).size
        : 0;
      setStandingsDivisionData(result.division);
      setStandingsDraftOverrides(result.division.standingsOverrides ? { ...result.division.standingsOverrides } : {});
      if (applyStandingsReassignment) {
        await loadSchedule();
        if (result.reassignedPlayoffDivisionIds.length > 0) {
          setInfoMessage(
            seededTeamCount > 0
              ? `Standings confirmed and seeded ${seededTeamCount} playoff team(s) across ${result.reassignedPlayoffDivisionIds.length} division(s).`
              : `Standings confirmed and playoff assignments refreshed for ${result.reassignedPlayoffDivisionIds.length} division(s). No teams were seeded yet.`,
          );
        } else {
          setInfoMessage('Standings confirmed. No mapped playoff divisions were updated.');
        }
      } else {
        setInfoMessage('Standings confirmed without playoff reassignment.');
      }
    } catch (confirmError) {
      console.error('Failed to confirm standings:', confirmError);
      setStandingsActionError(confirmError instanceof Error ? confirmError.message : 'Failed to confirm standings.');
    } finally {
      setConfirmingStandings(false);
    }
  }, [activeEvent?.$id, applyStandingsReassignment, loadSchedule, standingsActionDivisionId]);

  const standingsValidationMessages = useMemo(() => {
    if (!standingsDivisionData?.validation) {
      return [];
    }
    return [
      ...(standingsDivisionData.validation.mappingErrors ?? []),
      ...(standingsDivisionData.validation.capacityErrors ?? []),
    ];
  }, [standingsDivisionData]);

  const handleStandingsSortChange = useCallback((field: StandingsSortField) => {
    setStandingsSort((prev) => {
      if (prev.field === field) {
        return {
          field,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return {
        field,
        direction: field === 'team' ? 'asc' : 'desc',
      };
    });
  }, []);

  const renderSortIndicator = (field: StandingsSortField) => {
    if (standingsSort.field !== field) {
      return <span className="ml-1 text-xs text-gray-400">{'\u2195'}</span>;
    }
    return (
      <span className="ml-1 text-xs font-semibold text-gray-700">
        {standingsSort.direction === 'asc' ? '\u2191' : '\u2193'}
      </span>
    );
  };

  const formatPoints = (value: number): string => {
    return Number.isInteger(value) ? value.toString() : value.toFixed(2);
  };

  if (authLoading || !eventId) {
    return <Loading fullScreen text="Loading schedule..." />;
  }

  if (loading) {
    return (
      <>
        <Navigation />
        <Loading fullScreen belowNavigation text="Loading schedule..." />
      </>
    );
  }

  if (isCreateMode && !activeEvent) {
    return (
      <>
        <Navigation />
        <Container fluid py="xl">
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Title order={2}>Create Event</Title>
              <Group gap="sm">
                {renderPendingChangesPopover()}
                {hasPendingUnsavedChanges && (
                  <Button
                    variant="default"
                    onClick={handleDiscardChanges}
                    disabled={publishing || reschedulingMatches || cancelling}
                  >
                    Discard Changes
                  </Button>
                )}
                <Button
                  color="green"
                  onClick={handlePublish}
                  loading={publishing}
                  disabled={reschedulingMatches || cancelling}
                >
                  {createButtonLabel}
                </Button>
                <Button
                  variant="default"
                  onClick={handleCancel}
                  loading={cancelling}
                  disabled={publishing || reschedulingMatches}
                >
                  {cancelButtonLabel}
                </Button>
              </Group>
            </Group>
            {submitError && (
              <Alert color="red" radius="md" onClose={() => setSubmitError(null)} withCloseButton>
                {submitError}
              </Alert>
            )}
            {error && (
              <Alert color="red" radius="md" onClose={() => setError(null)} withCloseButton>
                {error}
              </Alert>
            )}
            {warningMessage && (
              <Alert color="yellow" radius="md" onClose={() => setWarningMessage(null)} withCloseButton>
                {warningMessage}
              </Alert>
            )}
            {infoMessage && (
              <Alert color="green" radius="md" onClose={() => setInfoMessage(null)} withCloseButton>
                {infoMessage}
              </Alert>
            )}
            <Modal
              opened={templatePromptOpen}
              onClose={closeTemplatePrompt}
              title="Start from a template?"
              centered
              size="lg"
              fullScreen={Boolean(isMobile)}
              closeOnClickOutside={!applyingTemplate}
              closeOnEscape={!applyingTemplate}
              withCloseButton={!applyingTemplate}
            >
              <Stack gap="sm">
                <Text size="sm" c="dimmed">
                  Pick a template to prefill this event. Matches are not copied; event settings and time slots are.
                </Text>
                {templatesError && (
                  <Alert color="red" radius="md">
                    {templatesError}
                  </Alert>
                )}
                {actionError && (
                  <Alert color="red" radius="md">
                    {actionError}
                  </Alert>
                )}
                <Select
                  label="Template"
                  placeholder={templatesLoading ? 'Loading templates...' : 'Select a template'}
                  data={templateSelectData}
                  value={selectedTemplateId}
                  onChange={(value) => setSelectedTemplateId(value)}
                  searchable
                  clearable
                  disabled={templatesLoading || applyingTemplate}
                  nothingFoundMessage="No templates found"
                />
                <DatePickerInput
                  label="New event start date"
                  valueFormat="MM/DD/YYYY"
                  value={selectedTemplateStartDate}
                  onChange={(value) => setSelectedTemplateStartDate(parseLocalDateTime(value))}
                  minDate={new Date()}
                  disabled={applyingTemplate}
                />
                <Group justify="space-between" mt="md">
                  <Button
                    variant="default"
                    onClick={closeTemplatePrompt}
                    disabled={applyingTemplate}
                  >
                    Start Blank
                  </Button>
                  <Button
                    onClick={handleApplyTemplate}
                    loading={applyingTemplate}
                    disabled={!selectedTemplateId || !selectedTemplateStartDate}
                  >
                    Use Template
                  </Button>
                </Group>
              </Stack>
            </Modal>
            {user && changesEvent ? (
                <EventForm
                  key={`create-event-form-${templateSeedKey}`}
                  ref={eventFormRef}
                  isOpen
                  onClose={() => router.push('/events')}
                  onDirtyStateChange={handleEventFormDirtyStateChange}
                  currentUser={user}
                  organization={organizationForCreate}
                defaultLocation={createLocationDefaults}
                immutableDefaults={rentalImmutableDefaults}
                rentalPurchase={rentalPurchaseContext}
                templateOrganizationId={resolvedRentalOrgId ?? organizationForCreate?.$id ?? undefined}
                event={changesEvent}
                formId={createFormId}
                isCreateMode
              />
            ) : (
              <Loading text="Loading user..." />
            )}
          </Stack>
        </Container>
        <PaymentModal
          isOpen={showRentalPayment && Boolean(rentalPaymentData)}
          onClose={closeRentalPaymentModal}
          event={rentalPaymentEventSummary}
          paymentData={rentalPaymentData}
          onPaymentSuccess={handleRentalPaymentSuccess}
        />
        <Modal
          opened={showRentalSignModal && Boolean(currentRentalSignLink)}
          onClose={closeRentalSignModal}
          title="Sign Rental Document"
          size="xl"
          centered
        >
          <Stack gap="sm">
            {currentRentalSignLink ? (
              <>
                <Text size="sm" c="dimmed">
                  Document {rentalSignIndex + 1} of {rentalSignLinks.length}
                  {currentRentalSignLink.title ? ` \u2022 ${currentRentalSignLink.title}` : ''}
                </Text>
                {currentRentalSignLink.requiredSignerLabel ? (
                  <Text size="sm" c="dimmed">
                    Required signer: {currentRentalSignLink.requiredSignerLabel}
                  </Text>
                ) : null}
                {rentalSignError ? (
                  <Alert color="red">
                    {rentalSignError}
                  </Alert>
                ) : null}
                {pendingRentalSignedDocumentId || pendingRentalSignatureOperationId ? (
                  <Group gap="xs">
                    <Loader size="sm" />
                    <Text size="sm" c="dimmed">
                      Confirming signature...
                    </Text>
                  </Group>
                ) : null}
                {currentRentalSignLink.type === 'TEXT' ? (
                  <>
                    <Paper withBorder p="sm" radius="md" style={{ maxHeight: 320, overflowY: 'auto' }}>
                      <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                        {currentRentalSignLink.content || 'No document content provided.'}
                      </Text>
                    </Paper>
                    <Checkbox
                      checked={rentalTextAccepted}
                      onChange={(event) => setRentalTextAccepted(event.currentTarget.checked)}
                      label="I have read and agree to this document."
                    />
                    <Group justify="flex-end">
                      <Button
                        onClick={handleRentalTextAcceptance}
                        disabled={!rentalTextAccepted || recordingRentalSignature}
                        loading={recordingRentalSignature}
                      >
                        Accept And Continue
                      </Button>
                    </Group>
                  </>
                ) : (
                  <>
                    {currentRentalSignLink.url ? (
                      <iframe
                        title={`Rental document ${currentRentalSignLink.title ?? currentRentalSignLink.templateId}`}
                        src={currentRentalSignLink.url}
                        className="h-[480px] w-full rounded border"
                      />
                    ) : (
                      <Alert color="red">
                        This document is missing a signing link. Close checkout and try again.
                      </Alert>
                    )}
                    <Group justify="space-between">
                      {currentRentalSignLink.url ? (
                        <Button
                          component="a"
                          href={currentRentalSignLink.url}
                          target="_blank"
                          rel="noreferrer"
                          variant="default"
                        >
                          Open In New Tab
                        </Button>
                      ) : (
                        <div />
                      )}
                      <Button
                        onClick={() => void handleRentalSignedDocument()}
                        disabled={!currentRentalSignLink.documentId || recordingRentalSignature}
                        loading={recordingRentalSignature}
                      >
                        I Finished Signing
                      </Button>
                    </Group>
                  </>
                )}
              </>
            ) : (
              <Text size="sm" c="dimmed">Preparing rental document...</Text>
            )}
          </Stack>
        </Modal>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Navigation />
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <Paper withBorder shadow="sm" p="xl" radius="md">
            <Stack gap="md" align="center">
              <Text fw={600} size="lg">Something went wrong.</Text>
              <Button variant="default" onClick={() => loadSchedule()}>Try Again</Button>
              <Text size="sm" c="red" ta="center">{error}</Text>
            </Stack>
          </Paper>
        </div>
      </>
    );
  }

  if (!activeEvent) {
    return (
      <>
        <Navigation />
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <Paper withBorder shadow="sm" p="xl" radius="md">
            <Stack gap="md" align="center">
              <Text fw={600} size="lg">League not found.</Text>
              <Button variant="default" onClick={() => router.push('/events')}>Back to Events</Button>
            </Stack>
          </Paper>
        </div>
      </>
    );
  }

  const leagueConfig = activeEvent.leagueConfig;
  const hasNetworkActionInFlight = publishing || reschedulingMatches || cancelling || creatingTemplate;
  const showEditActionButton = !isCreateMode && !isTemplateEvent && !isEditingEvent;
  const showSaveActionButton = isCreateMode || isEditingEvent;
  const showRescheduleActionButton = isEditingEvent && (isLeague || isTournament);
  const showBuildBracketsActionButton = isEditingEvent && (
    isTournament || (isLeague && Boolean(activeEvent.includePlayoffs))
  );
  const showDeleteTemplateActionButton = isTemplateEvent;
  const showCancelActionButton = !isTemplateEvent;
  const showCreateTemplateButton = !isTemplateEvent;
  const showLifecycleStatusSelect = isEditingEvent && !isTemplateEvent;
  const showDiscardChangesButton = (isEditingEvent || isCreateMode) && hasPendingUnsavedChanges;
  const eventFormRenderKey = isCreateMode
    ? `create:${activeEvent?.$id ?? eventId ?? 'event'}:${templateSeedKey}:${eventFormResetVersion}`
    : `event:${activeEvent?.$id ?? eventId ?? 'event'}:${eventFormResetVersion}`;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <Container fluid pt="xl" pb={0}>
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start">
            <Group gap="xs" align="center">
              <Title order={2} mb="xs">{activeEvent.name}</Title>
              {canManageEvent && !isCreateMode && (
                <ActionIcon
                  variant="subtle"
                  size="lg"
                  onClick={handleOpenNotificationModal}
                  aria-label="Send notification"
                  title="Send notification"
                >
                  <Megaphone size={18} />
                </ActionIcon>
              )}
            </Group>

            {canManageEvent && (
              <Group gap="sm" wrap="wrap">
                {showEditActionButton && (
                  <Button onClick={handleEnterEditMode} disabled={hasNetworkActionInFlight}>
                    Manage
                  </Button>
                )}
                {(isEditingEvent || isCreateMode) && (
                  <>
                    {renderPendingChangesPopover()}
                    {showDiscardChangesButton && (
                      <Button
                        variant="default"
                        onClick={handleDiscardChanges}
                        disabled={hasNetworkActionInFlight}
                      >
                        Discard Changes
                      </Button>
                    )}
                    {showLifecycleStatusSelect && (
                      <Select
                        data={EVENT_LIFECYCLE_OPTIONS}
                        value={selectedLifecycleStatus ?? activeLifecycleStatus}
                        onChange={handleLifecycleStatusChange}
                        allowDeselect={false}
                        w={160}
                        disabled={hasNetworkActionInFlight}
                      />
                    )}
                    {showSaveActionButton && (
                      <Button
                        color="green"
                        onClick={isCreateMode ? handlePublish : handleSaveEvent}
                        loading={publishing}
                        disabled={
                          (hasNetworkActionInFlight && !publishing)
                          || (!isCreateMode && !hasPendingUnsavedChanges)
                          || hasSplitDivisionUnassignedTeams
                          || (!isCreateMode && hasMatchConflicts)
                        }
                      >
                        {isCreateMode ? createButtonLabel : 'Save'}
                      </Button>
                    )}
                    {showRescheduleActionButton && (
                      <Button
                        variant="light"
                        onClick={handleRescheduleMatches}
                        loading={reschedulingMatches && pendingScheduleAction === 'reschedule'}
                        disabled={
                          (hasNetworkActionInFlight && !(reschedulingMatches && pendingScheduleAction === 'reschedule'))
                          || hasSplitDivisionUnassignedTeams
                        }
                      >
                        Reschedule
                      </Button>
                    )}
                    {showBuildBracketsActionButton && (
                      <Button
                        variant="light"
                        color="orange"
                        onClick={handleBuildBrackets}
                        loading={reschedulingMatches && pendingScheduleAction === 'rebuild'}
                        disabled={
                          (hasNetworkActionInFlight && !(reschedulingMatches && pendingScheduleAction === 'rebuild'))
                          || hasSplitDivisionUnassignedTeams
                        }
                      >
                        Rebuild
                      </Button>
                    )}
                  </>
                )}
                {showCancelActionButton && (
                  <Button
                    color="red"
                    variant="light"
                    onClick={handleCancel}
                    loading={cancelling}
                    disabled={hasNetworkActionInFlight && !cancelling}
                  >
                    {cancelButtonLabel}
                  </Button>
                )}
                {showDeleteTemplateActionButton && (
                  <Button
                    color="red"
                    variant="light"
                    onClick={handleDeleteTemplate}
                    loading={cancelling}
                    disabled={hasNetworkActionInFlight && !cancelling}
                  >
                    Delete
                  </Button>
                )}
                {showCreateTemplateButton && (
                  <Button
                    variant="light"
                    onClick={handleCreateTemplateFromEvent}
                    loading={creatingTemplate}
                    disabled={hasNetworkActionInFlight && !creatingTemplate}
                  >
                    Create Template
                  </Button>
                )}
              </Group>
            )}
          </Group>

          {infoMessage && (
            <Alert color="green" radius="md" onClose={() => setInfoMessage(null)} withCloseButton>
              {infoMessage}
            </Alert>
          )}

          {submitError && (
            <Alert color="red" radius="md" onClose={() => setSubmitError(null)} withCloseButton>
              {submitError}
            </Alert>
          )}

          {error && (
            <Alert color="red" radius="md" onClose={() => setError(null)} withCloseButton>
              {error}
            </Alert>
          )}

          {visibleMatchConflictMessage && (
            <Alert
              color="red"
              radius="md"
              withCloseButton
              onClose={() => {
                setDismissedMatchConflictSignature(matchConflictSignature);
                setMatchConflictOverrideMessage(null);
              }}
            >
              {visibleMatchConflictMessage}
            </Alert>
          )}

          {warningMessage && (
            <Alert color="yellow" radius="md" onClose={() => setWarningMessage(null)} withCloseButton>
              {warningMessage}
            </Alert>
          )}

          {hasSplitDivisionUnassignedTeams && (
            <Alert color="yellow" radius="md">
              Split-division leagues require every registered team to be assigned to a division before saving or rescheduling.
              Unassigned teams: {unassignedFilledParticipantTeams.map((team) => team.$id).join(', ')}.
            </Alert>
          )}

          {actionError && (
            <Alert color="red" radius="md" onClose={() => setActionError(null)} withCloseButton>
              {actionError}
            </Alert>
          )}

          <Tabs value={activeTab} onChange={handleTabChange}>
            <Tabs.List>
              <Tabs.Tab value="details">Details</Tabs.Tab>
              {showParticipantsTab && <Tabs.Tab value="participants">{isSplitDivisionEvent ? 'Divisions' : 'Participants'}</Tabs.Tab>}
              {showScheduleTab && <Tabs.Tab value="schedule">Schedule</Tabs.Tab>}
              {shouldShowBracketTab && <Tabs.Tab value="bracket">Bracket</Tabs.Tab>}
              {showStandingsTab && <Tabs.Tab value="standings">Standings</Tabs.Tab>}
            </Tabs.List>

            <Tabs.Panel value="details" pt="md">
              {shouldShowCreationSheet && user ? (
                <EventForm
                  key={eventFormRenderKey}
                  ref={eventFormRef}
                  isOpen={activeTab === 'details'}
                  onClose={handleDetailsClose}
                  onDirtyStateChange={handleEventFormDirtyStateChange}
                  currentUser={user}
                  event={activeEvent ?? undefined}
                  organization={activeOrganization}
                  defaultLocation={activeLocationDefaults}
                  isCreateMode={isCreateMode}
                  immutableDefaults={isCreateMode ? rentalImmutableDefaults : undefined}
                  rentalPurchase={isCreateMode ? rentalPurchaseContext : undefined}
                  templateOrganizationId={isCreateMode ? (resolvedRentalOrgId ?? activeOrganization?.$id ?? undefined) : undefined}
                />
              ) : (
                <EventDetailSheet
                  event={activeEvent}
                  isOpen={activeTab === 'details'}
                  renderInline
                  onClose={handleDetailsClose}
                />
              )}
            </Tabs.Panel>

            {showParticipantsTab && (
              <Tabs.Panel value="participants" pt="md">
                <Stack gap="md">
                  <Group justify="space-between" align="center">
                    <Text size="sm" c="dimmed">
                      {activeEvent?.teamSignup === false
                        ? (
                          participantUsers.length === 1
                            ? '1 participant is currently registered.'
                            : `${participantUsers.length} participants are currently registered.`
                        )
                        : (
                          filledParticipantTeams.length === 1
                            ? '1 team is currently participating.'
                            : `${filledParticipantTeams.length} teams are currently participating.`
                        )}
                    </Text>
                    {canManageEvent && activeEvent?.teamSignup !== false && (
                      <Button
                        variant="light"
                        onClick={() => {
                          setParticipantsError(null);
                          setTeamSearchQuery('');
                          setSelectedAddTeamDivisionId(null);
                          setIsAddTeamModalOpen(true);
                        }}
                      >
                        Add Team
                      </Button>
                    )}
                  </Group>

                  {participantsError && (
                    <Alert color="red" radius="md">
                      {participantsError}
                    </Alert>
                  )}

                  {canUseTeamCompliance && teamComplianceError && (
                    <Alert color="yellow" radius="md">
                      {teamComplianceError}
                    </Alert>
                  )}

                  {canUseUserCompliance && userComplianceError && (
                    <Alert color="yellow" radius="md">
                      {userComplianceError}
                    </Alert>
                  )}

                  {participantsLoading ? (
                    <Paper withBorder radius="md" p="xl">
                      <Group justify="center" gap="sm">
                        <Loader size="sm" />
                        <Text size="sm" c="dimmed">Loading participants...</Text>
                      </Group>
                    </Paper>
                  ) : activeEvent?.teamSignup === false ? (
                    participantUsers.length === 0 ? (
                      <Paper withBorder radius="md" p="xl" ta="center">
                        <Text>No participants have been added yet.</Text>
                      </Paper>
                    ) : (
                      <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
                        {participantUsers.map((participant) => {
                          const pseudoTeam = toUserParticipantPseudoTeam(participant);
                          return renderParticipantUserCard({
                            cardKey: participant.$id,
                            participant,
                            actions: canManageEvent
                              ? (
                                participantsUpdatingTeamId === participant.$id
                                  ? <Text size="xs" c="dimmed">Updating...</Text>
                                  : (
                                    <Stack gap={6}>
                                      {renderEditBillingActions(pseudoTeam)}
                                      <Button
                                        size="xs"
                                        variant="light"
                                        color="red"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          void handleRemoveUserFromParticipants(participant);
                                        }}
                                      >
                                        Remove
                                      </Button>
                                    </Stack>
                                  )
                              )
                              : undefined,
                          });
                        })}
                      </SimpleGrid>
                    )
                  ) : participantTeams.length === 0 ? (
                    <Paper withBorder radius="md" p="xl" ta="center">
                      <Text>No teams have been added yet.</Text>
                    </Paper>
                  ) : isSplitDivisionEvent ? (
                    <div className="overflow-x-auto">
                      <Group align="flex-start" gap="md" wrap="nowrap">
                        {participantDivisionColumns.map((column) => {
                          const columnTeams = column.teamIds
                            .map((teamId) => participantTeamsById.get(teamId))
                            .filter((team): team is Team => Boolean(team));
                          const filledColumnTeamsCount = columnTeams.filter((team) => !isPlaceholderParticipantTeam(team)).length;
                          return (
                            <Paper key={column.id} withBorder radius="md" p="md" miw={320}>
                              <Stack gap="sm">
                                <Group justify="space-between" align="center">
                                  <Text fw={600}>{column.label}</Text>
                                  <Text size="xs" c="dimmed">{filledColumnTeamsCount}</Text>
                                </Group>
                                {columnTeams.length === 0 ? (
                                  <Text size="sm" c="dimmed">No teams assigned.</Text>
                                ) : (
                                  <Stack gap="sm">
                                    {columnTeams.map((team) => {
                                      const canMoveTeamBetweenDivisions = canManageEvent && !isEditingEvent;
                                      const isPlaceholderTeam = isPlaceholderParticipantTeam(team);
                                      const teamActions = canManageEvent && !isPlaceholderTeam
                                        ? (
                                          participantsUpdatingTeamId === team.$id
                                            ? <Text size="xs" c="dimmed">Updating...</Text>
                                            : (
                                              <Stack gap={6}>
                                                {renderEditBillingActions(team)}
                                                {canMoveTeamBetweenDivisions ? (
                                                  <Select
                                                    size="xs"
                                                    data={participantDivisionSelectData}
                                                    value={column.id}
                                                    onChange={(value) => {
                                                      void handleMoveTeamDivision(team, value);
                                                    }}
                                                    allowDeselect={false}
                                                    w={200}
                                                  />
                                                ) : null}
                                                <Button
                                                  size="xs"
                                                  variant="light"
                                                  color="red"
                                                  onClick={(event) => {
                                                    event.stopPropagation();
                                                    void handleRemoveTeamFromParticipants(team);
                                                  }}
                                                >
                                                  Remove
                                                </Button>
                                              </Stack>
                                            )
                                        )
                                        : undefined;

                                      return renderParticipantTeamCard({
                                        cardKey: `${column.id}:${team.$id}`,
                                        team,
                                        className: isPlaceholderTeam ? '!bg-gray-100' : '',
                                        enableDetailsView: !isPlaceholderTeam,
                                        actions: teamActions,
                                      });
                                    })}
                                  </Stack>
                                )}
                              </Stack>
                            </Paper>
                          );
                        })}
                        <Paper withBorder radius="md" p="md" miw={320}>
                          <Stack gap="sm">
                            <Group justify="space-between" align="center">
                              <Text fw={600}>Unassigned</Text>
                              <Text size="xs" c={unassignedFilledParticipantTeams.length > 0 ? 'red' : 'dimmed'}>
                                {unassignedFilledParticipantTeams.length}
                              </Text>
                            </Group>
                            {unassignedParticipantTeams.length === 0 ? (
                              <Text size="sm" c="dimmed">All teams assigned.</Text>
                            ) : (
                              <Stack gap="sm">
                                {unassignedParticipantTeams.map((team) => {
                                  const canMoveTeamBetweenDivisions = canManageEvent && !isEditingEvent;
                                  const isPlaceholderTeam = isPlaceholderParticipantTeam(team);
                                  const teamActions = canManageEvent && !isPlaceholderTeam
                                    ? (
                                      participantsUpdatingTeamId === team.$id
                                        ? <Text size="xs" c="dimmed">Updating...</Text>
                                        : (
                                          <Stack gap={6}>
                                            {renderEditBillingActions(team)}
                                            {canMoveTeamBetweenDivisions ? (
                                              <Select
                                                size="xs"
                                                data={participantDivisionSelectData}
                                                value={null}
                                                placeholder="Move to division"
                                                onChange={(value) => {
                                                  void handleMoveTeamDivision(team, value);
                                                }}
                                                allowDeselect
                                                w={200}
                                              />
                                            ) : null}
                                            <Button
                                              size="xs"
                                              variant="light"
                                              color="red"
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                void handleRemoveTeamFromParticipants(team);
                                              }}
                                            >
                                              Remove
                                            </Button>
                                          </Stack>
                                        )
                                    )
                                    : undefined;

                                  return renderParticipantTeamCard({
                                    cardKey: `unassigned:${team.$id}`,
                                    team,
                                    className: isPlaceholderTeam ? '!bg-gray-100' : '',
                                    enableDetailsView: !isPlaceholderTeam,
                                    actions: teamActions,
                                  });
                                })}
                              </Stack>
                            )}
                          </Stack>
                        </Paper>
                      </Group>
                    </div>
                  ) : (
                    <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
                      {participantTeams.map((team) => {
                        const isPlaceholderTeam = isPlaceholderParticipantTeam(team);
                        return renderParticipantTeamCard({
                          cardKey: team.$id,
                          team,
                          className: isPlaceholderTeam ? '!bg-gray-100' : '',
                          enableDetailsView: !isPlaceholderTeam,
                          actions: canManageEvent && !isPlaceholderTeam
                            ? (
                              participantsUpdatingTeamId === team.$id
                                ? <Text size="xs" c="dimmed">Updating...</Text>
                                : (
                                  <Stack gap={6}>
                                    {renderEditBillingActions(team)}
                                    <Button
                                      size="xs"
                                      variant="light"
                                      color="red"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void handleRemoveTeamFromParticipants(team);
                                      }}
                                    >
                                      Remove
                                    </Button>
                                  </Stack>
                                )
                            )
                            : undefined,
                        });
                      })}
                    </SimpleGrid>
                  )}
                </Stack>
              </Tabs.Panel>
            )}

            {showScheduleTab && (
              <Tabs.Panel value="schedule" pt="md">
                <Stack gap="sm">
                  <Group justify="space-between" align="flex-end" wrap="wrap">
                    {shouldShowScheduleDivisionFilter ? (
                      <Select
                        label="Division"
                        data={scheduleDivisionSelectData}
                        value={selectedScheduleDivision}
                        onChange={(value) => setSelectedScheduleDivision(value ?? 'all')}
                        allowDeselect={false}
                        w={220}
                      />
                    ) : (
                      <div />
                    )}
                    {canEditMatches && (
                      <Button onClick={handleAddScheduleMatch}>Add Match</Button>
                    )}
                  </Group>

                  {activeMatches.length === 0 ? (
                    <Paper withBorder radius="md" p="xl" ta="center">
                      <Text>No matches generated yet.</Text>
                    </Paper>
                  ) : scheduleMatches.length === 0 ? (
                    <Paper withBorder radius="md" p="xl" ta="center">
                      <Text>No matches found for the selected division.</Text>
                    </Paper>
                  ) : (
                    <LeagueCalendarView
                      matches={scheduleMatches}
                      teams={
                        participantTeams.length > 0
                          ? participantTeams
                          : (Array.isArray(activeEvent.teams) ? activeEvent.teams : [])
                      }
                      fields={Array.isArray(activeEvent.fields) ? activeEvent.fields : []}
                      officials={Array.isArray(activeEvent.officials) ? activeEvent.officials : []}
                      eventStart={activeEvent.start}
                      eventEnd={activeEvent.end ?? undefined}
                      onMatchClick={(match) => {
                        if (canEditMatches) {
                          handleMatchEditRequest(match, 'schedule');
                          return;
                        }
                        void handleMatchClick(match);
                      }}
                      canManage={canEditMatches}
                      showEventOfficialNames={showEventOfficialNames}
                      currentUser={user}
                      childUserIds={childUserIds}
                      onToggleLockAllMatches={handleToggleLockAllMatches}
                      conflictMatchIdsById={matchConflictsById}
                    />
                  )}
                </Stack>
              </Tabs.Panel>
            )}

            {shouldShowBracketTab && (
              <Tabs.Panel value="bracket" pt="md" pb={0}>
                <Stack gap="sm">
                  <Group justify="space-between" align="flex-end" wrap="wrap">
                    {shouldShowBracketDivisionFilter ? (
                      <Select
                        label="Division"
                        data={bracketDivisionOptions}
                        value={selectedBracketDivision ?? bracketDivisionOptions[0]?.value ?? null}
                        onChange={(value) => setSelectedBracketDivision(value ?? bracketDivisionOptions[0]?.value ?? null)}
                        allowDeselect={false}
                        w={220}
                      />
                    ) : (
                      <div />
                    )}
                    {canEditMatches && (
                      <Button onClick={handleAddBracketMatch}>Add Match</Button>
                    )}
                  </Group>

                  {bracketData ? (
                    <TournamentBracketView
                      bracket={bracketData}
                      currentUser={user ?? undefined}
                      isPreview={isPreview}
                      onMatchClick={handleMatchClick}
                      canEditMatches={canEditMatches}
                      showEventOfficialNames={showEventOfficialNames}
                      showDateOnMatches={showDateOnMatches}
                      conflictMatchIdsById={matchConflictsById}
                    />
                  ) : (
                    <Paper withBorder radius="md" p="xl" ta="center">
                      <Text>
                        {playoffMatches.length > 0
                          ? 'No playoff bracket generated for the selected division.'
                          : 'No playoff bracket generated yet.'}
                      </Text>
                    </Paper>
                  )}
                </Stack>
              </Tabs.Panel>
            )}

            {showStandingsTab && (
              <Tabs.Panel value="standings" pt="md">
                <Stack gap="sm">
                  <Group justify="space-between" align="flex-end" wrap="wrap">
                    <Select
                      label="Division"
                      data={leagueDivisionOptions}
                      value={selectedStandingsDivision}
                      onChange={(value) => setSelectedStandingsDivision(value)}
                      allowDeselect={false}
                      disabled={!leagueDivisionOptions.length || standingsLoading}
                      w={260}
                    />
                    {canManageStandings && selectedStandingsDivision && (
                      <Stack gap={6} align="flex-end">
                        <Checkbox
                          label="Apply automatic playoff reassignment"
                          checked={applyStandingsReassignment}
                          onChange={(event) => setApplyStandingsReassignment(event.currentTarget.checked)}
                        />
                        <Group gap="xs">
                          <Button
                            variant="light"
                            onClick={() => void handleSaveStandingsAdjustments()}
                            loading={savingStandings}
                            disabled={standingsLoading || confirmingStandings}
                          >
                            Save Standings Adjustments
                          </Button>
                          <Button
                            onClick={() => void handleConfirmStandings()}
                            loading={confirmingStandings}
                            disabled={standingsLoading || savingStandings}
                          >
                            Confirm Results
                          </Button>
                        </Group>
                      </Stack>
                    )}
                  </Group>

                  {standingsDivisionData?.standingsConfirmedAt && (
                    <Text size="sm" c="dimmed">
                      Confirmed {new Date(standingsDivisionData.standingsConfirmedAt).toLocaleString()}
                      {standingsDivisionData.standingsConfirmedBy ? ` by ${standingsDivisionData.standingsConfirmedBy}` : ''}.
                    </Text>
                  )}

                  {standingsActionError && (
                    <Alert color="red" radius="md">
                      {standingsActionError}
                    </Alert>
                  )}

                  {standingsValidationMessages.length > 0 && (
                    <Alert color="yellow" radius="md">
                      <Stack gap={2}>
                        {standingsValidationMessages.map((message, index) => (
                          <Text key={`${message}-${index}`} size="sm">
                            {message}
                          </Text>
                        ))}
                      </Stack>
                    </Alert>
                  )}

                  {standingsLoading ? (
                    <Paper withBorder radius="md" p="xl">
                      <Group justify="center" gap="sm">
                        <Loader size="sm" />
                        <Text size="sm" c="dimmed">Loading standings...</Text>
                      </Group>
                    </Paper>
                  ) : standings.length === 0 ? (
                    <Paper withBorder radius="md" p="xl" ta="center">
                      <Text>No teams available yet.</Text>
                    </Paper>
                  ) : (
                    <Paper withBorder radius="md" p={0}>
                      {!hasRecordedMatches && (
                        <div className="px-4 pt-4">
                          <Text size="sm" c="dimmed">
                            Standings will update automatically as match results are recorded.
                          </Text>
                        </div>
                      )}
                      <div className="overflow-x-auto">
                        <Table striped highlightOnHover>
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th className="w-12 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                #
                              </Table.Th>
                              <Table.Th className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                <UnstyledButton
                                  className="flex items-center gap-1 text-sm font-semibold text-gray-700"
                                  onClick={() => handleStandingsSortChange('team')}
                                >
                                  Team
                                  {renderSortIndicator('team')}
                                </UnstyledButton>
                              </Table.Th>
                              <Table.Th className="w-16 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                                <UnstyledButton
                                  className="flex w-full items-center justify-end gap-1 text-sm font-semibold text-gray-700"
                                  onClick={() => handleStandingsSortChange('draws')}
                                >
                                  D
                                  {renderSortIndicator('draws')}
                                </UnstyledButton>
                              </Table.Th>
                              <Table.Th className="w-48 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                                <UnstyledButton
                                  className="flex w-full items-center justify-end gap-1 text-sm font-semibold text-gray-700"
                                  onClick={() => handleStandingsSortChange('points')}
                                >
                                  Final Pts
                                  {renderSortIndicator('points')}
                                </UnstyledButton>
                              </Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {standings.map((row) => {
                              const points = getDraftStandingsPoints(row);
                              const deltaColor = points.pointsDelta > 0
                                ? 'teal'
                                : points.pointsDelta < 0
                                  ? 'red'
                                  : 'dimmed';
                              return (
                                <Table.Tr key={row.teamId}>
                                  <Table.Td className="text-sm font-semibold text-gray-600">{row.rank}</Table.Td>
                                  <Table.Td className="text-sm font-medium text-gray-700">{row.teamName}</Table.Td>
                                  <Table.Td className="text-right text-sm text-gray-700">{row.draws}</Table.Td>
                                  <Table.Td className="text-right text-sm font-semibold text-gray-900">
                                    {canManageStandings ? (
                                      <Group justify="flex-end" gap="xs" wrap="nowrap">
                                        <NumberInput
                                          value={points.finalPoints}
                                          onChange={(value) => handleStandingsOverrideChange(row.teamId, value as string | number)}
                                          min={-9999}
                                          max={9999}
                                          step={1}
                                          w={96}
                                          size="xs"
                                        />
                                        <Text size="xs" c={deltaColor}>
                                          Î” {formatPoints(points.pointsDelta)}
                                        </Text>
                                      </Group>
                                    ) : (
                                      <Group justify="flex-end" gap="xs" wrap="nowrap">
                                        <Text size="sm" fw={600}>{formatPoints(points.finalPoints)}</Text>
                                        <Text size="xs" c={deltaColor}>
                                          Î” {formatPoints(points.pointsDelta)}
                                        </Text>
                                      </Group>
                                    )}
                                  </Table.Td>
                                </Table.Tr>
                              );
                            })}
                          </Table.Tbody>
                        </Table>
                      </div>
                    </Paper>
                  )}
                </Stack>
              </Tabs.Panel>
            )}
          </Tabs>
        </Stack>
      </Container>
      <Modal
        opened={isNotificationModalOpen}
        onClose={handleCloseNotificationModal}
        title="Send notification"
        size="lg"
        centered
        fullScreen={Boolean(isMobile)}
        closeOnClickOutside={!sendingNotification}
        closeOnEscape={!sendingNotification}
        withCloseButton={!sendingNotification}
      >
        <Stack gap="md">
          <TextInput
            label="Title"
            placeholder="Notification title"
            value={notificationTitle}
            onChange={(event) => setNotificationTitle(event.currentTarget.value)}
            maxLength={160}
            required
            disabled={sendingNotification}
          />
          <Textarea
            label="Message"
            placeholder="Write your message"
            value={notificationMessage}
            onChange={(event) => setNotificationMessage(event.currentTarget.value)}
            minRows={4}
            autosize
            maxLength={2000}
            required
            disabled={sendingNotification}
          />
          <Stack gap={6}>
            <Text size="sm" fw={500}>Send to</Text>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
              <Checkbox
                label="Managers"
                checked={notificationAudience.managers}
                onChange={(event) => handleNotificationAudienceToggle('managers', event.currentTarget.checked)}
                disabled={sendingNotification}
              />
              <Checkbox
                label="Players"
                checked={notificationAudience.players}
                onChange={(event) => handleNotificationAudienceToggle('players', event.currentTarget.checked)}
                disabled={sendingNotification}
              />
              <Checkbox
                label="Parents (of players)"
                checked={notificationAudience.parents}
                onChange={(event) => handleNotificationAudienceToggle('parents', event.currentTarget.checked)}
                disabled={sendingNotification}
              />
              <Checkbox
                label="Officials"
                checked={notificationAudience.officials}
                onChange={(event) => handleNotificationAudienceToggle('officials', event.currentTarget.checked)}
                disabled={sendingNotification}
              />
              <Checkbox
                label="Hosts"
                checked={notificationAudience.hosts}
                onChange={(event) => handleNotificationAudienceToggle('hosts', event.currentTarget.checked)}
                disabled={sendingNotification}
              />
            </SimpleGrid>
          </Stack>

          {notificationError && (
            <Alert color="red" radius="md">
              {notificationError}
            </Alert>
          )}

          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={handleCloseNotificationModal}
              disabled={sendingNotification}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                void handleSendNotification();
              }}
              loading={sendingNotification}
              disabled={!notificationTitle.trim() || !notificationMessage.trim() || !hasSelectedNotificationAudience}
            >
              Confirm
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Modal
        opened={isAddTeamModalOpen}
        onClose={() => {
          setIsAddTeamModalOpen(false);
          setTeamSearchQuery('');
          setSelectedAddTeamDivisionId(null);
        }}
        title="Add Team"
        size="xl"
        centered
        fullScreen={Boolean(isMobile)}
      >
        <Stack gap="md">
          <TextInput
            label="Search teams"
            placeholder="Search by team name, sport, or division"
            value={teamSearchQuery}
            onChange={(event) => setTeamSearchQuery(event.currentTarget.value)}
          />

          {isSplitDivisionEvent && (
            <Select
              label="Assign to division"
              data={participantDivisionSelectData}
              value={selectedAddTeamDivisionId}
              onChange={(value) => setSelectedAddTeamDivisionId(value)}
              allowDeselect={false}
            />
          )}

          {organizationIdForParticipants && (
            <Stack gap="sm">
              <Text fw={600} size="sm">Organization Teams</Text>
              {organizationTeamsLoading ? (
                <Paper withBorder radius="md" p="md">
                  <Group justify="center" gap="sm">
                    <Loader size="sm" />
                    <Text size="sm" c="dimmed">Loading organization teams...</Text>
                  </Group>
                </Paper>
              ) : availableOrganizationTeams.length === 0 ? (
                <Paper withBorder radius="md" p="md">
                  <Text size="sm" c="dimmed" ta="center">
                    No organization teams available to add.
                  </Text>
                </Paper>
              ) : (
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
                  {availableOrganizationTeams.map((team) => renderParticipantTeamCard({
                    cardKey: `org-team-${team.$id}`,
                    team,
                    showComplianceDetails: false,
                    enableDetailsView: false,
                    actions: participantsUpdatingTeamId === team.$id
                      ? <Text size="xs" c="dimmed">Adding...</Text>
                      : (
                        <Button
                          size="xs"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleAddTeamToParticipants(team);
                          }}
                        >
                          Add
                        </Button>
                      ),
                  }))}
                </SimpleGrid>
              )}
            </Stack>
          )}

          <Stack gap="sm">
            <Text fw={600} size="sm">Search Results</Text>
            {searchTeamsLoading ? (
              <Paper withBorder radius="md" p="md">
                <Group justify="center" gap="sm">
                  <Loader size="sm" />
                  <Text size="sm" c="dimmed">Loading searchable teams...</Text>
                </Group>
              </Paper>
            ) : searchResultTeams.length === 0 ? (
              <Paper withBorder radius="md" p="md">
                <Text size="sm" c="dimmed" ta="center">
                  No teams match your search.
                </Text>
              </Paper>
            ) : (
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
                {searchResultTeams.map((team) => renderParticipantTeamCard({
                  cardKey: `search-team-${team.$id}`,
                  team,
                  showComplianceDetails: false,
                  enableDetailsView: false,
                  actions: participantsUpdatingTeamId === team.$id
                    ? <Text size="xs" c="dimmed">Adding...</Text>
                    : (
                      <Button
                        size="xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleAddTeamToParticipants(team);
                        }}
                      >
                        Add
                      </Button>
                    ),
                }))}
              </SimpleGrid>
            )}
          </Stack>
        </Stack>
      </Modal>
      {selectedParticipantTeam && (
        <TeamDetailModal
          currentTeam={selectedParticipantTeam}
          isOpen={Boolean(selectedParticipantTeam)}
          onClose={() => {
            setSelectedParticipantTeam(null);
          }}
          canManage={false}
        />
      )}
      <Modal
        opened={Boolean(selectedRefundTeam)}
        onClose={closeRefundModal}
        title={selectedRefundTeam ? `Refunds \u2022 ${selectedRefundTeam.name || 'Team'}` : 'Refunds'}
        size="xl"
        centered
        fullScreen={Boolean(isMobile)}
      >
        <Stack gap="md">
          {refundError ? (
            <Alert color="red" radius="md">
              {refundError}
            </Alert>
          ) : null}

          {refundLoading ? (
            <Paper withBorder radius="md" p="md">
              <Group justify="center" gap="sm">
                <Loader size="sm" />
                <Text size="sm" c="dimmed">Loading bill payments...</Text>
              </Group>
            </Paper>
          ) : refundSnapshot ? (
            <>
              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                <Paper withBorder radius="md" p="sm">
                  <Text size="xs" c="dimmed">Paid</Text>
                  <Text fw={600}>{formatBillAmount(refundSnapshot.totals.paidAmountCents)}</Text>
                </Paper>
                <Paper withBorder radius="md" p="sm">
                  <Text size="xs" c="dimmed">Refunded</Text>
                  <Text fw={600}>{formatBillAmount(refundSnapshot.totals.refundedAmountCents)}</Text>
                </Paper>
                <Paper withBorder radius="md" p="sm">
                  <Text size="xs" c="dimmed">Refundable</Text>
                  <Text fw={600}>{formatBillAmount(refundSnapshot.totals.refundableAmountCents)}</Text>
                </Paper>
              </SimpleGrid>

              {refundSnapshot.bills.length === 0 ? (
                <Paper withBorder radius="md" p="md">
                  <Text size="sm" c="dimmed">No bills were found for this team on this event.</Text>
                </Paper>
              ) : (
                <Stack gap="sm">
                  {refundSnapshot.bills.map((bill) => (
                    <Paper key={bill.$id} withBorder radius="md" p="md">
                      <Stack gap="xs">
                        <Group justify="space-between" align="flex-start" wrap="wrap">
                          <Stack gap={2}>
                            <Text fw={600}>
                              {bill.ownerType === 'TEAM' ? 'Team bill' : 'User bill'} {'\u2022'} {bill.ownerName}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {bill.status ?? 'OPEN'} {'\u2022'} Total {formatBillAmount(bill.totalAmountCents)}
                            </Text>
                          </Stack>
                          <Text size="xs" c="dimmed">
                            Refunded {formatBillAmount(bill.refundedAmountCents)} / Refundable {formatBillAmount(bill.refundableAmountCents)}
                          </Text>
                        </Group>

                        {Array.isArray(bill.lineItems) && bill.lineItems.length > 0 ? (
                          <Stack gap={2}>
                            {bill.lineItems.map((item, index) => (
                              <Text key={`${bill.$id}:line:${item.id ?? index}`} size="xs" c="dimmed">
                                {(item.label ?? 'Line item')} {'\u2022'} {formatBillAmount(Number(item.amountCents ?? 0))}
                              </Text>
                            ))}
                          </Stack>
                        ) : null}

                        <Stack gap="xs" mt={4}>
                          {bill.payments.length === 0 ? (
                            <Text size="sm" c="dimmed">No bill payments found.</Text>
                          ) : bill.payments.map((payment) => {
                            const draftAmount = refundAmountDraftByPaymentId[payment.$id] ?? (payment.refundableAmountCents / 100);
                            const maxDollars = payment.refundableAmountCents / 100;
                            const canRefundPayment = payment.isRefundable && Boolean(payment.paymentIntentId);
                            return (
                              <Paper key={payment.$id} withBorder radius="sm" p="sm">
                                <Stack gap="xs">
                                  <Group justify="space-between" align="center" wrap="wrap">
                                    <Text size="sm" fw={500}>Payment #{payment.sequence}</Text>
                                    <Text size="xs" c="dimmed">
                                      Amount {formatBillAmount(payment.amountCents)} {'\u2022'} Refunded {formatBillAmount(payment.refundedAmountCents)}
                                    </Text>
                                  </Group>
                                  <Text size="xs" c="dimmed">
                                    Refundable: {formatBillAmount(payment.refundableAmountCents)}
                                  </Text>
                                  {canRefundPayment ? (
                                    <Group align="flex-end" wrap="wrap">
                                      <NumberInput
                                        label="Refund amount"
                                        min={0}
                                        max={maxDollars}
                                        decimalScale={2}
                                        fixedDecimalScale
                                        prefix="$"
                                        value={draftAmount}
                                        onChange={(value) => {
                                          const numeric = typeof value === 'number' ? value : Number(value);
                                          setRefundAmountDraftByPaymentId((current) => ({
                                            ...current,
                                            [payment.$id]: Number.isFinite(numeric) ? Math.max(0, numeric) : 0,
                                          }));
                                        }}
                                        w={180}
                                      />
                                      <Button
                                        loading={refundingPaymentId === payment.$id}
                                        disabled={refundingPaymentId !== null && refundingPaymentId !== payment.$id}
                                        onClick={() => {
                                          void submitRefund(payment.$id);
                                        }}
                                      >
                                        Refund
                                      </Button>
                                    </Group>
                                  ) : (
                                    <Text size="xs" c="dimmed">
                                      {payment.paymentIntentId
                                        ? 'This payment has no refundable balance.'
                                        : 'This payment cannot be refunded because it is not linked to Stripe.'}
                                    </Text>
                                  )}
                                </Stack>
                              </Paper>
                            );
                          })}
                        </Stack>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              )}
            </>
          ) : (
            <Paper withBorder radius="md" p="md">
              <Text size="sm" c="dimmed">No billing details loaded yet.</Text>
            </Paper>
          )}
        </Stack>
      </Modal>
      <Modal
        opened={Boolean(createBillTeam)}
        onClose={closeCreateBillModal}
        title={createBillTeam ? `Send Bill \u2022 ${createBillTeam.name || 'Team'}` : 'Send Bill'}
        size="lg"
        centered
      >
        <Stack gap="md">
          {createBillError ? (
            <Alert color="red" radius="md">
              {createBillError}
            </Alert>
          ) : null}

          <Group align="flex-end" wrap="wrap">
            <Select
              label="Bill owner"
              data={createBillIsUserOnly
                ? [{ value: 'USER', label: 'User' }]
                : [
                    { value: 'TEAM', label: 'Team' },
                    { value: 'USER', label: 'User' },
                  ]}
              value={createBillOwnerType}
              onChange={(value) => {
                setCreateBillOwnerType(value === 'USER' ? 'USER' : 'TEAM');
              }}
              allowDeselect={false}
              disabled={createBillIsUserOnly}
              w={180}
            />
            {createBillOwnerType === 'USER' && !createBillIsUserOnly ? (
              <Select
                label="User"
                data={createBillUserOptions}
                value={createBillOwnerId}
                onChange={(value) => setCreateBillOwnerId(value ?? null)}
                placeholder="Select user"
                searchable
                allowDeselect={false}
                w={260}
              />
            ) : null}
          </Group>

          <Group align="flex-end" wrap="wrap">
            <NumberInput
              label="Amount"
              min={0}
              decimalScale={2}
              fixedDecimalScale
              prefix="$"
              value={createBillAmountDollars}
              onChange={(value) => {
                const numeric = typeof value === 'number' ? value : Number(value);
                setCreateBillAmountDollars(Number.isFinite(numeric) ? Math.max(0, numeric) : 0);
              }}
              w={180}
            />
            <NumberInput
              label="Tax"
              min={0}
              decimalScale={2}
              fixedDecimalScale
              prefix="$"
              value={createBillTaxDollars}
              onChange={(value) => {
                const numeric = typeof value === 'number' ? value : Number(value);
                setCreateBillTaxDollars(Number.isFinite(numeric) ? Math.max(0, numeric) : 0);
              }}
              w={180}
            />
            <TextInput
              label="Primary line item label"
              value={createBillLabel}
              onChange={(event) => setCreateBillLabel(event.currentTarget.value)}
              placeholder="Event registration"
              w={280}
            />
          </Group>

          {createBillOwnerType === 'TEAM' && !createBillIsUserOnly ? (
            <Checkbox
              label="Allow team members to split this bill"
              checked={createBillAllowSplit}
              onChange={(event) => setCreateBillAllowSplit(event.currentTarget.checked)}
            />
          ) : null}

          <Paper withBorder radius="md" p="md">
            <Stack gap={6}>
              <Text size="sm" fw={600}>Bill preview</Text>
              {createBillPreviewLineItems.map((item) => (
                <Group key={item.id} justify="space-between" align="center">
                  <Text size="sm">{item.label}</Text>
                  <Text size="sm">{formatBillAmount(item.amountCents)}</Text>
                </Group>
              ))}
              <Group justify="space-between" align="center" pt={6} style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
                <Text fw={600}>Total bill</Text>
                <Text fw={600}>{formatBillAmount(createBillTotalCents)}</Text>
              </Group>
            </Stack>
          </Paper>

          <Group justify="flex-end">
            <Button variant="default" onClick={closeCreateBillModal}>Cancel</Button>
            <Button loading={creatingBill} onClick={() => { void submitCreateBill(); }}>
              Create Bill
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Modal
        opened={Boolean(selectedComplianceTeamId)}
        onClose={() => {
          setSelectedComplianceTeamId(null);
          setExpandedComplianceUserIds([]);
        }}
        title={selectedComplianceTeam ? `${selectedComplianceTeam.name || 'Team'} users` : 'Team users'}
        size="xl"
        centered
        fullScreen={Boolean(isMobile)}
      >
        <Stack gap="md">
          {selectedComplianceSummary ? (
            <>
              <Group justify="space-between" align="flex-start" wrap="wrap">
                <Stack gap={2}>
                  <Text size="sm" c="dimmed">Payment</Text>
                  <Text size="sm">{formatCompliancePaymentLabel(selectedComplianceSummary.payment)}</Text>
                </Stack>
                <Stack gap={2}>
                  <Text size="sm" c="dimmed">Required signatures</Text>
                  <Text size="sm">
                    {selectedComplianceSummary.documents.signedCount}/{selectedComplianceSummary.documents.requiredCount} complete
                  </Text>
                </Stack>
              </Group>

              {selectedComplianceSummary.users.length === 0 ? (
                <Paper withBorder radius="md" p="md">
                  <Text size="sm" c="dimmed">No users were found on this team.</Text>
                </Paper>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <Table withTableBorder withColumnBorders highlightOnHover miw={760}>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>User</Table.Th>
                        <Table.Th>Payment</Table.Th>
                        <Table.Th>Documents</Table.Th>
                        <Table.Th style={{ width: 120 }}>Details</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {selectedComplianceSummary.users.map((userSummary) => {
                        const expanded = expandedComplianceUserIds.includes(userSummary.userId);
                        return (
                          <Fragment key={userSummary.userId}>
                            <Table.Tr>
                              <Table.Td>
                                <Text fw={600}>{userSummary.fullName}</Text>
                                {userSummary.userName ? (
                                  <Text size="xs" c="dimmed">@{userSummary.userName}</Text>
                                ) : null}
                                <Text size="xs" c="dimmed">
                                  {userSummary.registrationType === 'CHILD'
                                    ? 'Child registration'
                                    : 'Adult registration'}
                                </Text>
                              </Table.Td>
                              <Table.Td>
                                <Text size="sm">{formatCompliancePaymentLabel(userSummary.payment)}</Text>
                              </Table.Td>
                              <Table.Td>
                                {userSummary.documents.requiredCount === 0 ? (
                                  <Text size="xs" c="dimmed">No required documents</Text>
                                ) : (
                                  <Text size="sm">
                                    {userSummary.documents.signedCount}/{userSummary.documents.requiredCount} signed
                                  </Text>
                                )}
                              </Table.Td>
                              <Table.Td>
                                <Button
                                  size="xs"
                                  variant="light"
                                  onClick={() => toggleComplianceUserExpanded(userSummary.userId)}
                                >
                                  {expanded ? 'Collapse' : 'Expand'}
                                </Button>
                              </Table.Td>
                            </Table.Tr>
                            {expanded && (
                              <Table.Tr>
                                <Table.Td colSpan={4}>
                                  {userSummary.requiredDocuments.length === 0 ? (
                                    <Text size="xs" c="dimmed">No required documents for this user.</Text>
                                  ) : (
                                    <Stack gap={6}>
                                      {userSummary.requiredDocuments.map((document) => (
                                        <Group key={document.key} justify="space-between" align="center" wrap="wrap">
                                          <Stack gap={0}>
                                            <Text size="sm">{document.title}</Text>
                                            <Text size="xs" c="dimmed">
                                              {document.signerLabel}
                                              {document.signOnce ? ' \u2022 Sign once' : ' \u2022 Event-specific'}
                                            </Text>
                                          </Stack>
                                          <Group gap={6}>
                                            {document.signedAt ? (
                                              <Text size="xs" c="dimmed">
                                                {new Date(document.signedAt).toLocaleString()}
                                              </Text>
                                            ) : null}
                                            <Badge
                                              size="sm"
                                              color={document.status === 'SIGNED' ? 'green' : 'yellow'}
                                              variant="light"
                                            >
                                              {document.status === 'SIGNED' ? 'Signed' : 'Needs signature'}
                                            </Badge>
                                          </Group>
                                        </Group>
                                      ))}
                                    </Stack>
                                  )}
                                </Table.Td>
                              </Table.Tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                </div>
              )}
            </>
          ) : teamComplianceLoading ? (
            <Paper withBorder radius="md" p="md">
              <Group justify="center" gap="sm">
                <Loader size="sm" />
                <Text size="sm" c="dimmed">Loading team users...</Text>
              </Group>
            </Paper>
          ) : (
            <Paper withBorder radius="md" p="md">
              <Text size="sm" c="dimmed">
                Team compliance details are not available yet.
              </Text>
            </Paper>
          )}
        </Stack>
      </Modal>
      {scoreUpdateMatch && activeEvent && (
        <ScoreUpdateModal
          match={scoreUpdateMatch}
          tournament={activeEvent}
          canManage={canUserManageScore(scoreUpdateMatch)}
          onScoreChange={handleScoreChange}
          onSetComplete={handleSetComplete}
          onMatchComplete={handleMatchComplete}
          onSubmit={handleScoreSubmit}
          onClose={() => {
            setIsScoreModalOpen(false);
            setScoreUpdateMatch(null);
          }}
          isOpen={isScoreModalOpen}
        />
      )}
      <MatchEditModal
        opened={isMatchEditorOpen}
        match={matchBeingEdited}
        allMatches={activeMatches}
        fields={Array.isArray(activeEvent.fields) ? activeEvent.fields : []}
        teams={matchEditorTeams}
        officials={matchEditorOfficials}
        officialPositions={Array.isArray(activeEvent.officialPositions) ? activeEvent.officialPositions : []}
        eventOfficials={Array.isArray(activeEvent.eventOfficials) ? activeEvent.eventOfficials : []}
        doTeamsOfficiate={Boolean(activeEvent.doTeamsOfficiate)}
        isCreateMode={Boolean(matchBeingEdited && isClientMatchId(matchBeingEdited.$id))}
        creationContext={matchEditorContext}
        eventType={activeEvent.eventType}
        enforceScheduleFields={matchEditorContext === 'schedule'}
        onClose={handleMatchEditClose}
        onSave={handleMatchEditSave}
        onDelete={handleMatchDelete}
      />
      <PaymentModal
        isOpen={showRentalPayment && Boolean(rentalPaymentData)}
        onClose={closeRentalPaymentModal}
        event={rentalPaymentEventSummary}
        paymentData={rentalPaymentData}
        onPaymentSuccess={handleRentalPaymentSuccess}
      />
      <Modal
        opened={showRentalSignModal && Boolean(currentRentalSignLink)}
        onClose={closeRentalSignModal}
        title="Sign Rental Document"
        size="xl"
        centered
      >
        <Stack gap="sm">
          {currentRentalSignLink ? (
            <>
              <Text size="sm" c="dimmed">
                Document {rentalSignIndex + 1} of {rentalSignLinks.length}
                {currentRentalSignLink.title ? ` \u2022 ${currentRentalSignLink.title}` : ''}
              </Text>
              {currentRentalSignLink.requiredSignerLabel ? (
                <Text size="sm" c="dimmed">
                  Required signer: {currentRentalSignLink.requiredSignerLabel}
                </Text>
              ) : null}
              {rentalSignError ? (
                <Alert color="red">
                  {rentalSignError}
                </Alert>
              ) : null}
              {pendingRentalSignedDocumentId || pendingRentalSignatureOperationId ? (
                <Group gap="xs">
                  <Loader size="sm" />
                  <Text size="sm" c="dimmed">
                    Confirming signature...
                  </Text>
                </Group>
              ) : null}
              {currentRentalSignLink.type === 'TEXT' ? (
                <>
                  <Paper withBorder p="sm" radius="md" style={{ maxHeight: 320, overflowY: 'auto' }}>
                    <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                      {currentRentalSignLink.content || 'No document content provided.'}
                    </Text>
                  </Paper>
                  <Checkbox
                    checked={rentalTextAccepted}
                    onChange={(event) => setRentalTextAccepted(event.currentTarget.checked)}
                    label="I have read and agree to this document."
                  />
                  <Group justify="flex-end">
                    <Button
                      onClick={handleRentalTextAcceptance}
                      disabled={!rentalTextAccepted || recordingRentalSignature}
                      loading={recordingRentalSignature}
                    >
                      Accept And Continue
                    </Button>
                  </Group>
                </>
              ) : (
                <>
                  {currentRentalSignLink.url ? (
                    <iframe
                      title={`Rental document ${currentRentalSignLink.title ?? currentRentalSignLink.templateId}`}
                      src={currentRentalSignLink.url}
                      className="h-[480px] w-full rounded border"
                    />
                  ) : (
                    <Alert color="red">
                      This document is missing a signing link. Close checkout and try again.
                    </Alert>
                  )}
                  <Group justify="space-between">
                    {currentRentalSignLink.url ? (
                      <Button
                        component="a"
                        href={currentRentalSignLink.url}
                        target="_blank"
                        rel="noreferrer"
                        variant="default"
                      >
                        Open In New Tab
                      </Button>
                    ) : (
                      <div />
                    )}
                    <Button
                      onClick={() => void handleRentalSignedDocument()}
                      disabled={!currentRentalSignLink.documentId || recordingRentalSignature}
                      loading={recordingRentalSignature}
                    >
                      I Finished Signing
                    </Button>
                  </Group>
                </>
              )}
            </>
          ) : (
            <Text size="sm" c="dimmed">Preparing rental document...</Text>
          )}
        </Stack>
      </Modal>
    </div>
  );
}

export default function EventSchedulePage() {
  return (
    <Suspense fallback={<Loading text="Loading schedule..." />}>
      <EventScheduleContent />
    </Suspense>
  );
}



